// SOLMAR BAY — combat: fists and firearms, for the player and for anyone
// shooting back.
//
// Player fire is a ray from the camera through the crosshair, tested
// against pedestrians and gang members (spheres), cars (circles) and the
// building colliders (which cap the ray's range). Every pellet leaves a
// tracer that fades over a few frames. Enemy fire is resolved the other
// way: a hit chance by range, a tracer either way, and an event when the
// player is struck. Nothing here decides what a hit *means* — events go
// up to the game, which handles crimes, knockouts and mission kills.

import * as THREE from "three";
import { WEAPONS } from "./config.js";
import { audio } from "./audio.js";

export class Combat {
  constructor(scene, save) {
    this.scene = scene;
    this.owned = { fist: true, pistol: !!save.weapons.pistol, shotgun: !!save.weapons.shotgun, rifle: !!save.weapons.rifle };
    this.mag = { pistol: WEAPONS.pistol.mag, shotgun: WEAPONS.shotgun.mag, rifle: WEAPONS.rifle.mag };
    this.reserve = { pistol: 36, shotgun: 16, rifle: 60 };
    this.current = "fist";
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.9 });
  }

  select(name) {
    if (this.owned[name]) this.current = name;
  }

  selectSlot(slot) {
    for (const [name, w] of Object.entries(WEAPONS)) {
      if (w.slot === slot && this.owned[name]) {
        // Slot 3 holds two weapons; pressing it again swaps between them.
        if (name === this.current) continue;
        this.current = name;
        return;
      }
    }
  }

  give(name) {
    this.owned[name] = true;
    this.mag[name] = WEAPONS[name].mag;
    this.reserve[name] = Math.max(this.reserve[name], WEAPONS[name].mag * 2);
    this.current = name;
  }

  refillAll() {
    this.reserve.pistol = 72;
    this.reserve.shotgun = 32;
    this.reserve.rifle = 120;
    for (const name of ["pistol", "shotgun", "rifle"]) {
      if (this.owned[name]) this.mag[name] = WEAPONS[name].mag;
    }
  }

  startReload() {
    const w = WEAPONS[this.current];
    if (!w || w.mag === Infinity) return;
    if (this.mag[this.current] >= w.mag || this.reserve[this.current] <= 0) return;
    if (this.reloadTimer > 0) return;
    this.reloadTimer = 0.85;
    audio.reload();
  }

  tracer(from, to, color = 0xffe9a3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = this.tracerMat.clone();
    if (color !== 0xffe9a3) mat.color.setHex(color);
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  // The player's trigger. origin/dir come from the camera. Returns true
  // when a shot (or a swing) actually happened.
  attack(dt, world, events, origin, dir) {
    void dt; // the cooldown itself ticks in update()
    const name = this.current;
    const w = WEAPONS[name];
    if (this.reloadTimer > 0) return false;
    if (name === "fist") {
      if (this.cooldown > 0) return false;
      this.cooldown = w.rate;
      audio.punch();
      // A swing connects with the nearest person inside arm's reach and
      // roughly in front of the camera.
      let best = null;
      for (const ped of [...world.peds, ...world.cops]) {
        if (ped.down) continue;
        const dx = ped.pos.x - origin.x;
        const dz = ped.pos.z - origin.z;
        const d = Math.hypot(dx, dz);
        if (d < w.range && d > 0.01) {
          const dot = (dx / d) * dir.x + (dz / d) * dir.z;
          if (dot > 0.45 && (!best || d < best.d)) best = { ped, d };
        }
      }
      if (best) {
        best.ped.hurt(w.damage, events, "punch");
        events.push({ type: "punchHit", x: best.ped.pos.x, z: best.ped.pos.z });
        audio.thud();
      } else {
        events.push({ type: "punchAir", x: origin.x + dir.x * 2, z: origin.z + dir.z * 2 });
      }
      return true;
    }
    if (this.cooldown > 0) return false;
    if (this.mag[name] <= 0) {
      this.cooldown = 0.3;
      audio.dryFire();
      this.startReload();
      return false;
    }
    this.cooldown = w.rate;
    this.mag[name]--;
    audio.shot(name);
    events.push({ type: "shot", weapon: name, x: origin.x, z: origin.z });
    for (let p = 0; p < w.pellets; p++) {
      const d = new THREE.Vector3(
        dir.x + (Math.random() - 0.5) * 2 * w.spread,
        dir.y + (Math.random() - 0.5) * 2 * w.spread,
        dir.z + (Math.random() - 0.5) * 2 * w.spread
      ).normalize();
      this.fireRay(world, events, origin, d, w, name);
    }
    if (this.mag[name] <= 0) this.startReload();
    return true;
  }

  fireRay(world, events, origin, dir, w, weaponName) {
    let range = w.range;
    // Buildings cap the ray.
    for (const c of world.colliders) {
      const t = rayAabb(origin, dir, c);
      if (t !== null && t < range) range = t;
    }
    const end = new THREE.Vector3(origin.x + dir.x * range, origin.y + dir.y * range, origin.z + dir.z * range);
    let hitSomething = false;
    // People: a body sphere and a head sphere (head hits count double).
    for (const ped of [...world.peds, ...world.cops]) {
      if (ped.down) continue;
      const bodyC = new THREE.Vector3(ped.pos.x, ped.pos.y + 1.05, ped.pos.z);
      const headC = new THREE.Vector3(ped.pos.x, ped.pos.y + 1.68, ped.pos.z);
      const tBody = raySphere(origin, dir, bodyC, 0.62);
      const tHead = raySphere(origin, dir, headC, 0.3);
      const t = tHead !== null ? tHead : tBody;
      if (t !== null && t <= range) {
        ped.hurt(w.damage * (tHead !== null ? 2 : 1), events, "shot");
        events.push({ type: "pedHit", ped, weapon: weaponName, x: ped.pos.x, z: ped.pos.z });
        hitSomething = true;
      }
    }
    // Cars: a squat cylinder test in the ground plane.
    for (const car of world.cars) {
      const dx = car.pos.x - origin.x;
      const dz = car.pos.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > range) continue;
      const px = origin.x + dir.x * along;
      const pz = origin.z + dir.z * along;
      if (Math.hypot(car.pos.x - px, car.pos.z - pz) < 2.3) {
        car.health = Math.max(0, car.health - w.damage * 0.7);
        events.push({ type: "carShot", car, x: car.pos.x, z: car.pos.z });
        hitSomething = true;
      }
    }
    void hitSomething;
    const muzzle = new THREE.Vector3(origin.x + dir.x * 0.7, origin.y - 0.12, origin.z + dir.z * 0.7);
    this.tracer(muzzle, end, 0xffe9a3);
  }

  // An enemy (gang member or foot cop) fires at a target position.
  enemyShoot(shooter, target, world, events, now) {
    if (shooter.reload > now) return;
    shooter.reload = now + 0.9 + Math.random() * 0.7;
    const from = new THREE.Vector3(shooter.pos.x, shooter.pos.y + 1.35, shooter.pos.z);
    const dist = Math.hypot(target.x - shooter.pos.x, target.z - shooter.pos.z);
    const aim = new THREE.Vector3(
      target.x + (Math.random() - 0.5) * 2.4,
      1.1,
      target.z + (Math.random() - 0.5) * 2.4
    );
    this.tracer(from, aim, 0xff9a7a);
    audio.shot("pistol");
    events.push({ type: "shot", weapon: "pistol", x: shooter.pos.x, z: shooter.pos.z, enemy: true });
    const hitChance = Math.max(0.04, 0.42 - dist * 0.008);
    if (Math.random() < hitChance) {
      events.push({ type: "playerShot", amount: 5 + Math.random() * 6, x: target.x, z: target.z });
    }
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const name = this.current;
        const w = WEAPONS[name];
        if (w && w.mag !== Infinity) {
          const need = w.mag - this.mag[name];
          const take = Math.min(need, this.reserve[name]);
          this.mag[name] += take;
          this.reserve[name] -= take;
        }
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  hudState() {
    const w = WEAPONS[this.current];
    return {
      weapon: w.name,
      mag: w.mag === Infinity ? "—" : this.mag[this.current],
      reserve: w.mag === Infinity ? "—" : this.reserve[this.current],
      reloading: this.reloadTimer > 0,
    };
  }
}

function raySphere(origin, dir, center, radius) {
  const ox = center.x - origin.x;
  const oy = center.y - origin.y;
  const oz = center.z - origin.z;
  const t = ox * dir.x + oy * dir.y + oz * dir.z;
  if (t < 0) return null;
  const px = origin.x + dir.x * t;
  const py = origin.y + dir.y * t;
  const pz = origin.z + dir.z * t;
  const d2 = (center.x - px) ** 2 + (center.y - py) ** 2 + (center.z - pz) ** 2;
  if (d2 > radius * radius) return null;
  return t;
}

function rayAabb(origin, dir, c) {
  // Ground-plane slab test: the shot's height at the box is checked loosely
  // (buildings are tall; a level shot always meets them).
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [origin.x, dir.x, c.x0, c.x1],
    [origin.z, dir.z, c.z0, c.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
