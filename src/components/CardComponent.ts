import Phaser from 'phaser';
import type { LotteryCard } from '../types';
import { CARD_ATLAS_KEY, getCardFrameById } from '../data/cards';

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
  private border!: Phaser.GameObjects.Rectangle;
  private hoverBorder!: Phaser.GameObjects.Rectangle;
  private markOverlay!: Phaser.GameObjects.Rectangle;
  private frijol!: Phaser.GameObjects.Arc;
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
        if (!this.marked) this.hoverBorder.setVisible(true);
      });
      this.on('pointerout', () => {
        this.hoverBorder.setVisible(false);
      });
    }

    scene.add.existing(this);
  }

  private buildCard(): void {
    const w = this.cardWidth;
    const h = this.cardHeight;

    const frame = getCardFrameById(this.card.id);
    const cardImage = this.scene.add.image(0, 0, CARD_ATLAS_KEY, frame);
    cardImage.setDisplaySize(w, h);

    this.border = this.scene.add.rectangle(0, 0, w, h);
    this.border.setFillStyle(0x000000, 0);
    this.border.setStrokeStyle(2, 0x111111, 0.5);

    this.hoverBorder = this.scene.add.rectangle(0, 0, w + 2, h + 2);
    this.hoverBorder.setFillStyle(0x000000, 0);
    this.hoverBorder.setStrokeStyle(3, 0xffffff, 0.95);
    this.hoverBorder.setVisible(false);

    this.markOverlay = this.scene.add.rectangle(0, 0, w, h, 0x101010, 0.28);
    this.markOverlay.setVisible(false);

    const beanRadius = Math.max(8, Math.floor(Math.min(w, h) * 0.14));
    this.frijol = this.scene.add.circle(0, 0, beanRadius, 0x6f3b19, 0.95);
    this.frijol.setStrokeStyle(2, 0xf0d9a0, 0.9);
    this.frijol.setVisible(false);

    this.add([cardImage, this.border, this.hoverBorder, this.markOverlay, this.frijol]);
  }

  mark(animate = true): void {
    if (this.marked) return;
    this.marked = true;
    this.markOverlay.setVisible(true);
    this.frijol.setVisible(true);

    if (animate && this.scene) {
      this.markOverlay.setAlpha(0);
      this.frijol.setAlpha(0);
      this.scene.tweens.add({
        targets: [this.markOverlay, this.frijol],
        alpha: 1,
        duration: 220,
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
    this.frijol.setVisible(false);
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
      this.hoverBorder.setVisible(true);
      this.hoverBorder.setStrokeStyle(3, 0xffff66, 1);
    } else {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: 'Power2',
      });
      this.hoverBorder.setVisible(false);
      this.hoverBorder.setStrokeStyle(3, 0xffffff, 0.95);
    }
  }
}
