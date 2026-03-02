import { describe, expect, it } from 'vitest';
import { checkCuadro, checkLinea, checkTabla, validateClaim } from '../utils/validation';
import type { BoardCell } from '../types';
import { withLineTypes, withSquareTypes } from '../utils/winCondition';

function makeBoard(markedIndices: number[]): BoardCell[] {
  return Array.from({ length: 16 }, (_, index) => ({
    cardId: index + 1,
    marked: markedIndices.includes(index),
  }));
}

describe('checkLinea', () => {
  it('detecta una fila horizontal cuando esta habilitada', () => {
    const board = makeBoard([0, 1, 2, 3]);
    const result = checkLinea(board, withLineTypes(['horizontal']));

    expect(result.isWin).toBe(true);
    expect(result.condition).toEqual(withLineTypes(['horizontal']));
  });

  it('no detecta columnas si solo se permiten horizontales', () => {
    const board = makeBoard([0, 4, 8, 12]);
    const result = checkLinea(board, withLineTypes(['horizontal']));

    expect(result.isWin).toBe(false);
  });

  it('detecta diagonal cuando ese subtipo esta habilitado', () => {
    const board = makeBoard([0, 5, 10, 15]);
    const result = checkLinea(board, withLineTypes(['diagonal']));

    expect(result.isWin).toBe(true);
    expect(result.condition).toEqual(withLineTypes(['diagonal']));
  });
});

describe('checkCuadro', () => {
  it('detecta las cuatro esquinas', () => {
    const board = makeBoard([0, 3, 12, 15]);
    const result = checkCuadro(board, withSquareTypes(['esquinas']));

    expect(result.isWin).toBe(true);
    expect(result.condition).toEqual(withSquareTypes(['esquinas']));
  });

  it('detecta las cuatro cartas centrales', () => {
    const board = makeBoard([5, 6, 9, 10]);
    const result = checkCuadro(board, withSquareTypes(['centro']));

    expect(result.isWin).toBe(true);
    expect(result.condition).toEqual(withSquareTypes(['centro']));
  });
});

describe('checkTabla', () => {
  it('detecta tabla llena', () => {
    const board = makeBoard(Array.from({ length: 16 }, (_, index) => index));
    const result = checkTabla(board);

    expect(result.isWin).toBe(true);
    expect(result.condition).toEqual({ type: 'tabla' });
  });
});

describe('validateClaim', () => {
  it('valida un reclamo legitimo de linea configurada', () => {
    const board = makeBoard([0, 1, 2, 3]);
    const drawnCards = [1, 2, 3, 4];
    const result = validateClaim(board, drawnCards, withLineTypes(['horizontal']));

    expect(result.isWin).toBe(true);
  });

  it('rechaza reclamos con cartas no cantadas', () => {
    const board = makeBoard([0, 1, 2, 3]);
    const drawnCards = [1, 2, 3];
    const result = validateClaim(board, drawnCards, withLineTypes(['horizontal']));

    expect(result.isWin).toBe(false);
  });

  it('rechaza reclamos sin patron valido', () => {
    const board = makeBoard([0, 1, 2, 3]);
    const drawnCards = [1, 2, 3, 4];
    const result = validateClaim(board, drawnCards, withLineTypes(['vertical']));

    expect(result.isWin).toBe(false);
  });
});
