import Phaser from 'phaser';
import { STARFURY_KEY } from '../utils/textures';

export class Starfury extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, STARFURY_KEY);
    this.setDepth(5);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(19, 17, 17);
    body.setMaxVelocity(480, 480);
    body.setDrag(24, 24);
  }
}
