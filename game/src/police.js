// SOLMAR BAY — District Heat, the wanted level, and the Solmar PD.
//
// THE SIGNATURE SYSTEM. The city is six districts and each one keeps its
// own heat, 0 to 100. A crime raises the heat of the district it happens
// in — and only that district. The stars over the player's head are read
// from the heat of the district the player is standing in, so the hunt is
// a property of the map, not of the player: flee a boiling district into
// a cool one and the stars fall, while the district you left stays hot on
// the minimap and keeps its patrols. Every district cools at its own rate
// (Downtown slowest — cameras — the Hills fastest), cooling pauses while
// the police have eyes on the player, and a respray at Shine Auto washes
// the current district clean and halves the rest.
//
// The PD itself: pursuit cars that steer for the player and ram, foot
// cops from two stars who close in and shoot from three, roadblocks
// across the street from four, and a bust meter that fills when a unit is
// on top of a player who has stopped running.

import * as THREE from "three";
import { DISTRICTS, districtAt, starsForHeat, CRIME_HEAT, streetCenter, GRID, EXTENT } from "./config.js";
import { Car } from "./vehicles.js";
import { Ped } from "./pedestrians.js";
import { resolveCollisions } from "./city.js";

const CARS_BY_STARS = [0, 2, 3, 4, 5, 6];
const COPS_BY_STARS = [0, 0, 1, 2, 3, 3];

