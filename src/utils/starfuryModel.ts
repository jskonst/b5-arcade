/**
 * In-game fighter: Blender roll sheet (`public/ships/fighter-roll.png`).
 * Nose = +X (Phaser angle 0), top-down, 16 frames, step 22.5°.
 * Muzzle and nozzle positions come from `fighter-anchors.json` (frame 0).
 */

export const FIGHTER_ROLL_KEY = 'fighter-roll';
export const FIGHTER_ROLL_JSON_KEY = 'fighter-roll-json';
export const FIGHTER_ANCHORS_KEY = 'fighter-anchors';

/** Tight-cropped blueprint previously drawn at this scale (~38 px length). */
const PREV_PNG_LENGTH_PX = 146;
const PREV_PNG_SCALE = 0.26;
const PREV_HIT_RADIUS_TEX = 60;

/** Opaque nose-to-tail length of frame 0 (x = 14..241). */
export const FIGHTER_VISIBLE_LENGTH = 228;

/** Scale so visible length matches the previous ~38 px on screen. */
export const STARFURY_DISPLAY_SCALE = (PREV_PNG_LENGTH_PX * PREV_PNG_SCALE) / FIGHTER_VISIBLE_LENGTH;

/** Texture-space radius (~16 world px, same as before). */
export const STARFURY_HIT_RADIUS_WORLD = PREV_HIT_RADIUS_TEX * PREV_PNG_SCALE;
export const STARFURY_HIT_RADIUS = STARFURY_HIT_RADIUS_WORLD / STARFURY_DISPLAY_SCALE;

/** Front cap of the engine pods in frame 0, texture X (measured from the sheet). */
const POD_FRONT_TEX_X = 127;

const GUN_LATERAL_MIN = 0.15;
const POD_LATERAL_MIN = 0.08;

export interface FighterRollMeta {
  key: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  margin?: number;
  spacing?: number;
}

export interface FighterAnchor {
  name: string;
  x: number;
  y: number;
  viewZ?: number;
}

export interface FighterAnchorsFile {
  frameWidth: number;
  frameHeight: number;
  guns: FighterAnchor[];
  nozzles: FighterAnchor[];
}

export interface TexOffset {
  x: number;
  y: number;
}

let frameWidth = 256;
let frameHeight = 256;
let frameCount = 16;
let gunTex: TexOffset[] = [];
let nozzleTex: TexOffset[] = [];
let retroTex: TexOffset[] = [];

function uniqueByXY(points: FighterAnchor[]): FighterAnchor[] {
  const seen = new Set<string>();
  const out: FighterAnchor[] = [];
  for (const p of points) {
    const k = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}

export function applyFighterSheet(meta: FighterRollMeta, anchors: FighterAnchorsFile): void {
  frameWidth = meta.frameWidth;
  frameHeight = meta.frameHeight;
  frameCount = meta.frameCount;
  const cx = anchors.frameWidth / 2;
  const cy = anchors.frameHeight / 2;
  gunTex = uniqueByXY(anchors.guns).map((g) => ({ x: g.x - cx, y: g.y - cy }));
  const nozzles = uniqueByXY(anchors.nozzles);
  nozzleTex = nozzles.map((n) => ({ x: n.x - cx, y: n.y - cy }));
  retroTex = nozzles.map((n) => ({ x: POD_FRONT_TEX_X - cx, y: n.y - cy }));
}

applyFighterSheet(
  {
    key: 'fighter-roll',
    image: 'fighter-roll.png',
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 16
  },
  {
    frameWidth: 256,
    frameHeight: 256,
    guns: [
      { name: 'gun_muzzle_port', x: 241.7, y: 114.06 },
      { name: 'gun_muzzle_starboard', x: 241.7, y: 141.94 }
    ],
    nozzles: [
      { name: 'nozzle_port_dorsal', x: 58.28, y: 59.74 },
      { name: 'nozzle_starboard_dorsal', x: 58.28, y: 196.26 }
    ]
  }
);

export function fighterFrameWidth(): number {
  return frameWidth;
}

export function fighterFrameHeight(): number {
  return frameHeight;
}

export function fighterFrameCount(): number {
  return frameCount;
}

/** Maps a roll angle in radians (0 = level) to a sheet frame. */
export function fighterRollFrame(roll: number): number {
  const n = frameCount;
  return (((Math.round((roll / (Math.PI * 2)) * n) % n) + n) % n);
}

function withLateral(tex: TexOffset, roll: number, minK: number): TexOffset {
  const k = Math.max(minK, Math.abs(Math.cos(roll)));
  return { x: tex.x * STARFURY_DISPLAY_SCALE, y: tex.y * STARFURY_DISPLAY_SCALE * k };
}

export function fighterWorldPoint(shipX: number, shipY: number, angle: number, local: TexOffset): TexOffset {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: shipX + cos * local.x - sin * local.y,
    y: shipY + sin * local.x + cos * local.y
  };
}

function worldPoints(
  shipX: number,
  shipY: number,
  angle: number,
  roll: number,
  tex: TexOffset[],
  minK: number
): TexOffset[] {
  return tex.map((t) => fighterWorldPoint(shipX, shipY, angle, withLateral(t, roll, minK)));
}

export function fighterGunPoints(shipX: number, shipY: number, angle: number, roll: number): TexOffset[] {
  return worldPoints(shipX, shipY, angle, roll, gunTex, GUN_LATERAL_MIN);
}

export function fighterNozzlePoints(shipX: number, shipY: number, angle: number, roll: number): TexOffset[] {
  return worldPoints(shipX, shipY, angle, roll, nozzleTex, POD_LATERAL_MIN);
}

export function fighterRetroPoints(shipX: number, shipY: number, angle: number, roll: number): TexOffset[] {
  return worldPoints(shipX, shipY, angle, roll, retroTex, POD_LATERAL_MIN);
}
