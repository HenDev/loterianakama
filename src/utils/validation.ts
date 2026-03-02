import type {
  BoardCell,
  LinePattern,
  SquarePattern,
  WinCheckResult,
  WinCondition,
} from '../types';
import { normalizeWinCondition } from './winCondition';

const BOARD_SIZE = 4;

const SQUARE_PATTERNS: Record<SquarePattern, number[]> = {
  esquinas: [0, 3, 12, 15],
  centro: [5, 6, 9, 10],
};

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

function getSquare(board: BoardCell[], pattern: SquarePattern): BoardCell[] {
  return SQUARE_PATTERNS[pattern].map(index => board[index]);
}

function isPatternComplete(cells: BoardCell[]): boolean {
  return cells.every(cell => cell.marked);
}

function createLineResult(pattern: LinePattern, cells: BoardCell[]): WinCheckResult {
  return {
    isWin: true,
    condition: {
      type: 'linea',
      lineTypes: [pattern],
    },
    lines: [cells.map(cell => cell.cardId)],
  };
}

function createSquareResult(pattern: SquarePattern, cells: BoardCell[]): WinCheckResult {
  return {
    isWin: true,
    condition: {
      type: 'cuadro',
      squareTypes: [pattern],
    },
    lines: [cells.map(cell => cell.cardId)],
  };
}

export function checkLinea(board: BoardCell[], condition: WinCondition = { type: 'linea', lineTypes: ['horizontal', 'vertical', 'diagonal'] }): WinCheckResult {
  const normalized = normalizeWinCondition(condition);
  if (normalized.type !== 'linea') return { isWin: false };

  if (normalized.lineTypes.includes('horizontal')) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      const cells = getRow(board, row);
      if (isPatternComplete(cells)) {
        return createLineResult('horizontal', cells);
      }
    }
  }

  if (normalized.lineTypes.includes('vertical')) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cells = getColumn(board, col);
      if (isPatternComplete(cells)) {
        return createLineResult('vertical', cells);
      }
    }
  }

  if (normalized.lineTypes.includes('diagonal')) {
    for (const cells of getDiagonals(board)) {
      if (isPatternComplete(cells)) {
        return createLineResult('diagonal', cells);
      }
    }
  }

  return { isWin: false };
}

export function checkCuadro(board: BoardCell[], condition: WinCondition = { type: 'cuadro', squareTypes: ['esquinas', 'centro'] }): WinCheckResult {
  const normalized = normalizeWinCondition(condition);
  if (normalized.type !== 'cuadro') return { isWin: false };

  for (const pattern of normalized.squareTypes) {
    const cells = getSquare(board, pattern);
    if (isPatternComplete(cells)) {
      return createSquareResult(pattern, cells);
    }
  }

  return { isWin: false };
}

export function checkTabla(board: BoardCell[]): WinCheckResult {
  if (board.every(cell => cell.marked)) {
    return {
      isWin: true,
      condition: { type: 'tabla' },
      lines: [board.map(cell => cell.cardId)],
    };
  }

  return { isWin: false };
}

export function checkWin(board: BoardCell[], condition: WinCondition): WinCheckResult {
  const normalized = normalizeWinCondition(condition);

  switch (normalized.type) {
    case 'linea':
      return checkLinea(board, normalized);
    case 'cuadro':
      return checkCuadro(board, normalized);
    case 'tabla':
      return checkTabla(board);
  }
}

export function validateClaim(
  board: BoardCell[],
  drawnCards: number[],
  condition: WinCondition
): WinCheckResult {
  const markedIds = board.filter(cell => cell.marked).map(cell => cell.cardId);
  const allMarkedAreDrawn = markedIds.every(id => drawnCards.includes(id));
  if (!allMarkedAreDrawn) return { isWin: false };

  return checkWin(board, condition);
}
