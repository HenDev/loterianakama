import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import type {
  GameState,
  INetworkService,
  NetworkEvent,
  WinCondition,
} from '../types';
import { BaseNetworkService, createNetworkEvent } from './NetworkService';
import { GameService, DEFAULT_CONFIG } from './GameService';
import { validateClaim } from '../utils/validation';

const NAKAMA_HOST = 'multiplayer.studiohen.com.mx';
const NAKAMA_PORT = '443';
const NAKAMA_KEY = 'VMedYA8iiYNuevHxmxPXV36oTqvopvb1';
const DRAW_INTERVAL_MS = 3000;
const AI_MARK_DELAY_MS = 500;
const MIN_MULTIPLAYER_PLAYERS = 2;

export const OP_CODE = {
  GAME_EVENT: 1,
} as const;

export class NakamaNetworkService extends BaseNetworkService implements INetworkService {
  private client: Client;
  private session: Session | null = null;
  private socket: Socket | null = null;
  private matchId: string | null = null;
  private localPlayerId = '';
  private isHost = false;
  private gameService = new GameService(DEFAULT_CONFIG);
  gameState: GameState | null = null;
  private drawTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.client = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, true);
  }

  async connect(playerId: string): Promise<void> {
    this.localPlayerId = playerId;
    const email = `${playerId}@loteria.game`;
    const password = playerId;

    try {
      this.session = await this.client.authenticateEmail(email, password, true, playerId);
    } catch {
      this.session = await this.client.authenticateEmail(email, password, false, playerId);
    }

    this.socket = this.client.createSocket(true, false);

    this.socket.onmatchdata = (matchData) => {
      try {
        const raw = new TextDecoder().decode(matchData.data);
        const event: NetworkEvent = JSON.parse(raw);
        this.handleIncomingEvent(event);
      } catch {
      }
    };

    this.socket.onmatchpresence = (presence) => {
      if (!this.gameState) return;
      presence.joins?.forEach((p) => {
        const existing = this.gameState!.players.find(pl => pl.id === p.user_id);
        if (!existing && this.isHost) {
          const newPlayer = this.gameService.createPlayer(p.user_id, p.username ?? p.user_id, true);
          this.gameState = this.gameService.addPlayer(this.gameState!, newPlayer);
          const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
          this.broadcastEvent(syncEvt);
          this.emit(syncEvt);
        }
      });

      presence.leaves?.forEach((p) => {
        if (!this.gameState) return;
        this.gameState = this.gameService.removePlayer(this.gameState!, p.user_id);
        const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
        this.broadcastEvent(syncEvt);
        this.emit(syncEvt);
      });
    };

    this.socket.ondisconnect = () => {
      this.connected = false;
      this.stopDrawing();
    };

    await this.socket.connect(this.session, true);
    this.localPlayerId = this.session.user_id ?? playerId;
    this.connected = true;
  }

  async createMatch(playerName: string, targetWin: WinCondition): Promise<string> {
    if (!this.socket) throw new Error('Not connected');
    this.isHost = true;

    const match = await this.socket.createMatch();
    this.matchId = match.match_id;

    this.gameState = this.gameService.createInitialState(this.localPlayerId, playerName);
    this.gameState = { ...this.gameState, targetWin };

    if (match.presences) {
      match.presences.forEach((p) => {
        if (p.user_id !== this.localPlayerId) {
          const player = this.gameService.createPlayer(p.user_id, p.username ?? p.user_id, true);
          this.gameState = this.gameService.addPlayer(this.gameState!, player);
        }
      });
    }

    this.emit(createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server'));
    return this.matchId;
  }

  async joinMatch(matchId: string, playerName: string): Promise<void> {
    if (!this.socket) throw new Error('Not connected');
    this.isHost = false;
    this.matchId = matchId;
    await this.socket.joinMatch(matchId);
    this.forwardEventToHost(createNetworkEvent('PLAYER_JOIN', {
      playerId: this.localPlayerId,
      playerName: playerName.trim() || 'Jugador',
    }, this.localPlayerId));
  }

  send(event: NetworkEvent): void {
    if (!this.connected) return;

    if (this.isHost) {
      this.processEventAsHost(event);
    } else {
      this.forwardEventToHost(event);
    }
  }

  disconnect(): void {
    this.stopDrawing();
    if (this.matchId && this.socket) {
      this.socket.leaveMatch(this.matchId).catch(() => {});
    }
    this.socket?.disconnect(false);
    this.connected = false;
    this.gameState = null;
    this.matchId = null;
    this.session = null;
  }

  getMatchId(): string | null {
    return this.matchId;
  }

  getLocalPlayerId(): string {
    return this.localPlayerId;
  }

  isHostPlayer(): boolean {
    return this.isHost;
  }

  async saveClipboardToStorage(clipboardData: string): Promise<void> {
    if (!this.session) {
      throw new Error('No session available');
    }

    try {
      // Parsear el JSON string a objeto para que Nakama lo maneje correctamente
      const dataObject = JSON.parse(clipboardData);

      await this.client.writeStorageObjects(this.session, [
        {
          collection: 'clip',
          key: `clipboard_${Date.now()}`,
          value: dataObject,
          permission_read: 1,
          permission_write: 1,
        },
      ]);
    } catch (error) {
      console.error('Error saving clipboard to storage:', error);
      throw error;
    }
  }

  private handleIncomingEvent(event: NetworkEvent): void {
    if (event.type === 'GAME_STATE_SYNC') {
      const payload = event.payload as { state?: GameState };
      if (payload?.state) {
        this.gameState = payload.state;
      }
    }

    if (this.isHost) {
      this.processEventAsHost(event);
    } else {
      this.emit(event);
    }
  }

  private processEventAsHost(event: NetworkEvent): void {
    if (!this.gameState) return;

    switch (event.type) {
      case 'GAME_START': {
        if (this.gameState.players.length < MIN_MULTIPLAYER_PLAYERS) {
          const errorEvt = createNetworkEvent('ERROR', {
            message: `Se requieren al menos ${MIN_MULTIPLAYER_PLAYERS} jugadores para iniciar.`,
          }, 'server');
          this.emit(errorEvt);
          break;
        }

        const payload = event.payload as { targetWin?: WinCondition };
        if (payload?.targetWin) {
          this.gameState = { ...this.gameState, targetWin: payload.targetWin };
        }
        this.gameState = this.gameService.startGame(this.gameState);
        const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
        this.broadcastEvent(syncEvt);
        this.emit(syncEvt);
        this.startDrawing();
        break;
      }

      case 'MARK_CARD': {
        const p = event.payload as { playerId: string; cardId: number };
        this.gameState = this.gameService.markCard(this.gameState, p.playerId, p.cardId);
        const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
        this.broadcastEvent(syncEvt);
        this.emit(syncEvt);
        break;
      }

      case 'PLAYER_JOIN': {
        const p = event.payload as { playerId: string; playerName?: string };
        const requestedName = p.playerName?.trim() || 'Jugador';
        const existing = this.gameState.players.find(pl => pl.id === p.playerId);

        if (existing) {
          this.gameState = {
            ...this.gameState,
            players: this.gameState.players.map(pl =>
              pl.id === p.playerId ? { ...pl, name: requestedName } : pl
            ),
          };
        } else {
          const player = this.gameService.createPlayer(p.playerId, requestedName, true);
          this.gameState = this.gameService.addPlayer(this.gameState, player);
        }

        const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
        this.broadcastEvent(syncEvt);
        this.emit(syncEvt);
        break;
      }

      case 'CLAIM_WIN': {
        const p = event.payload as { playerId: string; condition: WinCondition };
        const player = this.gameState.players.find(pl => pl.id === p.playerId);
        if (!player) break;

        const result = validateClaim(player.board, this.gameState.drawnCards, p.condition);
        if (result.isWin) {
          const { state } = this.gameService.processClaim(this.gameState, p.playerId, p.condition);
          this.gameState = state;
          this.stopDrawing();

          const winEvt = createNetworkEvent('WIN_VALIDATED', {
            playerId: p.playerId,
            valid: true,
            condition: p.condition,
            winner: this.gameState.winner,
          }, 'server');
          const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
          this.broadcastEvent(winEvt);
          this.broadcastEvent(syncEvt);
          this.emit(winEvt);
          this.emit(syncEvt);
        } else {
          const invalidEvt = createNetworkEvent('WIN_INVALID', { playerId: p.playerId }, 'server');
          this.broadcastEvent(invalidEvt);
          this.emit(invalidEvt);
        }
        break;
      }
    }
  }

  private forwardEventToHost(event: NetworkEvent): void {
    if (!this.socket || !this.matchId) return;
    const data = JSON.stringify(event);
    this.socket.sendMatchState(this.matchId, OP_CODE.GAME_EVENT, data).catch(() => {});
  }

  private broadcastEvent(event: NetworkEvent): void {
    if (!this.socket || !this.matchId) return;
    const data = JSON.stringify(event);
    this.socket.sendMatchState(this.matchId, OP_CODE.GAME_EVENT, data).catch(() => {});
  }

  private startDrawing(): void {
    this.stopDrawing();
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

    const cardEvt = createNetworkEvent('CARD_DRAWN', {
      card: currentCard,
      deck: this.gameState.deck,
      drawnCards: this.gameState.drawnCards,
    }, 'server');

    this.broadcastEvent(cardEvt);
    this.emit(cardEvt);

    setTimeout(() => this.checkAllWins(), AI_MARK_DELAY_MS);
  }

  private checkAllWins(): void {
    if (!this.gameState) return;

    for (const player of this.gameState.players) {
      if (player.id === this.localPlayerId || player.isWinner) continue;
      const result = validateClaim(player.board, this.gameState.drawnCards, this.gameState.targetWin);
      if (result.isWin) {
        const { state } = this.gameService.processClaim(this.gameState, player.id, this.gameState.targetWin);
        this.gameState = state;
        this.stopDrawing();

        const winEvt = createNetworkEvent('WIN_VALIDATED', {
          playerId: player.id,
          valid: true,
          condition: this.gameState.targetWin,
          winner: this.gameState.winner,
        }, 'server');
        const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
        this.broadcastEvent(winEvt);
        this.broadcastEvent(syncEvt);
        this.emit(winEvt);
        this.emit(syncEvt);
        return;
      }
    }

    const syncEvt = createNetworkEvent('GAME_STATE_SYNC', { state: this.gameState }, 'server');
    this.broadcastEvent(syncEvt);
    this.emit(syncEvt);
  }
}

let _nakamaInstance: NakamaNetworkService | null = null;

export function getNakamaNetworkService(): NakamaNetworkService {
  if (!_nakamaInstance) _nakamaInstance = new NakamaNetworkService();
  return _nakamaInstance;
}

export function resetNakamaNetworkService(): void {
  _nakamaInstance?.disconnect();
  _nakamaInstance = null;
}
