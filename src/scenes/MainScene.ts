import Phaser from 'phaser';
import { Bullet } from '../entities/Bullet';
import { Asteroid } from '../entities/Asteroid';
import { ROLL_COOLDOWN_MS, Starfury } from '../entities/Starfury';
import {
  DOUBLE_TAP_MS,
  freshTap,
  pollDoubleTap,
  SIDE_TAP_MS,
  SWIPE_MAX_MS,
  SWIPE_MIN_PX,
  SWIPE_PAIR_MS,
  TapState
} from '../input/gestures';
import { TouchControls } from '../input/TouchControls';
import {
  ASTEROID_RADIUS,
  AsteroidSize,
  EXHAUST_KEY,
  GAME_HEIGHT,
  GAME_WIDTH,
  RETRO_KEY,
  STAR_LAYERS
} from '../utils/textures';
import { STARFURY_NOSE_OFFSET, STARFURY_TAIL_OFFSET } from '../utils/starfuryModel';

const SHIP_TURN = 280;
const SHIP_THRUST = 340;
const BULLET_SPEED = 620;
const FIRE_INTERVAL = 250;
const RESPAWN_INVULN = 2000;
const START_LIVES = 3;
const SHIP_WRAP_MARGIN = 64;

const NEXT_SIZE: Record<AsteroidSize, AsteroidSize | null> = {
  large: 'medium',
  medium: 'small',
  small: null
};

interface Keys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  q: Phaser.Input.Keyboard.Key;
  e: Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
}

interface PilotDebugState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  rolling: boolean;
  rollProgress: number;
  frame: string;
  lives: number;
  invulnerable: boolean;
  gameOver: boolean;
  bullets: number;
  bodyX: number;
  bodyY: number;
}

declare global {
  interface Window {
    __B5__?: { getState: () => PilotDebugState; scene: Phaser.Scene };
  }
}

type Wrapped = { x: number; y: number };

