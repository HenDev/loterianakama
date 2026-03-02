import Phaser from 'phaser';
import * as THREE from 'three';
import type { LinePattern, SquarePattern, WinCondition } from '../types';
import { getMockNetworkService, resetMockNetworkService } from '../services/MockNetworkService';
import { getAudioService } from '../services/AudioService';
import { generateUUID } from '../utils/shuffle';
import { CARD_ATLAS_KEY } from '../data/cards';
import {
  cloneWinCondition,
  DEFAULT_LINE_PATTERNS,
  DEFAULT_SQUARE_PATTERNS,
  DEFAULT_TARGET_WIN,
  getCompactWinConditionLabel,
  getLinePatternLabel,
  getSquarePatternLabel,
  getWinConditionSummary,
  normalizeWinCondition,
} from '../utils/winCondition';

export class LobbyScene extends Phaser.Scene {
  private playerId = '';
  private targetWin: WinCondition = cloneWinCondition(DEFAULT_TARGET_WIN);
  private rememberedLineTypes: LinePattern[] = [];
  private rememberedSquareTypes: SquarePattern[] = [];
  private networkService = getMockNetworkService();
  private card3DCanvas: HTMLCanvasElement | null = null;
  private card3DRenderer: THREE.WebGLRenderer | null = null;
  private card3DScene: THREE.Scene | null = null;
  private card3DCamera: THREE.PerspectiveCamera | null = null;
  private card3DMesh: THREE.Object3D | null = null;
  private card3DStartMs = 0;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    resetMockNetworkService();
    this.networkService = getMockNetworkService();
    this.playerId = generateUUID();

    const { width, height } = this.scale;
    this.buildBackground(width, height);
    this.buildTitle(width, height);
    //this.buildDecoration(width, height);
    this.buildVictoryStartPanel(width, height);
    //this.buildRulesPanel(width, height);
    this.buildThreeCard(width, height);

