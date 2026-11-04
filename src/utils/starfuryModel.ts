/**
 * Original procedural SA-23 Aurora Starfury.
 * Four engine pods on an X, cockpit at the cross, Earthforce yellow/black stripes.
 * No third-party artwork. Roll frames spin the mesh about the nose axis (+X).
 */

export const STARFURY_TEXTURE_SIZE = 256;
export const STARFURY_DISPLAY_SCALE = 0.56;
export const STARFURY_FRAME_COUNT = 16;
export const STARFURY_HIT_RADIUS = 52;

const MODEL_SCALE = 2.45;
const CENTER = STARFURY_TEXTURE_SIZE / 2;

/** World pixels from ship center to the forward gun line / aft nozzles. */
export const STARFURY_NOSE_OFFSET = 40.5 * MODEL_SCALE * STARFURY_DISPLAY_SCALE;
export const STARFURY_TAIL_OFFSET = 32 * MODEL_SCALE * STARFURY_DISPLAY_SCALE;

export function starfuryFrame(index: number): string {
  const i = ((index % STARFURY_FRAME_COUNT) + STARFURY_FRAME_COUNT) % STARFURY_FRAME_COUNT;
  return `starfury-${i}`;
}

export const STARFURY_KEY = starfuryFrame(0);

interface V3 {
  x: number;
  y: number;
  z: number;
}

interface Paint {
  px: string;
  nx: string;
  py: string;
  ny: string;
  pz: string;
  nz: string;
}

interface Face {
  v: V3[];
  fill: string;
}

interface Mesh {
  faces: Face[];
  nozzles: V3[];
}

const INK = '#101218';

const HULL: Paint = {
  px: '#7e8894',
  nx: '#2a3037',
  py: '#5a636d',
  ny: '#5a636d',
  pz: '#b7c2cc',
  nz: '#2a3036'
};

const CANOPY: Paint = {
  px: '#c5ecff',
  nx: '#6eb6db',
  py: '#8fd4f5',
  ny: '#8fd4f5',
  pz: '#e7f7ff',
  nz: '#5aa4cc'
};

const SHINE: Paint = {
  px: '#ffffff',
  nx: '#ffffff',
  py: '#ffffff',
  ny: '#ffffff',
  pz: '#ffffff',
  nz: '#d8f4ff'
};

const GUN: Paint = {
  px: '#ffb703',
  nx: '#2c3138',
  py: '#3e4650',
  ny: '#3e4650',
  pz: '#4a525c',
  nz: '#2a2f36'
};

const YELLOW: Paint = {
  px: '#f2c31a',
  nx: '#c4960b',
  py: '#f0c010',
  ny: '#f0c010',
  pz: '#ffe14a',
  nz: '#b88908'
};

const BLACK: Paint = {
  px: '#16181d',
  nx: '#16181d',
  py: '#16181d',
  ny: '#16181d',
  pz: '#0e1014',
  nz: '#0e1014'
};

const GLOW: Paint = {
  px: '#ffb15a',
  nx: '#fff1d2',
  py: '#ff8a2a',
  ny: '#ff8a2a',
  pz: '#ffd27a',
  nz: '#ff6a12'
};

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s);
const cross = (a: V3, b: V3): V3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return mul(a, 1 / l);
};

