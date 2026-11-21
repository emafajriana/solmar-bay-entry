// pedestrians.js — people: the low-poly humanoid every body in the game
// shares, and the Ped brain that walks them around the block, runs them
// away from trouble, or (for the Tiburones and the PD) points them at the
// player. Combat maths lives in combat.js; a Ped only moves, animates,
// takes damage and falls down.

import * as THREE from 'three';
import { GRID, BLOCK_CENTRES } from './config.js';
import { collideCircle } from './city.js';

const SKIN = [0xe8b98d, 0xc98a5e, 0x8a5a34, 0xf0c8a0, 0x6e4525];
const SHIRT = [0xd95f43, 0x3f7fbf, 0xf2e3c9, 0x59a96a, 0xe0a83c, 0x8a6fc9, 0x3aa6a0, 0xd9d9d9];
const PANTS = [0x35455e, 0x5e4632, 0x22242a, 0x746a58, 0x405a3a];

const GEO = {
  torso: new THREE.BoxGeometry(0.52, 0.62, 0.28),
  head: new THREE.BoxGeometry(0.3, 0.34, 0.3),
  arm: new THREE.BoxGeometry(0.15, 0.58, 0.15),
  leg: new THREE.BoxGeometry(0.19, 0.62, 0.19),
  hat: new THREE.BoxGeometry(0.36, 0.09, 0.36),
};
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

