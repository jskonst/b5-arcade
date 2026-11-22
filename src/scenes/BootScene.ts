import Phaser from 'phaser';
import {
  makeAsteroidTextures,
  makeBulletTexture,
  makeStarLayers,
  makeThrustTextures
} from '../utils/textures';
import {
  FIGHTER_ANCHORS_KEY,
  FIGHTER_ROLL_JSON_KEY,
  FIGHTER_ROLL_KEY,
  FighterAnchorsFile,
  FighterRollMeta,
  applyFighterSheet
} from '../utils/starfuryModel';
import { createFxAnims, preloadFx } from '../fx/pixelfx';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadFx(this);
    const base = import.meta.env.BASE_URL;
    this.load.json(FIGHTER_ROLL_JSON_KEY, `${base}ships/fighter-roll.json`);
    this.load.json(FIGHTER_ANCHORS_KEY, `${base}ships/fighter-anchors.json`);
  }

  create(): void {
    createFxAnims(this);
    const meta = this.cache.json.get(FIGHTER_ROLL_JSON_KEY) as FighterRollMeta;
    const anchors = this.cache.json.get(FIGHTER_ANCHORS_KEY) as FighterAnchorsFile;
    applyFighterSheet(meta, anchors);
    const base = import.meta.env.BASE_URL;
    this.load.spritesheet(FIGHTER_ROLL_KEY, `${base}ships/${meta.image}`, {
      frameWidth: meta.frameWidth,
      frameHeight: meta.frameHeight,
      margin: meta.margin ?? 0,
      spacing: meta.spacing ?? 0,
      endFrame: meta.frameCount - 1
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      // Linear filter on purpose: smooth downscaled render, not pixel art.
      this.textures.get(FIGHTER_ROLL_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
      makeStarLayers(this);
      makeThrustTextures(this);
      makeAsteroidTextures(this);
      makeBulletTexture(this);
      this.scene.start('Main');
    });
    this.load.start();
  }
}
