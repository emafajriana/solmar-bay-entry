// Pedestrians: walkers on the sidewalks who stroll between intersections
// and flee from gunshots, crashes and high wanted levels. Simple, original
// characters in varied shirt colours.

import * as THREE from 'three';
import { ROAD_LINES } from './config.js';
import { pick, range } from './rng.js';

const SHIRTS = [0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00cec9];

export function makePedMesh(color) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.35), shirt);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.55;
  group.add(head);
  for (const sx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), new THREE.MeshLambertMaterial({ color: 0x333a44 }));
    leg.position.set(sx, 0.3, 0);
    group.add(leg);
  }
  return group;
}

export function spawnPedestrians(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = makePedMesh(pick(rng, SHIRTS));
    const x = pick(rng, ROAD_LINES) + (rng() < 0.5 ? 8.5 : -8.5);
    const z = range(rng, -180, 180);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z, hp: 50, alive: true, fleeing: false, fleeTimer: 0,
      targetX: x, targetZ: range(rng, -180, 180), speed: range(rng, 1.2, 2.2),
      panic: 0,
    });
  }
  return peds;
}

function pickTarget(ped, rng) {
  ped.targetX = pick(rng, ROAD_LINES) + (rng() < 0.5 ? 8.5 : -8.5);
  ped.targetZ = range(rng, -180, 180);
}

export function updatePedestrians(peds, dt, rng, danger) {
  // danger: {x, z, radius} of the latest gunshot / crash, or null.
  for (const ped of peds) {
    if (!ped.alive) continue;
    if (danger) {
      const d = Math.hypot(ped.x - danger.x, ped.z - danger.z);
      if (d < danger.radius) { ped.fleeing = true; ped.fleeTimer = 3; }
    }
    let speed = ped.speed;
    let tx = ped.targetX;
    let tz = ped.targetZ;
    if (ped.fleeing) {
      ped.fleeTimer -= dt;
      speed = 5.5;
      // Run away from the danger point.
      const dx = ped.x - (danger ? danger.x : ped.x);
      const dz = ped.z - (danger ? danger.z : ped.z);
      const len = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / len) * 40;
      tz = ped.z + (dz / len) * 40;
      if (ped.fleeTimer <= 0) ped.fleeing = false;
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      if (!ped.fleeing) pickTarget(ped, rng);
      continue;
    }
    ped.x += (dx / dist) * speed * dt;
    ped.z += (dz / dist) * speed * dt;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = Math.atan2(dx, dz);
  }
}

export function nearestPed(player, peds, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const ped of peds) {
    if (!ped.alive) continue;
    const d = Math.hypot(ped.x - player.x, ped.z - player.z);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}
