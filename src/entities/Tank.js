import {
  DIRS,
  TYPES,
  PLAYER_LEVELS,
  PLAYER_MAX_LEVEL,
} from "../core/config.js";
import { AttackTelegraph } from "../world/AttackTelegraph.js";
import {
  tankModel,
  bossTankModel,
  disposeGroup,
  merged,
  box,
  glow,
} from "../world/models.js";

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
    this.visualYaw = (-this.direction * Math.PI) / 2;
    this.visualSpeed = 0;
    this.lastVisualX = x;
    this.lastVisualZ = z;
    this.pitch = 0;
    this.aim = (this.direction * Math.PI) / 2;
    this.cooldownLeft = 0;
    this.invincible = type === "player" ? 3 : 1;
    this.shieldLeft = 0;
    this.smokeTimer = 0;
    this.flash = 0;
    this.frozenUntil = 0;
    if (type === "player") this.level = 1;
    this.model =
      type === "boss"
        ? bossTankModel(this.color, type)
        : tankModel(this.color, type);
    if (type === "boss") this.model.root.scale.setScalar(1.2);
    else this.model.root.scale.setScalar(0.85);
    game.scene.add(this.model.root);
    this.sync();
  }
  move(direction, dt) {
    this.direction = direction;
    const d = DIRS[direction];
    let x = this.x,
      z = this.z;
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
    if (this.team === "enemy" && this.game.time < this.frozenUntil) return;
    this.cooldownLeft =
      this.team === "player"
        ? this.cooldown
        : this.type === "rapid"
          ? this.cooldown * (0.7 + this.game.rng() * 0.35)
          : this.cooldown * (0.7 + this.game.rng() * 0.7);
    const multiShot = this.multiShot ?? 1;
    if (multiShot === 1) {
      this.game.bullets.fire(this);
    } else if (multiShot === 2) {
      this.game.bullets.fire(this, -0.16);
      this.game.bullets.fire(this, 0.16);
    } else if (multiShot === 3) {
      this.game.bullets.fire(this, -0.28);
      this.game.bullets.fire(this, 0);
      this.game.bullets.fire(this, 0.28);
    }
    this.model.turret.position.z = 0.09;
    if (this.team === "player") this.game.audio.play("shoot");
  }
  hit(damage = 1, source) {
    if (!this.alive || this.invincible > 0) return;
    if (this.shieldLeft > 0) {
      this.shieldLeft = 0;
      this.game.effects.burst(this.x, 0.8, this.z, 0xb4d8ff, 14);
      this.game.effects.pulse?.(this.x, this.z, 0x56eee4, 1.1, 0.3);
      this.game.audio.play("shield");
      return;
    }
    if (this.team === "player" && this.armorCharges > 0) {
      this.armorCharges--;
      this.game.effects.burst(this.x, 0.8, this.z, 0x9bbf5a, 18, 0.8);
      this.game.effects.pulse?.(this.x, this.z, 0x56eee4, 1.1, 0.3);
      this.game.audio.play("shield");
      this.game.syncRunUpgradeHud?.();
      return;
    }
    this.hp -= this.damageReceived(Math.max(1, damage), source);
    this.flash = 0.15;
    this.game.effects.burst(this.x, 0.8, this.z, 0xffdc80, 12);
    this.game.audio.play("hit");
    if (this.team === "player") {
      this.game.effects.shake(180, 0.06);
      this.game.flashDamage();
      // Brief stagger on enemies — gives the player a recoverable moment.
      this.game.staggerEnemies?.(0.5);
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.telegraph?.hide();
      this.model.root.visible = false;
      this.game.effects.explode(this.x, this.z);
      this.game.audio.play("explosion");
      this.game.onTankDestroyed(this);
    }
  }
  damageReceived(damage) {
    return damage;
  }
  tick(dt) {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    this.shieldLeft = Math.max(0, this.shieldLeft - dt);
    this.flash = Math.max(0, this.flash - dt);
    const frozen = this.game.time < this.frozenUntil;
    const flashOn = this.flash > 0;
    const shieldOn = this.shieldLeft > 0 && this.team === "player";
    if (frozen) {
      const pulse = 0.4 + 0.25 * Math.sin(this.game.time * 8);
      this.model.paint.emissive.setHex(0x6080ff);
      this.model.paint.emissiveIntensity = pulse;
    } else if (flashOn) {
      this.model.paint.emissive.setHex(0xf5d17a);
      this.model.paint.emissiveIntensity = 0.8;
    } else if (shieldOn) {
      this.model.paint.emissive.setHex(0xb4d8ff);
      this.model.paint.emissiveIntensity =
        0.4 + 0.2 * Math.sin(this.game.time * 6);
    } else {
      this.model.paint.emissive.setHex(0x000000);
      this.model.paint.emissiveIntensity = 0;
    }
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
    const yaw = (-this.direction * Math.PI) / 2;
    const turn = Math.atan2(
      Math.sin(yaw - this.visualYaw),
      Math.cos(yaw - this.visualYaw),
    );
    const speed =
      Math.hypot(this.x - this.lastVisualX, this.z - this.lastVisualZ) /
      Math.max(dt, 0.001);
    const reduced = this.game.reducedMotion;
    this.visualYaw = reduced
      ? yaw
      : this.visualYaw + turn * (1 - Math.exp(-dt * 22));
    this.pitch = reduced
      ? 0
      : this.pitch * Math.exp(-dt * 12) + (speed - this.visualSpeed) * 0.012;
    this.pitch = Math.max(-0.07, Math.min(0.07, this.pitch));
    this.visualSpeed = speed;
    this.lastVisualX = this.x;
    this.lastVisualZ = this.z;
    this.sync();
  }
  sync() {
    this.model.root.position.set(this.x, 0, this.z);
    this.model.hull.rotation.y = this.visualYaw;
    this.model.hull.rotation.x = this.pitch;
    this.model.turret.rotation.y = -this.aim;
  }
  dispose() {
    disposeGroup(this.model.root);
    this.model.paint.dispose();
    this.model.ring.material.dispose();
  }
}
export class PlayerTank extends Tank {
  constructor(game, x, z, level = 1) {
    super(game, "player", x, z);
    this.level = Math.max(1, Math.min(level, PLAYER_MAX_LEVEL));
    this.applyLevelStats();
    this.armorCharges = game.getRunUpgradeStacks?.("reactive") ?? 0;
  }
  applyLevelStats() {
    const cfg = PLAYER_LEVELS[this.level - 1];
    const stacks = (id) => this.game.getRunUpgradeStacks?.(id) ?? 0;
    this.speed = cfg.speed * (1 + stacks("overdrive") * 0.1);
    this.cooldown = cfg.cooldown * Math.pow(0.88, stacks("autoloader"));
    this.multiShot = cfg.multiShot;
    this.breakSteel = cfg.breakSteel;
    this.bulletSpeedMultiplier = 1 + stacks("velocity") * 0.15;
    this.damage = 1 + stacks("piercing");
    this.ricochets =
      this.game.mode === "endless"
        ? stacks("ricochet")
        : this.game.levelConfig?.abilities?.ricochet
          ? 1
          : 0;
  }
  upgrade() {
    if (this.level >= PLAYER_MAX_LEVEL) return false;
    const prev = this.level;
    this.level++;
    this.applyLevelStats();
    this.game.effects.burst(this.x, 0.8, this.z, 0xf3d65a, 18, 0.9);
    this.game.audio.play("levelup");
    this.game.showLevelBurst(this.x, this.z, prev, this.level);
    return true;
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
    if (this.game.time < this.frozenUntil) {
      super.tick(dt);
      return;
    }
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
export class ArmorTank extends EnemyTank {
  constructor(...args) {
    super(...args);
    this.armorMaterial = glow(0xffc56b, 1.5);
    this.weakpointMaterial = glow(0xd987ff, 2);
    merged(
      this.model.hull,
      [box(0.95, 0.3, 0.13, 0, 0.64, -0.63)],
      this.armorMaterial,
    );
    merged(
      this.model.hull,
      [box(0.58, 0.2, 0.12, 0, 0.64, 0.6)],
      this.weakpointMaterial,
    );
  }
  damageReceived(damage, source) {
    if (!source) return damage; // Bomb / area damage bypasses the front plate.
    const forward = DIRS[this.direction];
    const speed = Math.hypot(source.vx, source.vz);
    const dot = speed
      ? (source.vx * forward.x + source.vz * forward.z) / speed
      : 0;
    return dot < -Math.SQRT1_2 ? damage * 0.5 : damage;
  }
  dispose() {
    super.dispose();
    this.armorMaterial.dispose();
    this.weakpointMaterial.dispose();
  }
}

export class SniperTank extends EnemyTank {
  constructor(...args) {
    super(...args);
    this.attackState = "patrol";
    this.attackTimer = 2;
    this.telegraph = new AttackTelegraph(this.game, 0xff65c7);
  }
  interruptAttack() {
    this.attackState = "recover";
    this.attackTimer = 1.4;
    this.telegraph.hide();
  }
  tick(dt) {
    if (this.game.time < this.frozenUntil) {
      this.interruptAttack();
      Tank.prototype.tick.call(this, dt);
      return;
    }
    if (this.invincible <= 0) this.attackTimer -= dt;
    if (this.attackState === "patrol") {
      this.think -= dt;
      if (
        this.invincible <= 0 &&
        (this.think <= 0 || !this.move(this.direction, dt))
      )
        this.chooseDirection();
      this.aim = (this.direction * Math.PI) / 2;
      if (this.attackTimer <= 0 && this.game.player.alive) {
        this.aim = Math.atan2(
          this.game.player.x - this.x,
          -(this.game.player.z - this.z),
        );
        this.attackState = "windup";
        this.attackTimer = 0.8;
      }
    } else if (this.attackState === "windup") {
      this.telegraph.show(this, [this.aim]);
      if (this.attackTimer <= 0) {
        this.game.bullets.fire(this);
        this.interruptAttack();
      }
    } else if (this.attackTimer <= 0) {
      this.attackState = "patrol";
      this.attackTimer = 2;
    }
    Tank.prototype.tick.call(this, dt);
  }
  dispose() {
    this.telegraph.dispose();
    super.dispose();
  }
}

export class BossTank extends EnemyTank {
  constructor(...args) {
    super(...args);
    this.hp = this.game.levelConfig?.bossHp ?? this.hp;
    this.maxHp = this.hp;
    this.phase = 1;
    this.attackState = "patrol";
    this.attackTimer = 2;
    this.nextCharge = true;
    this.telegraph = new AttackTelegraph(this.game, 0xffb85c);
  }
  interruptAttack() {
    this.attackState = "recover";
    this.attackTimer = 1.4;
    this.telegraph.hide();
  }
  tick(dt) {
    if (this.hp <= this.maxHp / 2) this.phase = 2;
    if (this.game.time < this.frozenUntil) {
      this.interruptAttack();
      Tank.prototype.tick.call(this, dt);
      return;
    }
    if (this.invincible <= 0) this.attackTimer -= dt;
    if (this.attackState === "patrol") {
      this.think -= dt;
      if (
        this.invincible <= 0 &&
        (this.think <= 0 || !this.move(this.direction, dt))
      )
        this.chooseDirection();
      this.aim = (this.direction * Math.PI) / 2;
      if (this.attackTimer <= 0 && this.game.player.alive) {
        const p = this.game.player;
        this.aim = Math.atan2(p.x - this.x, -(p.z - this.z));
        this.charging = this.phase === 2 && this.nextCharge;
        if (this.phase === 2) this.nextCharge = !this.nextCharge;
        if (this.charging) {
          this.direction =
            Math.abs(p.x - this.x) > Math.abs(p.z - this.z)
              ? p.x > this.x
                ? 1
                : 3
              : p.z > this.z
                ? 2
                : 0;
          this.aim = (this.direction * Math.PI) / 2;
        }
        this.attackState = "windup";
        this.attackTimer = this.charging ? 1 : 0.8;
        this.fan =
          this.phase === 2 ? [-0.7, -0.35, 0, 0.35, 0.7] : [-0.4, 0, 0.4];
      }
    } else if (this.attackState === "windup") {
      this.telegraph.show(
        this,
        this.charging ? [this.aim] : this.fan.map((a) => this.aim + a),
        this.charging ? 4.8 : 22,
      );
      if (this.attackTimer <= 0) {
        this.telegraph.hide();
        if (this.charging) {
          this.attackState = "charge";
          this.attackTimer = 0.8;
        } else {
          for (const offset of this.fan)
            this.game.bullets.fire(this, 0, offset);
          this.interruptAttack();
        }
      }
    } else if (this.attackState === "charge") {
      const d = DIRS[this.direction],
        p = this.game.player;
      const x = this.x + d.x * 6 * dt,
        z = this.z + d.z * 6 * dt;
      if (
        p.alive &&
        Math.abs(p.x - x) < p.radius + this.radius &&
        Math.abs(p.z - z) < p.radius + this.radius
      ) {
        p.hit();
        this.interruptAttack();
      } else if (
        this.attackTimer <= 0 ||
        !this.game.collision.canMove(this, x, z)
      )
        this.interruptAttack();
      else {
        this.x = x;
        this.z = z;
      }
    } else if (this.attackTimer <= 0) {
      this.attackState = "patrol";
      this.attackTimer = 1.6;
    }
    Tank.prototype.tick.call(this, dt);
  }
  dispose() {
    this.telegraph.dispose();
    super.dispose();
  }
}
