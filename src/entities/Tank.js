import { DIRS, TYPES } from "../core/config.js";
import { tankModel, disposeGroup } from "../world/models.js";

export class Tank {
  constructor(game, type, x, z) {
    this.game = game;
    this.type = type;
    Object.assign(this, TYPES[type]);
    this.team = type === "player" ? "player" : "enemy";
    this.x = x;
    this.z = z;
    this.radius = 0.46;
    this.alive = true;
    this.direction = type === "player" ? 0 : 2;
    this.aim = (this.direction * Math.PI) / 2;
    this.cooldownLeft = 0;
    this.invincible = type === "player" ? 3 : 1;
    this.smokeTimer = 0;
    this.flash = 0;
    this.model = tankModel(this.color, type);
    this.model.root.scale.setScalar(0.85);
    game.scene.add(this.model.root);
    this.sync();
  }
  move(direction, dt) {
    this.direction = direction;
    const d = DIRS[direction];
    let x = this.x,
      z = this.z;
    // Complete the perpendicular alignment before entering a new grid lane.
    const perpendicular = d.x ? this.z : this.x,
      center = Math.round(perpendicular - 0.5) + 0.5;
    const gap = center - perpendicular;
    if (Math.abs(gap) > 0.01) {
      const step = Math.sign(gap) * Math.min(Math.abs(gap), this.speed * dt);
      if (d.x) z += step;
      else x += step;
    } else {
      x += d.x * this.speed * dt;
      z += d.z * this.speed * dt;
    }
    if (!this.game.collision.canMove(this, x, z)) return false;
    this.x = x;
    this.z = z;
    return true;
  }
  shoot() {
    if (!this.alive || this.cooldownLeft > 0) return;
    this.cooldownLeft =
      this.team === "player"
        ? this.cooldown
        : this.type === "rapid"
          ? this.cooldown * (0.7 + this.game.rng() * 0.35)
          : this.cooldown * (0.7 + this.game.rng() * 0.7);
    this.game.bullets.fire(this);
    this.model.turret.position.z = 0.09;
    if (this.team === "player") this.game.audio.play("shoot");
  }
  hit() {
    if (!this.alive || this.invincible > 0) return;
    this.hp--;
    this.flash = 0.15;
    this.game.effects.burst(this.x, 0.8, this.z, 0xffdc80, 12);
    this.game.audio.play("hit");
    if (this.hp <= 0) {
      this.alive = false;
      this.model.root.visible = false;
      this.game.effects.explode(this.x, this.z);
      this.game.audio.play("explosion");
      this.game.onTankDestroyed(this);
    }
  }
  tick(dt) {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.model.paint.emissive.setHex(this.flash > 0 ? 0xf5d17a : 0x000000);
    this.model.paint.emissiveIntensity = this.flash > 0 ? 0.8 : 0;
    this.model.ring.material.opacity =
      this.invincible > 0 ? 0.35 + Math.sin(this.game.time * 12) * 0.3 : 0.7;
    this.model.turret.position.z *= Math.exp(-dt * 20);
    if (this.hp < TYPES[this.type].hp) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.18;
        this.game.effects.smoke(this.x, this.z);
      }
    }
    this.sync();
  }
  sync() {
    this.model.root.position.set(this.x, 0, this.z);
    this.model.hull.rotation.y = (-this.direction * Math.PI) / 2;
    this.model.turret.rotation.y = -this.aim;
  }
  dispose() {
    disposeGroup(this.model.root);
    this.model.paint.dispose();
    this.model.ring.material.dispose();
  }
}
export class PlayerTank extends Tank {
  constructor(game, x, z) {
    super(game, "player", x, z);
  }
  tick(dt) {
    const input = this.game.input;
    const dir = input.direction;
    if (dir !== null) {
      this.move(dir, dt);
      if (!input.mouseAim) this.aim = (dir * Math.PI) / 2;
    }
    if (input.mouseAim && input.target) {
      this.aim = Math.atan2(
        input.target.x - this.x,
        -(input.target.z - this.z),
      );
    }
    if (input.firing) this.shoot();
    super.tick(dt);
  }
}
export class EnemyTank extends Tank {
  constructor(game, type, x, z) {
    super(game, type, x, z);
    const tuning = game.levelConfig ?? {};
    this.speed *= tuning.speedMultiplier ?? 1;
    this.cooldown *= tuning.fireMultiplier ?? 1;
    this.think = 1;
    this.cooldownLeft = 1.5 + game.rng() * 1.5;
  }
  chooseDirection() {
    const options = [0, 1, 2, 3].filter((dir) => {
      const d = DIRS[dir];
      return this.game.collision.canMove(
        this,
        this.x + d.x * 0.28,
        this.z + d.z * 0.28,
      );
    });
    if (!options.length) {
      this.direction = Math.floor(this.game.rng() * 4);
      return;
    }
    if (this.game.rng() < 0.67) {
      const target =
        this.game.rng() < 0.62 ? this.game.map.base : this.game.player;
      options.sort((a, b) => {
        const da = DIRS[a],
          db = DIRS[b];
        return (
          Math.hypot(target.x - this.x - da.x, target.z - this.z - da.z) -
          Math.hypot(target.x - this.x - db.x, target.z - this.z - db.z)
        );
      });
      this.direction = options[0];
    } else
      this.direction = options[Math.floor(this.game.rng() * options.length)];
    this.think = 0.7 + this.game.rng() * 2;
  }
  tick(dt) {
    this.think -= dt;
    if (this.think <= 0) this.chooseDirection();
    if (this.invincible <= 0 && !this.move(this.direction, dt)) {
      this.chooseDirection();
    }
    this.aim = (this.direction * Math.PI) / 2;
    if (this.invincible <= 0) this.shoot();
    super.tick(dt);
  }
}
