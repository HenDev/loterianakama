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
import { BaseNetworkService } from './NetworkService';
import { getOrCreateDeviceId } from '../utils/deviceId';
import { normalizeWinCondition } from '../utils/winCondition';
import {
  DEFAULT_USER_PREFERENCES,
  normalizeUserPreferences,
  readCachedUserPreferences,
  USER_PREFERENCES_STORAGE_COLLECTION,
  USER_PREFERENCES_STORAGE_KEY,
  writeCachedUserPreferences,
} from '../utils/userPreferences';

const DEFAULT_NAKAMA_HOST = 'multiplayer.studiohen.com.mx';
const DEFAULT_NAKAMA_PORT = '443';
const DEFAULT_NAKAMA_KEY = 'VMedYA8iiYNuevHxmxPXV36oTqvopvb1';
const DEFAULT_NAKAMA_USE_SSL = true;
const NAKAMA_HOST = import.meta.env.VITE_NAKAMA_HOST?.trim() || DEFAULT_NAKAMA_HOST;
const NAKAMA_PORT = import.meta.env.VITE_NAKAMA_PORT?.trim() || DEFAULT_NAKAMA_PORT;
const NAKAMA_KEY = import.meta.env.VITE_NAKAMA_KEY?.trim() || DEFAULT_NAKAMA_KEY;
const NAKAMA_USE_SSL = ((): boolean => {
  const value = import.meta.env.VITE_NAKAMA_USE_SSL?.trim().toLowerCase();
  if (!value) return DEFAULT_NAKAMA_USE_SSL;
  return value === '1' || value === 'true' || value === 'yes';
})();
const AUTH_MODE_KEY = 'loteria.authMode';
const CREATE_MATCH_RPC_ID = 'create_loteria_match';

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
  gameState: GameState | null = null;

  constructor() {
    super();
    this.client = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_USE_SSL);
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
    if (!this.socket || !this.session) throw new Error('Not connected');
    this.isHost = true;
    this.gameState = null;

    const response = await this.client.rpc(this.session, CREATE_MATCH_RPC_ID, {
      targetWin: normalizeWinCondition(targetWin),
    });
    const createdMatchId = (response.payload as { matchId?: string } | undefined)?.matchId;
    if (typeof createdMatchId !== 'string' || !createdMatchId) {
      throw new Error('El servidor no devolvio un matchId valido.');
    }

    this.matchId = createdMatchId;
    await this.socket.joinMatch(this.matchId, undefined, {
      playerName: playerName.trim() || 'Jugador',
    });
    return this.matchId;
  }

  async joinMatch(matchId: string, playerName: string): Promise<void> {
    if (!this.socket) throw new Error('Not connected');
    this.isHost = false;
    this.matchId = matchId;
    this.gameState = null;
    await this.socket.joinMatch(matchId, undefined, {
      playerName: playerName.trim() || 'Jugador',
    });
  }

  send(event: NetworkEvent): void {
    if (!this.connected) return;
    void this.sendToMatch(event).catch((error) => {
      console.error('Error sending match event:', error);
    });
  }

  disconnect(): void {
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
    console.info('Incoming match event', {
      type: event.type,
      matchId: this.matchId,
      status: (event.payload as { state?: GameState } | undefined)?.state?.status,
    });
    if (event.type === 'GAME_STATE_SYNC') {
      const payload = event.payload as { state?: GameState };
      if (payload?.state) {
        this.gameState = {
          ...payload.state,
          targetWin: normalizeWinCondition(payload.state.targetWin),
        };
      }
    }

    this.emit(event);
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
      void presence;
    };

    this.socket.ondisconnect = () => {
      this.connected = false;
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

  async sendMatchEvent(event: NetworkEvent): Promise<void> {
    return this.sendToMatch(event);
  }

  private async sendToMatch(event: NetworkEvent): Promise<void> {
    if (!this.socket || !this.matchId) {
      throw new Error('No hay una partida activa para enviar eventos.');
    }
    const data = JSON.stringify(event);
    console.info('Sending match event', {
      type: event.type,
      matchId: this.matchId,
      opCode: OP_CODE.GAME_EVENT,
      payload: event.payload,
    });
    await this.socket.sendMatchState(this.matchId, OP_CODE.GAME_EVENT, data);
    console.info('Match event sent', {
      type: event.type,
      matchId: this.matchId,
    });
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
