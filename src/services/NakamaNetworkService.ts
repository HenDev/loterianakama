import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import type {
  AuthProfile,
  AuthProvider,
  GameState,
  INetworkService,
  NetworkEvent,
  UserPreferences,
  WinCondition,
} from '../types';
import { BaseNetworkService, createNetworkEvent } from './NetworkService';
import { GameService, DEFAULT_CONFIG } from './GameService';
import { validateClaim } from '../utils/validation';
import { getOrCreateDeviceId } from '../utils/deviceId';
import { cloneWinCondition, normalizeWinCondition } from '../utils/winCondition';
import {
  DEFAULT_USER_PREFERENCES,
  normalizeUserPreferences,
  readCachedUserPreferences,
  USER_PREFERENCES_STORAGE_COLLECTION,
  USER_PREFERENCES_STORAGE_KEY,
  writeCachedUserPreferences,
} from '../utils/userPreferences';

const NAKAMA_HOST = 'multiplayer.studiohen.com.mx';
const NAKAMA_PORT = '443';
const NAKAMA_KEY = 'VMedYA8iiYNuevHxmxPXV36oTqvopvb1';
const DRAW_INTERVAL_MS = 3000;
const AI_MARK_DELAY_MS = 500;
const MIN_MULTIPLAYER_PLAYERS = 2;
const AUTH_MODE_KEY = 'loteria.authMode';

export const OP_CODE = {
  GAME_EVENT: 1,
} as const;

type NakamaAccount = Awaited<ReturnType<Client['getAccount']>>;

function readStoredAuthMode(): AuthProvider {
  if (typeof localStorage === 'undefined') return 'guest';
  try {
    const stored = localStorage.getItem(AUTH_MODE_KEY);
    return stored === 'google' ? 'google' : 'guest';
  } catch {
    return 'guest';
  }
}

function writeStoredAuthMode(mode: AuthProvider): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AUTH_MODE_KEY, mode);
  } catch {
    // Ignore storage errors.
  }
}

