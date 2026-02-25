import Phaser from 'phaser';
import type { LotteryCard } from '../types';
import { CARD_ATLAS_KEY, CARD_BACK_FRAME, getCardFrameById } from '../data/cards';

export class DeckCardComponent extends Phaser.GameObjects.Container {
  private frontFace!: Phaser.GameObjects.Image;
  private backFace!: Phaser.GameObjects.Image;
  private border!: Phaser.GameObjects.Rectangle;
  private readonly cardWidth: number;
  private readonly cardHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y);
    this.cardWidth = width;
    this.cardHeight = height;
    this.buildFaces();
    scene.add.existing(this);
  }

  private buildFaces(): void {
    this.backFace = this.scene.add.image(0, 0, CARD_ATLAS_KEY, CARD_BACK_FRAME);
    this.backFace.setDisplaySize(this.cardWidth, this.cardHeight);

    this.frontFace = this.scene.add.image(0, 0, CARD_ATLAS_KEY, getCardFrameById(1));
    this.frontFace.setDisplaySize(this.cardWidth, this.cardHeight);
    this.frontFace.setVisible(false);

    this.border = this.scene.add.rectangle(0, 0, this.cardWidth, this.cardHeight);
    this.border.setFillStyle(0x000000, 0);
    this.border.setStrokeStyle(2, 0xd4af37, 0.9);

    this.add([this.backFace, this.frontFace, this.border]);
  }

  showCard(card: LotteryCard): void {
    this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      duration: 180,
      ease: 'Power2',
      onComplete: () => {
        this.backFace.setVisible(false);
        this.frontFace.setFrame(getCardFrameById(card.id)).setVisible(true);
        this.scene.tweens.add({
          targets: this,
          scaleX: 1,
          duration: 180,
          ease: 'Power2',
        });
      },
    });
  }

  showBack(): void {
    this.backFace.setVisible(true);
    this.frontFace.setVisible(false);
    this.setScale(1);
  }
}
