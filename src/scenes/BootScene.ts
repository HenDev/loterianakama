import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.scale;

    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x0d1b2a);
    this.add.text(width / 2, height / 2 - 60, 'LOTERÍA MEXICANA', {
      fontSize: '42px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 10, 'Multijugador', {
      fontSize: '20px',
      color: '#aaaaaa',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    const loadingBg = this.add.rectangle(width / 2, height / 2 + 60, 320, 20, 0x333333);
    loadingBg.setStrokeStyle(1, 0x555555);

    const progressBar = this.add.rectangle(width / 2 - 155, height / 2 + 60, 4, 14, 0xd4af37);
    progressBar.setOrigin(0, 0.5);

    const loadingText = this.add.text(width / 2, height / 2 + 90, 'Cargando...', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressBar.setScale(value * 310 / 4, 1);
      progressBar.setDisplaySize(value * 310, 14);
    });

    this.load.on('complete', () => {
      loadingText.setText('¡Listo!');
    });

    void bg;
  }

  create(): void {
    this.scene.start('LobbyScene');
  }
}
