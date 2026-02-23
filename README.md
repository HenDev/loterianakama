# Lotería Mexicana Multijugador

Juego de Lotería Mexicana multijugador construido con Phaser 3, React, TypeScript y Vite. Arquitectura modular lista para conectarse a un backend real (Socket.IO, WebSocket, Colyseus o API REST).

---

## Inicio rápido

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en tu navegador.

---

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run test` | Ejecutar pruebas unitarias |
| `npm run test:watch` | Pruebas en modo observador |
| `npm run test:ui` | Interfaz visual de pruebas |
| `npm run typecheck` | Verificación de tipos TypeScript |

---

## Estructura del proyecto

```
src/
├── types/
│   └── index.ts              # Interfaces y tipos globales
├── data/
│   ├── cards.ts              # Las 54 cartas de Lotería con versos
│   └── players.ts            # Nombres y avatares de jugadores mock
├── utils/
│   ├── shuffle.ts            # Barajar, selección aleatoria, UUID
│   └── validation.ts         # Validación de línea, tabla y reclamos
├── services/
│   ├── GameService.ts        # Lógica pura del juego (sin UI, sin red)
│   ├── NetworkService.ts     # Interfaz y clase base de red
│   ├── MockNetworkService.ts # Implementación simulada multijugador
│   └── AudioService.ts       # Efectos de sonido con Web Audio API
├── components/
│   ├── CardComponent.ts      # Carta individual Phaser
│   ├── BoardComponent.ts     # Tablero 4x4 Phaser
│   ├── DeckCardComponent.ts  # Carta actual del mazo
│   └── PlayerListComponent.ts# Lista de jugadores
├── scenes/
│   ├── BootScene.ts          # Carga inicial de assets
│   ├── LobbyScene.ts         # Pantalla de inicio
│   ├── GameScene.ts          # Escena principal del juego
│   └── ResultScene.ts        # Pantalla de resultados
├── tests/
│   ├── GameService.test.ts   # 29 pruebas de lógica de juego
│   ├── MockNetworkService.test.ts # 14 pruebas de red simulada
│   └── validation.test.ts    # 12 pruebas de validación
├── game.ts                   # Configuración de Phaser
├── App.tsx                   # Componente React raíz
├── main.tsx                  # Punto de entrada
└── index.css                 # Estilos base
```

---

## Reglas del juego

1. Se generan tableros únicos de **4×4** cartas para cada jugador
2. El cantor voltea cartas del mazo de **54** cartas una a una
3. Los jugadores marcan sus cartas cuando son cantadas
4. Los jugadores IA marcan automáticamente
5. El primero en completar el objetivo gana

### Modos de victoria
- **Línea**: Completar cualquier fila, columna o diagonal
- **Tabla**: Completar las 16 cartas del tablero

---

## Arquitectura multijugador

### Patrón servidor autoritativo

```
Cliente → NetworkService → Servidor (MockNetworkService)
                                  ↓
                             GameService (lógica pura)
                                  ↓
                         GameState inmutable
                                  ↓
                        Broadcast a todos los clientes
```

### Separación de responsabilidades

- **GameService**: Lógica pura sin dependencias de UI o red
- **NetworkService**: Interfaz desacoplada de transporte
- **MockNetworkService**: Simula latencia y comportamiento de 3 jugadores IA
- **Escenas Phaser**: Solo presentación, sin lógica de negocio

---

## Guía de integración con backend real

### Opción 1: Socket.IO

```typescript
import { io, Socket } from 'socket.io-client';
import { BaseNetworkService } from './NetworkService';
import type { NetworkEvent } from '../types';

export class SocketIONetworkService extends BaseNetworkService {
  private socket: Socket | null = null;

  async connect(playerId: string): Promise<void> {
    this.socket = io('https://tu-servidor.com', {
      auth: { playerId }
    });

    this.socket.onAny((eventType: string, payload: unknown) => {
      this.emit({
        type: eventType as NetworkEvent['type'],
        payload,
        senderId: 'server',
        timestamp: Date.now()
      });
    });

    this.connected = true;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.connected = false;
  }

