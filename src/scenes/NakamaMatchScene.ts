import Phaser from 'phaser';
import type { WinCondition, GameState } from '../types';
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
  private clipboardData = '';

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

    const backBtn = this.createButton(90, hh / 2, '← Volver', 0x1a2a3a, () => {
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

    const label1 = this.add.text(panelX, panelY - 140, 'Nombre de Jugador', {
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

    const label2 = this.add.text(panelX, panelY - 55, 'Modo de Victoria', {
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

    container.add(panel);
    container.add([label1, nameBox, this.nameInputText, label2, lineaBtn, tablaBtn, createBtn, joinBtn, this.statusText, this.errorText]);
    void nameBox;
  }

  private showJoin(width: number, height: number): void {
    this.clearContainers();
    this.currentView = 'join';

    const container = this.add.container(0, 0);
    this.containers.push(container);

    const panelW = 480;
    const panelH = 400;
    const panelX = width / 2;
    const panelY = height / 2 + 20;

    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a1428, 0.95);
    panel.setStrokeStyle(2, 0xd4af37, 0.7);

    const nameLabel = this.add.text(panelX, panelY - 155, 'Tu Nombre', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const nameBox = this.add.rectangle(panelX, panelY - 125, 380, 40, 0x0d1e30);
    nameBox.setStrokeStyle(2, 0x4a7a9b);
    nameBox.setInteractive({ useHandCursor: true });
    nameBox.on('pointerdown', () => { this.inputActive = 'name'; });

    this.nameInputText = this.add.text(panelX, panelY - 125, this.nameValue, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const codeLabel = this.add.text(panelX, panelY - 85, 'Código de Partida', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const inputBox = this.add.rectangle(panelX, panelY - 50, 380, 44, 0x0d1e30);
    inputBox.setStrokeStyle(2, 0x4a7a9b);
    inputBox.setInteractive({ useHandCursor: true });
    inputBox.on('pointerdown', () => { this.inputActive = 'matchId'; });

    this.joinInputText = this.add.text(panelX, panelY - 50, this.joinInput || 'Pega el código aquí...', {
      fontSize: '14px',
      color: this.joinInput ? '#ffffff' : '#555555',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const confirmBtn = this.createButton(panelX, panelY + 30, 'Unirse a la Partida', 0x1a2a4a, () => {
      getAudioService().play('button');
      this.handleJoinMatch(width, height);
    });

    const pasteBtn = this.createButton(panelX - 90, panelY + 100, 'Pegar código', 0x1a3a4a, () => {
      getAudioService().play('button');
      void this.handlePasteCode();
    }, 150);

    const backBtn2 = this.createButton(panelX + 90, panelY + 100, '← Regresar', 0x2a1a1a, () => {
      this.showMenu(width, height);
    }, 150);

    this.statusText = this.add.text(panelX, panelY + 155, '', {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.errorText = this.add.text(panelX, panelY + 175, '', {
      fontSize: '13px',
      color: '#ff6666',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    container.add(panel);
    container.add([nameLabel, nameBox, this.nameInputText, codeLabel, inputBox, this.joinInputText, confirmBtn, pasteBtn, backBtn2, this.statusText, this.errorText]);
    void inputBox;
    void nameBox;
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
    container.add(panel);

    const title = this.add.text(panelX, panelY - 165, this.isHost ? 'Sala de Espera' : 'Conectado', {
      fontSize: '20px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    if (this.isHost) {
      const shareText = this.add.text(panelX, panelY - 130, 'Comparte este código con tus amigos:', {
        fontSize: '13px',
        color: '#888888',
        fontFamily: 'Georgia, serif',
      }).setOrigin(0.5);

      const codeBox = this.add.rectangle(panelX, panelY - 100, 440, 44, 0x071020, 1);
      codeBox.setStrokeStyle(2, 0xd4af37, 1);

      const matchIdText = this.add.text(panelX, panelY - 100, this.matchId, {
        fontSize: '15px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      const copyBtn = this.createButton(panelX, panelY - 48, 'Copiar código', 0x1a3a4a, () => {
        getAudioService().play('button');
        void this.handleCopyCode();
      }, 170);

      container.add([title, shareText, codeBox, matchIdText, copyBtn]);
    } else {
      const waitingHostText = this.add.text(panelX, panelY - 120, 'Esperando que el host inicie el juego...', {
        fontSize: '14px',
        color: '#aaaaaa',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
      }).setOrigin(0.5);
      container.add([title, waitingHostText]);
    }

    const playersLabel = this.add.text(panelX, panelY, 'Jugadores en la sala:', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.waitingPlayerList = this.add.text(panelX, panelY + 60, '', {
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
      this._startBtn = this.createButton(panelX + 90, panelY + 175, '▶ Iniciar Juego', 0x1a4a2a, () => {
        getAudioService().play('button');
        this.handleStartGame();
      });
      container.add(this._startBtn);
    }

    const leaveBtn = this.createButton(panelX - (this.isHost ? 90 : 0), panelY + 175, 'Salir', 0x3a1a1a, () => {
      resetNakamaNetworkService();
      this.showMenu(width, height);
    });
    container.add([playersLabel, this.waitingPlayerList, this.statusText, this.errorText, leaveBtn]);

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

      ns.on('GAME_STATE_SYNC', (event) => {
        const payload = event.payload as { state: GameState };
        const state = payload.state;
        if (this.currentView === 'waiting') this.updateWaitingList();
        if (state.status === 'playing') {
          this.launchGame();
        }
      });

      const id = await ns.createMatch(name, this.targetWin);
      this.matchId = id;

      if (this.clipboardData) {
        try {
          await ns.saveClipboardToStorage(this.clipboardData);
        } catch (clipErr) {
          console.error('Error saving clipboard:', clipErr);
        }
      }

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

      ns.on('GAME_STATE_SYNC', (event) => {
        const payload = event.payload as { state: GameState };
        const state = payload.state;
        if (this.currentView === 'waiting') this.updateWaitingList();
        if (state.status === 'playing') {
          this.launchGame();
        }
      });

      await ns.joinMatch(id, name);

      if (this.clipboardData) {
        try {
          await ns.saveClipboardToStorage(this.clipboardData);
        } catch (clipErr) {
          console.error('Error saving clipboard:', clipErr);
        }
      }

      this.showWaiting(width, height);
    } catch (e) {
      if (this.errorText) this.errorText.setText(`Error al unirse: ${String(e)}`);
      resetNakamaNetworkService();
    }
  }

  private handleStartGame(): void {
    const ns = getNakamaNetworkService();
    const playerCount = ns.gameState?.players.length ?? 0;
    if (playerCount < MIN_MULTIPLAYER_PLAYERS) {
      if (this.errorText) {
        this.errorText.setText(`Se requieren al menos ${MIN_MULTIPLAYER_PLAYERS} jugadores para iniciar.`);
      }
      return;
    }
    if (this.errorText) this.errorText.setText('');
    
    // Notificamos al servidor que queremos empezar
    ns.send({
      type: 'GAME_START',
      payload: { targetWin: this.targetWin },
      senderId: this.playerId,
      timestamp: Date.now(),
    });
    
    // El cambio de escena ocurrirá automáticamente cuando recibamos el GAME_STATE_SYNC
    if (this.statusText) this.statusText.setText('Iniciando partida...');
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

      try {
        const clipboardItems = await navigator.clipboard.read();
        const clipboardContent: string[] = [];

        for (const item of clipboardItems) {
          for (const type of item.types) {
            console.log(`Item type: ${type}`);
            const blob = await item.getType(type);
            const text = await blob.text();
            clipboardContent.push(`[${type}]: ${text}`);
          }
        }

        this.clipboardData = JSON.stringify({
          text: pasted,
          items: clipboardContent,
          timestamp: Date.now(),
        });
      } catch (clipError) {
        console.error('Error reading clipboard:', clipError);

        this.clipboardData = JSON.stringify({
          text: pasted,
          timestamp: Date.now(),
        });
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

    const bg = this._startBtn.getAt<Phaser.GameObjects.Rectangle>(0);
    const text = this._startBtn.getAt<Phaser.GameObjects.Text>(1);

    if (canStart) {
      bg.setStrokeStyle(2, 0xd4af37, 1);
      bg.setAlpha(1);
      text.setAlpha(1);
      this._startBtn.setAlpha(1);
    } else {
      bg.setStrokeStyle(2, 0xd4af37, 0.3);
      bg.setAlpha(0.6);
      text.setAlpha(0.6);
      this._startBtn.setAlpha(0.9);
    }
  }

  shutdown(): void {
    if (this.loadingTimer) { this.loadingTimer.remove(); this.loadingTimer = null; }
  }
}
