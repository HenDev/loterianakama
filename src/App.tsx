import { useEffect, useRef } from 'react';
import { createGame } from './game';
import type Phaser from 'phaser';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    gameRef.current = createGame(containerRef.current);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0d1b2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      aria-label="Lotería Mexicana Multijugador"
      role="main"
    >
      <div
        ref={containerRef}
        id="game-container"
        style={{ width: '100%', height: '100%' }}
        aria-label="Canvas del juego"
      />
    </div>
  );
}
