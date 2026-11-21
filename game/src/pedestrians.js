// pedestrians.js — the people of SOLMAR BAY. makeHumanoid builds the
// low-poly walker every person in the game shares (civilians here, gang
// members and foot police in combat.js); the crowd itself walks the
// sidewalk loop of its block, and runs when gunfire or a crash panics it.

import * as THREE from 'three';
import { TUNING, blockCenters } from './config.js';
import { collideCircle } from './city.js';

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x457b9d, 0xf4f1de, 0x9b5de5, 0xef476f, 0x118ab2];
const PANTS = [0x264653, 0x3d405b, 0x606c38, 0x22223b, 0x6d6875];

export function makeHumanoid(rng, palette = {}) {
  const shirt = palette.shirt ?? rng.pick(SHIRTS);
  const pants = palette.pants ?? rng.pick(PANTS);
  const skin = palette.skin ?? rng.pick(SKIN);
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });

  function limb(w, h, d, color, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const legL = limb(0.17, 0.78, 0.17, pants, -0.13, 0.8, 0);
  const legR = limb(0.17, 0.78, 0.17, pants, 0.13, 0.8, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.3), mat(shirt));
  torso.position.y = 1.13;
  torso.castShadow = true;
  group.add(torso);
  if (palette.vest) {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.34), mat(palette.vest));
    vest.position.y = 1.16;
    group.add(vest);
  }
  const armL = limb(0.13, 0.62, 0.13, shirt, -0.35, 1.42, 0);
  const armR = limb(0.13, 0.62, 0.13, shirt, 0.35, 1.42, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), mat(skin));
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  if (palette.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), mat(palette.cap));
    cap.position.y = 1.86;
    group.add(cap);
  }
  return { group, legL, legR, armL, armR };
}

export function animateWalk(parts, phase, amount) {
  const swing = Math.sin(phase) * 0.55 * amount;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8;
  parts.armR.rotation.x = swing * 0.8;
}

export function layDown(parts) {
  parts.group.rotation.x = -Math.PI / 2;
  parts.group.position.y = 0.25;
}

export function createPeds(rng, city) {
  const list = [];
  const group = new THREE.Group();
  const centers = blockCenters();
  const PATH = 17; // sidewalk loop half-extent inside a block

  function cornerOf(block, index) {
    const signs = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const [sx, sz] = signs[index % 4];
    return { x: block.cx + sx * PATH, z: block.cz + sz * PATH };
  }

  function spawnOne() {
    const cx = rng.pick(centers);
    const cz = rng.pick(centers);
    const parts = makeHumanoid(rng);
    const corner = rng.int(0, 3);
    const start = cornerOf({ cx, cz }, corner);
    const ped = {
      kind: 'civilian',
      parts,
      x: start.x,
      z: start.z,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.1, 1.9),
      hp: 100,
      dead: false,
      block: { cx, cz },
      corner: (corner + 1) % 4,
      phase: rng.range(0, 6),
      state: 'walk',
      fleeT: 0,
      fleeFrom: { x: 0, z: 0 },
    };
    parts.group.position.set(ped.x, 0, ped.z);
    group.add(parts.group);
    list.push(ped);
    return ped;
  }

  function update(dt, G) {
    const panic = G.panic;
    for (const ped of list) {
      if (ped.dead) continue;
      if (ped.state === 'walk' && panic && G.time - panic.t < 1.2) {
        const d = Math.hypot(ped.x - panic.x, ped.z - panic.z);
        if (d < 22) {
          ped.state = 'flee';
          ped.fleeT = rng.range(2.5, 4.5);
          ped.fleeFrom = { x: panic.x, z: panic.z };
        }
      }
      let tx;
      let tz;
      let speed = ped.speed;
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        const dx = ped.x - ped.fleeFrom.x;
        const dz = ped.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.x + (dx / d) * 10;
        tz = ped.z + (dz / d) * 10;
        speed = 6.4;
        if (ped.fleeT <= 0) ped.state = 'walk';
      } else {
        const target = cornerOf(ped.block, ped.corner);
        tx = target.x;
        tz = target.z;
        if (Math.hypot(tx - ped.x, tz - ped.z) < 0.8) {
          ped.corner = (ped.corner + 1) % 4;
          continue;
        }
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const dist = Math.hypot(dx, dz) || 1;
      const desired = Math.atan2(dx, dz);
      let turn = desired - ped.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      ped.heading += Math.max(-6 * dt, Math.min(6 * dt, turn));
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      const [nx, nz] = collideCircle(city, ped.x, ped.z, 0.4);
      ped.x = nx;
      ped.z = nz;
      ped.phase += speed * dt * 2.4;
      animateWalk(ped.parts, ped.phase, 1);
      ped.parts.group.position.set(ped.x, 0, ped.z);
      ped.parts.group.rotation.y = ped.heading;
    }
  }

  return {
    group,
    list,
    spawn(count) {
      for (let i = 0; i < count; i++) spawnOne();
    },
    spawnOne,
    update,
    damage(ped, amount) {
      if (ped.dead) return;
      ped.hp -= amount;
      if (ped.hp <= 0) {
        ped.dead = true;
        layDown(ped.parts);
      }
    },
    radius: TUNING.playerRadius,
  };
}