export class NakamaNetworkService extends BaseNetworkService implements INetworkService {
  private client: Client;
  private session: Session | null = null;
  private account: NakamaAccount | null = null;
  private authProvider: AuthProvider = readStoredAuthMode();
  private socket: Socket | null = null;
  private matchId: string | null = null;
  private localPlayerId = '';
  private isHost = false;
  private userPreferences: UserPreferences = { ...DEFAULT_USER_PREFERENCES };
  private gameService = new GameService(DEFAULT_CONFIG);
  gameState: GameState | null = null;
  private drawTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.client = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, true);
  }

  async connect(playerId: string): Promise<void> {
    await this.ensureGuestSession(playerId);

    if (this.connected && this.socket) return;

    this.ensureSocket();
    if (!this.socket || !this.session) {
      throw new Error('No se pudo establecer la conexión de socket.');
    }

    await this.socket.connect(this.session, true);
    this.connected = true;
    this.localPlayerId = this.session.user_id ?? this.localPlayerId;
  }

  async ensureGuestSession(usernameHint = 'Jugador'): Promise<AuthProfile> {
    if (!this.session || this.isSessionExpired()) {
      const deviceId = getOrCreateDeviceId();
      const safeUsername = usernameHint.trim() || 'Jugador';
      this.session = await this.client.authenticateDevice(deviceId, true, safeUsername);
      this.localPlayerId = this.session.user_id ?? this.localPlayerId;
      this.account = null;
      this.authProvider = 'guest';
    }

    await this.refreshAccount();
    await this.loadUserPreferences();
    return this.buildAuthProfile();
  }

  async loginWithGoogle(accessToken: string, usernameHint = 'Jugador'): Promise<AuthProfile> {
    const safeUsername = usernameHint.trim() || 'Jugador';
    this.session = await this.client.authenticateGoogle(accessToken, true, safeUsername);
    this.localPlayerId = this.session.user_id ?? this.localPlayerId;
    this.account = null;
    this.authProvider = 'google';
    writeStoredAuthMode('google');
    await this.tryLinkCurrentDevice();
    await this.refreshAccount();
    await this.loadUserPreferences();
    return this.buildAuthProfile();
  }

  async linkGoogleToCurrentAccount(accessToken: string): Promise<AuthProfile> {
    await this.ensureGuestSession();
    if (!this.session) {
      throw new Error('No hay sesión activa para enlazar Google.');
    }

    if (this.account?.user?.google_id) {
      return this.buildAuthProfile();
    }

    await this.client.linkGoogle(this.session, { token: accessToken });
    this.authProvider = 'google';
    writeStoredAuthMode('google');
    await this.refreshAccount();
    await this.loadUserPreferences();
    return this.buildAuthProfile();
  }

  async getAuthProfile(forceRefresh = false): Promise<AuthProfile> {
    await this.ensureGuestSession();
    if (forceRefresh || !this.account) {
      await this.refreshAccount();
      await this.loadUserPreferences();
    }
    return this.buildAuthProfile();
  }

  getUserPreferences(): UserPreferences {
    return { ...this.userPreferences };
  }

  async setCalledCardFeedbackEnabled(enabled: boolean): Promise<AuthProfile> {
    await this.ensureGuestSession();
    if (!this.session) {
      throw new Error('No hay sesion activa para guardar preferencias.');
    }

    const nextPreferences = normalizeUserPreferences({
      ...this.userPreferences,
      calledCardFeedbackEnabled: enabled,
    });

    await this.client.writeStorageObjects(this.session, [
      {
        collection: USER_PREFERENCES_STORAGE_COLLECTION,
        key: USER_PREFERENCES_STORAGE_KEY,
        value: nextPreferences,
        permission_read: 0,
        permission_write: 1,
      },
    ]);

    const userId = this.session.user_id ?? this.account?.user?.id ?? this.localPlayerId;
    this.userPreferences = nextPreferences;
    if (userId) {
      writeCachedUserPreferences(userId, this.userPreferences);
    }

    return this.buildAuthProfile();
  }

  getAuthProvider(): AuthProvider {
    return this.authProvider;
  }

  isGoogleLinked(): boolean {
    return Boolean(this.account?.user?.google_id);
  }

  async createMatch(playerName: string, targetWin: WinCondition): Promise<string> {
    if (!this.socket) throw new Error('Not connected');
    this.isHost = true;

    const match = await this.socket.createMatch();
    this.matchId = match.match_id;

    this.gameState = this.gameService.createInitialState(this.localPlayerId, playerName);
    this.gameState = { ...this.gameState, targetWin: normalizeWinCondition(targetWin) };

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
    this.socket = null;
    this.connected = false;
    this.gameState = null;
    this.matchId = null;
    this.isHost = false;
    this.userPreferences = { ...DEFAULT_USER_PREFERENCES };
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
        this.gameState = {
          ...payload.state,
          targetWin: normalizeWinCondition(payload.state.targetWin),
        };
      }
    }

    if (this.isHost) {
      this.processEventAsHost(event);
    } else {
      this.emit(event);
    }
  }

  private ensureSocket(): void {
    if (this.socket) return;
    this.socket = this.client.createSocket(true, false);

    this.socket.onmatchdata = (matchData) => {
      try {
        const raw = new TextDecoder().decode(matchData.data);
        const event: NetworkEvent = JSON.parse(raw);
        this.handleIncomingEvent(event);
      } catch {
        // Ignore malformed network payloads.
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
  }

  private isSessionExpired(): boolean {
    if (!this.session?.expires_at) return true;
    const nowInSeconds = Math.floor(Date.now() / 1000);
    return this.session.isexpired(nowInSeconds + 5);
  }

  private async refreshAccount(): Promise<void> {
    if (!this.session) {
      throw new Error('No hay sesión activa.');
    }

    this.account = await this.client.getAccount(this.session);
    this.localPlayerId = this.session.user_id ?? this.account.user?.id ?? this.localPlayerId;
    this.authProvider = this.account.user?.google_id ? 'google' : 'guest';
    writeStoredAuthMode(this.authProvider);
  }

  private async loadUserPreferences(): Promise<UserPreferences> {
    const userId = this.session?.user_id ?? this.account?.user?.id ?? this.localPlayerId;
    const cached = userId ? readCachedUserPreferences(userId) : { ...DEFAULT_USER_PREFERENCES };

    if (!this.session || !userId) {
      this.userPreferences = cached;
      return this.getUserPreferences();
    }

    try {
      const result = await this.client.readStorageObjects(this.session, {
        object_ids: [
          {
            collection: USER_PREFERENCES_STORAGE_COLLECTION,
            key: USER_PREFERENCES_STORAGE_KEY,
            user_id: userId,
          },
        ],
      });

      this.userPreferences = normalizeUserPreferences(result.objects[0]?.value);
      writeCachedUserPreferences(userId, this.userPreferences);
    } catch {
      this.userPreferences = cached;
    }

    return this.getUserPreferences();
  }

  private async tryLinkCurrentDevice(): Promise<void> {
    if (!this.session) return;
    const deviceId = getOrCreateDeviceId();
    try {
      await this.client.linkDevice(this.session, { id: deviceId });
    } catch {
      // Link can fail when already linked elsewhere; ignore to avoid blocking Google login.
    }
  }

  private buildAuthProfile(): AuthProfile {
    const deviceId = getOrCreateDeviceId();
    const userId = this.session?.user_id ?? this.account?.user?.id ?? '';
    const username = this.account?.user?.username ?? this.session?.username ?? 'Jugador';
    const googleLinked = Boolean(this.account?.user?.google_id);
    const provider: AuthProvider = googleLinked ? 'google' : 'guest';

    this.authProvider = provider;
    writeStoredAuthMode(provider);

    return {
      userId,
      username,
      provider,
      googleLinked,
      deviceId,
      preferences: this.getUserPreferences(),
    };
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
          this.gameState = { ...this.gameState, targetWin: normalizeWinCondition(payload.targetWin) };
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

        const result = validateClaim(player.board, this.gameState.drawnCards, this.gameState.targetWin);
        if (result.isWin) {
          const { state } = this.gameService.processClaim(this.gameState, p.playerId, this.gameState.targetWin);
          this.gameState = state;
          this.stopDrawing();

          const winEvt = createNetworkEvent('WIN_VALIDATED', {
            playerId: p.playerId,
            valid: true,
            condition: result.condition ? cloneWinCondition(result.condition) : cloneWinCondition(this.gameState.targetWin),
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
          condition: state.winner?.winCondition ? cloneWinCondition(state.winner.winCondition) : cloneWinCondition(this.gameState.targetWin),
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
