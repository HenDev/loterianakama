import type { BoardCell, WinCheckResult, WinCondition } from '../types';

const BOARD_SIZE = 4;

function getRow(board: BoardCell[], row: number): BoardCell[] {
  return board.slice(row * BOARD_SIZE, row * BOARD_SIZE + BOARD_SIZE);
}

function getColumn(board: BoardCell[], col: number): BoardCell[] {
  return [0, 1, 2, 3].map(row => board[row * BOARD_SIZE + col]);
}

function getDiagonals(board: BoardCell[]): BoardCell[][] {
  const main = [0, 1, 2, 3].map(i => board[i * BOARD_SIZE + i]);
  const anti = [0, 1, 2, 3].map(i => board[i * BOARD_SIZE + (BOARD_SIZE - 1 - i)]);
  return [main, anti];
}

function isLineComplete(cells: BoardCell[]): boolean {
  return cells.every(cell => cell.marked);
}

export function checkLinea(board: BoardCell[]): WinCheckResult {
  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = getRow(board, i);
    if (isLineComplete(row)) {
      return {
        isWin: true,
        condition: 'linea',
        lines: [row.map(c => c.cardId)],
      };
    }
  }
  for (let i = 0; i < BOARD_SIZE; i++) {
    const col = getColumn(board, i);
    if (isLineComplete(col)) {
      return {
        isWin: true,
        condition: 'linea',
        lines: [col.map(c => c.cardId)],
      };
    }
  }
  for (const diag of getDiagonals(board)) {
    if (isLineComplete(diag)) {
      return {
        isWin: true,
        condition: 'linea',
        lines: [diag.map(c => c.cardId)],
      };
    }
  }
  return { isWin: false };
}

export function checkTabla(board: BoardCell[]): WinCheckResult {
  if (board.every(cell => cell.marked)) {
    return {
      isWin: true,
      condition: 'tabla',
      lines: [board.map(c => c.cardId)],
    };
  }
  return { isWin: false };
}

export function checkWin(board: BoardCell[], condition: WinCondition): WinCheckResult {
  if (condition === 'tabla') return checkTabla(board);
  return checkLinea(board);
}

export function validateClaim(
  board: BoardCell[],
  drawnCards: number[],
  condition: WinCondition
): WinCheckResult {
  const markedIds = board.filter(c => c.marked).map(c => c.cardId);
  const allMarkedAreDrawn = markedIds.every(id => drawnCards.includes(id));
  if (!allMarkedAreDrawn) return { isWin: false };
  return checkWin(board, condition);
}
