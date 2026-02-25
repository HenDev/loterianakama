import Phaser from 'phaser';
import type { Player, GameState } from '../types';
import { getAudioService } from '../services/AudioService';
import { resetMockNetworkService } from '../services/MockNetworkService';
import { resetNakamaNetworkService } from '../services/NakamaNetworkService';

export class ResultScene extends Phaser.Scene {
  private winner: Player | null = null;
  private isLocalWinner = false;
  private gameState: GameState | null = null;
  private useNakama = false;

  constructor() {
    super({ key: 'ResultScene' });
  }

  init(data: { winner: Player; isLocalWinner: boolean; gameState: GameState; useNakama?: boolean }): void {
    this.winner = data.winner;
    this.isLocalWinner = data.isLocalWinner;
    this.gameState = data.gameState;
    this.useNakama = data.useNakama ?? false;
  }

  create(): void {
    const { width, height } = this.scale;
    this.buildBackground(width, height);
    this.buildResults(width, height);
    this.buildParticles(width, height);
    getAudioService().play(this.isLocalWinner ? 'win' : 'lose');
  }

  private buildBackground(width: number, height: number): void {
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x0d1b2a);
    void bg;
    const overlay = this.add.rectangle(width / 2, height / 2, width, height,
      this.isLocalWinner ? 0xd4af37 : 0x8B1A1A, 0.1);
    void overlay;
  }

  private buildResults(width: number, height: number): void {
    const centerX = width / 2;

    if (this.isLocalWinner) {
      this.add.text(centerX, height * 0.22, '🏆 ¡LOTERÍA! 🏆', {
        fontSize: '56px',
        color: '#d4af37',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(centerX, height * 0.30, '¡Felicidades, ganaste!', {
        fontSize: '28px',
        color: '#ffffff',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
      }).setOrigin(0.5);
    } else {
      this.add.text(centerX, height * 0.22, '¡Lotería!', {
        fontSize: '56px',
        color: '#cc4444',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(centerX, height * 0.30, 'Otro jugador ganó esta vez', {
        fontSize: '24px',
        color: '#aaaaaa',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
      }).setOrigin(0.5);
    }

    const winnerName = this.winner?.name ?? '???';
    const winCondition = this.winner?.winCondition === 'tabla' ? 'Tabla' : 'Línea';

    const panel = this.add.rectangle(centerX, height * 0.42, 400, 100, 0x0a0a1a, 0.9);
    panel.setStrokeStyle(2, 0xd4af37, 0.6);

    this.add.text(centerX, height * 0.38, 'GANADOR', {
      fontSize: '13px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.add.text(centerX, height * 0.43, winnerName, {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(centerX, height * 0.49, `Condición: ${winCondition}`, {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    void panel;
    this.buildScoreboard(centerX, height);
    this.buildButtons(centerX, height);
  }

  private buildScoreboard(centerX: number, height: number): void {
    if (!this.gameState) return;

    this.add.text(centerX, height * 0.58, 'RESULTADOS', {
      fontSize: '13px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const sortedPlayers = [...this.gameState.players].sort((a, b) => {
      if (a.isWinner) return -1;
      if (b.isWinner) return 1;
      return b.board.filter(c => c.marked).length - a.board.filter(c => c.marked).length;
    });

    sortedPlayers.forEach((player, i) => {
      const y = height * 0.63 + i * 30;
      const markedCount = player.board.filter(c => c.marked).length;
      const rowBg = this.add.rectangle(centerX, y, 380, 26,
        player.isWinner ? 0xd4af37 : player.id === this.gameState?.hostId ? 0x1a3a5a : 0x1a1a2e, 0.8);
      rowBg.setStrokeStyle(1, 0x333355);

      const nameColor = player.isWinner ? '#1a1a2e' : '#cccccc';
      this.add.text(centerX - 170, y, `${i + 1}. ${player.name}`, {
        fontSize: '13px',
        color: nameColor,
        fontFamily: 'Georgia, serif',
      }).setOrigin(0, 0.5);

      this.add.text(centerX + 160, y, `${markedCount}/16 cartas`, {
        fontSize: '12px',
        color: nameColor,
        fontFamily: 'monospace',
      }).setOrigin(1, 0.5);

      if (player.isWinner) {
        this.add.text(centerX + 170, y, '🏆', { fontSize: '14px' }).setOrigin(1, 0.5);
      }
      void rowBg;
    });
  }

  private buildButtons(centerX: number, height: number): void {
    const resetAll = () => {
      resetMockNetworkService();
      if (this.useNakama) resetNakamaNetworkService();
    };

    const nextScene = this.useNakama ? 'NakamaMatchScene' : 'LobbyScene';

    const playAgainBtn = this.createButton(centerX - 100, height * 0.9, 'Jugar de nuevo', 0x1a3a2a, () => {
      getAudioService().play('button');
      resetAll();
      this.scene.start(nextScene);
    });

    const quitBtn = this.createButton(centerX + 100, height * 0.9, 'Salir', 0x3a1a1a, () => {
      getAudioService().play('button');
      resetAll();
      this.scene.start('LobbyScene');
    });

    void playAgainBtn, quitBtn;
  }

  private buildParticles(width: number, height: number): void {
    if (!this.isLocalWinner) return;

    for (let i = 0; i < 25; i++) {
      const x = Math.random() * width;
      const y = -Math.random() * height * 0.5;
      const size = Math.random() * 8 + 4;
      const color = [0xd4af37, 0xff6b6b, 0x6bff6b, 0x6b6bff, 0xff6bff][Math.floor(Math.random() * 5)];
      const particle = this.add.rectangle(x, y, size, size, color);

      this.tweens.add({
        targets: particle,
        y: height + 50,
        x: x + (Math.random() - 0.5) * 200,
        rotation: Math.random() * Math.PI * 4,
        duration: Phaser.Math.Between(2000, 4000),
        delay: Math.random() * 2000,
        repeat: -1,
        ease: 'Linear',
      });
    }
    void width, height;
  }

  private createButton(
    x: number, y: number,
    label: string,
    color: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 160, 44, color);
    bg.setStrokeStyle(2, 0xd4af37, 0.7);
    const text = this.add.text(0, 0, label, {
      fontSize: '15px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([bg, text]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-80, -22, 160, 44),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', onClick);
    container.on('pointerover', () =>
      this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 100 }));
    container.on('pointerout', () =>
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 }));
    return container;
  }
}
