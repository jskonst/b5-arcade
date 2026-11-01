import Phaser from 'phaser';
import { STARFURY_FRAME_COUNT, STARFURY_TEXTURE_SIZE, drawStarfury, starfuryFrame } from './starfuryModel';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export type AsteroidSize = 'large' | 'medium' | 'small';

export const ASTEROID_RADIUS: Record<AsteroidSize, number> = {
  large: 42,
  medium: 26,
  small: 14
};

export const ASTEROID_SCORE: Record<AsteroidSize, number> = {
  large: 20,
  medium: 50,
  small: 100
};

export const BULLET_KEY = 'bullet';
export const EXHAUST_KEY = 'exhaust';
export const RETRO_KEY = 'retro';
export const STAR_LAYERS = ['stars-far', 'stars-mid', 'stars-near'] as const;

export const ASTEROID_TEXTURES: Record<AsteroidSize, string[]> = {
  large: [],
  medium: [],
  small: []
};

type Pt = [number, number];

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): void {
  const tex = scene.textures.createCanvas(key, w, h) as Phaser.Textures.CanvasTexture | null;
  if (!tex) {
    throw new Error(`Failed to create canvas texture: ${key}`);
  }
  draw(tex.getContext());
  tex.refresh();
}

function polygon(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, stroke: string, lw = 1.5): void {
  if (pts.length === 0) {
    return;
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawAsteroidInto(ctx: CanvasRenderingContext2D, radius: number): void {
  const c = ctx.canvas.width / 2;
  const rand = Math.random;
  const n = 9 + Math.floor(rand() * 5);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = radius * (0.74 + rand() * 0.32);
    pts.push([c + Math.cos(ang) * r, c + Math.sin(ang) * r]);
  }
  polygon(ctx, pts, '#565b63', '#23262b', 2);

  const craters = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < craters; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = radius * (0.12 + rand() * 0.32);
    const cr = radius * (0.09 + rand() * 0.14);
    ctx.beginPath();
    ctx.arc(c + Math.cos(ang) * dist, c + Math.sin(ang) * dist, cr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 32, 38, 0.55)';
    ctx.fill();
  }

  const sparks = 2 + Math.floor(rand() * 3);
  ctx.fillStyle = 'rgba(172, 180, 192, 0.5)';
  for (let i = 0; i < sparks; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = radius * (0.2 + rand() * 0.4);
    ctx.beginPath();
    ctx.arc(c + Math.cos(ang) * dist, c + Math.sin(ang) * dist, radius * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function makeAsteroidTextures(scene: Phaser.Scene): void {
  (Object.keys(ASTEROID_RADIUS) as AsteroidSize[]).forEach((size) => {
    const radius = ASTEROID_RADIUS[size];
    const pad = Math.ceil(radius * 0.4);
    const dim = Math.ceil((radius + pad) * 2);
    const variants = size === 'large' ? 3 : 2;
    ASTEROID_TEXTURES[size] = [];
    for (let v = 0; v < variants; v++) {
      const key = `asteroid-${size}-${v}`;
      canvasTexture(scene, key, dim, dim, (ctx) => {
        drawAsteroidInto(ctx, radius);
      });
      ASTEROID_TEXTURES[size].push(key);
    }
  });
}

export function makeStarfuryTexture(scene: Phaser.Scene): void {
  for (let i = 0; i < STARFURY_FRAME_COUNT; i++) {
    const roll = (i / STARFURY_FRAME_COUNT) * Math.PI * 2;
    canvasTexture(scene, starfuryFrame(i), STARFURY_TEXTURE_SIZE, STARFURY_TEXTURE_SIZE, (ctx) => {
      drawStarfury(ctx, roll);
    });
  }
}

export function makeThrustTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, EXHAUST_KEY, 56, 28, (ctx) => {
    const g = ctx.createLinearGradient(56, 14, 0, 14);
    g.addColorStop(0, 'rgba(255, 252, 235, 0.95)');
    g.addColorStop(0.28, 'rgba(255, 168, 54, 0.9)');
    g.addColorStop(1, 'rgba(255, 70, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(56, 9);
    ctx.lineTo(56, 19);
    ctx.lineTo(0, 26);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
  });

  canvasTexture(scene, RETRO_KEY, 40, 22, (ctx) => {
    const g = ctx.createLinearGradient(0, 11, 40, 11);
    g.addColorStop(0, 'rgba(232, 248, 255, 0.95)');
    g.addColorStop(0.35, 'rgba(120, 196, 255, 0.85)');
    g.addColorStop(1, 'rgba(60, 130, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(0, 16);
    ctx.lineTo(40, 20);
    ctx.lineTo(40, 2);
    ctx.closePath();
    ctx.fill();
  });
}

export function makeBulletTexture(scene: Phaser.Scene): void {
  canvasTexture(scene, BULLET_KEY, 12, 12, (ctx) => {
    const g = ctx.createRadialGradient(6, 6, 0, 6, 6, 6);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.4, 'rgba(255, 226, 122, 0.9)');
    g.addColorStop(1, 'rgba(255, 160, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 12, 12);
    ctx.beginPath();
    ctx.arc(6, 6, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff3c8';
    ctx.fill();
  });
}

export function makeStarLayers(scene: Phaser.Scene): void {
  const layers = [
    { key: STAR_LAYERS[0], count: 140, rMin: 0.4, rMax: 0.9, aMin: 0.2, aMax: 0.5, tint: '#cdd6e4' },
    { key: STAR_LAYERS[1], count: 80, rMin: 0.7, rMax: 1.4, aMin: 0.4, aMax: 0.75, tint: '#e8eef8' },
    { key: STAR_LAYERS[2], count: 40, rMin: 1.1, rMax: 2.2, aMin: 0.55, aMax: 1.0, tint: '#ffffff' }
  ];
  layers.forEach((layer) => {
    canvasTexture(scene, layer.key, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
      for (let i = 0; i < layer.count; i++) {
        const x = Math.floor(Math.random() * GAME_WIDTH);
        const y = Math.floor(Math.random() * GAME_HEIGHT);
        const r = layer.rMin + Math.random() * (layer.rMax - layer.rMin);
        ctx.globalAlpha = layer.aMin + Math.random() * (layer.aMax - layer.aMin);
        ctx.fillStyle = layer.tint;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  });
}
