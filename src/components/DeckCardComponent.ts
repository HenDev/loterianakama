import Phaser from 'phaser';
import type { LotteryCard } from '../types';
import { CARD_COLORS } from '../data/cards';

export class DeckCardComponent extends Phaser.GameObjects.Container {
  private bg!: Phaser.GameObjects.Rectangle;
  private innerBg!: Phaser.GameObjects.Rectangle;
  private numText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private verseText!: Phaser.GameObjects.Text;
  private backFace!: Phaser.GameObjects.Container;
  private readonly W = 180;
  private readonly H = 260;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.buildBack();
    this.buildFront();
    scene.add.existing(this);
  }

  private buildBack(): void {
    const W = this.W;
    const H = this.H;
    this.backFace = this.scene.add.container(0, 0);

    const back = this.scene.add.rectangle(0, 0, W, H, 0x8B1A1A);
    back.setStrokeStyle(3, 0xd4af37, 1);

    const innerBack = this.scene.add.rectangle(0, 0, W - 12, H - 12, 0x000000, 0.2);
    innerBack.setStrokeStyle(2, 0xd4af37, 0.5);

    const logoText = this.scene.add.text(0, -20, 'LOTERÍA', {
      fontSize: '26px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    const subText = this.scene.add.text(0, 16, 'MEXICANA', {
      fontSize: '14px',
      color: '#d4af37cc',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5, 0.5);

    const decorTop = this.scene.add.text(0, -H / 2 + 20, '✦ ✦ ✦', {
      fontSize: '12px',
      color: '#d4af37',
    }).setOrigin(0.5, 0.5);

    const decorBot = this.scene.add.text(0, H / 2 - 20, '✦ ✦ ✦', {
      fontSize: '12px',
      color: '#d4af37',
    }).setOrigin(0.5, 0.5);

    this.backFace.add([back, innerBack, logoText, subText, decorTop, decorBot]);
    this.add(this.backFace);
  }

  private buildFront(): void {
    const W = this.W;
    const H = this.H;

    this.bg = this.scene.add.rectangle(0, 0, W, H, 0x888888);
    this.bg.setStrokeStyle(3, 0xd4af37, 1);
    this.bg.setVisible(false);

    this.innerBg = this.scene.add.rectangle(0, 0, W - 12, H - 12, 0xffffff, 0.1);
    this.innerBg.setVisible(false);

    this.numText = this.scene.add.text(-W / 2 + 8, -H / 2 + 6, '', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    this.numText.setVisible(false);

    this.nameText = this.scene.add.text(0, -H * 0.1, '', {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      wordWrap: { width: W - 16 },
      align: 'center',
    }).setOrigin(0.5, 0.5);
    this.nameText.setVisible(false);

    this.verseText = this.scene.add.text(0, H * 0.28, '', {
      fontSize: '12px',
      color: '#ffffffcc',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      wordWrap: { width: W - 20 },
      align: 'center',
    }).setOrigin(0.5, 0.5);
    this.verseText.setVisible(false);

    this.add([this.bg, this.innerBg, this.numText, this.nameText, this.verseText]);
  }

  showCard(card: LotteryCard): void {
    const color = CARD_COLORS[card.category] ?? 0x555555;
    this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        this.backFace.setVisible(false);
        this.bg.setFillStyle(color);
        this.bg.setVisible(true);
        this.innerBg.setVisible(true);
        this.numText.setText(String(card.id)).setVisible(true);
        this.nameText.setText(card.name).setVisible(true);
        this.verseText.setText(card.verse).setVisible(true);
        this.scene.tweens.add({
          targets: this,
          scaleX: 1,
          duration: 200,
          ease: 'Power2',
        });
      },
    });
  }

  showBack(): void {
    this.backFace.setVisible(true);
    this.bg.setVisible(false);
    this.innerBg.setVisible(false);
    this.numText.setVisible(false);
    this.nameText.setVisible(false);
    this.verseText.setVisible(false);
    this.setScale(1);
  }
}
