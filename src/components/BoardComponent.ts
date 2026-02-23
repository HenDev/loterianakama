import Phaser from 'phaser';
import type { BoardCell } from '../types';
import { getCardById } from '../data/cards';
import { CardComponent } from './CardComponent';
import { getAudioService } from '../services/AudioService';

interface BoardOptions {
  x: number;
  y: number;
  cells: BoardCell[];
  cellWidth: number;
  cellHeight: number;
  gap: number;
  interactive: boolean;
  onMark?: (cardId: number) => void;
  playerName?: string;
}

export class BoardComponent extends Phaser.GameObjects.Container {
  private cardComponents: CardComponent[] = [];
  private opts: BoardOptions;
  private highlightedCards = new Set<number>();

  constructor(scene: Phaser.Scene, options: BoardOptions) {
    super(scene, options.x, options.y);
    this.opts = options;
    this.build();
    scene.add.existing(this);
  }

  private build(): void {
    const { cellWidth, cellHeight, gap, cells, interactive, onMark, playerName } = this.opts;
    const COLS = 4;
    const ROWS = 4;
    const totalW = COLS * cellWidth + (COLS - 1) * gap;
    const totalH = ROWS * cellHeight + (ROWS - 1) * gap;

    const bgPad = 12;
    const bg = this.scene.add.rectangle(0, 0, totalW + bgPad * 2, totalH + bgPad * 2, 0x1a1a2e, 0.85);
    bg.setStrokeStyle(2, 0xd4af37, 0.8);
    this.add(bg);

    if (playerName) {
      const label = this.scene.add.text(0, -totalH / 2 - bgPad - 14, playerName, {
        fontSize: '14px',
        color: '#d4af37',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);
      this.add(label);
    }

    const startX = -(totalW / 2) + cellWidth / 2;
    const startY = -(totalH / 2) + cellHeight / 2;

    cells.forEach((cell, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = startX + col * (cellWidth + gap);
      const cy = startY + row * (cellHeight + gap);

      const cardData = getCardById(cell.cardId);
      if (!cardData) return;

      const cardComp = new CardComponent(this.scene, {
        x: cx,
        y: cy,
        width: cellWidth,
        height: cellHeight,
        card: cardData,
        marked: cell.marked,
        interactive,
        onMark: (cardId) => {
          getAudioService().play('mark');
          onMark?.(cardId);
        },
      });

      this.cardComponents.push(cardComp);
      this.add(cardComp);
    });
  }

  updateCell(cardId: number, marked: boolean): void {
    const comp = this.cardComponents.find(c => c.getCardData().id === cardId);
    if (!comp) return;
    if (marked && !comp.isMarked()) comp.mark(true);
    if (!marked && comp.isMarked()) comp.unmark();
  }

  highlightCard(cardId: number): void {
    if (this.highlightedCards.has(cardId)) return;
    if (!this.scene || !this.active) return;
    this.highlightedCards.add(cardId);
    const comp = this.cardComponents.find(c => c.getCardData().id === cardId);
    comp?.highlight(true);
    this.scene.time.delayedCall(2000, () => {
      this.highlightedCards.delete(cardId);
      if (!this.active) return;
      comp?.highlight(false);
    });
  }

  updateBoard(cells: BoardCell[]): void {
    cells.forEach(cell => this.updateCell(cell.cardId, cell.marked));
  }

  destroy(fromScene?: boolean): void {
    this.cardComponents.forEach(c => c.destroy(fromScene));
    this.cardComponents = [];
    super.destroy(fromScene);
  }
}
