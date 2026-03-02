export interface LotteryCard {
  id: number;
  name: string;
  verse: string;
  category: CardCategory;
}

export type CardCategory = 'character' | 'animal' | 'nature' | 'object' | 'celestial';

export interface BoardCell {
  cardId: number;
  marked: boolean;
}

export type WinConditionType = 'linea' | 'cuadro' | 'tabla';
export type LinePattern = 'horizontal' | 'vertical' | 'diagonal';
export type SquarePattern = 'esquinas' | 'centro';

export interface LineWinCondition {
  type: 'linea';
  lineTypes: LinePattern[];
}

export interface SquareWinCondition {
  type: 'cuadro';
  squareTypes: SquarePattern[];
}

export interface FullBoardWinCondition {
  type: 'tabla';
}

export type WinCondition = LineWinCondition | SquareWinCondition | FullBoardWinCondition;

export interface Player {
  id: string;
  name: string;
  board: BoardCell[];
  isWinner: boolean;
  isConnected: boolean;
  isHuman: boolean;
  winCondition?: WinCondition;
}

export type GameStatus = 'waiting' | 'playing' | 'paused' | 'finished';

export interface GameState {
  gameId: string;
  players: Player[];
  deck: number[];
  drawnCards: number[];
  currentCard: LotteryCard | null;
  status: GameStatus;
  winner: Player | null;
  turnInterval: number;
  targetWin: WinCondition;
  hostId: string;
}

export type NetworkEventType =
  | 'PLAYER_JOIN'
  | 'PLAYER_LEAVE'
  | 'GAME_START'
  | 'GAME_STATE_SYNC'
  | 'CARD_DRAWN'
  | 'MARK_CARD'
  | 'CLAIM_WIN'
  | 'WIN_VALIDATED'
  | 'WIN_INVALID'
  | 'GAME_OVER'
  | 'CHAT_MESSAGE'
  | 'TURN_TICK'
  | 'ERROR';

export interface NetworkEvent {
  type: NetworkEventType;
  payload: unknown;
  timestamp: number;
  senderId: string;
}

export interface PlayerJoinPayload {
  player: Player;
}

export interface PlayerLeavePayload {
  playerId: string;
}

export interface CardDrawnPayload {
  card: LotteryCard;
  deck: number[];
  drawnCards: number[];
}

export interface MarkCardPayload {
  playerId: string;
  cardId: number;
}

export interface ClaimWinPayload {
  playerId: string;
  condition: WinCondition;
  board: BoardCell[];
}

export interface WinValidatedPayload {
  playerId: string;
  valid: boolean;
  condition: WinCondition;
  winner: Player;
}

export interface GameStateSyncPayload {
  state: GameState;
}

export interface INetworkService {
  connect(playerId: string): Promise<void>;
  disconnect(): void;
  send(event: NetworkEvent): void;
  on(eventType: NetworkEventType, callback: (event: NetworkEvent) => void): void;
  off(eventType: NetworkEventType, callback: (event: NetworkEvent) => void): void;
  isConnected(): boolean;
}

export interface WinCheckResult {
  isWin: boolean;
  condition?: WinCondition;
  lines?: number[][];
}

export interface BoardGenerationOptions {
  totalCards: number;
  boardSize: number;
}

export interface GameConfig {
  maxPlayers: number;
  boardSize: number;
  turnIntervalMs: number;
  targetWin: WinCondition;
  mockPlayerCount: number;
}

export type AuthProvider = 'guest' | 'google';

export interface UserPreferences {
  calledCardFeedbackEnabled: boolean;
}

export interface AuthProfile {
  userId: string;
  username: string;
  provider: AuthProvider;
  googleLinked: boolean;
  deviceId: string;
  preferences: UserPreferences;
}
