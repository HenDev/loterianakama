import Phaser from 'phaser';
import type { WinCondition } from '../types';
import { getNakamaNetworkService, resetNakamaNetworkService } from '../services/NakamaNetworkService';
import { getAudioService } from '../services/AudioService';
import { generateUUID } from '../utils/shuffle';

type MatchView = 'menu' | 'create' | 'join' | 'waiting';
const MIN_MULTIPLAYER_PLAYERS = 2;

export class NakamaMatchScene extends Phaser.Scene {
  private playerId = '';
  private playerName = '';
  private targetWin: WinCondition = 'linea';
  private currentView: MatchView = 'menu';
  private matchId = '';
  private joinInput = '';
  private statusText: Phaser.GameObjects.Text | null = null;
  private joinInputText: Phaser.GameObjects.Text | null = null;
  private nameInputText: Phaser.GameObjects.Text | null = null;
  private nameValue = '';
  private inputActive: 'name' | 'matchId' | null = null;
  private loadingDots = 0;
  private loadingTimer: Phaser.Time.TimerEvent | null = null;
  private errorText: Phaser.GameObjects.Text | null = null;
  private waitingPlayerList: Phaser.GameObjects.Text | null = null;
  private _startBtn: Phaser.GameObjects.Container | null = null;
  private isHost = false;
  private containers: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'NakamaMatchScene' });
  }

  init(): void {
    this.playerId = generateUUID();
    this.nameValue = `Jugador${Math.floor(Math.random() * 999) + 1}`;
    this.currentView = 'menu';
    this.matchId = '';
    this.joinInput = '';
  }

  create(): void {
    const { width, height } = this.scale;
    this.buildBackground(width, height);
    this.buildHeader(width, height);
    this.showMenu(width, height);
    this.setupKeyboard();
  }

  private buildBackground(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d1b2a);
    const g = this.add.graphics();
    g.lineStyle(1, 0x1a3a5a, 0.2);
    for (let x = 0; x < width; x += 60) g.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 60) g.lineBetween(0, y, width, y);
  }

  private buildHeader(width: number, _height: number): void {
    const hh = 56;
    const hbg = this.add.rectangle(width / 2, hh / 2, width, hh, 0x071422, 0.95);
    hbg.setStrokeStyle(1, 0xd4af37, 0.5);

    this.add.text(width / 2, hh / 2, '¡LOTERÍA! — Multijugador', {
      fontSize: '22px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const backBtn = this.createButton(60, hh / 2, '← Volver', 0x1a2a3a, () => {
      resetNakamaNetworkService();
      this.scene.start('LobbyScene');
    });
    void hbg, backBtn;
  }

  private clearContainers(): void {
    this.containers.forEach(c => c.destroy());
    this.containers = [];
    this.statusText = null;
        this.joinInputText = null;
    this.nameInputText = null;
    this.errorText = null;
    this.waitingPlayerList = null;
    this._startBtn = null;
    this.inputActive = null;
    if (this.loadingTimer) {
      this.loadingTimer.remove();
      this.loadingTimer = null;
    }
  }

  private showMenu(width: number, height: number): void {
    this.clearContainers();
    this.currentView = 'menu';

    const container = this.add.container(0, 0);
    this.containers.push(container);

    const panelW = 480;
    const panelH = 380;
    const panelX = width / 2;
    const panelY = height / 2 + 20;

    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a1428, 0.95);
    panel.setStrokeStyle(2, 0xd4af37, 0.7);

    this.add.text(panelX, panelY - 140, 'Nombre de Jugador', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const nameBox = this.add.rectangle(panelX, panelY - 110, 340, 40, 0x0d1e30);
    nameBox.setStrokeStyle(2, 0x4a7a9b);
    nameBox.setInteractive({ useHandCursor: true });
    nameBox.on('pointerdown', () => { this.inputActive = 'name'; });

    this.nameInputText = this.add.text(panelX, panelY - 110, this.nameValue, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.add.text(panelX, panelY - 55, 'Modo de Victoria', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const lineaBtn = this.createModeButton(panelX - 80, panelY - 25, 'Línea', () => {
      this.targetWin = 'linea';
      lineaBtn.getAt<Phaser.GameObjects.Rectangle>(0).setStrokeStyle(3, 0xd4af37);
      tablaBtn.getAt<Phaser.GameObjects.Rectangle>(0).setStrokeStyle(1, 0x4a7a9b);
    });
    const tablaBtn = this.createModeButton(panelX + 80, panelY - 25, 'Tabla', () => {
      this.targetWin = 'tabla';
      tablaBtn.getAt<Phaser.GameObjects.Rectangle>(0).setStrokeStyle(3, 0xd4af37);
      lineaBtn.getAt<Phaser.GameObjects.Rectangle>(0).setStrokeStyle(1, 0x4a7a9b);
    });
    lineaBtn.getAt<Phaser.GameObjects.Rectangle>(0).setStrokeStyle(3, 0xd4af37);

    const createBtn = this.createButton(panelX - 100, panelY + 60, 'Crear Partida', 0x1a3a2a, () => {
      getAudioService().play('button');
      this.handleCreateMatch(width, height);
    });

    const joinBtn = this.createButton(panelX + 100, panelY + 60, 'Unirse', 0x1a2a4a, () => {
      getAudioService().play('button');
      this.showJoin(width, height);
    });

    this.statusText = this.add.text(panelX, panelY + 130, '', {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.errorText = this.add.text(panelX, panelY + 155, '', {
      fontSize: '13px',
      color: '#ff6666',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    container.add([panel, nameBox, lineaBtn, tablaBtn, createBtn, joinBtn]);
    void nameBox;
  }

  private showJoin(width: number, height: number): void {
    this.clearContainers();
    this.currentView = 'join';

    const container = this.add.container(0, 0);
    this.containers.push(container);

    const panelW = 480;
    const panelH = 320;
    const panelX = width / 2;
    const panelY = height / 2 + 20;

    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a1428, 0.95);
    panel.setStrokeStyle(2, 0xd4af37, 0.7);

    this.add.text(panelX, panelY - 120, 'Código de Partida', {
      fontSize: '16px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const inputBox = this.add.rectangle(panelX, panelY - 75, 380, 44, 0x0d1e30);
    inputBox.setStrokeStyle(2, 0x4a7a9b);
    inputBox.setInteractive({ useHandCursor: true });
    inputBox.on('pointerdown', () => { this.inputActive = 'matchId'; });

    this.joinInputText = this.add.text(panelX, panelY - 75, this.joinInput || 'Pega el código aquí...', {
      fontSize: '14px',
      color: this.joinInput ? '#ffffff' : '#555555',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const confirmBtn = this.createButton(panelX, panelY + 20, 'Unirse a la Partida', 0x1a2a4a, () => {
      getAudioService().play('button');
      this.handleJoinMatch(width, height);
    });

    const pasteBtn = this.createButton(panelX - 90, panelY + 90, 'Pegar código', 0x1a3a4a, () => {
      getAudioService().play('button');
      void this.handlePasteCode();
    }, 150);

    const backBtn2 = this.createButton(panelX + 90, panelY + 90, '← Regresar', 0x2a1a1a, () => {
      this.showMenu(width, height);
    }, 150);

    this.statusText = this.add.text(panelX, panelY + 140, '', {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.errorText = this.add.text(panelX, panelY + 160, '', {
      fontSize: '13px',
      color: '#ff6666',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    container.add([panel, inputBox, confirmBtn, pasteBtn, backBtn2]);
    void inputBox;
  }

  private showWaiting(width: number, height: number): void {
    this.clearContainers();
    this.currentView = 'waiting';

    const container = this.add.container(0, 0);
    this.containers.push(container);

    const panelX = width / 2;
    const panelY = height / 2 + 20;

    const panel = this.add.rectangle(panelX, panelY, 500, 400, 0x0a1428, 0.95);
    panel.setStrokeStyle(2, 0xd4af37, 0.7);

    this.add.text(panelX, panelY - 165, this.isHost ? 'Sala de Espera' : 'Conectado', {
      fontSize: '20px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    if (this.isHost) {
      this.add.text(panelX, panelY - 130, 'Comparte este código con tus amigos:', {
        fontSize: '13px',
        color: '#888888',
        fontFamily: 'Georgia, serif',
      }).setOrigin(0.5);

      const codeBox = this.add.rectangle(panelX, panelY - 100, 440, 44, 0x071020);
      codeBox.setStrokeStyle(2, 0xd4af37, 0.5);

      this.add.text(panelX, panelY - 100, this.matchId, {
        fontSize: '13px',
        color: '#d4af37',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      const copyBtn = this.createButton(panelX, panelY - 58, 'Copiar código', 0x1a3a4a, () => {
        getAudioService().play('button');
        void this.handleCopyCode();
      }, 170);

      container.add([codeBox, copyBtn]);
    } else {
      this.add.text(panelX, panelY - 120, 'Esperando que el host inicie el juego...', {
        fontSize: '14px',
        color: '#aaaaaa',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
      }).setOrigin(0.5);
    }

    this.add.text(panelX, panelY - 55, 'Jugadores en la sala:', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.waitingPlayerList = this.add.text(panelX, panelY + 30, '', {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: 'Georgia, serif',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    this.statusText = this.add.text(panelX, panelY + 130, '', {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.errorText = this.add.text(panelX, panelY + 155, '', {
      fontSize: '13px',
      color: '#ff6666',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    if (this.isHost) {
      this._startBtn = this.createButton(panelX, panelY + 170, '▶ Iniciar Juego', 0x1a4a2a, () => {
        getAudioService().play('button');
        this.handleStartGame();
      });
      container.add([this._startBtn!]);
    }

    const leaveBtn = this.createButton(panelX + (this.isHost ? 130 : 0), panelY + 170, 'Salir', 0x3a1a1a, () => {
      resetNakamaNetworkService();
      this.showMenu(width, height);
    });
    container.add([panel, leaveBtn]);

    this.updateWaitingList();

    this.loadingTimer = this.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        this.loadingDots = (this.loadingDots + 1) % 4;
        const dots = '.'.repeat(this.loadingDots);
        if (this.statusText) {
          this.statusText.setText(`Esperando jugadores${dots}`);
        }
      },
    });
  }

  private updateWaitingList(): void {
    const ns = getNakamaNetworkService();
    const state = ns.gameState;
    if (state?.players && this.waitingPlayerList) {
      const names = state.players.map((p, i) =>
        `${i + 1}. ${p.name}${p.name === this.nameValue ? ' (tú)' : ''}`
      );
      this.waitingPlayerList.setText(names.join('\n'));
    }
    this.updateStartButtonState();
  }

  private async handleCreateMatch(width: number, height: number): Promise<void> {
    const name = this.nameValue.trim() || 'Jugador';
    this.playerName = name;
    this.isHost = true;

    if (this.statusText) this.statusText.setText('Conectando al servidor...');
    if (this.errorText) this.errorText.setText('');

    try {
      const ns = getNakamaNetworkService();
      await ns.connect(this.playerId);
      this.playerId = ns.getLocalPlayerId();
      const id = await ns.createMatch(name, this.targetWin);
      this.matchId = id;

      ns.on('GAME_STATE_SYNC', () => {
        if (this.currentView === 'waiting') this.updateWaitingList();
      });

      this.showWaiting(width, height);
    } catch (e) {
      if (this.errorText) this.errorText.setText(`Error: ${String(e)}`);
      resetNakamaNetworkService();
    }
  }

  private async handleJoinMatch(width: number, height: number): Promise<void> {
    const id = this.joinInput.trim();
    if (!id) {
      if (this.errorText) this.errorText.setText('Ingresa el código de la partida.');
      return;
    }

    const name = this.nameValue.trim() || 'Jugador';
    this.playerName = name;
    this.matchId = id;
    this.isHost = false;

    if (this.statusText) this.statusText.setText('Uniéndose a la partida...');
    if (this.errorText) this.errorText.setText('');

    try {
      const ns = getNakamaNetworkService();
      await ns.connect(this.playerId);
      this.playerId = ns.getLocalPlayerId();
      await ns.joinMatch(id, name);

      ns.on('GAME_STATE_SYNC', (event) => {
        const state = (event.payload as { state: { status: string; players: { name: string }[] } }).state;
        if (this.currentView === 'waiting') this.updateWaitingList();
        if (state.status === 'playing') {
          this.launchGame();
        }
      });

      this.showWaiting(width, height);
    } catch (e) {
      if (this.errorText) this.errorText.setText(`Error al unirse: ${String(e)}`);
      resetNakamaNetworkService();
    }
  }

  private handleStartGame(): void {
    const playerCount = getNakamaNetworkService().gameState?.players.length ?? 0;
    if (playerCount < MIN_MULTIPLAYER_PLAYERS) {
      if (this.errorText) {
        this.errorText.setText(`Se requieren al menos ${MIN_MULTIPLAYER_PLAYERS} jugadores para iniciar.`);
      }
      return;
    }
    if (this.errorText) this.errorText.setText('');
    this.launchGame();
  }

  private launchGame(): void {
    if (this.loadingTimer) { this.loadingTimer.remove(); this.loadingTimer = null; }
    this.scene.start('GameScene', {
      playerId: this.playerId,
      targetWin: this.targetWin,
      useNakama: true,
      playerName: this.playerName,
    });
  }

  private setupKeyboard(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!this.inputActive) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        if (this.inputActive === 'matchId') {
          void this.handlePasteCode();
        }
        return;
      }

      if (event.key === 'Backspace') {
        if (this.inputActive === 'name') {
          this.nameValue = this.nameValue.slice(0, -1);
          this.nameInputText?.setText(this.nameValue || '_');
        } else {
          this.joinInput = this.joinInput.slice(0, -1);
          this.joinInputText?.setText(this.joinInput || 'Pega el código aquí...');
          if (this.joinInputText) this.joinInputText.setColor(this.joinInput ? '#ffffff' : '#555555');
        }
        return;
      }

      if (event.key === 'Enter') {
        this.inputActive = null;
        return;
      }

      if (event.key === 'Escape') {
        this.inputActive = null;
        return;
      }

      if (event.key.length !== 1) return;

      if (this.inputActive === 'name' && this.nameValue.length < 20) {
        this.nameValue += event.key;
        this.nameInputText?.setText(this.nameValue);
      } else if (this.inputActive === 'matchId') {
        this.joinInput += event.key;
        this.joinInputText?.setText(this.joinInput);
        if (this.joinInputText) this.joinInputText.setColor('#ffffff');
      }
    });
  }

  private async handleCopyCode(): Promise<void> {
    if (!this.matchId) {
      if (this.errorText) this.errorText.setText('No hay código de sala para copiar.');
      return;
    }

    if (!window.isSecureContext || !navigator.clipboard) {
      if (this.errorText) this.errorText.setText('Portapapeles no disponible en este entorno.');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.matchId);
      if (this.statusText) this.statusText.setText('Código copiado al portapapeles.');
      if (this.errorText) this.errorText.setText('');
    } catch {
      if (this.errorText) this.errorText.setText('No se pudo copiar el código.');
    }
  }

  private async handlePasteCode(): Promise<void> {
    if (!window.isSecureContext || !navigator.clipboard) {
      if (this.errorText) this.errorText.setText('Portapapeles no disponible en este entorno.');
      return;
    }

    try {
      const pasted = (await navigator.clipboard.readText()).trim();
      if (!pasted) {
        if (this.errorText) this.errorText.setText('El portapapeles está vacío.');
        return;
      }

      this.joinInput = pasted;
      this.joinInputText?.setText(this.joinInput);
      this.joinInputText?.setColor('#ffffff');
      if (this.statusText) this.statusText.setText('Código pegado. Puedes unirte ahora.');
      if (this.errorText) this.errorText.setText('');
    } catch {
      if (this.errorText) this.errorText.setText('No se pudo leer el portapapeles.');
    }
  }

  private createButton(
    x: number, y: number,
    label: string,
    color: number,
    onClick: () => void,
    width = 150,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, width, 42, color);
    bg.setStrokeStyle(2, 0xd4af37, 0.7);
    const text = this.add.text(0, 0, label, {
      fontSize: '15px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([bg, text]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -21, width, 42),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', onClick);
    container.on('pointerover', () => {
      bg.setFillStyle(color + 0x111111);
      this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 80 });
    });
    container.on('pointerout', () => {
      bg.setFillStyle(color);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
    });
    return container;
  }

  private createModeButton(
    x: number, y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 130, 38, 0x0d1e30);
    bg.setStrokeStyle(1, 0x4a7a9b);
    const text = this.add.text(0, 0, label, {
      fontSize: '15px',
      color: '#cccccc',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
    container.add([bg, text]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-65, -19, 130, 38),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', onClick);
    return container;
  }

  private updateStartButtonState(): void {
    if (!this.isHost || !this._startBtn) return;
    const playerCount = getNakamaNetworkService().gameState?.players.length ?? 0;
    const canStart = playerCount >= MIN_MULTIPLAYER_PLAYERS;

    this._startBtn.setAlpha(canStart ? 1 : 0.55);
  }

  shutdown(): void {
    if (this.loadingTimer) { this.loadingTimer.remove(); this.loadingTimer = null; }
  }
}
