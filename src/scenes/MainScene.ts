import Phaser from 'phaser';
import { Bullet } from '../entities/Bullet';
import { Asteroid } from '../entities/Asteroid';
import { Starfury } from '../entities/Starfury';
import { ASTEROID_RADIUS, AsteroidSize, GAME_HEIGHT, GAME_WIDTH, STAR_LAYERS } from '../utils/textures';

const SHIP_TURN = 280;
const SHIP_THRUST = 340;
const BULLET_SPEED = 620;
const FIRE_INTERVAL = 250;
const RESPAWN_INVULN = 2000;
const START_LIVES = 3;
const SHIP_WRAP_MARGIN = 24;

const NEXT_SIZE: Record<AsteroidSize, AsteroidSize | null> = {
  large: 'medium',
  medium: 'small',
  small: null
};

interface Keys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
}

type Wrapped = { x: number; y: number };

export class MainScene extends Phaser.Scene {
  private ship!: Starfury;
  private bullets: Bullet[] = [];
  private asteroids: Asteroid[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private keys!: Keys;
  private score = 0;
  private lives = START_LIVES;
  private level = 1;
  private lastShot = 0;
  private invulnUntil = 0;
  private gameOver = false;

  constructor() {
    super('Main');
  }

  create(): void {
    this.score = 0;
    this.lives = START_LIVES;
    this.level = 1;
    this.lastShot = 0;
    this.gameOver = false;
    this.bullets = [];
    this.asteroids = [];

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, STAR_LAYERS[0]).setDepth(0);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, STAR_LAYERS[1]).setDepth(1);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, STAR_LAYERS[2]).setDepth(2);

    this.ship = new Starfury(this, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.invulnUntil = this.time.now + RESPAWN_INVULN;

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Courier New", monospace',
      fontSize: '24px',
      fontStyle: 'bold'
    };
    this.scoreText = this.add.text(16, 12, '', { ...style, color: '#ffd23c' }).setDepth(10);
    this.livesText = this.add.text(16, 42, '', { ...style, color: '#9fd8ff' }).setDepth(10);
    this.levelText = this.add.text(GAME_WIDTH - 16, 12, '', { ...style, color: '#9be29b' }).setOrigin(1, 0).setDepth(10);
    this.updateHud();

    const kb = this.input.keyboard!;
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      enter: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    };

    this.physics.add.overlap(this.ship, this.asteroids, this.onShipHit, undefined, this);
    this.physics.add.overlap(this.bullets, this.asteroids, this.onBulletHit, undefined, this);

    this.spawnLevel(1);
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      this.wrapAround(b, 8);
      b.lifetime -= delta;
      if (b.lifetime <= 0) {
        b.destroy();
        this.bullets.splice(i, 1);
      }
    }

    this.asteroids.forEach((a) => {
      this.wrapAround(a, ASTEROID_RADIUS[a.size]);
    });

    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
        this.scene.restart();
      }
      return;
    }

    const turn =
      (this.keys.left.isDown || this.keys.a.isDown ? -1 : 0) + (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0);
    this.ship.angle += turn * SHIP_TURN * dt;

    const rad = Phaser.Math.DegToRad(this.ship.angle);
    if (this.keys.up.isDown || this.keys.w.isDown) {
      this.ship.setAcceleration(Math.cos(rad) * SHIP_THRUST, Math.sin(rad) * SHIP_THRUST);
    } else {
      this.ship.setAcceleration(0, 0);
    }

    if (this.keys.space.isDown && time - this.lastShot >= FIRE_INTERVAL) {
      this.shoot(time);
    }

    this.wrapAround(this.ship, SHIP_WRAP_MARGIN);

    if (time < this.invulnUntil) {
      this.ship.setAlpha(Math.floor(time / 100) % 2 === 0 ? 0.25 : 1);
    } else {
      this.ship.setAlpha(1);
    }
  }

  private wrapAround(obj: Wrapped, margin: number): void {
    if (obj.x < -margin) {
      obj.x = GAME_WIDTH + margin;
    } else if (obj.x > GAME_WIDTH + margin) {
      obj.x = -margin;
    }
    if (obj.y < -margin) {
      obj.y = GAME_HEIGHT + margin;
    } else if (obj.y > GAME_HEIGHT + margin) {
      obj.y = -margin;
    }
  }

  private shoot(time: number): void {
    const rad = Phaser.Math.DegToRad(this.ship.angle);
    const shipBody = this.ship.body as Phaser.Physics.Arcade.Body;
    const bullet = new Bullet(
      this,
      this.ship.x + Math.cos(rad) * 34,
      this.ship.y + Math.sin(rad) * 34,
      shipBody.velocity.x + Math.cos(rad) * BULLET_SPEED,
      shipBody.velocity.y + Math.sin(rad) * BULLET_SPEED
    );
    this.bullets.push(bullet);
    this.lastShot = time;
  }

  private spawnLevel(level: number): void {
    this.level = level;
    this.levelText.setText(`LEVEL ${level}`);
    const count = 3 + level;
    for (let i = 0; i < count; i++) {
      this.spawnAsteroid('large');
    }
  }

  private spawnAsteroid(size: AsteroidSize, x?: number, y?: number): void {
    let px = x;
    let py = y;
    if (px === undefined || py === undefined) {
      for (let tries = 0; tries < 24; tries++) {
        px = Phaser.Math.Between(40, GAME_WIDTH - 40);
        py = Phaser.Math.Between(40, GAME_HEIGHT - 40);
        if (Phaser.Math.Distance.Between(px, py, this.ship.x, this.ship.y) > 260) {
          break;
        }
      }
    }
    const asteroid = new Asteroid(this, px ?? 0, py ?? 0, size);
    const baseSpeed = size === 'large' ? 45 : size === 'medium' ? 65 : 90;
    const speed = (baseSpeed + this.level * 6) * (0.8 + Math.random() * 0.5);
    const ang = Math.random() * Math.PI * 2;
    const body = asteroid.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    asteroid.setAngularVelocity(Phaser.Math.FloatBetween(-2, 2));
    this.asteroids.push(asteroid);
  }

  private splitAsteroid(asteroid: Asteroid): void {
    const index = this.asteroids.indexOf(asteroid);
    if (index >= 0) {
      this.asteroids.splice(index, 1);
    }
    const nextSize = NEXT_SIZE[asteroid.size];
    if (nextSize) {
      const parentBody = asteroid.body as Phaser.Physics.Arcade.Body;
      const speed = Math.max(parentBody.velocity.length(), 40) * 1.15;
      const baseAng = Math.atan2(parentBody.velocity.y, parentBody.velocity.x);
      for (let i = 0; i < 2; i++) {
        const ang = baseAng + Math.PI * (0.25 + Math.random() * 0.5) * (i === 0 ? 1 : -1);
        this.spawnAsteroid(nextSize, asteroid.x, asteroid.y);
        const child = this.asteroids[this.asteroids.length - 1];
        const childBody = child.body as Phaser.Physics.Arcade.Body;
        childBody.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
      }
    }
    asteroid.destroy();
    if (this.asteroids.length === 0) {
      this.time.delayedCall(900, () => {
        if (!this.gameOver && this.scene.isActive('Main')) {
          this.spawnLevel(this.level + 1);
        }
      });
    }
  }

  private onBulletHit(obj1: unknown, obj2: unknown): void {
    if (this.gameOver) {
      return;
    }
    const asteroid = obj1 instanceof Asteroid ? obj1 : obj2 instanceof Asteroid ? obj2 : null;
    const bullet = obj1 instanceof Bullet ? obj1 : obj2 instanceof Bullet ? obj2 : null;
    if (!asteroid || !bullet) {
      return;
    }
    const bulletIndex = this.bullets.indexOf(bullet);
    if (bulletIndex >= 0) {
      this.bullets.splice(bulletIndex, 1);
    }
    bullet.destroy();
    this.score += asteroid.score;
    this.updateHud();
    this.splitAsteroid(asteroid);
  }

  private onShipHit(): void {
    if (this.gameOver || this.time.now < this.invulnUntil) {
      return;
    }
    this.lives -= 1;
    this.updateHud();
    if (this.lives <= 0) {
      this.gameOver = true;
      this.ship.disableBody(true, true);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'GAME OVER', {
          fontFamily: '"Courier New", monospace',
          fontSize: '64px',
          fontStyle: 'bold',
          color: '#ff5a4e'
        })
        .setOrigin(0.5)
        .setDepth(11);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'PRESS ENTER TO RESTART', {
          fontFamily: '"Courier New", monospace',
          fontSize: '24px',
          color: '#c9d4e3'
        })
        .setOrigin(0.5)
        .setDepth(11);
    } else {
      const body = this.ship.body as Phaser.Physics.Arcade.Body;
      body.reset(GAME_WIDTH / 2, GAME_HEIGHT / 2);
      this.ship.setAcceleration(0, 0);
      this.invulnUntil = this.time.now + RESPAWN_INVULN;
    }
  }

  private updateHud(): void {
    this.scoreText.setText(`SCORE ${this.score}`);
    this.livesText.setText(`LIVES ${this.lives}`);
    this.levelText.setText(`LEVEL ${this.level}`);
  }
}