  send(event: NetworkEvent): void {
    this.socket?.emit(event.type, event.payload);
  }
}
```

### Opción 2: Colyseus

```typescript
import Colyseus from 'colyseus.js';
import { BaseNetworkService } from './NetworkService';

export class ColyseusNetworkService extends BaseNetworkService {
  private room: Colyseus.Room | null = null;
  private client = new Colyseus.Client('ws://tu-servidor.com');

  async connect(playerId: string): Promise<void> {
    this.room = await this.client.joinOrCreate('loteria', { playerId });
    this.room.onMessage('*', (type, message) => {
      this.emit({ type, payload: message, senderId: 'server', timestamp: Date.now() });
    });
    this.connected = true;
  }

  disconnect(): void {
    this.room?.leave();
    this.connected = false;
  }

  send(event: NetworkEvent): void {
    this.room?.send(event.type, event.payload);
  }
}
```

### Opción 3: WebSocket nativo

```typescript
export class WebSocketNetworkService extends BaseNetworkService {
  private ws: WebSocket | null = null;

  async connect(_playerId: string): Promise<void> {
    this.ws = new WebSocket('wss://tu-servidor.com/loteria');
    this.ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      this.emit(event);
    };
    this.connected = true;
  }

  disconnect(): void {
    this.ws?.close();
    this.connected = false;
  }

  send(event: NetworkEvent): void {
    this.ws?.send(JSON.stringify(event));
  }
}
```

### Reemplazar MockNetworkService

En `LobbyScene.ts` y `GameScene.ts`, cambia:

```typescript
import { getMockNetworkService } from '../services/MockNetworkService';
// Por:
import { getSocketIONetworkService } from '../services/SocketIONetworkService';
```

---

## Eventos del protocolo

| Evento | Dirección | Descripción |
|---|---|---|
| `PLAYER_JOIN` | C → S | Jugador se une a la sala |
| `PLAYER_LEAVE` | S → C | Jugador abandona |
| `GAME_START` | C → S | Iniciar partida |
| `GAME_STATE_SYNC` | S → C | Sincronización completa de estado |
| `CARD_DRAWN` | S → C | Nueva carta cantada |
| `MARK_CARD` | C → S | Jugador marca una carta |
| `CLAIM_WIN` | C → S | Jugador reclama victoria |
| `WIN_VALIDATED` | S → C | Victoria válida confirmada |
| `WIN_INVALID` | S → C | Reclamo rechazado |
| `GAME_OVER` | S → C | Partida terminada |

---

## Pruebas

```bash
npm test
```

```
✓ src/tests/validation.test.ts       (12 tests)
✓ src/tests/GameService.test.ts      (29 tests)
✓ src/tests/MockNetworkService.test.ts (14 tests)

Test Files  3 passed
Tests       55 passed
```

---

## Patrones de diseño aplicados

- **Servidor autoritativo**: El MockNetworkService valida todos los reclamos antes de emitir ganador
- **Estado inmutable**: GameService devuelve nuevos objetos de estado en cada operación
- **Eventos tipados**: NetworkEventType garantiza contratos claros entre cliente y servidor
- **Separación lógica/UI**: GameService no importa nada de Phaser
- **Pool de objetos**: Las escenas reutilizan contenedores Phaser para minimizar garbage collection
- **Singleton de servicios**: getMockNetworkService() garantiza una sola instancia por sesión

---

## Consideraciones técnicas

- **Phaser 3.60** con renderizado WebGL/Canvas automático
- **TypeScript strict** en todo el codebase
- **ESM modules** para tree-shaking óptimo
- Animaciones a **60fps** con tweens de Phaser
- Audio generado con **Web Audio API** (sin archivos externos)
- Diseño responsivo con **Phaser Scale.FIT**
- Tableros y mazos aleatorizados con **Fisher-Yates shuffle**
- Validación de victoria con doble verificación (cliente + servidor)

---

## Tecnologías

- [Phaser 3](https://phaser.io) — Motor de juego
- [React 18](https://react.dev) — Shell de aplicación
- [TypeScript 5](https://www.typescriptlang.org) — Tipado estático
- [Vite 5](https://vitejs.dev) — Build tool
- [Vitest](https://vitest.dev) — Framework de pruebas
- [Tailwind CSS](https://tailwindcss.com) — Utilidades CSS
