import Phaser from 'phaser';
import { ASTEROID_RADIUS, ASTEROID_SCORE, ASTEROID_TEXTURES, AsteroidSize } from '../utils/textures';

export class Asteroid extends Phaser.Physics.Arcade.Image {
  readonly size: AsteroidSize;
  readonly score: number;

  constructor(scene: Phaser.Scene, x: number, y: number, size: AsteroidSize) {
    const keys = ASTEROID_TEXTURES[size];
    super(scene, x, y, keys[Phaser.Math.Between(0, keys.length - 1)]);
    this.size = size;
    this.score = ASTEROID_SCORE[size];
    this.setDepth(4);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const radius = ASTEROID_RADIUS[size] * 0.92;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
  }
}
