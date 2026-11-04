/**
 * Original procedural SA-23 Aurora Starfury, top view (nose = +X).
 * Wedge fuselage with a cockpit "handle" at the nose, swept wings to two big engine pods,
 * two claw-like thruster legs per pod. No third-party artwork.
 * Roll frames squash the wingspan by |cos(roll)| and show the darker belly past 90°.
 */

export const STARFURY_TEXTURE_SIZE = 256;
export const STARFURY_DISPLAY_SCALE = 0.56;
export const STARFURY_FRAME_COUNT = 16;
export const STARFURY_HIT_RADIUS = 56;

const MODEL_SCALE = 1;
const CENTER = STARFURY_TEXTURE_SIZE / 2;

/** World pixels from ship center to the forward gun line / aft nozzles. */
export const STARFURY_NOSE_OFFSET = 84 * MODEL_SCALE * STARFURY_DISPLAY_SCALE;
export const STARFURY_TAIL_OFFSET = 44 * MODEL_SCALE * STARFURY_DISPLAY_SCALE;

export function starfuryFrame(index: number): string {
  const i = ((index % STARFURY_FRAME_COUNT) + STARFURY_FRAME_COUNT) % STARFURY_FRAME_COUNT;
  return `starfury-${i}`;
}

export const STARFURY_KEY = starfuryFrame(0);


type P = [number, number];

function poly(ctx: CanvasRenderingContext2D, pts: P[], fill: string, stroke = '#15181d', lw = 2): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function line(ctx: CanvasRenderingContext2D, a: P, b: P, color = '#3a414a', lw = 1.2): void {
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

/** Draws one roll frame into a STARFURY_TEXTURE_SIZE canvas. */
export function drawStarfury(ctx: CanvasRenderingContext2D, roll: number): void {
  const c = Math.cos(roll);
  const belly = c < 0;
  const hull = belly ? '#6c737c' : '#a9b1ba';
  const hullLight = belly ? '#7d858e' : '#c7cdd4';
  const hullDark = belly ? '#4a5058' : '#7c848e';
  const pod = belly ? '#5a6068' : '#8e969f';

  ctx.save();
  ctx.translate(CENTER, CENTER);
  ctx.scale(1, Math.max(0.08, Math.abs(c)));
  ctx.lineJoin = 'round';

  for (const side of [-1, 1]) {
    const s = side;
    // claw thruster legs, two per pod, pointing aft
    for (const off of [-9, 9]) {
      const y0 = s * (84 + off);
      const bend = off * 0.5;
      poly(ctx, [
        [-40, y0 - 5], [-40, y0 + 5], [-70, y0 + 6 + bend * 1.4], [-100, y0 + 2 + bend * 2], [-112, y0 + bend * 2.6], [-78, y0 - 3 + bend * 1.6]
      ], hullDark);
      line(ctx, [-46, y0], [-88, y0 + bend * 1.8], '#2a2f36', 1);
    }
    // swept wing
    poly(ctx, [[44, s * 14], [6, s * 72], [-26, s * 72], [-22, s * 22]], hull);
    line(ctx, [30, s * 34], [-20, s * 38]);
    line(ctx, [17, s * 54], [-24, s * 56]);
    if (!belly) {
      // Earthforce yellow/black stripes
      poly(ctx, [[36, s * 26], [31, s * 34], [-21, s * 36], [-22, s * 28]], '#f0c419', '#15181d', 1);
      poly(ctx, [[31, s * 34], [27, s * 40], [-21, s * 42], [-21, s * 36]], '#17191e', '#15181d', 1);
    }
    // engine pod
    poly(ctx, [[16, s * 70], [22, s * 76], [22, s * 92], [16, s * 98], [-36, s * 98], [-42, s * 92], [-42, s * 76], [-36, s * 70]], pod);
    line(ctx, [8, s * 72], [8, s * 96]);
    line(ctx, [-28, s * 72], [-28, s * 96]);
    poly(ctx, [[-36, s * 73], [-46, s * 76], [-46, s * 92], [-36, s * 95]], '#3b4048');
    // round nozzle face
    dot(ctx, -10, s * 84, 11, '#22262c');
    dot(ctx, -10, s * 84, 8, '#7a2a2a');
    dot(ctx, -10, s * 84, 5.5, '#14161a');
    dot(ctx, -10, s * 84, 2, '#5a616b');
    // blue nav lights
    dot(ctx, 19, s * 70, 2.6, '#58b4ff');
    dot(ctx, 0, s * 62, 2, '#3a8cff');
  }

  // fuselage wedge
  poly(ctx, [[70, -9], [70, 9], [-30, 26], [-40, 18], [-40, -18], [-30, -26]], hullLight);
  poly(ctx, [[58, -6], [58, 6], [10, 13], [10, -13]], hull, '#3a414a', 1.2);
  line(ctx, [40, 0], [-34, 0], '#5b636d', 1);
  line(ctx, [-6, -20], [-6, 20]);
  poly(ctx, [[-30, -10], [-44, -8], [-44, 8], [-30, 10]], '#3b4048');
  dot(ctx, -38, 0, 2.6, '#58b4ff');
  // cockpit handle at the nose
  poly(ctx, [[70, -10], [86, -7], [86, 7], [70, 10]], hullDark);
  poly(ctx, [[73, -5], [83, -3.5], [83, 3.5], [73, 5]], belly ? '#2a2f36' : '#9fdcff', '#15181d', 1);
  ctx.restore();
}
