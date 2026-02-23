import Phaser from 'phaser';
import type { LotteryCard } from '../types';
import { CARD_COLORS } from '../data/cards';

export interface CardComponentOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  card: LotteryCard;
  marked?: boolean;
  interactive?: boolean;
  onMark?: (cardId: number) => void;
}

export class CardComponent extends Phaser.GameObjects.Container {
  private card: LotteryCard;
  private bg!: Phaser.GameObjects.Rectangle;
  private markOverlay!: Phaser.GameObjects.Rectangle;
  private nameText!: Phaser.GameObjects.Text;
  private numText!: Phaser.GameObjects.Text;
  private marked = false;
  private cardWidth: number;
  private cardHeight: number;

  constructor(scene: Phaser.Scene, options: CardComponentOptions) {
    super(scene, options.x, options.y);
    this.card = options.card;
    this.cardWidth = options.width;
    this.cardHeight = options.height;

    this.buildCard();

    if (options.marked) this.mark(false);
    if (options.interactive && options.onMark) {
      this.setInteractive(
        new Phaser.Geom.Rectangle(-this.cardWidth / 2, -this.cardHeight / 2, this.cardWidth, this.cardHeight),
        Phaser.Geom.Rectangle.Contains
      );
      this.on('pointerdown', () => {
        if (!this.marked) options.onMark!(this.card.id);
      });
      this.on('pointerover', () => {
        if (!this.marked) this.bg.setStrokeStyle(2, 0xffffff, 1);
      });
      this.on('pointerout', () => {
        this.bg.setStrokeStyle(2, 0x000000, 0.3);
      });
    }

    scene.add.existing(this);
  }

  private buildCard(): void {
    const w = this.cardWidth;
    const h = this.cardHeight;
    const color = CARD_COLORS[this.card.category] ?? 0x555555;

    this.bg = this.scene.add.rectangle(0, 0, w, h, color);
    this.bg.setStrokeStyle(2, 0x000000, 0.3);

    const innerBg = this.scene.add.rectangle(0, 0, w - 6, h - 6, 0xffffff, 0.08);

    this.numText = this.scene.add.text(-w / 2 + 5, -h / 2 + 4, String(this.card.id), {
      fontSize: `${Math.floor(h * 0.16)}px`,
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });

    this.nameText = this.scene.add.text(0, -h * 0.08, this.card.name, {
      fontSize: `${Math.floor(h * 0.14)}px`,
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      wordWrap: { width: w - 8 },
      align: 'center',
    }).setOrigin(0.5, 0.5);

    const verseText = this.scene.add.text(0, h * 0.3, this.card.verse, {
      fontSize: `${Math.max(8, Math.floor(h * 0.09))}px`,
      color: '#ffffffcc',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      wordWrap: { width: w - 10 },
      align: 'center',
    }).setOrigin(0.5, 0.5);

    this.markOverlay = this.scene.add.rectangle(0, 0, w, h, 0xff3300, 0.7);
    this.markOverlay.setVisible(false);

    const frijolText = this.scene.add.text(0, 0, '●', {
      fontSize: `${Math.floor(h * 0.4)}px`,
      color: '#8B4513',
    }).setOrigin(0.5, 0.5);
    frijolText.setVisible(false);
    (this.markOverlay as unknown as { frijol: Phaser.GameObjects.Text }).frijol = frijolText;

    this.add([this.bg, innerBg, this.numText, this.nameText, verseText, this.markOverlay, frijolText]);
  }

  mark(animate = true): void {
    if (this.marked) return;
    this.marked = true;
    this.markOverlay.setVisible(true);

    const frijol = (this.markOverlay as unknown as { frijol: Phaser.GameObjects.Text }).frijol;
    frijol.setVisible(true);

    if (animate && this.scene) {
      this.markOverlay.setAlpha(0);
      frijol.setAlpha(0);
      this.scene.tweens.add({
        targets: [this.markOverlay, frijol],
        alpha: 1,
        duration: 300,
        ease: 'Power2',
      });
      this.scene.tweens.add({
        targets: this,
        scaleX: 1.05,
        scaleY: 1.05,
        yoyo: true,
        duration: 150,
        ease: 'Sine.easeInOut',
      });
    }
  }

  unmark(): void {
    this.marked = false;
    this.markOverlay.setVisible(false);
    const frijol = (this.markOverlay as unknown as { frijol: Phaser.GameObjects.Text }).frijol;
    frijol.setVisible(false);
  }

  isMarked(): boolean {
    return this.marked;
  }

  getCardData(): LotteryCard {
    return this.card;
  }

  highlight(active: boolean): void {
    if (!this.scene || !this.active) return;
    if (active) {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 200,
        ease: 'Power2',
      });
      this.bg.setStrokeStyle(3, 0xffff00, 1);
    } else {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: 'Power2',
      });
      this.bg.setStrokeStyle(2, 0x000000, 0.3);
    }
  }
}
