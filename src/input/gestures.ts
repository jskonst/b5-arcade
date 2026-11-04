/** Star Fox-style "tap the stick twice" timing. */
export const FLICK_WINDOW_MS = 900;
export const FLICK_THRESHOLD = 0.72;
export const FLICK_CENTER = 0.28;
/** A shove must reach the edge this fast to count as a flick, not a held turn. */
export const FLICK_MAX_MS = 320;

export const DOUBLE_TAP_MS = 300;
export const SWIPE_MIN_PX = 72;
export const SWIPE_MAX_MS = 380;
export const SWIPE_PAIR_MS = 700;
export const SIDE_TAP_MS = 320;

export interface FlickState {
  dir: -1 | 0 | 1;
  at: number;
  armed: boolean;
  leftCenterAt: number;
}

export interface TapState {
  dir: -1 | 0 | 1;
  at: number;
}

export function freshFlick(): FlickState {
  return { dir: 0, at: -1e9, armed: true, leftCenterAt: -1 };
}

export function freshTap(): TapState {
  return { dir: 0, at: -1e9 };
}

/**
 * Double deflection on one axis. `axis` is -1..1 (positive = right).
 * `lateral` is the other axis, so a diagonal shove does not roll.
 * The stick must pass near center between the two flicks.
 */
export function pollDoubleFlick(state: FlickState, axis: number, lateral: number, now: number): -1 | 0 | 1 {
  const abs = Math.abs(axis);
  if (abs < FLICK_CENTER) {
    state.armed = true;
    state.leftCenterAt = -1;
    return 0;
  }
  if (state.armed && state.leftCenterAt < 0) {
    state.leftCenterAt = now;
  }
  const horizontal = abs >= FLICK_THRESHOLD && abs > Math.abs(lateral) + 0.12;
  if (!horizontal || !state.armed) {
    return 0;
  }
  const elapsed = now - state.leftCenterAt;
  state.armed = false;
  state.leftCenterAt = -1;
  if (elapsed > FLICK_MAX_MS) {
    return 0;
  }
  const dir: -1 | 1 = axis > 0 ? 1 : -1;
  if (state.dir === dir && now - state.at <= FLICK_WINDOW_MS) {
    state.dir = 0;
    state.at = -1e9;
    return dir;
  }
  state.dir = dir;
  state.at = now;
  return 0;
}

/** Second tap in the same direction inside the window returns that direction. */
export function pollDoubleTap(state: TapState, dir: -1 | 0 | 1, now: number, windowMs: number): -1 | 0 | 1 {
  if (dir === 0) {
    return 0;
  }
  if (state.dir === dir && now - state.at <= windowMs) {
    state.dir = 0;
    state.at = -1e9;
    return dir;
  }
  state.dir = dir;
  state.at = now;
  return 0;
}
