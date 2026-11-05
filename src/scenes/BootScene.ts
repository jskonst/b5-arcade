import Phaser from 'phaser';
import {
  makeAsteroidTextures,
  makeBulletTexture,
  makeStarLayers,
  makeStarfuryTexture,
  makeThrustTextures
} from '../utils/textures';
import { createFxAnims, preloadFx } from '../fx/pixelfx';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadFx(this);
  }

  create(): void {
    createFxAnims(this);
    makeStarLayers(this);
    makeStarfuryTexture(this);
    makeThrustTextures(this);
    makeAsteroidTextures(this);
    makeBulletTexture(this);
    this.scene.start('Main');
  }
}
