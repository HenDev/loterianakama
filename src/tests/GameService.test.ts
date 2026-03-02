import { describe, it, expect, beforeEach } from 'vitest';
import { GameService, DEFAULT_CONFIG } from '../services/GameService';
import { LOTERIA_CARDS } from '../data/cards';
import type { GameState, BoardCell } from '../types';
import { withLineTypes } from '../utils/winCondition';

describe('GameService', () => {
  let service: GameService;
  let state: GameState;
  const HOST_ID = 'host-123';
  const HOST_NAME = 'Jugador Principal';

  beforeEach(() => {
    service = new GameService(DEFAULT_CONFIG);
    state = service.createInitialState(HOST_ID, HOST_NAME);
  });

  describe('createInitialState', () => {
    it('debe crear estado inicial con un jugador host', () => {
      expect(state.players).toHaveLength(1);
      expect(state.players[0].id).toBe(HOST_ID);
      expect(state.players[0].name).toBe(HOST_NAME);
      expect(state.players[0].isHuman).toBe(true);
    });

    it('debe tener el mazo con 54 cartas únicas', () => {
      expect(state.deck).toHaveLength(LOTERIA_CARDS.length);
      const unique = new Set(state.deck);
      expect(unique.size).toBe(LOTERIA_CARDS.length);
    });

    it('debe iniciar en estado "waiting"', () => {
      expect(state.status).toBe('waiting');
    });

    it('debe asignar gameId único', () => {
      const state2 = service.createInitialState('other', 'Other');
      expect(state.gameId).not.toBe(state2.gameId);
    });
  });

  describe('generateBoard', () => {
    it('debe generar tablero con 16 celdas', () => {
      const board = service.generateBoard();
      expect(board).toHaveLength(16);
    });

    it('todas las celdas deben estar sin marcar inicialmente', () => {
      const board = service.generateBoard();
      expect(board.every(c => !c.marked)).toBe(true);
    });

    it('todas las IDs de cartas deben ser válidas', () => {
      const board = service.generateBoard();
      const validIds = new Set(LOTERIA_CARDS.map(c => c.id));
      board.forEach(cell => expect(validIds.has(cell.cardId)).toBe(true));
    });

    it('no debe haber cartas repetidas en el tablero', () => {
      const board = service.generateBoard();
      const ids = board.map(c => c.cardId);
      const unique = new Set(ids);
      expect(unique.size).toBe(16);
    });
  });

  describe('addPlayer', () => {
    it('debe agregar jugador al estado', () => {
      const player = service.createPlayer('player-2', 'Compadre', false);
      const newState = service.addPlayer(state, player);
      expect(newState.players).toHaveLength(2);
      expect(newState.players[1].name).toBe('Compadre');
    });

    it('no debe agregar jugador duplicado', () => {
      const player = service.createPlayer(HOST_ID, 'Duplicado', false);
      const newState = service.addPlayer(state, player);
      expect(newState.players).toHaveLength(1);
    });

    it('no debe exceder el límite de jugadores', () => {
      let s = state;
      for (let i = 0; i < DEFAULT_CONFIG.maxPlayers + 5; i++) {
        const p = service.createPlayer(`p-${i}`, `Player ${i}`, false);
        s = service.addPlayer(s, p);
      }
      expect(s.players.length).toBeLessThanOrEqual(DEFAULT_CONFIG.maxPlayers);
    });
  });

  describe('startGame', () => {
    it('debe cambiar estado a "playing"', () => {
      const newState = service.startGame(state);
      expect(newState.status).toBe('playing');
    });

    it('debe resetear cartas cantadas', () => {
      state = { ...state, drawnCards: [1, 2, 3] };
      const newState = service.startGame(state);
      expect(newState.drawnCards).toHaveLength(0);
    });

    it('debe generar nuevos tableros para todos los jugadores', () => {
      const p2 = service.createPlayer('p2', 'AI', false);
      state = service.addPlayer(state, p2);
      const originalBoard = state.players[0].board;
      const newState = service.startGame(state);
      const newBoard = newState.players[0].board;
      expect(newBoard).toHaveLength(16);
      const allSame = originalBoard.every(
        (cell, i) => cell.cardId === newBoard[i].cardId
      );
      expect(allSame).toBe(false);
    });
  });

  describe('drawNextCard', () => {
    beforeEach(() => {
      state = service.startGame(state);
    });

    it('debe sacar la primera carta del mazo', () => {
      const firstCardId = state.deck[0];
      const newState = service.drawNextCard(state);
      expect(newState.currentCard?.id).toBe(firstCardId);
      expect(newState.drawnCards).toContain(firstCardId);
    });

    it('debe reducir el mazo en 1', () => {
      const deckSize = state.deck.length;
      const newState = service.drawNextCard(state);
      expect(newState.deck.length).toBe(deckSize - 1);
    });

    it('no debe sacar carta si el juego no está activo', () => {
      const waitingState = { ...state, status: 'waiting' as const };
      const result = service.drawNextCard(waitingState);
      expect(result.currentCard).toBeNull();
    });

    it('debe terminar juego si el mazo está vacío', () => {
      const emptyDeckState = { ...state, deck: [] };
      const result = service.drawNextCard(emptyDeckState);
      expect(result.status).toBe('finished');
    });
  });

  describe('markCard', () => {
    beforeEach(() => {
      state = service.startGame(state);
      state = service.drawNextCard(state);
    });

    it('debe marcar una carta válida', () => {
      const cardId = state.drawnCards[0];
      const newState = service.markCard(state, HOST_ID, cardId);
      const player = newState.players.find(p => p.id === HOST_ID)!;
      const cell = player.board.find(c => c.cardId === cardId);
      if (cell) {
        expect(cell.marked).toBe(true);
      }
    });

    it('no debe marcar una carta que no fue cantada', () => {
      const undrawnCardId = state.deck[0];
      const newState = service.markCard(state, HOST_ID, undrawnCardId);
      const player = newState.players.find(p => p.id === HOST_ID)!;
      const cell = player.board.find(c => c.cardId === undrawnCardId);
      if (cell) {
        expect(cell.marked).toBe(false);
      }
    });
  });

  describe('processClaim', () => {
    it('debe validar reclamo ganador con línea completa', () => {
      state = service.startGame(state);
      const player = state.players.find(p => p.id === HOST_ID)!;
      const firstRow = player.board.slice(0, 4).map(c => c.cardId);

      state = {
        ...state,
        drawnCards: firstRow,
        players: state.players.map(p =>
          p.id === HOST_ID
            ? { ...p, board: p.board.map((c, i) => ({ ...c, marked: i < 4 })) }
            : p
        ),
      };

      const { result } = service.processClaim(state, HOST_ID, withLineTypes(['horizontal']));
      expect(result.isWin).toBe(true);
      expect(result.condition).toEqual(withLineTypes(['horizontal']));
    });

    it('debe rechazar reclamo inválido', () => {
      state = service.startGame(state);
      const { result } = service.processClaim(state, HOST_ID, withLineTypes(['horizontal']));
      expect(result.isWin).toBe(false);
    });

    it('debe marcar al jugador como ganador en el estado', () => {
      state = service.startGame(state);
      const player = state.players.find(p => p.id === HOST_ID)!;
      const firstRow = player.board.slice(0, 4).map(c => c.cardId);

      state = {
        ...state,
        drawnCards: firstRow,
        players: state.players.map(p =>
          p.id === HOST_ID
            ? { ...p, board: p.board.map((c, i) => ({ ...c, marked: i < 4 })) }
            : p
        ),
      };

      const { state: newState } = service.processClaim(state, HOST_ID, withLineTypes(['horizontal']));
      const winner = newState.players.find(p => p.id === HOST_ID)!;
      expect(winner.isWinner).toBe(true);
      expect(newState.status).toBe('finished');
    });
  });

  describe('autoMarkAllAI', () => {
    it('debe marcar carta de jugadores IA automáticamente', () => {
      const aiId = 'ai-player';
      const aiPlayer = service.createPlayer(aiId, 'AI Bot', false);
      state = service.addPlayer(state, aiPlayer);
      state = service.startGame(state);
      state = service.drawNextCard(state);

      const currentCardId = state.currentCard!.id;
      const aiBeforeBoard = state.players.find(p => p.id === aiId)!.board;
      const aiHasCard = aiBeforeBoard.some(c => c.cardId === currentCardId);

      const newState = service.autoMarkAllAI(state);
      const aiAfterBoard = newState.players.find(p => p.id === aiId)!.board;
      const aiCell = aiAfterBoard.find(c => c.cardId === currentCardId);

      if (aiHasCard) {
        expect(aiCell?.marked).toBe(true);
      }
    });

    it('no debe marcar cartas del jugador humano', () => {
      state = service.startGame(state);
      state = service.drawNextCard(state);

      const beforeBoard = state.players.find(p => p.id === HOST_ID)!.board;
      const newState = service.autoMarkAllAI(state);
      const afterBoard = newState.players.find(p => p.id === HOST_ID)!.board;

      expect(beforeBoard.every((c, i) => c.marked === afterBoard[i].marked)).toBe(true);
    });
  });

  describe('getWinningLines', () => {
    it('debe detectar fila ganadora', () => {
      const board: BoardCell[] = Array.from({ length: 16 }, (_, i) => ({
        cardId: i + 1,
        marked: i < 4,
      }));
      const lines = service.getWinningLines(board);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('debe retornar vacío si no hay ganadora', () => {
      const board: BoardCell[] = Array.from({ length: 16 }, (_, i) => ({
        cardId: i + 1,
        marked: false,
      }));
      const lines = service.getWinningLines(board);
      expect(lines).toHaveLength(0);
    });

    it('debe detectar columna ganadora', () => {
      const board: BoardCell[] = Array.from({ length: 16 }, (_, i) => ({
        cardId: i + 1,
        marked: i % 4 === 0,
      }));
      const lines = service.getWinningLines(board);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('debe detectar diagonal ganadora', () => {
      const board: BoardCell[] = Array.from({ length: 16 }, (_, i) => ({
        cardId: i + 1,
        marked: [0, 5, 10, 15].includes(i),
      }));
      const lines = service.getWinningLines(board);
      expect(lines.length).toBeGreaterThan(0);
    });
  });
});
