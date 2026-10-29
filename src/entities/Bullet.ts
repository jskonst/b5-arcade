import Phaser from 'phaser';
import { BULLET_KEY } from '../utils/textures';

export class Bullet extends Phaser.Physics.Arcade.Image {
  lifetime = 1500;

  constructor(scene: Phaser.Scene, x: number, y: number, vx: number, vy: number) {
    super(scene, x, y, BULLET_KEY);
    this.setDepth(6);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(3, 3, 3);
    body.reset(x, y);
    body.setVelocity(vx, vy);
  }
}
