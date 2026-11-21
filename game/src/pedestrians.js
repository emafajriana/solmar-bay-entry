// SOLMAR BAY — pedestrians: people walking the sidewalks, and the gang
// members the story points at the player.
//
// A walker owns a block and strolls its sidewalk ring, corner to corner.
// Loud trouble nearby — gunfire, a crash, a chase — turns a stroll into a
// run directly away from the noise. Walkers hit by cars or gunfire go
// down; the game above decides what that means (a crime, a knockout, a
// mission objective) through the events this module emits.

import * as THREE from "three";
import { blockMin, BLOCK, GRID, EXTENT } from "./config.js";
import { resolveCollisions } from "./city.js";

const SKIN = [0xf2c79b, 0xd9a066, 0xa9713f, 0x7a4a21, 0xffe0bd];
const SHIRTS = [0xe4572e, 0x2e86ab, 0xf6f7eb, 0xffc53d, 0x71b340, 0x9b5de5, 0xf15bb5, 0x4ecdc4];

export class Ped {
  constructor(scene, rng, { x, z, kind = "walker" }) {
    this.kind = kind; // walker | gang | cop — cops are dressed by police.js
    this.health = kind === "gang" ? 60 : 30;
    this.down = false;
    this.downTimer = 0;
    this.fleeUntil = 0;
    this.fleeFrom = null;
    this.angle = rng.range(0, Math.PI * 2);
    this.speed = 0;
    this.stationary = false;
    this.corner = rng.int(0, 3);
    this.block = [Math.floor(x / 76) % GRID, Math.floor(z / 76) % GRID];
    this.reload = 0;

    const g = new THREE.Group();
    const shirt = kind === "gang" ? 0x8c2b2b : kind === "cop" ? 0x24466e : rng.pick(SHIRTS);
    const skin = rng.pick(SKIN);
    const cloth = new THREE.MeshLambertMaterial({ color: shirt });
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    const legs = new THREE.MeshLambertMaterial({ color: 0x2f3542 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), cloth);
    torso.position.y = 1.06;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
    head.position.y = 1.68;
    g.add(head);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), legs);
    this.legL.position.set(-0.14, 0.36, 0);
    g.add(this.legL);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), legs);
    this.legR.position.set(0.14, 0.36, 0);
    g.add(this.legR);
    const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.16);
    this.armL = new THREE.Mesh(armGeo, cloth);
    this.armL.position.set(-0.34, 1.08, 0);
    g.add(this.armL);
    this.armR = new THREE.Mesh(armGeo, cloth);
    this.armR.position.set(0.34, 1.08, 0);
    g.add(this.armR);
    if (kind === "gang" || kind === "cop") {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x14161a }));
      gun.position.set(0.34, 0.95, 0.25);
      g.add(gun);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    this.mesh = g;
    this.walkPhase = rng.range(0, 6);
  }

  get pos() {
    return this.mesh.position;
  }

  corners() {
    const [i, j] = this.block;
    const x0 = blockMin(i) - 3;
    const z0 = blockMin(j) - 3;
    const x1 = blockMin(i) + BLOCK + 3;
    const z1 = blockMin(j) + BLOCK + 3;
    return [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
    ];
  }

  hurt(amount, events, cause) {
    if (this.down) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.down = true;
      this.downTimer = 7;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
      events.push({ type: "pedDown", ped: this, cause, x: this.pos.x, z: this.pos.z });
    }
  }

  scare(x, z, now, seconds = 4) {
    if (this.down) return;
    const d = Math.hypot(this.pos.x - x, this.pos.z - z);
    if (d < 34) {
      this.fleeUntil = now + seconds;
      this.fleeFrom = { x, z };
    }
  }

  update(dt, world) {
    if (this.down) {
      this.downTimer -= dt;
      return this.downTimer > 0;
    }
    const now = world.time;
    let tx;
    let tz;
    let speed;
    if (this.stationary) {
      speed = 0;
    } else if (this.fleeUntil > now && this.fleeFrom) {
      const dx = this.pos.x - this.fleeFrom.x;
      const dz = this.pos.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = this.pos.x + (dx / d) * 12;
      tz = this.pos.z + (dz / d) * 12;
      speed = 4.4;
    } else {
      const cs = this.corners();
      const target = cs[this.corner];
      tx = target.x;
      tz = target.z;
      speed = 1.45;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 1.2) {
        this.corner = (this.corner + 1) % 4;
      }
    }
    // Sidestep anything with an engine that is bearing down on them.
    for (const car of world.cars) {
      if (Math.abs(car.speed) < 6) continue;
      const dx = this.pos.x - car.pos.x;
      const dz = this.pos.z - car.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 42) {
        const d = Math.sqrt(d2) || 1;
        tx = this.pos.x + (dx / d) * 8;
        tz = this.pos.z + (dz / d) * 8;
        speed = 4.6;
      }
    }
    if (speed > 0) {
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const targetAngle = Math.atan2(dx, dz);
        let diff = targetAngle - this.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
        this.pos.x += Math.sin(this.angle) * speed * dt;
        this.pos.z += Math.cos(this.angle) * speed * dt;
        resolveCollisions(this.pos, 0.45, world.colliders);
        this.pos.x = Math.max(2, Math.min(EXTENT - 2, this.pos.x));
        this.pos.z = Math.max(2, Math.min(EXTENT + 60, this.pos.z));
      }
    }
    this.speed = speed;
    this.walkPhase += dt * (speed > 2 ? 11 : 6.5);
    const swing = Math.sin(this.walkPhase) * (speed > 0 ? 0.5 : 0);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.mesh.rotation.y = this.angle;
    return true;
  }
}

export function spawnPeds(scene, rng, count) {
  const peds = [];
  for (let k = 0; k < count; k++) {
    const i = rng.int(0, GRID - 1);
    const j = rng.int(0, GRID - 1);
    const x = blockMin(i) - 3 + rng.range(0, BLOCK + 6);
    const z = blockMin(j) - 3;
    peds.push(new Ped(scene, rng, { x, z }));
  }
  return peds;
}
