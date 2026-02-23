import type { GameState, NetworkEvent, Player, WinCondition } from '../types';
import { BaseNetworkService, createNetworkEvent } from './NetworkService';
import { GameService, DEFAULT_CONFIG } from './GameService';
import { MOCK_PLAYER_NAMES } from '../data/players';
import { generateUUID } from '../utils/shuffle';

const DRAW_INTERVAL_MS = 3000;
const AI_MARK_DELAY_MS = 500;

export class MockNetworkService extends BaseNetworkService {
  private gameService = new GameService(DEFAULT_CONFIG);
  private gameState: GameState | null = null;
  private localPlayerId = '';
  private drawTimer: ReturnType<typeof setInterval> | null = null;
  private mockPlayerIds: string[] = [];

  async connect(playerId: string): Promise<void> {
    this.localPlayerId = playerId;
    this.connected = true;

    const playerName = 'Tú (Jugador)';
    this.gameState = this.gameService.createInitialState(playerId, playerName);

    for (let i = 0; i < DEFAULT_CONFIG.mockPlayerCount; i++) {
      const mockId = generateUUID();
      const mockPlayer = this.gameService.createPlayer(
        mockId,
        MOCK_PLAYER_NAMES[i % MOCK_PLAYER_NAMES.length],
        false
      );
      this.mockPlayerIds.push(mockId);
      this.gameState = this.gameService.addPlayer(this.gameState, mockPlayer);
    }

  }

  disconnect(): void {
    this.connected = false;
    this.stopDrawing();
    this.gameState = null;
    this.mockPlayerIds = [];
  }

  send(event: NetworkEvent): void {
    if (!this.connected || !this.gameState) return;

    switch (event.type) {
      case 'GAME_START':
        this.handleStart();
        break;
      case 'MARK_CARD':
        this.handleMarkCard(event.payload as { playerId: string; cardId: number });
        break;
      case 'CLAIM_WIN':
        this.handleClaim(event.payload as { playerId: string; condition: WinCondition });
        break;
    }
  }

  getLocalPlayer(): Player | undefined {
    return this.gameState?.players.find(p => p.id === this.localPlayerId);
  }

  getState(): GameState | null {
    return this.gameState;
  }

  private handleStart(): void {
    if (!this.gameState) return;
    this.gameState = this.gameService.startGame(this.gameState);
    this.emit(createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server'));
    this.startDrawing();
  }

  private handleMarkCard(payload: { playerId: string; cardId: number }): void {
    if (!this.gameState) return;
    this.gameState = this.gameService.markCard(this.gameState, payload.playerId, payload.cardId);
    this.emit(createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server'));
  }

  private handleClaim(payload: { playerId: string; condition: WinCondition }): void {
    if (!this.gameState) return;
    const { state, result } = this.gameService.processClaim(
      this.gameState,
      payload.playerId,
      payload.condition
    );
    this.gameState = state;

    if (result.isWin) {
      this.stopDrawing();
      this.emit(createNetworkEvent('WIN_VALIDATED', {
        playerId: payload.playerId,
        valid: true,
        condition: payload.condition,
        winner: this.gameState.winner,
      }, 'server'));
      this.emit(createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server'));
    } else {
      this.emit(createNetworkEvent('WIN_INVALID', { playerId: payload.playerId }, 'server'));
    }
  }

  private startDrawing(): void {
    this.drawTimer = setInterval(() => this.drawCard(), DRAW_INTERVAL_MS);
  }

  private stopDrawing(): void {
    if (this.drawTimer) {
      clearInterval(this.drawTimer);
      this.drawTimer = null;
    }
  }

  private drawCard(): void {
    if (!this.gameState || this.gameState.status !== 'playing') {
      this.stopDrawing();
      return;
    }

    this.gameState = this.gameService.drawNextCard(this.gameState);
    const currentCard = this.gameState.currentCard;

    if (!currentCard) {
      this.stopDrawing();
      return;
    }

    this.emit(createNetworkEvent('CARD_DRAWN', {
      card: currentCard,
      deck: this.gameState.deck,
      drawnCards: this.gameState.drawnCards,
    }, 'server'));

    setTimeout(() => this.processAIMarking(currentCard.id), AI_MARK_DELAY_MS);
  }

  private processAIMarking(_cardId: number): void {
    if (!this.gameState) return;

    this.gameState = this.gameService.autoMarkAllAI(this.gameState);

    for (const mockId of this.mockPlayerIds) {
      const player = this.gameState.players.find(p => p.id === mockId);
      if (!player || player.isWinner) continue;

      const { result } = this.gameService.processClaim(
        this.gameState,
        mockId,
        this.gameState.targetWin
      );

      if (result.isWin) {
        const { state: newState } = this.gameService.processClaim(
          this.gameState,
          mockId,
          this.gameState.targetWin
        );
        this.gameState = newState;
        this.stopDrawing();
        this.emit(createNetworkEvent('WIN_VALIDATED', {
          playerId: mockId,
          valid: true,
          condition: this.gameState.targetWin,
          winner: this.gameState.winner,
        }, 'server'));
        this.emit(createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server'));
        return;
      }
    }

    this.emit(createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server'));
  }
}

let _instance: MockNetworkService | null = null;
export function getMockNetworkService(): MockNetworkService {
  if (!_instance) _instance = new MockNetworkService();
  return _instance;
}

export function resetMockNetworkService(): void {
  _instance = null;
}