export class MainScene extends Phaser.Scene {
  private ship!: Starfury;
  private bullets: Bullet[] = [];
  private asteroids: Asteroid[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private exhaust!: Phaser.GameObjects.Image;
  private retro!: Phaser.GameObjects.Image;
  private keys!: Keys;
  private touch!: TouchControls;
  private score = 0;
  private lives = START_LIVES;
  private level = 1;
  private lastShot = 0;
  private invulnUntil = 0;
  private rollReadyAt = 0;
  private gameOver = false;
  private restarting = false;
  private readonly swipe: TapState = freshTap();
  private readonly sideTap: TapState = freshTap();
  private readonly keyTap: TapState = freshTap();
  private readonly gestureStart = new Map<number, { x: number; y: number; t: number }>();

  constructor() {
    super('Main');
  }

  create(): void {
    this.score = 0;
    this.lives = START_LIVES;
    this.level = 1;
    this.lastShot = 0;
    this.rollReadyAt = 0;
    this.gameOver = false;
    this.restarting = false;
    this.bullets = [];
    this.asteroids = [];
    this.gestureStart.clear();
    this.swipe.dir = 0;
    this.swipe.at = -1e9;
    this.sideTap.dir = 0;
    this.sideTap.at = -1e9;
    this.keyTap.dir = 0;
    this.keyTap.at = -1e9;

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, STAR_LAYERS[0]).setDepth(0);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, STAR_LAYERS[1]).setDepth(1);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, STAR_LAYERS[2]).setDepth(2);

    this.ship = new Starfury(this, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.invulnUntil = this.time.now + RESPAWN_INVULN;
    this.exhaust = this.add.image(0, 0, EXHAUST_KEY).setOrigin(1, 0.5).setDepth(4.5).setVisible(false);
    this.retro = this.add.image(0, 0, RETRO_KEY).setOrigin(0, 0.5).setDepth(4.5).setVisible(false);

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Courier New", monospace',
      fontSize: '24px',
      fontStyle: 'bold'
    };
    this.scoreText = this.add.text(16, 12, '', { ...style, color: '#ffd23c' }).setDepth(10);
    this.livesText = this.add.text(16, 42, '', { ...style, color: '#9fd8ff' }).setDepth(10);
    this.levelText = this.add.text(GAME_WIDTH - 16, 12, '', { ...style, color: '#9be29b' }).setOrigin(1, 0).setDepth(10);
    this.updateHud();

    this.touch = new TouchControls();
    this.touch.setRestartHandler(() => {
      if (this.gameOver) {
        this.restart();
      }
    });
    const hint = this.touch.visible
      ? 'STICK MOVES  ·  DOUBLE-FLICK OR ⟲⟳ ROLLS  ·  DOWN REVERSES  ·  FIRE SHOOTS'
      : 'ARROWS/WASD MOVE  ·  S/DOWN REVERSE  ·  Q/E OR DOUBLE-TAP TURN ROLLS  ·  SPACE FIRES';
    const hintText = this.add
      .text(16, 74, hint, {
        fontFamily: '"Courier New", monospace',
        fontSize: '15px',
        color: '#8ea0b5',
        wordWrap: { width: GAME_WIDTH - 32 }
      })
      .setDepth(10);
    this.tweens.add({ targets: hintText, alpha: 0, delay: 5400, duration: 700 });

    const kb = this.input.keyboard!;
    kb.addCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.Q,
      Phaser.Input.Keyboard.KeyCodes.E
    ]);
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      e: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      shift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      enter: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    };

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.mouse?.disableContextMenu();

    this.physics.add.overlap(this.ship, this.asteroids, this.onShipHit, undefined, this);
    this.physics.add.overlap(this.bullets, this.asteroids, this.onBulletHit, undefined, this);

    this.spawnLevel(1);

    const readState = (): PilotDebugState => {
      const body = this.ship.body as Phaser.Physics.Arcade.Body;
      return {
        x: this.ship.x,
        y: this.ship.y,
        vx: body.velocity.x,
        vy: body.velocity.y,
        angle: this.ship.angle,
        rolling: this.ship.isRolling,
        rollProgress: this.ship.rollProgress,
        frame: this.ship.texture.key,
        lives: this.lives,
        invulnerable: this.ship.isRolling || this.time.now < this.invulnUntil,
        gameOver: this.gameOver,
        bullets: this.bullets.length,
        bodyX: body.center.x,
        bodyY: body.center.y
      };
    };
    window.__B5__ = { getState: readState, scene: this as unknown as Phaser.Scene };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.touch.destroy();
      delete window.__B5__;
    });
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
      this.exhaust.setVisible(false);
      this.retro.setVisible(false);
      if (Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
        this.restart();
      }
      return;
    }

    this.pollKeyboardRoll(time);
    const touchRoll = this.touch.consumeRoll();
    if (touchRoll !== 0) {
      this.requestRoll(time, touchRoll);
    }

    const touch = this.touch.getState();
    const keyTurn =
      (this.keys.left.isDown || this.keys.a.isDown ? -1 : 0) +
      (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0);
    const keyThrust =
      (this.keys.up.isDown || this.keys.w.isDown ? 1 : 0) +
      (this.keys.down.isDown || this.keys.s.isDown ? -1 : 0);
    const turn = Phaser.Math.Clamp(keyTurn + touch.turn, -1, 1);
    const thrust = Phaser.Math.Clamp(keyThrust + touch.thrust, -1, 1);

    this.ship.angle += turn * SHIP_TURN * dt;
    this.ship.updateRoll(time);

    const rad = Phaser.Math.DegToRad(this.ship.angle);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    if (thrust !== 0) {
      this.ship.setAcceleration(cos * SHIP_THRUST * thrust, sin * SHIP_THRUST * thrust);
    } else {
      this.ship.setAcceleration(0, 0);
    }

    this.exhaust.setVisible(thrust > 0.08);
    this.retro.setVisible(thrust < -0.08);
    if (thrust > 0.08) {
      this.exhaust.setPosition(this.ship.x - cos * STARFURY_TAIL_OFFSET, this.ship.y - sin * STARFURY_TAIL_OFFSET);
      this.exhaust.angle = this.ship.angle;
      const flicker = 0.75 + Math.random() * 0.35;
      this.exhaust.setScale((0.65 + thrust * 0.55) * flicker, 0.85 + thrust * 0.3);
    }
    if (thrust < -0.08) {
      this.retro.setPosition(this.ship.x + cos * STARFURY_NOSE_OFFSET, this.ship.y + sin * STARFURY_NOSE_OFFSET);
      this.retro.angle = this.ship.angle;
      const flicker = 0.8 + Math.random() * 0.3;
      this.retro.setScale((0.7 - thrust * 0.4) * flicker, 0.9);
    }

    if ((this.keys.space.isDown || touch.fire) && time - this.lastShot >= FIRE_INTERVAL) {
      this.shoot(time);
    }

    this.wrapAround(this.ship, SHIP_WRAP_MARGIN);

    if (!this.ship.isRolling && time < this.invulnUntil) {
      this.ship.setAlpha(Math.floor(time / 100) % 2 === 0 ? 0.25 : 1);
    } else {
      this.ship.setAlpha(1);
    }
  }

  private pollKeyboardRoll(time: number): void {
    const q = Phaser.Input.Keyboard.JustDown(this.keys.q);
    const e = Phaser.Input.Keyboard.JustDown(this.keys.e);
    const left = Phaser.Input.Keyboard.JustDown(this.keys.left) || Phaser.Input.Keyboard.JustDown(this.keys.a);
    const right = Phaser.Input.Keyboard.JustDown(this.keys.right) || Phaser.Input.Keyboard.JustDown(this.keys.d);
    const shifted = this.keys.shift.isDown;

    if (q || (shifted && left && !right)) {
      this.requestRoll(time, -1);
      return;
    }
    if (e || (shifted && right && !left)) {
      this.requestRoll(time, 1);
      return;
    }
    if (left === right) {
      return;
    }
    const dir: -1 | 1 = left ? -1 : 1;
    const rolled = pollDoubleTap(this.keyTap, dir, time, DOUBLE_TAP_MS);
    if (rolled !== 0) {
      this.requestRoll(time, rolled);
    }
  }

  private requestRoll(time: number, dir: -1 | 1): void {
    if (this.gameOver || !this.ship.active || this.ship.isRolling || time < this.rollReadyAt) {
      return;
    }
    this.ship.startRoll(time, dir);
    this.rollReadyAt = time + ROLL_COOLDOWN_MS;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    this.gestureStart.set(p.id, { x: p.x, y: p.y, t: this.time.now });
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.gameOver) {
      this.restart();
      return;
    }
    const start = this.gestureStart.get(p.id);
    this.gestureStart.delete(p.id);
    if (!start) {
      return;
    }
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const dt = this.time.now - start.t;
    if (dt <= SWIPE_MAX_MS && Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.35) {
      const dir: -1 | 1 = dx > 0 ? 1 : -1;
      const rolled = pollDoubleTap(this.swipe, dir, this.time.now, SWIPE_PAIR_MS);
      if (rolled !== 0) {
        this.requestRoll(this.time.now, rolled);
      }
      return;
    }
    if (dt <= 280 && Math.abs(dx) < 22 && Math.abs(dy) < 22) {
      let dir: -1 | 0 | 1 = 0;
      if (p.x < GAME_WIDTH * 0.2) {
        dir = -1;
      } else if (p.x > GAME_WIDTH * 0.8) {
        dir = 1;
      }
      const rolled = pollDoubleTap(this.sideTap, dir, this.time.now, SIDE_TAP_MS);
      if (rolled !== 0) {
        this.requestRoll(this.time.now, rolled);
      }
    }
  }

  private restart(): void {
    if (this.restarting) {
      return;
    }
    this.restarting = true;
    this.scene.restart();
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
      this.ship.x + Math.cos(rad) * STARFURY_NOSE_OFFSET,
      this.ship.y + Math.sin(rad) * STARFURY_NOSE_OFFSET,
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
    if (this.gameOver || this.ship.isRolling || this.time.now < this.invulnUntil) {
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
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'TAP OR PRESS ENTER', {
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
