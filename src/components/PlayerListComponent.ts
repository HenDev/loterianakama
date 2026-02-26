import Phaser from 'phaser';
import type { Player } from '../types';

export class PlayerListComponent extends Phaser.GameObjects.Container {
  private rows: Phaser.GameObjects.Container[] = [];
  private readonly ROW_H = 40;
  private readonly WIDTH = 200;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  update(players: Player[]): void {
    this.rows.forEach(r => r.destroy());
    this.rows = [];

    const title = this.scene.add.text(0, 0, 'JUGADORES', {
      fontSize: '13px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);
    this.add(title);

    players.forEach((player, i) => {
      const row = this.scene.add.container(0, 28 + i * this.ROW_H);

      const bgColor = player.isWinner ? 0xd4af37 : player.isHuman ? 0x2c5364 : 0x1a1a2e;
      const bg = this.scene.add.rectangle(0, 0, this.WIDTH, this.ROW_H - 4, bgColor, 0.9);
      bg.setStrokeStyle(1, player.isConnected ? 0x444466 : 0x333333, 1);

      const statusDot = this.scene.add.circle(
        -this.WIDTH / 2 + 10, 0,
        5,
        player.isConnected ? 0x00ff88 : 0xff3300
      );

      const nameText = this.scene.add.text(
        -this.WIDTH / 2 + 24, 0,
        (player.isHuman ? '▶ ' : '') + player.name,
        {
          fontSize: '12px',
          color: player.isWinner ? '#1a1a2e' : '#e0e0e0',
          fontFamily: 'Georgia, serif',
          fontStyle: player.isHuman ? 'bold' : 'normal',
        }
      ).setOrigin(0, 0.5);

      const markedCount = player.board.filter(c => c.marked).length;
      const progressText = this.scene.add.text(
        this.WIDTH / 2 - 8, 0,
        `${markedCount}/16`,
        {
          fontSize: '11px',
          color: player.isWinner ? '#1a1a2e' : '#aaaaaa',
          fontFamily: 'monospace',
        }
      ).setOrigin(1, 0.5);

      if (player.isWinner) {
        const crown = this.scene.add.text(this.WIDTH / 2 - 8, 0, '👑', {
          fontSize: '14px',
        }).setOrigin(1, 0.5);
        row.add(crown);
      }

      row.add([bg, statusDot, nameText, progressText]);
      this.rows.push(row);
      this.add(row);
    });
  }
}