export class Police {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.heat = new Map(DISTRICTS.map((d) => [d.id, 0]));
    this.lastCrimeAt = new Map(DISTRICTS.map((d) => [d.id, -99]));
    this.cars = [];
    this.cops = [];
    this.blocks = [];
    this.seenAgo = 99; // seconds since any unit last saw the player
    this.bustMeter = 0;
    this.spawnTimer = 0;
    this.stars = 0;
    this.playerDistrict = DISTRICTS[3];
  }

  heatOf(id) {
    return this.heat.get(id) || 0;
  }

  addCrime(kind, x, z, now) {
    const d = districtAt(x, z);
    const add = CRIME_HEAT[kind] || 0;
    if (add > 0) {
      this.heat.set(d.id, Math.min(100, this.heatOf(d.id) + add));
      this.lastCrimeAt.set(d.id, now);
    }
    return d;
  }

  // Manually bleed heat out of the district containing a point — used
  // when the player is properly hidden somewhere the PD cannot reach.
  cool(x, z, amount) {
    const d = districtAt(x, z);
    this.heat.set(d.id, Math.max(0, this.heatOf(d.id) - amount));
  }

  // The Pay'n'Spray wash: this district clean, the rest halved.
  wash(x, z) {
    const here = districtAt(x, z);
    for (const d of DISTRICTS) {
      const h = this.heatOf(d.id);
      this.heat.set(d.id, d.id === here.id ? 0 : h * 0.5);
    }
    this.bustMeter = 0;
  }

  clearAll() {
    for (const d of DISTRICTS) this.heat.set(d.id, 0);
    this.removeUnits();
    this.bustMeter = 0;
    this.stars = 0;
  }

  removeUnits() {
    for (const car of [...this.cars, ...this.blocks]) this.scene.remove(car.mesh);
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cars = [];
    this.blocks = [];
    this.cops = [];
  }

  allCars() {
    return [...this.cars, ...this.blocks];
  }

  spawnPointNear(playerPos, minD, maxD) {
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(minD, maxD);
    let x = playerPos.x + Math.sin(a) * r;
    let z = playerPos.z + Math.cos(a) * r;
    x = Math.max(6, Math.min(EXTENT - 6, x));
    z = Math.max(6, Math.min(EXTENT - 6, z));
    // Snap to the nearest street centre line so units arrive on the road.
    const snap = (v) => streetCenter(Math.max(0, Math.min(GRID, Math.round((v - 8) / 76))));
    if (this.rng.chance(0.5)) x = snap(x);
    else z = snap(z);
    return { x, z };
  }

  update(dt, world, events) {
    const now = world.time;
    const player = world.player;
    const pPos = player.mode === "car" && player.car ? player.car.pos : player.pos;
    this.playerDistrict = districtAt(pPos.x, pPos.z);

    // Eyes on the player?
    let seen = false;
    for (const car of this.cars) {
      if (Math.hypot(car.pos.x - pPos.x, car.pos.z - pPos.z) < 60) seen = true;
    }
    for (const cop of this.cops) {
      if (!cop.down && Math.hypot(cop.pos.x - pPos.x, cop.pos.z - pPos.z) < 45) seen = true;
    }
    this.seenAgo = seen ? 0 : this.seenAgo + dt;

    // Cooling. A district sheds heat once the sirens have been quiet
    // there for a while; the district the player is hiding in cools at
    // half rate while units are near, and not at all under direct gaze.
    for (const d of DISTRICTS) {
      let h = this.heatOf(d.id);
      if (h <= 0) continue;
      if (now - (this.lastCrimeAt.get(d.id) || -99) < 8) continue;
      let rate = d.cool;
      if (d.id === this.playerDistrict.id) {
        if (this.seenAgo < 2.5) rate = 0;
        else if (this.cars.length + this.cops.length > 0) rate *= 0.5;
      }
      this.heat.set(d.id, Math.max(0, h - rate * dt));
    }

    this.stars = starsForHeat(this.heatOf(this.playerDistrict.id));
    if (world.stats) world.stats.topStars = Math.max(world.stats.topStars, this.stars);

    // Radio ahead: while a chase is live, the district the player has run
    // into warms slowly — the PD is not stupid, just slower than a car.
    if (this.stars === 0 && this.seenAgo < 1 && this.cars.length > 0) {
      const d = this.playerDistrict;
      this.heat.set(d.id, Math.min(30, this.heatOf(d.id) + 5.5 * dt));
    }

    this.spawnTimer -= dt;
    // Spawn and retire pursuit cars.
    const wantCars = CARS_BY_STARS[this.stars];
    if (this.cars.length < wantCars && this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      const s = this.spawnPointNear(pPos, 85, 130);
      const car = new Car(this.scene, { kind: "police", color: 0x1d2733, x: s.x, z: s.z, angle: this.rng.range(0, 6.28), mode: "police" });
      this.cars.push(car);
      world.cars.push(car);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const d = Math.hypot(car.pos.x - pPos.x, car.pos.z - pPos.z);
      if ((d > 300 && this.stars === 0) || d > 420 || car.health <= 0) {
        this.scene.remove(car.mesh);
        this.cars.splice(i, 1);
        const wi = world.cars.indexOf(car);
        if (wi >= 0) world.cars.splice(wi, 1);
      }
    }
    // Foot cops.
    const wantCops = COPS_BY_STARS[this.stars];
    if (this.cops.length < wantCops && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const s = this.spawnPointNear(pPos, 38, 60);
      const cop = new Ped(this.scene, this.rng, { x: s.x, z: s.z, kind: "cop" });
      cop.stationary = true;
      this.cops.push(cop);
      world.cops.push(cop);
    }
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      const d = Math.hypot(cop.pos.x - pPos.x, cop.pos.z - pPos.z);
      if (d > 320 || (cop.down && cop.downTimer <= 0)) {
        this.scene.remove(cop.mesh);
        this.cops.splice(i, 1);
        const wi = world.cops.indexOf(cop);
        if (wi >= 0) world.cops.splice(wi, 1);
      }
    }
    // Roadblocks from four stars: two cars across the street ahead.
    if (this.stars >= 4 && this.blocks.length === 0 && this.seenAgo < 30) {
      const ahead = 55;
      const fx = Math.sin(player.angle);
      const fz = Math.cos(player.angle);
      const bx = Math.max(10, Math.min(EXTENT - 10, pPos.x + fx * ahead));
      const bz = Math.max(10, Math.min(EXTENT - 10, pPos.z + fz * ahead));
      for (const off of [-3.4, 3.4]) {
        const car = new Car(this.scene, {
          kind: "police",
          color: 0x1d2733,
          x: bx + Math.cos(player.angle) * off,
          z: bz - Math.sin(player.angle) * off,
          angle: player.angle + Math.PI / 2,
          mode: "parked",
        });
        this.blocks.push(car);
        world.cars.push(car);
      }
    }
    if (this.stars < 4 && this.blocks.length > 0) {
      for (const car of this.blocks) {
        this.scene.remove(car.mesh);
        const wi = world.cars.indexOf(car);
        if (wi >= 0) world.cars.splice(wi, 1);
      }
      this.blocks = [];
    }

    // Drive the pursuit.
    for (const car of this.cars) {
      if (car.health <= 0) {
        car.speed = Math.max(0, car.speed - 18 * dt);
        continue;
      }
      const dx = pPos.x - car.pos.x;
      const dz = pPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      let throttle = 1;
      let steer = Math.max(-1, Math.min(1, diff * 1.9));
      if (Math.abs(diff) > 2.5 && car.speed > 6) throttle = -0.7; // overshot: brake and swing round
      if (dist < 7) throttle = 0.25;
      if (car.reverseTimer > 0) {
        car.reverseTimer -= dt;
        throttle = -1;
        steer = -steer;
      } else if (Math.abs(car.speed) < 0.6 && throttle > 0) {
        car.stuckTime = (car.stuckTime || 0) + dt;
        if (car.stuckTime > 1.1) {
          car.reverseTimer = 0.65;
          car.stuckTime = 0;
        }
      } else {
        car.stuckTime = 0;
      }
      car.drive(dt, throttle, steer, false);
    }

    // Foot cops close in, keep a firing distance, and shoot from 3 stars.
    for (const cop of this.cops) {
      if (cop.down) {
        cop.downTimer -= dt;
        continue;
      }
      const dx = pPos.x - cop.pos.x;
      const dz = pPos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - cop.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.angle += Math.max(-4 * dt, Math.min(4 * dt, diff));
      if (dist > 9) {
        const speed = 4.6;
        cop.pos.x += Math.sin(cop.angle) * speed * dt;
        cop.pos.z += Math.cos(cop.angle) * speed * dt;
        resolveCollisions(cop.pos, 0.45, world.colliders);
        cop.walkPhase += dt * 10;
      }
      const swing = Math.sin(cop.walkPhase) * 0.5;
      cop.legL.rotation.x = swing;
      cop.legR.rotation.x = -swing;
      cop.mesh.rotation.y = cop.angle;
      if (this.stars >= 3 && dist < 30 && !world.noEnemyFire) {
        world.combat.enemyShoot(cop, { x: pPos.x, z: pPos.z }, world, events, now);
      }
    }

    // The bust meter: a unit on top of a player who has stopped moving.
    let pressure = false;
    if (!player.dead) {
      if (player.mode === "foot") {
        for (const cop of this.cops) {
          if (!cop.down && Math.hypot(cop.pos.x - pPos.x, cop.pos.z - pPos.z) < 3.4) pressure = true;
        }
        for (const car of this.cars) {
          if (Math.hypot(car.pos.x - pPos.x, car.pos.z - pPos.z) < 4.6) pressure = true;
        }
        if (pressure) this.bustMeter += dt / 1.7;
      } else if (player.car) {
        for (const car of this.cars) {
          if (Math.hypot(car.pos.x - pPos.x, car.pos.z - pPos.z) < 5.2 && Math.abs(player.car.speed) < 1.6) pressure = true;
        }
        if (pressure) this.bustMeter += dt / 2.3;
      }
    }
    if (!pressure) this.bustMeter = Math.max(0, this.bustMeter - dt * 0.7);
    if (this.bustMeter >= 1 && !world.noBust) {
      this.bustMeter = 0;
      events.push({ type: "busted" });
    }
  }
}
