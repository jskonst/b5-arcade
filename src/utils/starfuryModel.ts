/**
 * Original procedural SA-23 Starfury, top view (nose = +X, wingspan = Y).
 * Broad swept wing with a shallow-V trailing edge, short pointed nose with a small green
 * canopy, cylindrical engine pods at the wingtips (front nozzle cap, ribbed rear section)
 * and two angled claw legs per pod pointing aft. Plain neutral grey, no markings.
 * Roll frames squash the wingspan by |cos(roll)| and shade the belly darker past 90°.
 * A second "mask" texture per frame holds the skinnable areas (wing + fuselage) in white;
 * it is drawn on top with MULTIPLY blend, so the default white tint changes nothing and
 * setTint(color) recolours just those areas.
 */

export const STARFURY_TEXTURE_SIZE = 256;
export const STARFURY_DISPLAY_SCALE = 0.56;
export const STARFURY_FRAME_COUNT = 16;
export const STARFURY_HIT_RADIUS = 60;

const CENTER = STARFURY_TEXTURE_SIZE / 2;
const S = STARFURY_DISPLAY_SCALE;

/** Model-space pod geometry. */
const POD_Y = 92;
const POD_FRONT = 46;
const POD_REAR = -44;

/** World pixels from ship center to the forward gun line. */
export const STARFURY_NOSE_OFFSET = 80 * S;
/** World pixels aft of center where the pod exhausts emit. */
export const STARFURY_TAIL_OFFSET = -POD_REAR * S;
/** World pixels forward of center where the pod retro nozzles emit. */
export const STARFURY_RETRO_OFFSET = POD_FRONT * S;
/** Lateral world offset of each pod at a given roll angle (0 = level). */
export function starfuryPodSpan(roll: number): number {
  return POD_Y * S * Math.max(0.08, Math.abs(Math.cos(roll)));
}

export function starfuryFrame(index: number): string {
  const i = ((index % STARFURY_FRAME_COUNT) + STARFURY_FRAME_COUNT) % STARFURY_FRAME_COUNT;
  return `starfury-${i}`;
}
export function starfuryMaskFrame(index: number): string {
  return `${starfuryFrame(index)}-mask`;
}
export function starfuryFrameRoll(index: number): number {
  return (index / STARFURY_FRAME_COUNT) * Math.PI * 2;
}

export const STARFURY_KEY = starfuryFrame(0);

type P = [number, number];
const INK = '#16191e';

