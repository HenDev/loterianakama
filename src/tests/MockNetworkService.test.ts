import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockNetworkService, resetMockNetworkService } from '../services/MockNetworkService';
import { DEFAULT_CONFIG } from '../services/GameService';
import type { NetworkEvent, GameState } from '../types';

vi.useFakeTimers();

describe('MockNetworkService', () => {
  let service: MockNetworkService;
  const PLAYER_ID = 'test-player-001';

  beforeEach(async () => {
    resetMockNetworkService();
    service = new MockNetworkService();
    await service.connect(PLAYER_ID);
  });

  afterEach(() => {
    service.disconnect();
    vi.clearAllTimers();
  });

  describe('connect', () => {
    it('debe conectar al servicio', () => {
      expect(service.isConnected()).toBe(true);
    });

    it('debe emitir GAME_STATE_SYNC al conectar', async () => {
      const newService = new MockNetworkService();
      let syncReceived = false;

      newService.on('GAME_STATE_SYNC', () => {
        syncReceived = true;
      });

      await newService.connect('player-xyz');
      vi.advanceTimersByTime(200);
      expect(syncReceived).toBe(true);
      newService.disconnect();
    });

    it('debe inicializar con jugadores mock', () => {
      const state = service.getState();
      expect(state).not.toBeNull();
      expect(state!.players.length).toBe(DEFAULT_CONFIG.mockPlayerCount + 1);
    });

    it('debe incluir un jugador humano', () => {
      const state = service.getState();
      const humanPlayer = state!.players.find(p => p.isHuman);
      expect(humanPlayer).toBeDefined();
      expect(humanPlayer!.id).toBe(PLAYER_ID);
    });
  });

  describe('disconnect', () => {
    it('debe desconectar el servicio', () => {
      service.disconnect();
      expect(service.isConnected()).toBe(false);
    });

    it('debe limpiar el estado del juego', () => {
      service.disconnect();
      expect(service.getState()).toBeNull();
    });
  });

  describe('GAME_START', () => {
    it('debe iniciar el juego y emitir GAME_STATE_SYNC', () => {
      let receivedState: GameState | null = null;
      service.on('GAME_STATE_SYNC', (event: NetworkEvent) => {
        receivedState = (event.payload as { state: GameState }).state;
      });

      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      expect(receivedState).not.toBeNull();
      expect(receivedState!.status).toBe('playing');
    });

    it('debe crear tableros de 16 casillas por jugador', () => {
      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      const state = service.getState()!;
      state.players.forEach(player => {
        expect(player.board).toHaveLength(16);
      });
    });
  });

  describe('CARD_DRAWN', () => {
    it('debe sacar carta automáticamente después de intervalo', () => {
      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      let cardDrawn = false;
      service.on('CARD_DRAWN', () => {
        cardDrawn = true;
      });

      vi.advanceTimersByTime(3500);
      expect(cardDrawn).toBe(true);
    });

    it('debe incluir la carta en drawnCards', () => {
      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      vi.advanceTimersByTime(3500);
      const state = service.getState()!;
      expect(state.drawnCards.length).toBeGreaterThan(0);
    });
  });

  describe('MARK_CARD', () => {
    it('debe marcar una carta que fue cantada', () => {
      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      vi.advanceTimersByTime(3500);
      const state = service.getState()!;
      const drawnCardId = state.drawnCards[0];

      service.send({
        type: 'MARK_CARD',
        payload: { playerId: PLAYER_ID, cardId: drawnCardId },
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      const newState = service.getState()!;
      const player = newState.players.find(p => p.id === PLAYER_ID)!;
      const cell = player.board.find(c => c.cardId === drawnCardId);
      if (cell) {
        expect(cell.marked).toBe(true);
      }
    });

    it('no debe marcar carta no cantada', () => {
      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      const state = service.getState()!;
      const undrawnCardId = state.deck[0];

      service.send({
        type: 'MARK_CARD',
        payload: { playerId: PLAYER_ID, cardId: undrawnCardId },
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      const newState = service.getState()!;
      const player = newState.players.find(p => p.id === PLAYER_ID)!;
      const cell = player.board.find(c => c.cardId === undrawnCardId);
      if (cell) {
        expect(cell.marked).toBe(false);
      }
    });
  });

  describe('event system', () => {
    it('debe permitir suscribirse a múltiples eventos', () => {
      const received: string[] = [];
      service.on('CARD_DRAWN', () => received.push('CARD_DRAWN'));
      service.on('GAME_STATE_SYNC', () => received.push('GAME_STATE_SYNC'));

      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      expect(received).toContain('GAME_STATE_SYNC');
    });

    it('debe permitir desuscribirse de eventos', () => {
      let count = 0;
      const handler = () => { count++; };

      service.on('GAME_STATE_SYNC', handler);
      service.off('GAME_STATE_SYNC', handler);

      service.send({
        type: 'GAME_START',
        payload: {},
        senderId: PLAYER_ID,
        timestamp: Date.now(),
      });

      expect(count).toBe(0);
    });
  });
});
