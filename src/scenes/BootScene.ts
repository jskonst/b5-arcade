import Phaser from 'phaser';
import {
  makeAsteroidTextures,
  makeBulletTexture,
  makeStarLayers,
  makeStarfuryTexture,
  makeThrustTextures
} from '../utils/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    makeStarLayers(this);
    makeStarfuryTexture(this);
    makeThrustTextures(this);
    makeAsteroidTextures(this);
    makeBulletTexture(this);
    this.scene.start('Main');
  }
}
