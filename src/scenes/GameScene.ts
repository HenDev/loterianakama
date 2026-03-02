import Phaser from 'phaser';
import type { GameState, INetworkService, NetworkEvent, Player, LotteryCard, WinCondition } from '../types';
import { getMockNetworkService } from '../services/MockNetworkService';
import { getNakamaNetworkService } from '../services/NakamaNetworkService';
import { getAudioService } from '../services/AudioService';
import { getVoiceService } from '../services/VoiceService';
import { BoardComponent } from '../components/BoardComponent';
import { DeckCardComponent } from '../components/DeckCardComponent';
import { PlayerListComponent } from '../components/PlayerListComponent';
import { CARD_ASPECT_RATIO, CARD_ATLAS_KEY, getCardFrameById } from '../data/cards';
import { CORCHOLATA_ATLAS_KEY, CORCHOLATA_FRAME_PREFIX } from '../data/corcholatas';
import { getOrCreateDeviceId } from '../utils/deviceId';
import { readCachedUserPreferences } from '../utils/userPreferences';
import {
  cloneWinCondition,
  DEFAULT_TARGET_WIN,
  getCompactWinConditionLabel,
  normalizeWinCondition,
} from '../utils/winCondition';

export class GameScene extends Phaser.Scene {
  private playerId = '';
  private playerName = '';
  private targetWin: WinCondition = cloneWinCondition(DEFAULT_TARGET_WIN);
  private useNakama = false;
  private networkService: INetworkService = getMockNetworkService();
  private gameState: GameState | null = null;

  private boardComp: BoardComponent | null = null;
  private deckCardComp: DeckCardComponent | null = null;
  private playerListComp: PlayerListComponent | null = null;

  private statusText: Phaser.GameObjects.Text | null = null;
  private modeText: Phaser.GameObjects.Text | null = null;
  private drawnCardsPile: Phaser.GameObjects.Container | null = null;
  private cardsDrawnCount: Phaser.GameObjects.Text | null = null;
  private currentCardLabel: Phaser.GameObjects.Text | null = null;
  private drawnPileIds: number[] = [];

