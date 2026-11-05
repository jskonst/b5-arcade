import Phaser from 'phaser';
import {
  makeAsteroidTextures,
  makeBulletTexture,
  makeStarLayers,
  makeThrustTextures
} from '../utils/textures';
import { STARFURY_PNG_KEY } from '../utils/starfuryModel';
import { createFxAnims, preloadFx } from '../fx/pixelfx';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadFx(this);
    // Linear (default) filter on purpose: smooth downscaled blueprint, not pixel art.
    this.load.image(STARFURY_PNG_KEY, `${import.meta.env.BASE_URL}ships/starfury-top.png`);
  }

  create(): void {
    createFxAnims(this);
    makeStarLayers(this);
    makeThrustTextures(this);
    makeAsteroidTextures(this);
    makeBulletTexture(this);
    this.scene.start('Main');
  }
}