function rotateX(p: V3, roll: number): V3 {
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return v3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

let cached: Mesh | null = null;

function box(faces: Face[], from: V3, to: V3, halfSide: number, halfUp: number, paint: Paint): void {
  const axis = norm(sub(to, from));
  const ref = Math.abs(axis.z) > 0.85 ? v3(0, 1, 0) : v3(0, 0, 1);
  const side = norm(cross(axis, ref));
  const up = norm(cross(side, axis));
  const at = (x: 0 | 1, y: -1 | 1, z: -1 | 1): V3 =>
    add(add(x ? to : from, mul(side, y * halfSide)), mul(up, z * halfUp));
  const push = (quad: V3[], fill: string): void => {
    faces.push({ v: quad, fill });
  };
  push([at(0, -1, 1), at(1, -1, 1), at(1, 1, 1), at(0, 1, 1)], paint.pz);
  push([at(1, -1, -1), at(0, -1, -1), at(0, 1, -1), at(1, 1, -1)], paint.nz);
  push([at(0, 1, -1), at(0, 1, 1), at(1, 1, 1), at(1, 1, -1)], paint.py);
  push([at(1, -1, -1), at(1, -1, 1), at(0, -1, 1), at(0, -1, -1)], paint.ny);
  push([at(1, -1, -1), at(1, 1, -1), at(1, 1, 1), at(1, -1, 1)], paint.px);
  push([at(0, 1, -1), at(0, -1, -1), at(0, -1, 1), at(0, 1, 1)], paint.nx);
}

function xBox(faces: Face[], c: V3, hx: number, hy: number, hz: number, paint: Paint): void {
  box(faces, v3(c.x - hx, c.y, c.z), v3(c.x + hx, c.y, c.z), hy, hz, paint);
}

function buildMesh(): Mesh {
  const faces: Face[] = [];
  const nozzles: V3[] = [];

  xBox(faces, v3(1, 0, 0), 10, 4.6, 3.6, HULL);
  xBox(faces, v3(13.5, 0, 0.2), 3.4, 2.3, 2.1, HULL);
  xBox(faces, v3(5.5, 0, 5.15), 4.6, 2.15, 1.55, CANOPY);
  xBox(faces, v3(7.4, -0.35, 6.45), 1.7, 0.7, 0.38, SHINE);

  const pods: { x: number; y: number; z: number; dorsal: boolean; gun: number }[] = [
    { x: 17, y: -24, z: 12, dorsal: true, gun: 14 },
    { x: 17, y: 24, z: 12, dorsal: true, gun: 14 },
    { x: -15, y: -22, z: -11, dorsal: false, gun: 7 },
    { x: -15, y: 22, z: -11, dorsal: false, gun: 7 }
  ];

  const hx = 10.5;
  const hy = 4.3;
  const hz = 3.5;

  pods.forEach((pod) => {
    const c = v3(pod.x, pod.y, pod.z);
    xBox(faces, c, hx, hy, hz, HULL);
    const root = v3(1.5, Math.sign(pod.y) * 3.2, Math.sign(pod.z) * 2.4);
    const dir = norm(sub(c, root));
    const end = sub(c, mul(dir, 8));
    box(faces, root, end, 2.15, 1.35, HULL);
    box(faces, add(root, v3(0, 0, Math.sign(pod.z) * 1.1)), add(end, v3(0, 0, Math.sign(pod.z) * 1.1)), 0.85, 0.42, YELLOW);

    const outward = pod.dorsal ? 1 : -1;
    xBox(faces, v3(pod.x, pod.y, pod.z + outward * (hz + 0.15)), hx * 0.78, hy * 0.98, 0.42, YELLOW);
    xBox(faces, v3(pod.x, pod.y, pod.z + outward * (hz + 0.55)), hx * 0.28, hy * 0.98, 0.28, BLACK);

    xBox(faces, v3(pod.x + hx + pod.gun / 2, pod.y, pod.z), pod.gun / 2, 0.7, 0.7, GUN);
    xBox(faces, v3(pod.x - hx - 1.1, pod.y, pod.z + outward * 1.4), 2.2, 2.3, 1.15, GLOW);
    nozzles.push(v3(pod.x - hx - 1.6, pod.y, pod.z));
  });

  return { faces, nozzles };
}

function mesh(): Mesh {
  if (!cached) {
    cached = buildMesh();
  }
  return cached;
}

export function drawStarfury(ctx: CanvasRenderingContext2D, roll: number): void {
  const { faces, nozzles } = mesh();
  const projected: { pts: { x: number; y: number }[]; depth: number; fill: string; order: number }[] = [];

  faces.forEach((face, order) => {
    const rotated = face.v.map((p) => rotateX(p, roll));
    const a = sub(rotated[1], rotated[0]);
    const b = sub(rotated[2], rotated[0]);
    const n = cross(a, b);
    if (n.z <= 0) {
      return;
    }
    let depth = 0;
    const pts = rotated.map((p) => {
      depth += p.z;
      return { x: CENTER + p.x * MODEL_SCALE, y: CENTER + p.y * MODEL_SCALE };
    });
    projected.push({ pts, depth: depth / rotated.length, fill: face.fill, order });
  });

  projected.sort((a, b) => a.depth - b.depth || a.order - b.order);

  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.4;
  projected.forEach((face) => {
    ctx.beginPath();
    face.pts.forEach((p, i) => {
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    });
    ctx.closePath();
    ctx.fillStyle = face.fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
  });

  nozzles.forEach((nozzle) => {
    const p = rotateX(nozzle, roll);
    const x = CENTER + p.x * MODEL_SCALE;
    const y = CENTER + p.y * MODEL_SCALE;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 13);
    g.addColorStop(0, 'rgba(255, 246, 220, 0.95)');
    g.addColorStop(0.45, 'rgba(255, 130, 36, 0.8)');
    g.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
  });
}
