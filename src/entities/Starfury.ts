import Phaser from 'phaser';
import {
  STARFURY_DISPLAY_SCALE,
  STARFURY_FRAME_COUNT,
  STARFURY_HIT_RADIUS,
  STARFURY_KEY,
  STARFURY_TEXTURE_SIZE,
  starfuryFrame,
  starfuryFrameRoll,
  starfuryMaskFrame
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
  private frameIndex = 0;
  /** Skin layer: white mask of wing + fuselage, MULTIPLY-blended on top. White tint = no change. */
  readonly skin: Phaser.GameObjects.Image;

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
    this.skin = scene.add
      .image(x, y, starfuryMaskFrame(0))
      .setDepth(5.01)
      .setScale(STARFURY_DISPLAY_SCALE)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.skin.destroy());
  }

  /** Recolour wings + fuselage; pass 0xffffff (default) for the plain grey hull. */
  setSkinTint(color: number): this {
    this.skin.setTint(color);
    return this;
  }

  /** Current roll angle in radians (0 = level), from the displayed frame. */
  get rollAngle(): number {
    return starfuryFrameRoll(this.frameIndex);
  }

  private showFrame(i: number): void {
    this.frameIndex = i;
    this.setTexture(starfuryFrame(i));
    this.skin.setTexture(starfuryMaskFrame(i));
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.skin
      .setPosition(this.x, this.y)
      .setAngle(this.angle)
      .setAlpha(this.alpha)
      .setVisible(this.visible && this.active);
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
    this.showFrame(dir === 1 ? 1 : STARFURY_FRAME_COUNT - 1);
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
      this.showFrame(0);
      return false;
    }
    this.progress = t;
    const turned = this.rollDir === 1 ? t : 1 - t;
    const frame = Math.min(STARFURY_FRAME_COUNT - 1, Math.floor(turned * STARFURY_FRAME_COUNT));
    if (this.frameIndex !== frame) {
      this.showFrame(frame);
    }
    return true;
  }
}
