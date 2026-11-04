import { freshFlick, pollDoubleFlick } from './gestures';

export interface TouchPilot {
  turn: number;
  thrust: number;
  fire: boolean;
}

/**
 * On-screen stick, fire, and roll buttons for touch play.
 * Shown for coarse pointers, touch hardware, a narrow viewport, `?touch=1`,
 * or after the first touch. `?touch=0` keeps it hidden until a touch.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly fireEl: HTMLElement;
  private readonly flick = freshFlick();
  private turn = 0;
  private thrust = 0;
  private fire = false;
  private roll: -1 | 0 | 1 = 0;
  private stickPointer: number | null = null;
  private firePointer: number | null = null;
  private sawTouch = false;
  private onRestart: (() => void) | null = null;
  private readonly mq = window.matchMedia('(pointer: coarse), (max-width: 900px)');

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.id = 'touch-ui';

    this.stick = document.createElement('div');
    this.stick.className = 'stick-zone';
    this.stick.setAttribute('role', 'slider');
    this.stick.setAttribute(
      'aria-label',
      'Flight stick. Up thrusts forward, down reverses, left and right turn. Double-flick sideways to barrel roll.'
    );
    const base = document.createElement('div');
    base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    base.appendChild(this.knob);
    this.stick.appendChild(base);

    this.fireEl = this.pad('fire-btn', 'FIRE', 'Fire');
    const rollPort = this.pad('roll-btn roll-port', '⟲', 'Barrel roll left');
    const rollStarboard = this.pad('roll-btn roll-starboard', '⟳', 'Barrel roll right');

    this.root.append(this.stick, rollPort, rollStarboard, this.fireEl);
    parent.appendChild(this.root);

    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickUp);
    this.fireEl.addEventListener('pointerdown', this.onFireDown);
    this.fireEl.addEventListener('pointerup', this.onFireUp);
    this.fireEl.addEventListener('pointercancel', this.onFireUp);
    rollPort.addEventListener('pointerdown', (ev) => this.onRollButton(ev, -1));
    rollStarboard.addEventListener('pointerdown', (ev) => this.onRollButton(ev, 1));
    this.root.addEventListener('contextmenu', (ev) => ev.preventDefault());

    this.mq.addEventListener('change', this.sync);
    window.addEventListener('touchstart', this.reveal, { passive: true });
    this.sync();
  }

  get visible(): boolean {
    return this.root.classList.contains('is-visible');
  }

  setRestartHandler(handler: () => void): void {
    this.onRestart = handler;
  }

  getState(): TouchPilot {
    return { turn: this.turn, thrust: this.thrust, fire: this.fire };
  }

  consumeRoll(): -1 | 0 | 1 {
    const roll = this.roll;
    this.roll = 0;
    return roll;
  }

  destroy(): void {
    this.mq.removeEventListener('change', this.sync);
    window.removeEventListener('touchstart', this.reveal);
    this.root.remove();
  }

  private pad(className: string, label: string, aria: string): HTMLElement {
    const el = document.createElement('div');
    el.className = className;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', aria);
    el.textContent = label;
    return el;
  }

  private readonly reveal = (): void => {
    this.sawTouch = true;
    this.sync();
  };

  private readonly sync = (): void => {
    const query = new URLSearchParams(location.search).get('touch');
    const auto = this.mq.matches || navigator.maxTouchPoints > 0;
    const show = this.sawTouch || query === '1' || (query !== '0' && auto);
    this.root.classList.toggle('is-visible', show);
  };

  private readonly onStickDown = (ev: PointerEvent): void => {
    if (this.stickPointer !== null) {
      return;
    }
    ev.preventDefault();
    this.stickPointer = ev.pointerId;
    this.stick.setPointerCapture(ev.pointerId);
    this.applyStick(ev);
    this.onRestart?.();
  };

  private readonly onStickMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.stickPointer) {
      return;
    }
    this.applyStick(ev);
  };

  private readonly onStickUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.stickPointer) {
      return;
    }
    this.stickPointer = null;
    this.turn = 0;
    this.thrust = 0;
    this.placeKnob(0, 0);
    pollDoubleFlick(this.flick, 0, 0, performance.now());
  };

  private applyStick(ev: PointerEvent): void {
    const base = this.stick.querySelector('.stick-base');
    if (!base) {
      return;
    }
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2 || 1;
    const rawX = (ev.clientX - (rect.left + radius)) / radius;
    const rawY = (ev.clientY - (rect.top + radius)) / radius;
    const mag = Math.hypot(rawX, rawY);
    if (mag < 0.14) {
      this.turn = 0;
      this.thrust = 0;
      this.placeKnob(0, 0);
      pollDoubleFlick(this.flick, 0, 0, performance.now());
      return;
    }
    const clamped = Math.min(mag, 1);
    const scaled = Math.min(1, (clamped - 0.14) / 0.86);
    const ux = rawX / mag;
    const uy = rawY / mag;
    this.turn = ux * scaled;
    this.thrust = -uy * scaled;
    this.placeKnob(ux * clamped, uy * clamped);
    const rolled = pollDoubleFlick(this.flick, this.turn, this.thrust, performance.now());
    if (rolled !== 0) {
      this.roll = rolled;
    }
  }

  private placeKnob(nx: number, ny: number): void {
    const base = this.stick.querySelector('.stick-base');
    const radius = base ? base.getBoundingClientRect().width / 2 : 50;
    const travel = Math.max(16, radius - 28);
    this.knob.style.transform = `translate(calc(-50% + ${nx * travel}px), calc(-50% + ${ny * travel}px))`;
  }

  private readonly onFireDown = (ev: PointerEvent): void => {
    ev.preventDefault();
    this.firePointer = ev.pointerId;
    this.fire = true;
    this.fireEl.classList.add('held');
    this.fireEl.setPointerCapture(ev.pointerId);
    this.onRestart?.();
  };

  private readonly onFireUp = (ev: PointerEvent): void => {
    if (this.firePointer !== null && ev.pointerId !== this.firePointer) {
      return;
    }
    this.firePointer = null;
    this.fire = false;
    this.fireEl.classList.remove('held');
  };

  private readonly onRollButton = (ev: PointerEvent, dir: -1 | 1): void => {
    ev.preventDefault();
    this.roll = dir;
    const el = ev.currentTarget;
    if (el instanceof HTMLElement) {
      el.classList.add('held');
      window.setTimeout(() => el.classList.remove('held'), 140);
    }
    this.onRestart?.();
  };
}
