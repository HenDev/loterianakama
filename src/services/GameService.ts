import type {
  GameState,
  Player,
  BoardCell,
  LotteryCard,
  WinCondition,
  WinCheckResult,
  GameConfig,
} from '../types';
import { LOTERIA_CARDS } from '../data/cards';
import { shuffleArray, pickRandom, generateUUID } from '../utils/shuffle';
import { validateClaim } from '../utils/validation';

export const DEFAULT_CONFIG: GameConfig = {
  maxPlayers: 6,
  boardSize: 4,
  turnIntervalMs: 3000,
  targetWin: 'linea',
  mockPlayerCount: 3,
};

export class GameService {
  private config: GameConfig;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  createInitialState(hostId: string, hostName: string): GameState {
    const deck = shuffleArray(LOTERIA_CARDS.map(c => c.id));
    const host = this.createPlayer(hostId, hostName, true);
    return {
      gameId: generateUUID(),
      players: [host],
      deck,
      drawnCards: [],
      currentCard: null,
      status: 'waiting',
      winner: null,
      turnInterval: this.config.turnIntervalMs,
      targetWin: this.config.targetWin,
      hostId,
    };
  }

  createPlayer(id: string, name: string, isHuman: boolean): Player {
    return {
      id,
      name,
      board: this.generateBoard(),
      isWinner: false,
      isConnected: true,
      isHuman,
    };
  }

  addPlayer(state: GameState, player: Player): GameState {
    if (state.players.length >= this.config.maxPlayers) return state;
    if (state.players.find(p => p.id === player.id)) return state;
    return { ...state, players: [...state.players, player] };
  }

  removePlayer(state: GameState, playerId: string): GameState {
    return {
      ...state,
      players: state.players.map(p =>
        p.id === playerId ? { ...p, isConnected: false } : p
      ),
    };
  }

  startGame(state: GameState): GameState {
    const deck = shuffleArray(LOTERIA_CARDS.map(c => c.id));
    return {
      ...state,
      deck,
      drawnCards: [],
      currentCard: null,
      status: 'playing',
      winner: null,
      players: state.players.map(p => ({
        ...p,
        board: this.generateBoard(),
        isWinner: false,
      })),
    };
  }

  drawNextCard(state: GameState): GameState {
    if (state.status !== 'playing') return state;
    if (state.deck.length === 0) return { ...state, status: 'finished' };

    const [cardId, ...remainingDeck] = state.deck;
    const card = LOTERIA_CARDS.find(c => c.id === cardId) ?? null;
    const drawnCards = [...state.drawnCards, cardId];

    return {
      ...state,
      deck: remainingDeck,
      drawnCards,
      currentCard: card,
    };
  }

  markCard(state: GameState, playerId: string, cardId: number): GameState {
    if (!state.drawnCards.includes(cardId)) return state;

    const players = state.players.map(p => {
      if (p.id !== playerId) return p;
      const board = p.board.map(cell =>
        cell.cardId === cardId ? { ...cell, marked: true } : cell
      );
      return { ...p, board };
    });

    return { ...state, players };
  }

  autoMarkAllAI(state: GameState): GameState {
    if (!state.currentCard) return state;
    const cardId = state.currentCard.id;

    const players = state.players.map(p => {
      if (p.isHuman) return p;
      const board = p.board.map(cell =>
        cell.cardId === cardId ? { ...cell, marked: true } : cell
      );
      return { ...p, board };
    });

    return { ...state, players };
  }

  processClaim(
    state: GameState,
    playerId: string,
    condition: WinCondition
  ): { state: GameState; result: WinCheckResult } {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return { state, result: { isWin: false } };

    const result = validateClaim(player.board, state.drawnCards, condition);

    if (result.isWin) {
      const winner = { ...player, isWinner: true, winCondition: condition };
      const players = state.players.map(p => (p.id === playerId ? winner : p));
      return {
        state: { ...state, status: 'finished', winner, players },
        result,
      };
    }

    return { state, result };
  }

  getCardInfo(cardId: number): LotteryCard | undefined {
    return LOTERIA_CARDS.find(c => c.id === cardId);
  }

  generateBoard(): BoardCell[] {
    const total = this.config.boardSize * this.config.boardSize;
    const selected = pickRandom(LOTERIA_CARDS.map(c => c.id), total);
    return selected.map(cardId => ({ cardId, marked: false }));
  }

  getWinningLines(board: BoardCell[]): number[][] {
    const SIZE = 4;
    const lines: number[][] = [];
    for (let r = 0; r < SIZE; r++) {
      const row = board.slice(r * SIZE, r * SIZE + SIZE);
      if (row.every(c => c.marked)) lines.push(row.map(c => c.cardId));
    }
    for (let col = 0; col < SIZE; col++) {
      const column = [0, 1, 2, 3].map(r => board[r * SIZE + col]);
      if (column.every(c => c.marked)) lines.push(column.map(c => c.cardId));
    }
    const diag1 = [0, 1, 2, 3].map(i => board[i * SIZE + i]);
    const diag2 = [0, 1, 2, 3].map(i => board[i * SIZE + (SIZE - 1 - i)]);
    if (diag1.every(c => c.marked)) lines.push(diag1.map(c => c.cardId));
    if (diag2.every(c => c.marked)) lines.push(diag2.map(c => c.cardId));
    return lines;
  }

  getConfig(): GameConfig {
    return { ...this.config };
  }
}
