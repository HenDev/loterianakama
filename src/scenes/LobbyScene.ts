import Phaser from 'phaser';
import { getMockNetworkService, resetMockNetworkService } from '../services/MockNetworkService';
import { getAudioService } from '../services/AudioService';
import { generateUUID } from '../utils/shuffle';

export class LobbyScene extends Phaser.Scene {
  private playerId = '';
  private networkService = getMockNetworkService();

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    resetMockNetworkService();
    this.networkService = getMockNetworkService();
    this.playerId = generateUUID();

    const { width, height } = this.scale;
    this.buildBackground(width, height);
    this.buildTitle(width, height);
    this.buildDecoration(width, height);
    this.buildStartPanel(width, height);
    this.buildRulesPanel(width, height);
  }

  private buildBackground(width: number, height: number): void {
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x0d1b2a);
    void bg;
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2 + 1;
      const star = this.add.circle(x, y, size, 0xffffff, Math.random() * 0.5 + 0.2);
      this.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: Phaser.Math.Between(1500, 3000),
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }
  }

  private buildTitle(width: number, height: number): void {
    const titleBg = this.add.rectangle(width / 2, height * 0.18, width * 0.7, 100, 0x000000, 0.4);
    titleBg.setStrokeStyle(2, 0xd4af37, 0.6);

    const title = this.add.text(width / 2, height * 0.14, '¡LOTERÍA!', {
      fontSize: '62px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height * 0.22, 'Lotería Mexicana Multijugador', {
      fontSize: '18px',
      color: '#cccccc',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      y: height * 0.14 - 6,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    void titleBg, subtitle;
  }

  private buildDecoration(width: number, height: number): void {
    const cardNames = ['El Sol', 'La Luna', 'El Gallo', 'La Rosa', 'El Diablito'];
    const colors = [0xE67E22, 0x16A085, 0xC0392B, 0x27AE60, 0x8B1A1A];
    cardNames.forEach((name, i) => {
      const x = (i / (cardNames.length - 1)) * width * 0.8 + width * 0.1;
      const y = height * 0.68;
      const card = this.add.rectangle(x, y, 90, 130, colors[i], 0.7);
      card.setStrokeStyle(2, 0xd4af37, 0.5);
      const label = this.add.text(x, y, name, {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'Georgia, serif',
        align: 'center',
        wordWrap: { width: 80 },
      }).setOrigin(0.5);
      this.tweens.add({
        targets: [card, label],
        y: y - 8,
        duration: Phaser.Math.Between(1800, 2800),
        yoyo: true,
        repeat: -1,
        delay: i * 300,
        ease: 'Sine.easeInOut',
      });
    });
  }

  private buildStartPanel(width: number, height: number): void {
    const panelX = width / 2;
    const panelY = height * 0.42;

    const panel = this.add.rectangle(panelX, panelY, 420, 240, 0x0a0a1a, 0.9);
    panel.setStrokeStyle(2, 0xd4af37, 0.8);

    this.add.text(panelX, panelY - 100, 'UN JUGADOR — Modo de Victoria', {
      fontSize: '12px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const lineaBtn = this.createButton(panelX - 80, panelY - 70, '  Línea  ', 0x2c5364, () => {
      getAudioService().play('button');
      this.startGame('linea');
    });

    const tablaBtn = this.createButton(panelX + 80, panelY - 70, '  Tabla  ', 0x1a3a2a, () => {
      getAudioService().play('button');
      this.startGame('tabla');
    });

    this.add.text(panelX, panelY - 30, 'Jugarás contra 3 jugadores simulados', {
      fontSize: '12px',
      color: '#777777',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xd4af37, 0.3);
    divider.lineBetween(panelX - 180, panelY + 5, panelX + 180, panelY + 5);

    this.add.text(panelX, panelY + 22, 'MULTIJUGADOR EN LÍNEA', {
      fontSize: '12px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const multiBtn = this.createButton(panelX, panelY + 52, '  Jugar en Línea  ', 0x1a2a4a, () => {
      getAudioService().play('button');
      this.scene.start('NakamaMatchScene');
    }, 200);

    const hint = this.add.text(panelX, panelY + 90, 'Crea o únete a una partida con amigos', {
      fontSize: '12px',
      color: '#555555',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    const muteBtnText = this.add.text(panelX + 185, panelY - 115, '🔊', {
      fontSize: '20px',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    muteBtnText.on('pointerdown', () => {
      const audio = getAudioService();
      audio.setMuted(!audio.isMuted());
      muteBtnText.setText(audio.isMuted() ? '🔇' : '🔊');
    });

    void panel, lineaBtn, tablaBtn, divider, multiBtn, hint;
  }

  private buildRulesPanel(width: number, height: number): void {
    const rulesX = width / 2;
    const rulesY = height * 0.86;

    const rules = [
      '🃏 Se reparten tableros de 4×4 cartas',
      '🎴 El cantor voltea cartas del mazo uno a uno',
      '✅ Marca tus cartas cuando sean cantadas',
      '🏆 Gana quien complete una línea o tabla primero',
    ];

    const ruleText = this.add.text(rulesX, rulesY - 30, rules.join('\n'), {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);

    void ruleText;
  }

  private createButton(
    x: number, y: number,
    label: string,
    color: number,
    onClick: () => void,
    btnWidth = 130,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, btnWidth, 44, color);
    bg.setStrokeStyle(2, 0xd4af37, 0.7);
    const text = this.add.text(0, 0, label, {
      fontSize: '16px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-btnWidth / 2, -22, btnWidth, 44),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', onClick);
    container.on('pointerover', () => {
      bg.setFillStyle(color + 0x111111);
      this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 100 });
    });
    container.on('pointerout', () => {
      bg.setFillStyle(color);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
    });

    return container;
  }

  private startGame(mode: 'linea' | 'tabla'): void {
    this.networkService.connect(this.playerId).then(() => {
      this.scene.start('GameScene', {
        playerId: this.playerId,
        targetWin: mode,
      });
    });
  }
}
