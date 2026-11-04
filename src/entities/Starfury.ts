import Phaser from 'phaser';
import {
  STARFURY_DISPLAY_SCALE,
  STARFURY_FRAME_COUNT,
  STARFURY_HIT_RADIUS,
  STARFURY_KEY,
  STARFURY_TEXTURE_SIZE,
  starfuryFrame
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

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, STARFURY_KEY);
    this.setDepth(5);
    this.setScale(STARFURY_DISPLAY_SCALE);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    const offset = STARFURY_TEXTURE_SIZE / 2 - STARFURY_HIT_RADIUS;
    body.setCircle(STARFURY_HIT_RADIUS, offset, offset);
    body.setMaxVelocity(480, 480);
    body.setDrag(24, 24);
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
    this.setTexture(starfuryFrame(dir === 1 ? 1 : STARFURY_FRAME_COUNT - 1));
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
      this.setTexture(starfuryFrame(0));
      return false;
    }
    this.progress = t;
    const turned = this.rollDir === 1 ? t : 1 - t;
    const frame = Math.min(STARFURY_FRAME_COUNT - 1, Math.floor(turned * STARFURY_FRAME_COUNT));
    const key = starfuryFrame(frame);
    if (this.texture.key !== key) {
      this.setTexture(key);
    }
    return true;
  }
}
