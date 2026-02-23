import { describe, it, expect } from 'vitest';
import { checkLinea, checkTabla, validateClaim } from '../utils/validation';
import type { BoardCell } from '../types';

function makeBoard(markedIndices: number[]): BoardCell[] {
  return Array.from({ length: 16 }, (_, i) => ({
    cardId: i + 1,
    marked: markedIndices.includes(i),
  }));
}

describe('checkLinea', () => {
  it('debe detectar primera fila completa', () => {
    const board = makeBoard([0, 1, 2, 3]);
    const result = checkLinea(board);
    expect(result.isWin).toBe(true);
    expect(result.condition).toBe('linea');
  });

  it('debe detectar última fila completa', () => {
    const board = makeBoard([12, 13, 14, 15]);
    const result = checkLinea(board);
    expect(result.isWin).toBe(true);
  });

  it('debe detectar primera columna completa', () => {
    const board = makeBoard([0, 4, 8, 12]);
    const result = checkLinea(board);
    expect(result.isWin).toBe(true);
  });

  it('debe detectar diagonal principal completa', () => {
    const board = makeBoard([0, 5, 10, 15]);
    const result = checkLinea(board);
    expect(result.isWin).toBe(true);
  });

  it('debe detectar diagonal anti completa', () => {
    const board = makeBoard([3, 6, 9, 12]);
    const result = checkLinea(board);
    expect(result.isWin).toBe(true);
  });

  it('no debe detectar línea incompleta', () => {
    const board = makeBoard([0, 1, 2]);
    const result = checkLinea(board);
    expect(result.isWin).toBe(false);
  });

  it('no debe detectar tablero vacío como ganador', () => {
    const board = makeBoard([]);
    const result = checkLinea(board);
    expect(result.isWin).toBe(false);
  });
});

describe('checkTabla', () => {
  it('debe detectar tablero completo', () => {
    const board = makeBoard(Array.from({ length: 16 }, (_, i) => i));
    const result = checkTabla(board);
    expect(result.isWin).toBe(true);
    expect(result.condition).toBe('tabla');
  });

  it('no debe detectar tabla con 15 marcadas', () => {
    const board = makeBoard(Array.from({ length: 15 }, (_, i) => i));
    const result = checkTabla(board);
    expect(result.isWin).toBe(false);
  });
});

describe('validateClaim', () => {
  it('debe validar reclamo legítimo de línea', () => {
    const board = makeBoard([0, 1, 2, 3]);
    const drawnCards = [1, 2, 3, 4];
    const result = validateClaim(board, drawnCards, 'linea');
    expect(result.isWin).toBe(true);
  });

  it('debe rechazar reclamo con cartas no cantadas', () => {
    const board = makeBoard([0, 1, 2, 3]);
    const drawnCards = [1, 2, 3];
    const result = validateClaim(board, drawnCards, 'linea');
    expect(result.isWin).toBe(false);
  });

  it('debe rechazar reclamo sin línea completa', () => {
    const board = makeBoard([0, 1]);
    const drawnCards = [1, 2];
    const result = validateClaim(board, drawnCards, 'linea');
    expect(result.isWin).toBe(false);
  });
});
