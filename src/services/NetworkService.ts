import type { INetworkService, NetworkEvent, NetworkEventType } from '../types';

export abstract class BaseNetworkService implements INetworkService {
  protected handlers = new Map<NetworkEventType, Set<(event: NetworkEvent) => void>>();
  protected connected = false;

  abstract connect(playerId: string): Promise<void>;
  abstract disconnect(): void;
  abstract send(event: NetworkEvent): void;

  on(eventType: NetworkEventType, callback: (event: NetworkEvent) => void): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(callback);
  }

  off(eventType: NetworkEventType, callback: (event: NetworkEvent) => void): void {
    this.handlers.get(eventType)?.delete(callback);
  }

  protected emit(event: NetworkEvent): void {
    this.handlers.get(event.type)?.forEach(cb => cb(event));
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export function createNetworkEvent(
  type: NetworkEvent['type'],
  payload: unknown,
  senderId: string
): NetworkEvent {
  return { type, payload, senderId, timestamp: Date.now() };
}