  private boundOnSync!: (e: NetworkEvent) => void;
  private boundOnCardDrawn!: (e: NetworkEvent) => void;
  private boundOnWinValidated!: (e: NetworkEvent) => void;
  private boundOnWinInvalid!: (e: NetworkEvent) => void;
  private hasShownResults = false;
  private selectedCorcholataFrame?: string;
  private corcholataRotationSeed = 0;
  private calledCardFeedbackEnabled = false;
  private static readonly TEMP_MARK_TEXTURE_KEY = 'frijol';

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { playerId: string; targetWin: WinCondition; useNakama?: boolean; playerName?: string }): void {
    this.playerId = data.playerId;
    this.playerName = data.playerName ?? '';
    this.targetWin = normalizeWinCondition(data.targetWin ?? DEFAULT_TARGET_WIN);
    this.useNakama = data.useNakama ?? false;
    this.networkService = this.useNakama ? getNakamaNetworkService() : getMockNetworkService();
    this.hasShownResults = false;
    if (this.useNakama) {
      const nakamaPlayerId = getNakamaNetworkService().getLocalPlayerId();
      if (nakamaPlayerId) this.playerId = nakamaPlayerId;
      this.calledCardFeedbackEnabled = getNakamaNetworkService().getUserPreferences().calledCardFeedbackEnabled;
    } else {
      this.calledCardFeedbackEnabled =
        readCachedUserPreferences(getOrCreateDeviceId()).calledCardFeedbackEnabled;
    }
  }

  create(): void {
    const { width, height } = this.scale;
    this.selectMatchCorcholata();
    this.selectedCorcholataFrame = GameScene.TEMP_MARK_TEXTURE_KEY;
    this.buildBackground(width, height);
    this.buildLayout(width, height);
    this.setupNetworkHandlers();
    if (this.useNakama) {
      const currentState = getNakamaNetworkService().gameState;
      if (currentState) this.onGameStateSync(currentState);
    }

    if (!this.useNakama) {
      this.networkService.send({
        type: 'GAME_START',
        payload: { targetWin: this.targetWin },
        senderId: this.playerId,
        timestamp: Date.now(),
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private buildBackground(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d2b1a);
    const stripes = this.add.graphics();
    stripes.lineStyle(1, 0x1a4a2a, 0.3);
    for (let x = 0; x < width; x += 40) stripes.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 40) stripes.lineBetween(0, y, width, y);
  }

  private buildLayout(width: number, height: number): void {
    const headerH = 50;
    const leftW = 220;
    const rightW = 220;
    const centerW = width - leftW - rightW;

    this.buildConfiguredHeader(width, headerH);
    this.buildLeftPanel(0, headerH, leftW, height - headerH);
    this.buildCenterPanel(leftW, headerH, centerW, height - headerH);
    this.buildRightPanel(width - rightW, headerH, rightW, height - headerH);
  }

  private buildConfiguredHeader(width: number, h: number): void {
    const bg = this.add.rectangle(width / 2, h / 2, width, h, 0x0a1a10, 0.95);
    bg.setStrokeStyle(1, 0xd4af37, 0.5);

    this.add.text(20, h / 2, 'LOTERIA MEXICANA!', {
      fontSize: '20px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.statusText = this.add.text(width / 2, h / 2, 'Iniciando juego...', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.modeText = this.add.text(width - 20, h / 2, `Modo: ${getCompactWinConditionLabel(this.targetWin)}`, {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);

    const fullscreenBtn = this.add.text(width - 160, h / 2, '[ ]', {
      fontSize: '18px',
      color: '#d4af37',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const updateFullscreenIcon = () => {
      fullscreenBtn.setText(this.scale.isFullscreen ? 'X' : '[ ]');
    };

    fullscreenBtn.on('pointerdown', () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    fullscreenBtn.on('pointerover', () => {
      fullscreenBtn.setScale(1.2);
    });

    fullscreenBtn.on('pointerout', () => {
      fullscreenBtn.setScale(1);
    });

    this.scale.on('fullscreenchange', updateFullscreenIcon);
  }

  public buildHeader(width: number, h: number): void {
    const bg = this.add.rectangle(width / 2, h / 2, width, h, 0x0a1a10, 0.95);
    bg.setStrokeStyle(1, 0xd4af37, 0.5);

    this.add.text(20, h / 2, '¡LOTERÍA MEXICANA!', {
      fontSize: '20px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.statusText = this.add.text(width / 2, h / 2, 'Iniciando juego...', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.modeText = this.add.text(width - 20, h / 2,
      // @ts-expect-error legacy header kept for compatibility with older scene wiring
      `Modo: ${this.targetWin === 'linea' ? 'Línea' : 'Tabla'}`, {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);
    this.modeText.setText(`Modo: ${getCompactWinConditionLabel(this.targetWin)}`);

    const fullscreenBtn = this.add.text(width - 160, h / 2, '⛶', {
      fontSize: '18px',
      color: '#d4af37',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const updateFullscreenIcon = () => {
      fullscreenBtn.setText(this.scale.isFullscreen ? '✕' : '⛶');
    };

    fullscreenBtn.on('pointerdown', () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    fullscreenBtn.on('pointerover', () => {
      fullscreenBtn.setScale(1.2);
    });

    fullscreenBtn.on('pointerout', () => {
      fullscreenBtn.setScale(1);
    });

    this.scale.on('fullscreenchange', updateFullscreenIcon);

  }

  private buildLeftPanel(x: number, y: number, w: number, h: number): void {
    const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x0a1a10, 0.8);
    bg.setStrokeStyle(1, 0x2a4a30, 1);

    this.playerListComp = new PlayerListComponent(this, x + w / 2, y + 16);

    const { cardWidth, cardHeight } = this.getCardSizeForArea(w - 30, h * 0.42);
    this.deckCardComp = new DeckCardComponent(this, x + w / 2, y + h * 0.62, cardWidth, cardHeight);

    this.currentCardLabel = this.add.text(x + w / 2, y + h * 0.88, 'Esperando...', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      wordWrap: { width: w - 20 },
      align: 'center',
    }).setOrigin(0.5, 0);

    void bg;
  }

  private buildCenterPanel(x: number, y: number, w: number, h: number): void {
    const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x0a1a10, 0.6);
    void bg;

    const boardLabel = this.add.text(x + w / 2, y + 16, 'TU TABLERO', {
      fontSize: '14px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    void boardLabel;

    const gap = 4;
    const { cellW, cellH } = this.getBoardCellSize(w - 40, h - 120, gap);
    const totalBoardH = 4 * cellH + 3 * gap;
    const boardX = x + w / 2;
    const boardY = y + 50 + totalBoardH / 2;

    this.boardComp = new BoardComponent(this, {
      x: boardX,
      y: boardY,
      cells: [],
      cellWidth: cellW,
      cellHeight: cellH,
      gap,
      interactive: true,
      corcholataFrame: this.selectedCorcholataFrame,
      corcholataRotationSeed: this.corcholataRotationSeed,
      onMark: (cardId) => this.onMarkCard(cardId),
    });

    this.createLoteriaButton(x + w / 2, y + h - 32);

    this.cardsDrawnCount = this.add.text(x + w / 2, y + h * 0.985, 'Cartas cantadas: 0 / 54', {
      fontSize: '11px',
      color: '#cdcdcd',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 1);
  }

  private buildRightPanel(x: number, y: number, w: number, h: number): void {
    const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x0a1a10, 0.8);
    bg.setStrokeStyle(1, 0x2a4a30, 1);

    this.add.text(x + w / 2, y + 14, 'CARTAS CANTADAS', {
      fontSize: '12px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const table = this.add.rectangle(x + w / 2, y + h * 0.56, w - 26, h * 0.72, 0x17321f, 0.9);
    table.setStrokeStyle(1, 0x3d6b47, 0.8);

    this.add.text(x + w / 2, y + h * 0.93, 'Las cartas caen en la mesa', {
      fontSize: '11px',
      color: '#8ca692',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.drawnCardsPile = this.add.container(x + w / 2, y + h * 0.56);

  }

  private createLoteriaButton(x: number, y: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 180, 48, 0x8B1A1A);
    bg.setStrokeStyle(3, 0xd4af37, 1);

    const text = this.add.text(0, 0, '¡LOTERÍA!', {
      fontSize: '24px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-90, -24, 180, 48),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', () => this.onClaimWin());
    container.on('pointerover', () => {
      bg.setFillStyle(0xaa2222);
      this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 100 });
    });
    container.on('pointerout', () => {
      bg.setFillStyle(0x8B1A1A);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
    });

    this.tweens.add({
      targets: container,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return container;
  }

  private setupNetworkHandlers(): void {
    this.boundOnSync = (e: NetworkEvent) => {
      const state = (e.payload as { state: GameState }).state;
      this.onGameStateSync(state);
    };
    this.boundOnCardDrawn = (e: NetworkEvent) => {
      const { card } = e.payload as { card: LotteryCard };
      this.onCardDrawn(card);
    };
    this.boundOnWinValidated = (e: NetworkEvent) => {
      const payload = (e.payload ?? {}) as { playerId?: string; winner?: Player | null };
      const winnerId = payload.playerId ?? this.gameState?.winner?.id;
      if (!winnerId) return;
      this.onWinValidated(winnerId, payload.winner ?? null);
    };
    this.boundOnWinInvalid = () => {
      this.showFeedback('¡Falsa alarma! La jugada no es válida.', 0xff4444);
      getAudioService().play('lose');
    };

    this.networkService.on('GAME_STATE_SYNC', this.boundOnSync);
    this.networkService.on('CARD_DRAWN', this.boundOnCardDrawn);
    this.networkService.on('WIN_VALIDATED', this.boundOnWinValidated);
    this.networkService.on('WIN_INVALID', this.boundOnWinInvalid);
  }

  private onGameStateSync(state: GameState): void {
    this.targetWin = normalizeWinCondition(state.targetWin);
    this.gameState = {
      ...state,
      targetWin: cloneWinCondition(this.targetWin),
    };
    this.modeText?.setText(`Modo: ${getCompactWinConditionLabel(this.targetWin)}`);

    this.statusText?.setText(
      state.status === 'playing' ? 'Jugando...' :
      state.status === 'waiting' ? 'Esperando inicio...' :
      state.status === 'finished' ? '¡Juego terminado!' : ''
    );

    let localPlayer = state.players.find(p => p.id === this.playerId);
    if (!localPlayer && this.useNakama) {
      const nakamaPlayerId = getNakamaNetworkService().getLocalPlayerId();
      if (nakamaPlayerId) {
        this.playerId = nakamaPlayerId;
        localPlayer = state.players.find(p => p.id === this.playerId);
      }
    }
    if (!localPlayer && this.playerName) {
      localPlayer = state.players.find(p => p.name === this.playerName);
      if (localPlayer) this.playerId = localPlayer.id;
    }
    if (localPlayer && this.boardComp) {
      this.rebuildBoard(localPlayer);
    }

    this.playerListComp?.update(state.players);

    if (state.currentCard) {
      this.currentCardLabel?.setText(`"${state.currentCard.verse}"`);
    }

    this.cardsDrawnCount?.setText(`Cartas cantadas: ${state.drawnCards.length} / 54`);
    this.updateDrawnCardsGrid(state.drawnCards);

    if (state.status === 'finished' && state.winner) {
      this.goToResults(state.winner.id, state.winner);
    }
  }

  private rebuildBoard(player: Player): void {
    if (!this.boardComp) return;
    const { width, height } = this.scale;
    const leftW = 220;
    const rightW = 220;
    const w = width - leftW - rightW;
    const h = height - 50;
    const gap = 4;
    const { cellW, cellH } = this.getBoardCellSize(w - 40, h - 120, gap);
    const totalBoardH = 4 * cellH + 3 * gap;
    const boardX = leftW + w / 2;
    const boardY = 50 + 50 + totalBoardH / 2;

    this.boardComp.destroy();
    this.boardComp = new BoardComponent(this, {
      x: boardX,
      y: boardY,
      cells: player.board,
      cellWidth: cellW,
      cellHeight: cellH,
      gap,
      interactive: player.isHuman && !player.isWinner,
      corcholataFrame: this.selectedCorcholataFrame,
      corcholataRotationSeed: this.corcholataRotationSeed,
      onMark: (cardId) => this.onMarkCard(cardId),
    });
  }

  private onCardDrawn(card: LotteryCard): void {
    getAudioService().play('card_flip');
    getVoiceService().speakCardName(card.name);
    this.deckCardComp?.showCard(card);
    this.currentCardLabel?.setText(`"${card.verse}"`);
    this.statusText?.setText(`Carta: ${card.id}. ${card.name}`);

    const localPlayer = this.gameState?.players.find(p => p.id === this.playerId);
    if (localPlayer) {
      const hasCard = localPlayer.board.some(c => c.cardId === card.id);
      if (hasCard && this.calledCardFeedbackEnabled) {
        this.boardComp?.highlightCard(card.id);
        this.showFeedback(`¡Tienes "${card.name}"!`, 0xd4af37);
      }
    }
  }

  private onWinValidated(winnerId: string, winner: Player | null): void {
    this.goToResults(winnerId, winner);
  }

  private goToResults(winnerId: string, winner: Player | null): void {
    if (this.hasShownResults) return;
    const resolvedWinner =
      winner ??
      this.gameState?.winner ??
      this.gameState?.players.find(p => p.id === winnerId) ??
      null;

    if (!resolvedWinner) return;

    this.hasShownResults = true;
    getAudioService().play('win');
    const isLocalWinner = winnerId === this.playerId;
    this.scene.start('ResultScene', {
      winner: resolvedWinner,
      isLocalWinner,
      gameState: this.gameState,
      useNakama: this.useNakama,
    });
  }

  private onMarkCard(cardId: number): void {
    if (!this.gameState || this.gameState.status !== 'playing') return;
    const drawnCards = this.gameState.drawnCards;
    if (!drawnCards.includes(cardId)) {
      this.showFeedback('Esta carta aún no ha sido cantada.', 0xff8800);
      return;
    }
    this.networkService.send({
      type: 'MARK_CARD',
      payload: { playerId: this.playerId, cardId },
      senderId: this.playerId,
      timestamp: Date.now(),
    });
  }

  private onClaimWin(): void {
    if (!this.gameState || this.gameState.status !== 'playing') return;
    getAudioService().play('loteria');
    this.networkService.send({
      type: 'CLAIM_WIN',
      payload: { playerId: this.playerId, condition: this.targetWin },
      senderId: this.playerId,
      timestamp: Date.now(),
    });
    this.showFeedback('Validando ¡Lotería!...', 0xd4af37);
  }

  private updateDrawnCardsGrid(drawnCardIds: number[]): void {
    if (!this.drawnCardsPile) return;

    if (drawnCardIds.length < this.drawnPileIds.length) {
      this.drawnCardsPile.removeAll(true);
      this.drawnPileIds = [];
    }

    const newCardIds = drawnCardIds.filter(cardId => !this.drawnPileIds.includes(cardId));
    const isBackfill = this.drawnPileIds.length === 0 && newCardIds.length > 1;

    newCardIds.forEach((cardId, index) => {
      const shouldAnimate = !isBackfill || index >= newCardIds.length - 2;
      this.addCardToDrawnPile(cardId, shouldAnimate);
      this.drawnPileIds.push(cardId);
    });
  }

  private addCardToDrawnPile(cardId: number, animate: boolean): void {
    if (!this.drawnCardsPile) return;

    const pileIndex = this.drawnPileIds.length;
    const cardHeight = 130;
    const cardWidth = cardHeight * CARD_ASPECT_RATIO;
    const targetX = Phaser.Math.Between(-22, 22) + ((pileIndex % 3) - 1) * 3;
    const targetY = Phaser.Math.Between(-24, 24) + Math.min(pileIndex * 0.55, 18);
    const targetRotation = Phaser.Math.FloatBetween(-0.24, 0.24);

    const startX = 90;
    const startY = -230;
    const startRotation = Phaser.Math.FloatBetween(-0.8, 0.8);

    const card = this.add.image(
      animate ? startX : targetX,
      animate ? startY : targetY,
      CARD_ATLAS_KEY,
      getCardFrameById(cardId),
    );
    card.setDisplaySize(cardWidth, cardHeight);
    card.setRotation(animate ? startRotation : targetRotation);
    card.setDepth(pileIndex);
    this.drawnCardsPile.add(card);

    if (animate) {
      this.tweens.add({
        targets: card,
        x: targetX,
        y: targetY,
        rotation: targetRotation,
        duration: 420,
        ease: 'Cubic.easeOut',
      });
      this.tweens.add({
        targets: card,
        y: targetY + 6,
        duration: 110,
        yoyo: true,
        ease: 'Sine.easeOut',
        delay: 420,
      });
    }

    const maxVisibleInPile = 22;
    if (this.drawnCardsPile.length > maxVisibleInPile) {
      const oldest = this.drawnCardsPile.first as Phaser.GameObjects.Image | undefined;
      if (oldest) {
        this.tweens.add({
          targets: oldest,
          alpha: 0,
          duration: 120,
          onComplete: () => oldest.destroy(),
        });
      }
    }
  }

  private showFeedback(message: string, color: number): void {
    const { width, height } = this.scale;
    const text = this.add.text(width / 2, height / 2 - 80, message, {
      fontSize: '20px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: height / 2 - 140,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private getCardSizeForArea(maxWidth: number, maxHeight: number): { cardWidth: number; cardHeight: number } {
    const cardHeight = Math.floor(Math.min(maxHeight, maxWidth / CARD_ASPECT_RATIO));
    const cardWidth = Math.floor(cardHeight * CARD_ASPECT_RATIO);
    return { cardWidth, cardHeight };
  }

  private getBoardCellSize(
    availableWidth: number,
    availableHeight: number,
    gap: number
  ): { cellW: number; cellH: number } {
    const maxCellW = (availableWidth - 3 * gap) / 4;
    const maxCellH = (availableHeight - 3 * gap) / 4;
    const cellH = Math.floor(Math.min(maxCellH, maxCellW / CARD_ASPECT_RATIO));
    const cellW = Math.floor(cellH * CARD_ASPECT_RATIO);
    return { cellW, cellH };
  }

  private selectMatchCorcholata(): void {
    this.corcholataRotationSeed = Phaser.Math.Between(1, 1_000_000);
    if (!this.textures.exists(CORCHOLATA_ATLAS_KEY)) {
      this.selectedCorcholataFrame = undefined;
      return;
    }

    const frames = this.textures
      .get(CORCHOLATA_ATLAS_KEY)
      .getFrameNames()
      .filter(frame => frame.startsWith(CORCHOLATA_FRAME_PREFIX));

    if (frames.length === 0) {
      this.selectedCorcholataFrame = undefined;
      return;
    }

    this.selectedCorcholataFrame = Phaser.Utils.Array.GetRandom(frames);
  }

  shutdown(): void {
    getVoiceService().stop();
    this.networkService.off('GAME_STATE_SYNC', this.boundOnSync);
    this.networkService.off('CARD_DRAWN', this.boundOnCardDrawn);
    this.networkService.off('WIN_VALIDATED', this.boundOnWinValidated);
    this.networkService.off('WIN_INVALID', this.boundOnWinInvalid);
    this.drawnPileIds = [];
  }
}


