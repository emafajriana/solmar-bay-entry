// police.js — District Heat, the wanted level, and the Solmar PD.
//
// THE SIGNATURE SYSTEM. The city is six districts and each keeps its own
// heat, 0-100. A crime warms the district it happened in — nowhere else.
// Your stars are read from the heat of the district you are standing in,
// so the map itself is the wanted system: flee somewhere quiet and the
// stars fall off you while the hot district stays hot, patrolled and red
// on the minimap. Districts cool at their own rates once they have been
// quiet a while, unless the PD currently has eyes on you there.
//
// The PD itself: pursuit cars that ram, foot cops who deploy from stopped
// cars and arrest by proximity (or shoot from three stars), and
// roadblocks across the road ahead at four stars and up.

import * as THREE from 'three';
import { DISTRICTS, CRIME_HEAT, TUNING, starsForHeat, districtAt, ROAD_LINES } from './config.js';
import { Ped } from './pedestrians.js';

const COP_OUTFIT = { shirt: 0x27354d, pants: 0x1d2735, skin: 0xc98a5e, hat: 0x1d2735 };

export class PoliceSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.heat = new Map();
    for (const d of DISTRICTS) this.heat.set(d.id, { value: 0, lastCrime: -99 });
    this.stars = 0;
    this.playerDistrict = DISTRICTS[5];
    this.bust = 0;
    this.footCops = [];
    this.roadblocks = [];
    this.spawnTimer = 0;
    this.copTimer = 0;
  }

  heatOf(district) { return this.heat.get(district.id); }

  // A crime warms only its own district. Shots only count when a unit is
  // close enough to hear them — firing in an empty district is free.
  reportCrime(kind, x, z, G) {
    if (kind === 'shotsHeard' && this.nearestUnitDistance(x, z, G) > 36) return false;
    const d = districtAt(x, z);
    const h = this.heatOf(d);
    h.value = Math.min(100, h.value + (CRIME_HEAT[kind] ?? 0));
    h.lastCrime = G.time;
    return true;
  }

  nearestUnitDistance(x, z, G) {
    let best = Infinity;
    for (const car of G.cars) {
      if (car.role !== 'police') continue;
      best = Math.min(best, Math.hypot(car.pos.x - x, car.pos.z - z));
    }
    for (const cop of this.footCops) {
      if (cop.dead) continue;
      best = Math.min(best, Math.hypot(cop.pos.x - x, cop.pos.z - z));
    }
    return best;
  }

  eyesOnPlayer(G) {
    return this.nearestUnitDistance(G.playerPos.x, G.playerPos.z, G) < 32;
  }

  washDistrict(d) {
    for (const district of DISTRICTS) {
      const h = this.heatOf(district);
      h.value = district.id === d.id ? 0 : h.value * 0.5;
    }
  }

  afterArrest() {
    for (const district of DISTRICTS) this.heatOf(district).value *= 0.35;
    this.bust = 0;
  }

  clearUnits(G) {
    for (const car of [...G.cars]) {
      if (car.role === 'police' || car.role === 'blockade') G.fleet.remove(car);
    }
    for (const cop of this.footCops) {
      const i = G.peds.indexOf(cop);
      if (i !== -1) G.peds.splice(i, 1);
      cop.dispose(this.scene);
    }
    this.footCops.length = 0;
    this.roadblocks.length = 0;
  }

  ringSpawnPoint(G, dist) {
    const a = this.rng.range(0, Math.PI * 2);
    let x = G.playerPos.x + Math.sin(a) * dist;
    let z = G.playerPos.z + Math.cos(a) * dist;
    // snap to the nearest road so cars arrive on streets, not through lots
    if (this.rng.chance(0.5)) x = ROAD_LINES.reduce((p, c) => (Math.abs(c - x) < Math.abs(p - x) ? c : p));
    else z = ROAD_LINES.reduce((p, c) => (Math.abs(c - z) < Math.abs(p - z) ? c : p));
    x = THREE.MathUtils.clamp(x, -178, 178);
    z = THREE.MathUtils.clamp(z, -178, 226);
    return { x, z };
  }

  update(dt, G) {
    const pd = districtAt(G.playerPos.x, G.playerPos.z);
    this.playerDistrict = pd;
    const myHeat = this.heatOf(pd);
    this.stars = starsForHeat(myHeat.value);
    const eyes = this.eyesOnPlayer(G);

    // the PD radios ahead: while a chase is live the district you are in
    // keeps warming, so circling one block never shakes them
    if (this.stars >= 2 && eyes) {
      myHeat.value = Math.min(100, myHeat.value + TUNING.chaseSpill * dt);
      myHeat.lastCrime = G.time;
    }
    // cooling: a district cools once quiet, unless it is yours and watched
    for (const d of DISTRICTS) {
      const h = this.heatOf(d);
      if (h.value <= 0) continue;
      if (G.time - h.lastCrime < TUNING.quietBeforeCooling) continue;
      if (d.id === pd.id && eyes) continue;
      h.value = Math.max(0, h.value - d.cool * dt);
    }
    this.stars = starsForHeat(this.heatOf(pd).value);

    // ---- pursuit cars ----
    const wantCars = [0, 1, 2, 3, 4, 5][this.stars];
    const copCars = G.cars.filter((c) => c.role === 'police');
    this.spawnTimer -= dt;
    if (copCars.length < wantCars && this.spawnTimer <= 0) {
      const p = this.ringSpawnPoint(G, this.rng.range(52, 68));
      G.fleet.spawnPolice(p.x, p.z);
      this.spawnTimer = 1.4;
    }
    for (const car of copCars) {
      const d = Math.hypot(car.pos.x - G.playerPos.x, car.pos.z - G.playerPos.z);
      if (d > 150 && copCars.length > wantCars) G.fleet.remove(car);
      else if (car.health <= 0 && !car.dead) { car.dead = true; }
    }

    // ---- foot cops: deploy from stopped pursuit cars, or walk in ----
    const wantCops = this.stars >= 2 ? Math.min(2 + (this.stars - 2) * 2, 6) : 0;
    const liveCops = this.footCops.filter((c) => !c.dead);
    for (const car of copCars) {
      if (car.deployed || this.stars < 2) continue;
      const d = Math.hypot(car.pos.x - G.playerPos.x, car.pos.z - G.playerPos.z);
      if (d < 8 && Math.abs(car.speed) < 1.6 && liveCops.length < wantCops) {
        car.deployed = true;
        for (let i = 0; i < 2 && liveCops.length < wantCops; i++) {
          const cop = new Ped(this.scene, this.rng, {
            role: 'cop', x: car.pos.x + this.rng.range(-1.5, 1.5), z: car.pos.z + this.rng.range(-1.5, 1.5),
            outfit: COP_OUTFIT,
          });
          cop.state = 'chase';
          this.footCops.push(cop);
          G.peds.push(cop);
          liveCops.push(cop);
        }
      }
    }
    this.copTimer -= dt;
    if (liveCops.length < wantCops && this.copTimer <= 0 && !G.playerInCar) {
      const p = this.ringSpawnPoint(G, this.rng.range(26, 34));
      const cop = new Ped(this.scene, this.rng, { role: 'cop', x: p.x, z: p.z, outfit: COP_OUTFIT });
      cop.state = 'chase';
      this.footCops.push(cop);
      G.peds.push(cop);
      this.copTimer = 2.2;
    }
    // cops switch between chasing and shooting stances
    for (const cop of liveCops) {
      const d = Math.hypot(cop.pos.x - G.playerPos.x, cop.pos.z - G.playerPos.z);
      if (this.stars >= 3 && d < 27 && !G.playerInCar) cop.state = 'shoot';
      else cop.state = 'chase';
    }
    // arrest by proximity: stand next to a cop too long and you are done
    if (!G.playerInCar && this.stars > 0) {
      const near = liveCops.some((cop) => Math.hypot(cop.pos.x - G.playerPos.x, cop.pos.z - G.playerPos.z) < 1.8);
      if (near) {
        this.bust += dt / TUNING.bustSeconds;
        if (this.bust >= 1) { this.bust = 0; G.onBusted(); }
      } else {
        this.bust = Math.max(0, this.bust - dt * 0.7);
      }
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.7);
    }

    // ---- roadblocks at four stars: two cars across the road ahead ----
    if (this.stars >= 4 && this.roadblocks.length === 0) {
      const ahead = 46;
      const fx = G.playerInCar ? Math.sin(G.playerCar.angle) : Math.sin(G.player.angle);
      const fz = G.playerInCar ? Math.cos(G.playerCar.angle) : Math.cos(G.player.angle);
      const bx = THREE.MathUtils.clamp(G.playerPos.x + fx * ahead, -176, 176);
      const bz = THREE.MathUtils.clamp(G.playerPos.z + fz * ahead, -176, 224);
      const snapX = Math.abs(fx) < Math.abs(fz);
      const rx = snapX ? ROAD_LINES.reduce((p, c) => (Math.abs(c - bx) < Math.abs(p - bx) ? c : p)) : bx;
      const rz = snapX ? bz : ROAD_LINES.reduce((p, c) => (Math.abs(c - bz) < Math.abs(p - bz) ? c : p));
      for (const off of [-2.6, 2.6]) {
        const car = G.fleet.spawnPolice(snapX ? rx + off : rx, snapX ? rz : rz + off);
        car.role = 'blockade';
        car.angle = snapX ? Math.PI / 2 + 0.35 : 0.35;
        this.roadblocks.push(car);
      }
    }
    if (this.stars < 4 || (this.roadblocks.length && Math.hypot(
      this.roadblocks[0].pos.x - G.playerPos.x, this.roadblocks[0].pos.z - G.playerPos.z) > 90)) {
      for (const car of this.roadblocks) G.fleet.remove(car);
      this.roadblocks.length = 0;
    }
  }
}