function path(ctx: CanvasRenderingContext2D, pts: P[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
function poly(ctx: CanvasRenderingContext2D, pts: P[], fill: string | CanvasGradient, stroke = INK, lw = 2): void {
  path(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function line(ctx: CanvasRenderingContext2D, a: P, b: P, color = 'rgba(30,34,40,0.55)', lw = 1): void {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Wing + fuselage outline for one side (s = ±1), nose to centreline tail. */
function hullPts(s: number): P[] {
  return [[82, 0], [70, s * 7], [62, s * 16], [16, s * 82], [-26, s * 82], [-46, s * 4], [-46, 0]];
}
function fullHull(): P[] {
  const a = hullPts(1);
  const b = hullPts(-1).slice(1, -1).reverse();
  return [...a, ...b];
}

function beginFrame(ctx: CanvasRenderingContext2D, roll: number): void {
  ctx.save();
  ctx.translate(CENTER, CENTER);
  ctx.scale(1, Math.max(0.08, Math.abs(Math.cos(roll))));
  ctx.lineJoin = 'round';
}

/** Draws one roll frame into a STARFURY_TEXTURE_SIZE canvas. */
export function drawStarfury(ctx: CanvasRenderingContext2D, roll: number): void {
  const belly = Math.cos(roll) < 0;
  const k = belly ? 0.72 : 1;
  const g = (v: number): string => {
    const c = Math.round(v * k);
    return `rgb(${c},${c + 3},${c + 7})`;
  };
  const hull = g(168);
  const hullHi = g(192);
  const hullLo = g(128);
  const metal = g(110);
  const dark = g(62);

  beginFrame(ctx, roll);

  for (const s of [-1, 1]) {
    // claw legs: two per pod, angled aft, the far pair slightly offset so they read as overlapping
    for (const [dy, spread, shade] of [[-8, -10, hullLo], [8, 14, metal]] as [number, number, string][]) {
      const y0 = s * (POD_Y + dy);
      const y1 = s * (POD_Y + dy + spread);
      poly(ctx, [
        [-30, y0 - s * 5], [-30, y0 + s * 5], [-86, y1 + s * 5], [-116, y1 + s * 2], [-118, y1 - s * 3], [-84, y1 - s * 4]
      ], shade);
      line(ctx, [-36, y0], [-104, y1]);
      dot(ctx, -112, y1, 2.2, dark);
    }
  }

  // wing + fuselage (one piece), light shading toward the leading edge
  const grad = ctx.createLinearGradient(70, 0, -46, 0);
  grad.addColorStop(0, hullHi);
  grad.addColorStop(1, hullLo);
  poly(ctx, fullHull(), grad);
  for (const s of [-1, 1]) {
    // panel lines
    line(ctx, [52, s * 14], [-38, s * 14]);
    line(ctx, [36, s * 40], [-30, s * 42]);
    line(ctx, [22, s * 62], [-26, s * 64]);
    line(ctx, [-8, s * 16], [-8, s * 80]);
    // leading-edge highlight
    line(ctx, [62, s * 17], [17, s * 80], 'rgba(255,255,255,0.28)', 1.4);
  }
  // fuselage spine & nose
  poly(ctx, [[74, -6], [74, 6], [-40, 10], [-40, -10]], hull, 'rgba(30,34,40,0.6)', 1);
  line(ctx, [74, 0], [-40, 0], 'rgba(30,34,40,0.4)', 1);
  poly(ctx, [[82, 0], [72, -6], [72, 6]], hullLo, INK, 1);
  // small green canopy
  poly(ctx, [[78, 0], [66, -5], [56, -4], [56, 4], [66, 5]], belly ? dark : '#3f7a4f', INK, 1);
  if (!belly) line(ctx, [74, -1], [60, -2.5], 'rgba(200,255,210,0.6)', 1);

  for (const s of [-1, 1]) {
    const y = s * POD_Y;
    // pod body
    const pg = ctx.createLinearGradient(0, y - 15, 0, y + 15);
    pg.addColorStop(0, s < 0 ? hullHi : hull);
    pg.addColorStop(1, s < 0 ? hull : hullLo);
    poly(ctx, [
      [34, y - 13], [34, y + 13], [-20, y + 15], [-28, y + 12], [-28, y - 12], [-20, y - 15]
    ], pg);
    // front nozzle cap (ribbed)
    poly(ctx, [[POD_FRONT, y - 9], [POD_FRONT, y + 9], [34, y + 12], [34, y - 12]], metal);
    for (let x = 37; x <= 44; x += 3.5) line(ctx, [x, y - 10], [x, y + 10], 'rgba(20,22,26,0.7)');
    dot(ctx, POD_FRONT - 1, y, 4, dark);
    // round intake/sensor on the inner side
    dot(ctx, 14, y - s * 8, 5, dark);
    dot(ctx, 14, y - s * 8, 2.6, metal);
    // ribbed rear section
    poly(ctx, [[-28, y - 12], [-28, y + 12], [POD_REAR, y + 10], [POD_REAR, y - 10]], metal);
    for (let x = -31; x >= POD_REAR + 2; x -= 3.2) line(ctx, [x, y - 11], [x, y + 11], 'rgba(20,22,26,0.75)');
    line(ctx, [0, y - 14], [0, y + 14]);
    // nav light
    dot(ctx, 26, y + s * 13, 1.8, '#58b4ff');
  }
  ctx.restore();
}

/** Skinnable areas (wing + fuselage) in white, same framing as drawStarfury. */
export function drawStarfuryMask(ctx: CanvasRenderingContext2D, roll: number): void {
  beginFrame(ctx, roll);
  poly(ctx, fullHull(), '#ffffff', '#ffffff', 0);
  ctx.restore();
}
