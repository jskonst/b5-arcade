import Phaser from 'phaser';
import {
  FIGHTER_ROLL_KEY,
  STARFURY_DISPLAY_SCALE,
  STARFURY_HIT_RADIUS,
  fighterFrameHeight,
  fighterFrameWidth,
  fighterRollFrame
} from '../utils/starfuryModel';

/** One full spin about the nose. Damage is ignored for this long. */
export const ROLL_MS = 560;
/** From the start of a roll until another roll may begin. */
export const ROLL_COOLDOWN_MS = 920;

export class Starfury extends Phaser.Physics.Arcade.Sprite {
  private rolling = false;
  private rollStart = 0;
  private rollDir: -1 | 1 = 1;
  private progress = 0;
  private roll = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, FIGHTER_ROLL_KEY, 0);
    this.setDepth(5);
    this.setScale(STARFURY_DISPLAY_SCALE);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    const r = STARFURY_HIT_RADIUS;
    body.setCircle(r, fighterFrameWidth() / 2 - r, fighterFrameHeight() / 2 - r);
    body.setMaxVelocity(480, 480);
    body.setDrag(24, 24);
  }

  /** Skins are not supported on the bitmap sprite yet: plain tint of the whole ship. */
  setSkinTint(color: number): this {
    if (color === 0xffffff) this.clearTint();
    else this.setTint(color);
    return this;
  }

  /** Current roll angle in radians (0 = level). */
  get rollAngle(): number {
    return this.roll;
  }

  /** Pick the sheet frame for this roll; scale stays uniform (no squash). */
  private applyRoll(roll: number): void {
    this.roll = roll;
    this.setFrame(fighterRollFrame(roll));
    this.setScale(STARFURY_DISPLAY_SCALE);
  }

  get isRolling(): boolean {
    return this.rolling;
  }

  get rollProgress(): number {
    return this.progress;
  }

  get rollDirection(): -1 | 1 {
    return this.rollDir;
  }

  startRoll(time: number, dir: -1 | 1): void {
    this.rolling = true;
    this.rollStart = time;
    this.rollDir = dir;
    this.progress = 0;
    this.applyRoll(0);
  }

  /** Advances the longitudinal spin. Returns true while the roll is still playing. */
  updateRoll(time: number): boolean {
    if (!this.rolling) {
      return false;
    }
    const t = (time - this.rollStart) / ROLL_MS;
    if (t >= 1) {
      this.rolling = false;
      this.progress = 0;
      this.applyRoll(0);
      return false;
    }
    this.progress = t;
    this.applyRoll(this.rollDir * t * Math.PI * 2);
    return true;
  }
}
