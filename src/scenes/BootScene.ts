import Phaser from 'phaser';
import { makeAsteroidTextures, makeBulletTexture, makeStarLayers, makeStarfuryTexture } from '../utils/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    makeStarLayers(this);
    makeStarfuryTexture(this);
    makeAsteroidTextures(this);
    makeBulletTexture(this);
    this.scene.start('Main');
  }
}