    this.scale.on('resize', this.onResizeThreeCard, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupThreeCard, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupThreeCard, this);
  }

  update(): void {
    this.renderThreeCard();
  }

  private buildBackground(width: number, height: number): void {
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x0d1b2a);
    void bg;
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2 + 1;
      const star = this.add.circle(x, y, size, 0xffffff, Math.random() * 0.5 + 0.2);
      this.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: Phaser.Math.Between(1500, 3000),
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }
  }

  private buildTitle(width: number, height: number): void {
    const titleBg = this.add.rectangle(width / 2, height * 0.2, width * 0.8, 100, 0x000000, 0.4);
    titleBg.setStrokeStyle(2, 0xd4af37, 0.6);

    this.add.text(width / 2, height * 0.19, '¡LOTERÍA!', {
      fontSize: '58px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.24, 'Lotería Mexicana Multijugador', {
      fontSize: '18px',
      color: '#cccccc',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

  }

  public buildDecoration(width: number, height: number): void {
    const cardNames = ['El Sol', 'La Luna', 'El Gallo', 'La Rosa', 'El Diablito'];
    const colors = [0xE67E22, 0x16A085, 0xC0392B, 0x27AE60, 0x8B1A1A];
    cardNames.forEach((name, i) => {
      const x = (i / (cardNames.length - 1)) * width * 0.8 + width * 0.1;
      const y = height * 0.68;
      const card = this.add.rectangle(x, y, 90, 130, colors[i], 0.7);
      card.setStrokeStyle(2, 0xd4af37, 0.5);
      const label = this.add.text(x, y, name, {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'Georgia, serif',
        align: 'center',
        wordWrap: { width: 80 },
      }).setOrigin(0.5);
      this.tweens.add({
        targets: [card, label],
        y: y - 8,
        duration: Phaser.Math.Between(1800, 2800),
        yoyo: true,
        repeat: -1,
        delay: i * 300,
        ease: 'Sine.easeInOut',
      });
    });
  }

  private buildThreeCard(width: number, height: number): void {
    const parent = this.game.canvas.parentElement;
    if (!parent) return;

    parent.style.position = parent.style.position || 'relative';

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '3';
    parent.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2.5, 3, 4);
    scene.add(ambient, key);

    const frontTexture = this.createThreeTextureFromAtlasFrame('carta_46_sol');
    const blueBackTexture = this.createThreeTextureFromAtlasFrame('reverso_azul');
    this.applyTextureCover(frontTexture, 1);
    this.applyTextureCover(blueBackTexture, 1);

    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xefe3c3, roughness: 0.6, metalness: 0.05 });
    const frontMaterial = frontTexture
      ? new THREE.MeshStandardMaterial({
        map: frontTexture,
        roughness: 0.9,
        metalness: 0.05,
        transparent: true,
        alphaTest: 0.2,
      })
      : new THREE.MeshStandardMaterial({ color: 0xffffff });
    const backMaterial = blueBackTexture
      ? new THREE.MeshStandardMaterial({
        map: blueBackTexture,
        roughness: 0.9,
        metalness: 0.05,
        transparent: true,
        alphaTest: 0.2,
      })
      : new THREE.MeshStandardMaterial({ color: 0x2f61b8 });

    const cardWidth = 2.04;
    const cardHeight = 3.14;
    const cardThickness = 0.02;
    const cornerRadius = 0.12;
    const shape = this.createRoundedCardShape(cardWidth, cardHeight, cornerRadius);

    const sideGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: cardThickness,
      bevelEnabled: false,
      curveSegments: 24,
    });
    sideGeometry.center();
    const sideMesh = new THREE.Mesh(sideGeometry, edgeMaterial);

    const faceGeometry = new THREE.ShapeGeometry(shape, 24);
    faceGeometry.center();
    this.remapCardFaceUVs(faceGeometry, cardWidth, cardHeight);

    const frontFace = new THREE.Mesh(faceGeometry, frontMaterial);
    frontFace.position.z = (cardThickness / 2) + 0.001;

    const backFace = new THREE.Mesh(faceGeometry, backMaterial);
    backFace.rotation.y = Math.PI;
    backFace.position.z = -(cardThickness / 2) - 0.001;

    const mesh = new THREE.Group();
    mesh.add(sideMesh, frontFace, backFace);
    mesh.rotation.x = 0.1;
    mesh.rotation.y = -0.25;
    scene.add(mesh);

    this.card3DCanvas = canvas;
    this.card3DRenderer = renderer;
    this.card3DScene = scene;
    this.card3DCamera = camera;
    this.card3DMesh = mesh;
    this.card3DStartMs = this.time.now;

    this.onResizeThreeCard({ width, height } as Phaser.Structs.Size);
  }

  private createThreeTextureFromAtlasFrame(frameName: string): THREE.CanvasTexture | null {
    const frame = this.textures.getFrame(CARD_ATLAS_KEY, frameName);
    if (!frame) return null;

    const sourceImage = frame.source.image as CanvasImageSource;
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = frame.cutWidth;
    frameCanvas.height = frame.cutHeight;

    const ctx = frameCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(
      sourceImage,
      frame.cutX,
      frame.cutY,
      frame.cutWidth,
      frame.cutHeight,
      0,
      0,
      frame.cutWidth,
      frame.cutHeight,
    );

    const texture = new THREE.CanvasTexture(frameCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  private applyTextureCover(texture: THREE.Texture | null, zoom: number): void {
    if (!texture) return;
    const safeZoom = Math.max(1, zoom);
    const repeat = 1 / safeZoom;
    const offset = (1 - repeat) * 0.5;
    texture.center.set(0.5, 0.5);
    texture.repeat.set(repeat, repeat);
    texture.offset.set(offset, offset);
    texture.needsUpdate = true;
  }

  private remapCardFaceUVs(geometry: THREE.BufferGeometry, width: number, height: number): void {
    const positions = geometry.getAttribute('position');
    const uvs = geometry.getAttribute('uv');
    if (!positions || !uvs) return;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const u = (x / width) + 0.5;
      const v = (y / height) + 0.5;
      uvs.setXY(i, u, v);
    }

    uvs.needsUpdate = true;
  }

  private createRoundedCardShape(width: number, height: number, radius: number): THREE.Shape {
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(radius, width / 2, height / 2);
    const shape = new THREE.Shape();

    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    return shape;
  }

  private onResizeThreeCard(gameSize: Phaser.Structs.Size): void {
    if (!this.card3DRenderer || !this.card3DCamera || !this.card3DCanvas) return;

    const width = gameSize.width;
    const height = gameSize.height;
    const cardHeight = Math.min(Math.max(height * 0.45, 200), 340);
    const cardWidth = cardHeight * (204 / 314);

    this.card3DCanvas.style.width = `${cardWidth}px`;
    this.card3DCanvas.style.height = `${cardHeight}px`;
    this.card3DCanvas.style.left = `${width * 0.16}px`;
    this.card3DCanvas.style.top = `${height * 0.62}px`;
    this.card3DCanvas.style.transform = 'translate(-50%, -50%)';

    this.card3DCamera.aspect = cardWidth / cardHeight;
    this.card3DCamera.updateProjectionMatrix();
    this.card3DRenderer.setSize(cardWidth, cardHeight, false);
  }

  private renderThreeCard(): void {
    if (!this.card3DRenderer || !this.card3DScene || !this.card3DCamera || !this.card3DMesh) return;

    const elapsedSec = (this.time.now - this.card3DStartMs) / 1000;
    const liftDuration = 2.2;
    const spinDuration = 1.2;
    const cycle = liftDuration + spinDuration;
    const current = elapsedSec % cycle;

    this.card3DMesh.rotation.x = 0.1;

    if (current <= liftDuration) {
      const t = current / liftDuration;
      this.card3DMesh.position.y = Math.sin(t * Math.PI * 2) * 0.22;
      this.card3DMesh.rotation.y = -0.25;
      this.card3DMesh.rotation.z = Math.sin(t * Math.PI) * 0.08;
    } else {
      const t = Phaser.Math.Clamp((current - liftDuration) / spinDuration, 0, 1);
      const easedT = Phaser.Math.Easing.Cubic.Out(t);
      this.card3DMesh.position.y = 0;
      this.card3DMesh.rotation.z = 0;
      this.card3DMesh.rotation.y = -0.25 + (Math.PI * 2 * easedT);
    }

    this.card3DRenderer.render(this.card3DScene, this.card3DCamera);
  }

  private cleanupThreeCard(): void {
    this.scale.off('resize', this.onResizeThreeCard, this);

    if (this.card3DScene) {
      this.card3DScene.traverse((obj: THREE.Object3D) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((material: THREE.Material) => {
          const texture = (material as THREE.MeshStandardMaterial).map;
          if (texture) texture.dispose();
          material.dispose();
        });
      });
    }

    if (this.card3DRenderer) {
      this.card3DRenderer.dispose();
      this.card3DRenderer.forceContextLoss();
    }

    if (this.card3DCanvas?.parentElement) {
      this.card3DCanvas.parentElement.removeChild(this.card3DCanvas);
    }

    this.card3DCanvas = null;
    this.card3DRenderer = null;
    this.card3DScene = null;
    this.card3DCamera = null;
    this.card3DMesh = null;
  }

  private createCircleIconButton(
    x: number,
    y: number,
    drawIcon: (graphics: Phaser.GameObjects.Graphics) => void,
    onClick: () => void,
  ): { bg: Phaser.GameObjects.Arc; container: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Graphics } {
    const container = this.add.container(x, y);
    const bg = this.add.circle(0, 0, 34, 0x13263a, 0.96);
    bg.setStrokeStyle(3, 0xd4af37, 0.9);

    const icon = this.add.graphics();
    drawIcon(icon);

    container.add([bg, icon]);
    container.setSize(68, 68);
    container.setInteractive(new Phaser.Geom.Circle(0, 0, 34), Phaser.Geom.Circle.Contains);
    if (container.input) container.input.cursor = 'pointer';

    container.on('pointerdown', onClick);
    container.on('pointerover', () => {
      bg.setFillStyle(0x1f3852, 1);
      this.tweens.add({
        targets: container,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 110,
      });
    });
    container.on('pointerout', () => {
      bg.setFillStyle(0x13263a, 0.96);
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 110,
      });
    });

    return { bg, container, icon };
  }

  private drawAudioIcon(graphics: Phaser.GameObjects.Graphics, muted: boolean): void {
    graphics.clear();
    graphics.fillStyle(0xf4d99a, 1);
    graphics.lineStyle(3, 0xf4d99a, 1);

    graphics.fillRect(-14, -8, 7, 16);
    graphics.fillTriangle(-7, -12, 6, 0, -7, 12);

    if (muted) {
      graphics.lineStyle(4, 0xff6b6b, 1);
      graphics.lineBetween(10, -11, 20, 11);
      graphics.lineBetween(10, 11, 20, -11);
      return;
    }

    graphics.beginPath();
    graphics.arc(7, 0, 7, -0.75, 0.75);
    graphics.strokePath();
    graphics.beginPath();
    graphics.arc(7, 0, 13, -0.75, 0.75);
    graphics.strokePath();
  }

  private drawFullscreenIcon(graphics: Phaser.GameObjects.Graphics, active: boolean): void {
    graphics.clear();

    if (active) {
      graphics.lineStyle(4, 0xf4d99a, 1);
      graphics.lineBetween(-12, -12, 12, 12);
      graphics.lineBetween(12, -12, -12, 12);
      return;
    }

    graphics.lineStyle(4, 0xf4d99a, 1);
    graphics.lineBetween(-16, -6, -16, -16);
    graphics.lineBetween(-16, -16, -6, -16);
    graphics.lineBetween(16, -6, 16, -16);
    graphics.lineBetween(16, -16, 6, -16);
    graphics.lineBetween(-16, 6, -16, 16);
    graphics.lineBetween(-16, 16, -6, 16);
    graphics.lineBetween(16, 6, 16, 16);
    graphics.lineBetween(16, 16, 6, 16);
  }

  public buildStartPanel(width: number, height: number): void {
    const panelX = width / 2;
    const panelY = height * 0.6;

    const panel = this.add.rectangle(panelX, panelY, 700, 520, 0x0a0a1a, 0.9);
    panel.setStrokeStyle(2, 0xd4af37, 0.8);

    this.add.text(panelX, panelY - 145, 'UN JUGADOR — Modo de Victoria', {
      fontSize: '17px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.createButton(panelX - 100, panelY - 95, '  Línea  ', 0x2c5364, () => {
      getAudioService().play('button');
      this.startGame('linea');
    }, 170, 58, 20);

    this.createButton(panelX + 100, panelY - 95, '  Tabla  ', 0x1a3a2a, () => {
      getAudioService().play('button');
      this.startGame('tabla');
    }, 170, 58, 20);

    this.add.text(panelX, panelY - 40, 'Jugarás contra 3 jugadores simulados', {
      fontSize: '16px',
      color: '#777777',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xd4af37, 0.3);
    divider.lineBetween(panelX - 220, panelY + 10, panelX + 220, panelY + 10);

    this.add.text(panelX, panelY + 42, 'MULTIJUGADOR EN LÍNEA', {
      fontSize: '17px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.createButton(panelX, panelY + 95, '  Jugar en Línea  ', 0x1a2a4a, () => {
      getAudioService().play('button');
      this.scene.start('NakamaMatchScene');
    }, 290, 62, 21);

    this.add.text(panelX, panelY + 150, 'Crea o únete a una partida con amigos', {
      fontSize: '15px',
      color: '#555555',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.createButton(panelX, panelY + 215, '  Solo cantar cartas  ', 0x4a2432, () => {
      getAudioService().play('button');
      this.scene.start('CantorScene');
    }, 340, 60, 19);

    const muteBtnText = this.add.text(panelX + 215, panelY - 145, '🔊', {
      fontSize: '30px',
    }).setOrigin(0.5).setInteractive(new Phaser.Geom.Circle(0, 0, 24), Phaser.Geom.Circle.Contains);
    if (muteBtnText.input) muteBtnText.input.cursor = 'pointer';

    muteBtnText.on('pointerdown', () => {
      const audio = getAudioService();
      audio.setMuted(!audio.isMuted());
      muteBtnText.setText(audio.isMuted() ? '🔇' : '🔊');
    });

    const fullscreenBtnBg = this.add.circle(panelX - 215, panelY - 145, 34, 0x13263a, 0.96);
    fullscreenBtnBg.setStrokeStyle(3, 0xd4af37, 0.9);

    const fullscreenBtnText = this.add.text(panelX - 215, panelY - 145, '⛶', {
      fontSize: '42px',
      color: '#f4d99a',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive(new Phaser.Geom.Circle(0, 0, 34), Phaser.Geom.Circle.Contains);
    if (fullscreenBtnText.input) fullscreenBtnText.input.cursor = 'pointer';
    const updateFullscreenIcon = () => {
      fullscreenBtnText.setText(this.scale.isFullscreen ? '✕' : '⛶');
    };

    fullscreenBtnText.on('pointerdown', () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    fullscreenBtnText.on('pointerover', () => {
      fullscreenBtnBg.setFillStyle(0x1f3852, 1);
      this.tweens.add({
        targets: [fullscreenBtnBg, fullscreenBtnText],
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 110,
      });
    });

    fullscreenBtnText.on('pointerout', () => {
      fullscreenBtnBg.setFillStyle(0x13263a, 0.96);
      this.tweens.add({
        targets: [fullscreenBtnBg, fullscreenBtnText],
        scaleX: 1,
        scaleY: 1,
        duration: 110,
      });
    });

    this.scale.on('fullscreenchange', updateFullscreenIcon);

  }

  public buildConfiguredStartPanel(width: number, height: number): void {
    const panelX = width / 2;
    const panelY = height * 0.54;

    const panel = this.add.rectangle(panelX, panelY, 720, 620, 0x0a0a1a, 0.9);
    panel.setStrokeStyle(2, 0xd4af37, 0.8);

    this.add.text(panelX, panelY - 145, 'UN JUGADOR - Modo de Victoria', {
      fontSize: '17px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.add.text(panelX, panelY - 112, 'Tipo principal', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    type SelectorButton = {
      container: Phaser.GameObjects.Container;
      bg: Phaser.GameObjects.Rectangle;
      text: Phaser.GameObjects.Text;
      activeColor: number;
      inactiveColor: number;
      resetHandler: () => void;
    };

    const createSelectorButton = (
      x: number,
      y: number,
      label: string,
      widthValue: number,
      activeColor: number,
      onClick: () => void,
    ): SelectorButton => {
      const container = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, widthValue, 42, 0x0d1e30);
      bg.setStrokeStyle(2, 0x4a7a9b, 0.7);
      const text = this.add.text(0, 0, label, {
        fontSize: '14px',
        color: '#d7d7d7',
        fontFamily: 'Georgia, serif',
      }).setOrigin(0.5);

      container.add([bg, text]);
      container.setSize(widthValue, 42);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-widthValue / 2, -21, widthValue, 42),
        Phaser.Geom.Rectangle.Contains,
      );

      const handler = () => {
        getAudioService().play('button');
        onClick();
      };

      container.on('pointerdown', handler);
      container.on('pointerover', () => {
        this.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, duration: 80 });
      });
      container.on('pointerout', () => {
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
      });

      return {
        container,
        bg,
        text,
        activeColor,
        inactiveColor: 0x0d1e30,
        resetHandler: handler,
      };
    };

    const setButtonActive = (button: SelectorButton, active: boolean): void => {
      button.bg.setFillStyle(active ? button.activeColor : button.inactiveColor);
      button.bg.setStrokeStyle(2, active ? 0xd4af37 : 0x4a7a9b, active ? 1 : 0.7);
      button.text.setColor(active ? '#f6e7b7' : '#d7d7d7');
    };

    const setButtonVisible = (button: SelectorButton, visible: boolean): void => {
      button.container.setVisible(visible);
      if (button.container.input) {
        button.container.input.enabled = visible;
      }
    };

    const bindButton = (button: SelectorButton, onClick: () => void): void => {
      button.container.removeListener('pointerdown', button.resetHandler);
      button.container.removeAllListeners('pointerdown');
      const handler = () => {
        getAudioService().play('button');
        onClick();
      };
      button.resetHandler = handler;
      button.container.on('pointerdown', handler);
    };

    const modeButtons = {
      linea: createSelectorButton(panelX - 180, panelY - 76, 'Lineas', 150, 0x2c5364, () => {
        if (this.rememberedLineTypes.length === 0) {
          this.rememberedLineTypes = [...DEFAULT_LINE_PATTERNS];
        }
        this.targetWin = { type: 'linea', lineTypes: [...this.rememberedLineTypes] };
        refreshSelectionUi();
      }),
      cuadro: createSelectorButton(panelX, panelY - 76, 'Cuadros', 150, 0x4a2448, () => {
        if (this.rememberedSquareTypes.length === 0) {
          this.rememberedSquareTypes = [...DEFAULT_SQUARE_PATTERNS];
        }
        this.targetWin = { type: 'cuadro', squareTypes: [...this.rememberedSquareTypes] };
        refreshSelectionUi();
      }),
      tabla: createSelectorButton(panelX + 180, panelY - 76, 'Tabla llena', 150, 0x1a3a2a, () => {
        this.targetWin = { type: 'tabla' };
        refreshSelectionUi();
      }),
    };

    this.add.text(panelX, panelY - 28, 'Subtipos permitidos', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const subtypeButtons: SelectorButton[] = [
      createSelectorButton(panelX - 180, panelY + 8, 'Horizontal', 150, 0x2b4554, () => {}),
      createSelectorButton(panelX, panelY + 8, 'Vertical', 150, 0x2b4554, () => {}),
      createSelectorButton(panelX + 180, panelY + 8, 'Diagonal', 150, 0x2b4554, () => {}),
    ];

    const summaryText = this.add.text(panelX, panelY + 58, '', {
      fontSize: '15px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      align: 'center',
    }).setOrigin(0.5);

    const infoText = this.add.text(panelX, panelY + 90, '', {
      fontSize: '13px',
      color: '#777777',
      fontFamily: 'Georgia, serif',
      align: 'center',
    }).setOrigin(0.5);

    this.createButton(panelX, panelY + 128, '  Iniciar Partida  ', 0x2c5364, () => {
      getAudioService().play('button');
      this.launchSelectedGame();
    }, 240, 56, 19);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xd4af37, 0.3);
    divider.lineBetween(panelX - 240, panelY + 168, panelX + 240, panelY + 168);

    this.add.text(panelX, panelY + 202, 'MULTIJUGADOR EN LINEA', {
      fontSize: '17px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.createButton(panelX - 110, panelY + 244, '  Jugar en linea  ', 0x1a2a4a, () => {
      getAudioService().play('button');
      this.scene.start('NakamaMatchScene');
    }, 220, 56, 18);

    this.createButton(panelX + 110, panelY + 244, '  Solo cantar  ', 0x4a2432, () => {
      getAudioService().play('button');
      this.scene.start('CantorScene');
    }, 220, 56, 18);

    this.add.text(panelX, panelY + 288, 'Crea o unete a una partida con amigos', {
      fontSize: '15px',
      color: '#555555',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    const toggleLinePattern = (pattern: LinePattern): void => {
      const current = normalizeWinCondition(this.targetWin);
      if (current.type !== 'linea') return;

      const next = current.lineTypes.includes(pattern)
        ? current.lineTypes.filter(item => item !== pattern)
        : [...current.lineTypes, pattern];

      if (next.length === 0) {
        this.rememberedLineTypes = [];
        this.targetWin = this.rememberedSquareTypes.length > 0
          ? { type: 'cuadro', squareTypes: [...this.rememberedSquareTypes] }
          : { type: 'tabla' };
        refreshSelectionUi();
        return;
      }

      this.rememberedLineTypes = [...next];
      this.targetWin = { type: 'linea', lineTypes: [...this.rememberedLineTypes] };
      refreshSelectionUi();
    };

    const toggleSquarePattern = (pattern: SquarePattern): void => {
      const current = normalizeWinCondition(this.targetWin);
      if (current.type !== 'cuadro') return;

      const next = current.squareTypes.includes(pattern)
        ? current.squareTypes.filter(item => item !== pattern)
        : [...current.squareTypes, pattern];

      if (next.length === 0) {
        this.rememberedSquareTypes = [];
        this.targetWin = this.rememberedLineTypes.length > 0
          ? { type: 'linea', lineTypes: [...this.rememberedLineTypes] }
          : { type: 'tabla' };
        refreshSelectionUi();
        return;
      }

      this.rememberedSquareTypes = [...next];
      this.targetWin = { type: 'cuadro', squareTypes: [...this.rememberedSquareTypes] };
      refreshSelectionUi();
    };

    const refreshSelectionUi = (): void => {
      const current = normalizeWinCondition(this.targetWin);

      setButtonActive(modeButtons.linea, current.type === 'linea');
      setButtonActive(modeButtons.cuadro, current.type === 'cuadro');
      setButtonActive(modeButtons.tabla, current.type === 'tabla');

      summaryText.setText(`Regla: ${getCompactWinConditionLabel(current)}`);
      infoText.setText(getWinConditionSummary(current));

      if (current.type === 'linea') {
        const patterns: LinePattern[] = ['horizontal', 'vertical', 'diagonal'];
        subtypeButtons.forEach((button, index) => {
          const pattern = patterns[index];
          button.text.setText(getLinePatternLabel(pattern));
          setButtonVisible(button, true);
          setButtonActive(button, current.lineTypes.includes(pattern));
          bindButton(button, () => toggleLinePattern(pattern));
        });
        return;
      }

      if (current.type === 'cuadro') {
        const patterns: SquarePattern[] = ['esquinas', 'centro'];
        subtypeButtons.forEach((button, index) => {
          const pattern = patterns[index];
          if (!pattern) {
            setButtonVisible(button, false);
            return;
          }

          button.text.setText(getSquarePatternLabel(pattern));
          setButtonVisible(button, true);
          setButtonActive(button, current.squareTypes.includes(pattern));
          bindButton(button, () => toggleSquarePattern(pattern));
        });
        return;
      }

      subtypeButtons[0].text.setText('Todas las cartas');
      setButtonVisible(subtypeButtons[0], true);
      setButtonActive(subtypeButtons[0], true);
      bindButton(subtypeButtons[0], () => {});
      setButtonVisible(subtypeButtons[1], false);
      setButtonVisible(subtypeButtons[2], false);
      infoText.setText('Se necesitan las 16 cartas marcadas.');
    };

    refreshSelectionUi();

    const muteBtnText = this.add.text(panelX + 215, panelY - 145, 'ðŸ”Š', {
      fontSize: '30px',
    }).setOrigin(0.5).setInteractive(new Phaser.Geom.Circle(0, 0, 24), Phaser.Geom.Circle.Contains);
    if (muteBtnText.input) muteBtnText.input.cursor = 'pointer';

    muteBtnText.on('pointerdown', () => {
      const audio = getAudioService();
      audio.setMuted(!audio.isMuted());
      muteBtnText.setText(audio.isMuted() ? 'ðŸ”‡' : 'ðŸ”Š');
    });

    const fullscreenBtnBg = this.add.circle(panelX - 215, panelY - 145, 34, 0x13263a, 0.96);
    fullscreenBtnBg.setStrokeStyle(3, 0xd4af37, 0.9);

    const fullscreenBtnText = this.add.text(panelX - 215, panelY - 145, 'â›¶', {
      fontSize: '42px',
      color: '#f4d99a',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive(new Phaser.Geom.Circle(0, 0, 34), Phaser.Geom.Circle.Contains);
    if (fullscreenBtnText.input) fullscreenBtnText.input.cursor = 'pointer';

    const updateFullscreenIcon = () => {
      fullscreenBtnText.setText(this.scale.isFullscreen ? 'âœ•' : 'â›¶');
    };

    fullscreenBtnText.on('pointerdown', () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    fullscreenBtnText.on('pointerover', () => {
      fullscreenBtnBg.setFillStyle(0x1f3852, 1);
      this.tweens.add({
        targets: [fullscreenBtnBg, fullscreenBtnText],
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 110,
      });
    });

    fullscreenBtnText.on('pointerout', () => {
      fullscreenBtnBg.setFillStyle(0x13263a, 0.96);
      this.tweens.add({
        targets: [fullscreenBtnBg, fullscreenBtnText],
        scaleX: 1,
        scaleY: 1,
        duration: 110,
      });
    });

    this.scale.on('fullscreenchange', updateFullscreenIcon);
  }

  private buildVictoryStartPanel(width: number, height: number): void {
    const panelX = width / 2;
    const panelY = height * 0.54;

    const panel = this.add.rectangle(panelX, panelY, 720, 620, 0x0a0a1a, 0.9);
    panel.setStrokeStyle(2, 0xd4af37, 0.8);

    this.add.text(panelX, panelY - 145, 'UN JUGADOR - Modo de Victoria', {
      fontSize: '17px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.add.text(panelX, panelY - 112, 'Tipo principal', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    type SelectorButton = {
      container: Phaser.GameObjects.Container;
      bg: Phaser.GameObjects.Rectangle;
      text: Phaser.GameObjects.Text;
      activeColor: number;
      inactiveColor: number;
      resetHandler: () => void;
    };

    const createSelectorButton = (
      x: number,
      y: number,
      label: string,
      widthValue: number,
      activeColor: number,
      onClick: () => void,
    ): SelectorButton => {
      const container = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, widthValue, 42, 0x0d1e30);
      bg.setStrokeStyle(2, 0x4a7a9b, 0.7);
      const text = this.add.text(0, 0, label, {
        fontSize: '14px',
        color: '#d7d7d7',
        fontFamily: 'Georgia, serif',
      }).setOrigin(0.5);

      container.add([bg, text]);
      container.setSize(widthValue, 42);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-widthValue / 2, -21, widthValue, 42),
        Phaser.Geom.Rectangle.Contains,
      );

      const handler = () => {
        getAudioService().play('button');
        onClick();
      };

      container.on('pointerdown', handler);
      container.on('pointerover', () => {
        this.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, duration: 80 });
      });
      container.on('pointerout', () => {
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
      });

      return {
        container,
        bg,
        text,
        activeColor,
        inactiveColor: 0x0d1e30,
        resetHandler: handler,
      };
    };

    const setButtonActive = (button: SelectorButton, active: boolean): void => {
      button.bg.setFillStyle(active ? button.activeColor : button.inactiveColor);
      button.bg.setStrokeStyle(2, active ? 0xd4af37 : 0x4a7a9b, active ? 1 : 0.7);
      button.text.setColor(active ? '#f6e7b7' : '#d7d7d7');
    };

    const setButtonVisible = (button: SelectorButton, visible: boolean): void => {
      button.container.setVisible(visible);
      if (button.container.input) {
        button.container.input.enabled = visible;
      }
    };

    const bindButton = (button: SelectorButton, onClick: () => void): void => {
      button.container.removeListener('pointerdown', button.resetHandler);
      button.container.removeAllListeners('pointerdown');
      const handler = () => {
        getAudioService().play('button');
        onClick();
      };
      button.resetHandler = handler;
      button.container.on('pointerdown', handler);
    };

    const modeButtons = {
      linea: createSelectorButton(panelX - 180, panelY - 76, 'Lineas', 150, 0x2c5364, () => {
        if (this.rememberedLineTypes.length === 0) {
          this.rememberedLineTypes = [...DEFAULT_LINE_PATTERNS];
        }
        this.targetWin = { type: 'linea', lineTypes: [...this.rememberedLineTypes] };
        refreshSelectionUi();
      }),
      cuadro: createSelectorButton(panelX, panelY - 76, 'Cuadros', 150, 0x4a2448, () => {
        if (this.rememberedSquareTypes.length === 0) {
          this.rememberedSquareTypes = [...DEFAULT_SQUARE_PATTERNS];
        }
        this.targetWin = { type: 'cuadro', squareTypes: [...this.rememberedSquareTypes] };
        refreshSelectionUi();
      }),
      tabla: createSelectorButton(panelX + 180, panelY - 76, 'Tabla llena', 150, 0x1a3a2a, () => {
        this.targetWin = { type: 'tabla' };
        refreshSelectionUi();
      }),
    };

    this.add.text(panelX, panelY - 28, 'Subtipos permitidos', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const subtypeButtons: SelectorButton[] = [
      createSelectorButton(panelX - 180, panelY + 8, 'Horizontal', 150, 0x2b4554, () => {}),
      createSelectorButton(panelX, panelY + 8, 'Vertical', 150, 0x2b4554, () => {}),
      createSelectorButton(panelX + 180, panelY + 8, 'Diagonal', 150, 0x2b4554, () => {}),
    ];

    const summaryText = this.add.text(panelX, panelY + 58, '', {
      fontSize: '15px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      align: 'center',
    }).setOrigin(0.5);

    const infoText = this.add.text(panelX, panelY + 90, '', {
      fontSize: '13px',
      color: '#777777',
      fontFamily: 'Georgia, serif',
      align: 'center',
    }).setOrigin(0.5);

    this.createButton(panelX, panelY + 128, '  Iniciar Partida  ', 0x2c5364, () => {
      getAudioService().play('button');
      this.launchSelectedGame();
    }, 240, 56, 19);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xd4af37, 0.3);
    divider.lineBetween(panelX - 240, panelY + 168, panelX + 240, panelY + 168);

    this.add.text(panelX, panelY + 202, 'MULTIJUGADOR EN LINEA', {
      fontSize: '17px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.createButton(panelX - 110, panelY + 244, '  Jugar en linea  ', 0x1a2a4a, () => {
      getAudioService().play('button');
      this.scene.start('NakamaMatchScene');
    }, 220, 56, 18);

    this.createButton(panelX + 110, panelY + 244, '  Solo cantar  ', 0x4a2432, () => {
      getAudioService().play('button');
      this.scene.start('CantorScene');
    }, 220, 56, 18);

    this.add.text(panelX, panelY + 288, 'Crea o unete a una partida con amigos', {
      fontSize: '15px',
      color: '#555555',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    const toggleLinePattern = (pattern: LinePattern): void => {
      const current = normalizeWinCondition(this.targetWin);
      if (current.type !== 'linea') return;

      const next = current.lineTypes.includes(pattern)
        ? current.lineTypes.filter(item => item !== pattern)
        : [...current.lineTypes, pattern];

      if (next.length === 0) {
        this.rememberedLineTypes = [];
        this.targetWin = this.rememberedSquareTypes.length > 0
          ? { type: 'cuadro', squareTypes: [...this.rememberedSquareTypes] }
          : { type: 'tabla' };
        refreshSelectionUi();
        return;
      }

      this.rememberedLineTypes = [...next];
      this.targetWin = { type: 'linea', lineTypes: [...this.rememberedLineTypes] };
      refreshSelectionUi();
    };

    const toggleSquarePattern = (pattern: SquarePattern): void => {
      const current = normalizeWinCondition(this.targetWin);
      if (current.type !== 'cuadro') return;

      const next = current.squareTypes.includes(pattern)
        ? current.squareTypes.filter(item => item !== pattern)
        : [...current.squareTypes, pattern];

      if (next.length === 0) {
        this.rememberedSquareTypes = [];
        this.targetWin = this.rememberedLineTypes.length > 0
          ? { type: 'linea', lineTypes: [...this.rememberedLineTypes] }
          : { type: 'tabla' };
        refreshSelectionUi();
        return;
      }

      this.rememberedSquareTypes = [...next];
      this.targetWin = { type: 'cuadro', squareTypes: [...this.rememberedSquareTypes] };
      refreshSelectionUi();
    };

    const refreshSelectionUi = (): void => {
      const current = normalizeWinCondition(this.targetWin);

      setButtonActive(modeButtons.linea, current.type === 'linea');
      setButtonActive(modeButtons.cuadro, current.type === 'cuadro');
      setButtonActive(modeButtons.tabla, current.type === 'tabla');

      summaryText.setText(`Regla: ${getCompactWinConditionLabel(current)}`);
      infoText.setText(getWinConditionSummary(current));

      if (current.type === 'linea') {
        const patterns: LinePattern[] = ['horizontal', 'vertical', 'diagonal'];
        subtypeButtons.forEach((button, index) => {
          const pattern = patterns[index];
          button.text.setText(getLinePatternLabel(pattern));
          setButtonVisible(button, true);
          setButtonActive(button, current.lineTypes.includes(pattern));
          bindButton(button, () => toggleLinePattern(pattern));
        });
        return;
      }

      if (current.type === 'cuadro') {
        const patterns: SquarePattern[] = ['esquinas', 'centro'];
        subtypeButtons.forEach((button, index) => {
          const pattern = patterns[index];
          if (!pattern) {
            setButtonVisible(button, false);
            return;
          }

          button.text.setText(getSquarePatternLabel(pattern));
          setButtonVisible(button, true);
          setButtonActive(button, current.squareTypes.includes(pattern));
          bindButton(button, () => toggleSquarePattern(pattern));
        });
        return;
      }

      subtypeButtons[0].text.setText('Todas las cartas');
      setButtonVisible(subtypeButtons[0], true);
      setButtonActive(subtypeButtons[0], true);
      bindButton(subtypeButtons[0], () => {});
      setButtonVisible(subtypeButtons[1], false);
      setButtonVisible(subtypeButtons[2], false);
      infoText.setText('Se necesitan las 16 cartas marcadas.');
    };

    refreshSelectionUi();

    const audioButton = this.createCircleIconButton(panelX + 215, panelY - 145, (graphics) => {
      this.drawAudioIcon(graphics, getAudioService().isMuted());
    }, () => {
      const audio = getAudioService();
      audio.setMuted(!audio.isMuted());
      this.drawAudioIcon(audioButton.icon, audio.isMuted());
    });

    const fullscreenButton = this.createCircleIconButton(panelX - 215, panelY - 145, (graphics) => {
      this.drawFullscreenIcon(graphics, this.scale.isFullscreen);
    }, () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    const updateFullscreenIcon = () => {
      this.drawFullscreenIcon(fullscreenButton.icon, this.scale.isFullscreen);
    };

    this.scale.on('fullscreenchange', updateFullscreenIcon);
  }

  public buildRulesPanel(width: number, height: number): void {
    const rulesX = width / 2;
    const rulesY = height * 0.86;

    const rules = [
      '🃏 Se reparten tableros de 4×4 cartas',
      '🎴 El cantor voltea cartas del mazo uno a uno',
      '✅ Marca tus cartas cuando sean cantadas',
      '🏆 Gana quien complete una línea o tabla primero',
    ];

    const ruleText = this.add.text(rulesX, rulesY - 30, rules.join('\n'), {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'Georgia, serif',
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);

    void ruleText;
  }

  private createButton(
    x: number, y: number,
    label: string,
    color: number,
    onClick: () => void,
    btnWidth = 130,
    btnHeight = 44,
    fontSize = 16,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, color);
    bg.setStrokeStyle(2, 0xd4af37, 0.7);
    const text = this.add.text(0, 0, label, {
      fontSize: `${fontSize}px`,
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', onClick);
    container.on('pointerover', () => {
      bg.setFillStyle(color + 0x111111);
      this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 100 });
    });
    container.on('pointerout', () => {
      bg.setFillStyle(color);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
    });

    return container;
  }

  private launchSelectedGame(): void {
    const targetWin = normalizeWinCondition(this.targetWin);
    this.networkService.connect(this.playerId).then(() => {
      this.scene.start('GameScene', {
        playerId: this.playerId,
        targetWin,
      });
    });
  }

  private startGame(mode: 'linea' | 'tabla'): void {
    this.networkService.connect(this.playerId).then(() => {
      this.scene.start('GameScene', {
        playerId: this.playerId,
        targetWin: normalizeWinCondition(mode),
      });
    });
  }
}

