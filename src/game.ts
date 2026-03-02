import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { NakamaMatchScene } from './scenes/NakamaMatchScene';
import { ProfileScene } from './scenes/ProfileScene';
import { CantorScene } from './scenes/CantorScene';

export function createGame(parent: string | HTMLElement): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1200,
    height: 760,
    backgroundColor: '#0d1b2a',
    parent,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, LobbyScene, GameScene, ResultScene, NakamaMatchScene, ProfileScene, CantorScene],
    render: {
      antialias: true,
      roundPixels: false,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
  };

  return new Phaser.Game(config);
}