// A person, ~1.8 m tall, origin at the feet. Limbs pivot at shoulder/hip
// so the walk cycle is four rotations and nothing more.
export function makeHumanoid(rng, outfit = {}) {
  const skin = mat(outfit.skin ?? rng.pick(SKIN));
  const shirt = mat(outfit.shirt ?? rng.pick(SHIRT));
  const pants = mat(outfit.pants ?? rng.pick(PANTS));
  const grp = new THREE.Group();

  const torso = new THREE.Mesh(GEO.torso, shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  grp.add(torso);
  const head = new THREE.Mesh(GEO.head, skin);
  head.position.y = 1.62;
  head.castShadow = true;
  grp.add(head);
  if (outfit.hat) {
    const hat = new THREE.Mesh(GEO.hat, mat(outfit.hat));
    hat.position.y = 1.83;
    grp.add(hat);
  }
  const limb = (geo, material, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = -geo.parameters.height / 2 + 0.04;
    mesh.castShadow = true;
    pivot.add(mesh);
    grp.add(pivot);
    return pivot;
  };
  const armL = limb(GEO.arm, shirt, -0.34, 1.4);
  const armR = limb(GEO.arm, shirt, 0.34, 1.4);
  const legL = limb(GEO.leg, pants, -0.14, 0.82);
  const legR = limb(GEO.leg, pants, 0.14, 0.82);
  return { grp, armL, armR, legL, legR, head, torso };
}

export function animateHumanoid(body, phase, amount) {
  const s = Math.sin(phase) * 0.55 * amount;
  body.legL.rotation.x = s;
  body.legR.rotation.x = -s;
  body.armL.rotation.x = -s * 0.8;
  body.armR.rotation.x = s * 0.8;
}

let pedSeq = 0;

export class Ped {
  constructor(scene, rng, { role = 'civil', x = 0, z = 0, outfit = null, home = null } = {}) {
    this.id = ++pedSeq;
    this.role = role;
    this.body = makeHumanoid(rng, outfit ?? {});
    this.grp = this.body.grp;
    this.grp.position.set(x, 0, z);
    scene.add(this.grp);
    this.pos = this.grp.position;
    this.angle = rng.range(0, Math.PI * 2);
    this.speed = 0;
    this.walkSpeed = rng.bell(1.1, 1.7);
    this.health = role === 'gang' ? 80 : 100;
    this.dead = false;
    this.deathT = 0;
    this.state = role === 'civil' ? 'walk' : 'stand';
    this.phase = rng.range(0, 6);
    this.shootCd = rng.range(0.4, 1.4);
    this.home = home ?? { x, z };
    this.fleeUntil = 0;
    this.waypoint = null;
    this.pickWaypoint(rng);
  }

  // Civilians walk the pavement ring around a block, corner to corner.
  pickWaypoint(rng) {
    const cx = BLOCK_CENTRES.reduce((a, b) => (Math.abs(b - this.pos.x) < Math.abs(a - this.pos.x) ? b : a));
    const cz = BLOCK_CENTRES.reduce((a, b) => (Math.abs(b - this.pos.z) < Math.abs(a - this.pos.z) ? b : a));
    const r = GRID.lotHalf + 2.3;
    const corners = [
      [cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r],
    ];
    // usually the next corner round the block; sometimes cross the street
    if (rng.chance(0.22)) {
      const nx = cx + rng.pick([-GRID.pitch, 0, GRID.pitch]);
      const nz = cz + rng.pick([-GRID.pitch, 0, GRID.pitch]);
      this.waypoint = { x: nx + rng.pick([-r, r]), z: nz + rng.pick([-r, r]) };
    } else {
      const [wx, wz] = rng.pick(corners);
      this.waypoint = { x: wx, z: wz };
    }
  }

  fleeFrom(x, z, now) {
    if (this.role !== 'civil' || this.dead) return;
    this.state = 'flee';
    this.fleeUntil = now + 3.2;
    this.fleeDir = Math.atan2(this.pos.x - x, this.pos.z - z);
  }

  damage(amount) {
    if (this.dead) return true;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.deathT = 0;
      return true;
    }
    return false;
  }

  update(dt, G) {
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.45);
      this.grp.rotation.x = -Math.PI / 2 * k;
      this.grp.position.y = 0.12 * k;
      return;
    }
    const rng = G.rng;
    let moveX = 0, moveZ = 0, wantSpeed = 0;

    if (this.state === 'flee') {
      if (G.time > this.fleeUntil) { this.state = 'walk'; this.pickWaypoint(rng); }
      else {
        moveX = Math.sin(this.fleeDir); moveZ = Math.cos(this.fleeDir);
        wantSpeed = 5.6;
      }
    } else if (this.role === 'civil') {
      if (!this.waypoint) this.pickWaypoint(rng);
      const dx = this.waypoint.x - this.pos.x, dz = this.waypoint.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.1) this.pickWaypoint(rng);
      else { moveX = dx / dist; moveZ = dz / dist; wantSpeed = this.walkSpeed; }
    } else if (this.role === 'gang') {
      const dx = G.playerPos.x - this.pos.x, dz = G.playerPos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      this.angle = Math.atan2(dx, dz);
      if (this.state === 'fight') {
        if (dist > 19) { moveX = dx / dist; moveZ = dz / dist; wantSpeed = 3.4; }
        else if (dist < 8) { moveX = -dx / dist; moveZ = -dz / dist; wantSpeed = 2.2; }
        else {
          // strafe slowly sideways to feel alive between shots
          moveX = Math.cos(this.angle) * 0.4; moveZ = -Math.sin(this.angle) * 0.4;
          wantSpeed = 1.1;
        }
      }
    } else if (this.role === 'cop') {
      const dx = G.playerPos.x - this.pos.x, dz = G.playerPos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      this.angle = Math.atan2(dx, dz);
      if (this.state === 'chase' && dist > 1.5) {
        moveX = dx / dist; moveZ = dz / dist;
        wantSpeed = dist > 14 ? 6.4 : 4.9;
      }
    }

    this.speed += (wantSpeed - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.05) {
      if (wantSpeed > 0) this.angle = Math.atan2(moveX, moveZ);
      this.pos.x += Math.sin(this.angle) * this.speed * dt;
      this.pos.z += Math.cos(this.angle) * this.speed * dt;
      collideCircle(this.pos, 0.4, G.colliders);
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -196, 196);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -196, 292);
      this.phase += dt * this.speed * 2.4;
    }
    this.grp.rotation.y = this.angle;
    animateHumanoid(this.body, this.phase, THREE.MathUtils.clamp(this.speed / 2.4, 0, 1));
    // an armed ped holds the right arm out toward the player
    if ((this.role === 'gang' && this.state === 'fight') || (this.role === 'cop' && this.state === 'shoot')) {
      this.body.armR.rotation.x = -Math.PI / 2 + 0.12;
    }
  }

  dispose(scene) {
    scene.remove(this.grp);
  }
}

// The standing crowd: civilians scattered over the pavements at boot.
export function spawnCrowd(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const cx = rng.pick(BLOCK_CENTRES), cz = rng.pick(BLOCK_CENTRES);
    const r = GRID.lotHalf + 2.3;
    const x = cx + rng.pick([-r, r]) + rng.range(-2, 2);
    const z = cz + rng.range(-r, r);
    peds.push(new Ped(scene, rng, { role: 'civil', x, z }));
  }
  return peds;
}
