import Phaser from 'phaser';
import type { LotteryCard } from '../types';
import { CARD_ATLAS_KEY, getCardFrameById } from '../data/cards';
import { CORCHOLATA_ATLAS_KEY } from '../data/corcholatas';

export interface CardComponentOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  card: LotteryCard;
  marked?: boolean;
  interactive?: boolean;
  onMark?: (cardId: number) => void;
  corcholataFrame?: string;
  corcholataRotationSeed?: number;
}

export class CardComponent extends Phaser.GameObjects.Container {
  private card: LotteryCard;
  private border!: Phaser.GameObjects.Rectangle;
  private hoverBorder!: Phaser.GameObjects.Rectangle;
  private markOverlay!: Phaser.GameObjects.Rectangle;
  private corcholataMark!: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private marked = false;
  private cardWidth: number;
  private cardHeight: number;
  private corcholataFrame?: string;
  private corcholataRotationSeed: number;

  constructor(scene: Phaser.Scene, options: CardComponentOptions) {
    super(scene, options.x, options.y);
    this.card = options.card;
    this.cardWidth = options.width;
    this.cardHeight = options.height;
    this.corcholataFrame = options.corcholataFrame;
    this.corcholataRotationSeed = options.corcholataRotationSeed ?? 0;

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

    const corcholataFrame = this.corcholataFrame;
    const hasCorcholataFrame =
      !!corcholataFrame &&
      this.scene.textures.exists(CORCHOLATA_ATLAS_KEY) &&
      this.scene.textures.get(CORCHOLATA_ATLAS_KEY).has(corcholataFrame);
    const hasStandaloneCorcholataTexture =
      !!corcholataFrame &&
      this.scene.textures.exists(corcholataFrame);

    if (hasCorcholataFrame) {
      const corcholata = this.scene.add.image(0, 0, CORCHOLATA_ATLAS_KEY, corcholataFrame);
      const maxWidth = w * 0.6;
      const maxHeight = h * 0.6;
      const scale = Math.min(maxWidth / corcholata.width, maxHeight / corcholata.height);
      corcholata.setScale(scale);
      corcholata.setAngle(this.getMarkRotationDegrees());
      corcholata.setVisible(false);
      this.corcholataMark = corcholata;
    } else if (hasStandaloneCorcholataTexture) {
      const corcholata = this.scene.add.image(0, 0, corcholataFrame);
      const maxWidth = w * 0.6;
      const maxHeight = h * 0.6;
      const scale = Math.min(maxWidth / corcholata.width, maxHeight / corcholata.height);
      corcholata.setScale(scale);
      corcholata.setAngle(this.getMarkRotationDegrees());
      corcholata.setVisible(false);
      this.corcholataMark = corcholata;
    } else {
      const beanRadius = Math.max(8, Math.floor(Math.min(w, h) * 0.14));
      const frijol = this.scene.add.circle(0, 0, beanRadius, 0x6f3b19, 0.95);
      frijol.setStrokeStyle(2, 0xf0d9a0, 0.9);
      frijol.setVisible(false);
      this.corcholataMark = frijol;
    }

    this.add([cardImage, this.border, this.hoverBorder, this.markOverlay, this.corcholataMark]);
  }

  mark(animate = true): void {
    if (this.marked) return;
    this.marked = true;
    // this.markOverlay.setVisible(true); // Efecto de oscurecimiento deshabilitado temporalmente
    this.corcholataMark.setVisible(true);

    if (animate && this.scene) {
      // this.markOverlay.setAlpha(0); // Efecto de oscurecimiento deshabilitado temporalmente
      this.corcholataMark.setAlpha(0);
      this.scene.tweens.add({
        targets: [this.corcholataMark],
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
    this.corcholataMark.setVisible(false);
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

  private getMarkRotationDegrees(): number {
    const spread = 46;
    const seed = (this.card.id * 37 + this.corcholataRotationSeed * 17) % spread;
    return seed - 23;
  }
}
