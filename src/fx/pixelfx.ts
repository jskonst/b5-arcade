import Phaser from 'phaser';

/**
 * Sprite sheets exported from pixelfx (MIT, © 2026 Patch, Hugo Duprez) with
 * `node tools/render.mjs <id> --sheet`, then decimated/trimmed to keep the bundle small.
 * See public/fx/NOTICE.md.
 */
interface FxSheet {
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  loop: boolean;
  originX: number;
  originY: number;
}

export const FX = {
  smallExplosion: { file: 'small-explosion', frameWidth: 191, frameHeight: 158, frames: 10, fps: 20, loop: false, originX: 0.518, originY: 0.6 },
  plasmaExplosion: { file: 'plasma-explosion', frameWidth: 205, frameHeight: 190, frames: 18, fps: 20, loop: false, originX: 0.527, originY: 0.5 },
  implosion: { file: 'implosion', frameWidth: 165, frameHeight: 168, frames: 17, fps: 14, loop: false, originX: 0.521, originY: 0.512 },
  hitSpark: { file: 'hit-spark', frameWidth: 119, frameHeight: 71, frames: 8, fps: 24, loop: false, originX: 0.286, originY: 0.789 },
  muzzle: { file: 'muzzle-smg', frameWidth: 74, frameHeight: 55, frames: 5, fps: 30, loop: false, originX: 0.2, originY: 0.5 },
  shield: { file: 'divine-shield', frameWidth: 72, frameHeight: 76, frames: 24, fps: 18, loop: true, originX: 0.5, originY: 0.55 }
} as const satisfies Record<string, FxSheet & { file: string }>;

export type FxName = keyof typeof FX;

const key = (name: FxName): string => `fx-${FX[name].file}`;

export function preloadFx(scene: Phaser.Scene): void {
  const base = import.meta.env.BASE_URL;
  (Object.keys(FX) as FxName[]).forEach((name) => {
    const s = FX[name];
    scene.load.spritesheet(key(name), `${base}fx/${s.file}.png`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
  });
}

export function createFxAnims(scene: Phaser.Scene): void {
  (Object.keys(FX) as FxName[]).forEach((name) => {
    const s = FX[name];
    scene.textures.get(key(name)).setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (!scene.anims.exists(key(name))) {
      scene.anims.create({
        key: key(name),
        frames: scene.anims.generateFrameNumbers(key(name), { start: 0, end: s.frames - 1 }),
        frameRate: s.fps,
        repeat: s.loop ? -1 : 0
      });
    }
  });
}

/** Fire-and-forget one-shot effect. */
export function playFx(scene: Phaser.Scene, name: FxName, x: number, y: number, scale = 1, angle = 0, depth = 6): Phaser.GameObjects.Sprite {
  const s = FX[name];
  const spr = scene.add.sprite(x, y, key(name)).setOrigin(s.originX, s.originY).setScale(scale).setAngle(angle).setDepth(depth);
  spr.play(key(name));
  if (!s.loop) {
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.destroy());
  }
  return spr;
}
