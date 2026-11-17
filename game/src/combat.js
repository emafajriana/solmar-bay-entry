// Combat: hitscan weapons, tracers, enemy gangsters (Los Tiburones),
// punch, health regen out of combat, and the hospital. Enemies are
// spawned by missions; they advance on the player and shoot back.

import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { addWanted } from './police.js';

export function createCombat(scene) {
  return { scene, bullets: [], shootTimer: 0, tracers: [] };
}

export function spawnEnemy(scene, rng, x, z) {
  const group = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0x8a1a1a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), red);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshLambertMaterial({ color: 0xb98a5e }));
  head.position.y = 1.72;
  group.add(head);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  band.position.y = 1.9;
  group.add(band);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  gun.position.set(0.3, 1.1, 0.4);
  group.add(gun);
  group.position.set(x, 0, z);
  scene.add(group);
  return { mesh: group, x, z, hp: 60, alive: true, shootTimer: 1 + rng() * 1.5, speed: 3.2 };
}

function addTracer(combat, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe066 }));
  combat.scene.add(line);
  combat.tracers.push({ line, life: 0.08 });
}

export function shoot(state, combat, audio) {
  const p = state.player;
  if (!p.onFoot || p.hp <= 0) return;
  const weapon = WEAPONS[p.weapon];
  if (combat.shootTimer > 0) return;
  if (p.ammo <= 0) {
    state.message = 'Out of ammo — buy more at GUN RUNNER (E near the shop).';
    combat.shootTimer = 0.3;
    return;
  }
  combat.shootTimer = weapon.rate;
  p.ammo -= 1;
  audio.gunshot();
  const origin = { x: p.x, y: p.y + 1.4, z: p.z };
  const yaw = p.yaw;
  const pellets = weapon.pellets || 1;
  let hitSomething = false;
  for (let i = 0; i < pellets; i += 1) {
    const spread = (Math.random() - 0.5) * weapon.spread * 2;
    const dirX = Math.sin(yaw + spread);
    const dirZ = Math.cos(yaw + spread);
    const end = { x: origin.x + dirX * weapon.range, y: origin.y, z: origin.z + dirZ * weapon.range };
    // Hit the nearest enemy / ped / police cop along the ray (2D distance to ray).
    let best = null;
    let bestT = weapon.range;
    const targets = [];
    for (const e of state.enemies) if (e.alive) targets.push({ obj: e, kind: 'enemy' });
    for (const ped of state.peds) if (ped.alive) targets.push({ obj: ped, kind: 'ped' });
    for (const cop of state.police.cops) if (cop.alive) targets.push({ obj: cop, kind: 'cop' });
    for (const t of targets) {
      const rx = t.obj.x - origin.x;
      const rz = t.obj.z - origin.z;
      const along = rx * dirX + rz * dirZ;
      if (along < 0 || along > weapon.range) continue;
      const perp = Math.abs(rx * dirZ - rz * dirX);
      if (perp < 1.2 && along < bestT) { bestT = along; best = t; }
    }
    if (best) {
      hitSomething = true;
      end.x = origin.x + dirX * bestT;
      end.z = origin.z + dirZ * bestT;
      best.obj.hp -= weapon.damage;
      if (best.kind === 'enemy' && best.obj.hp <= 0) {
        best.obj.alive = false;
        best.obj.mesh.visible = false;
        state.stats.kills += 1;
        state.player.cash += 25;
        state.message = 'Tiburones down — $25 picked up.';
      } else if (best.kind === 'ped' && best.obj.hp <= 0) {
        best.obj.alive = false;
        best.obj.mesh.visible = false;
        addWanted(state, 2, 'You killed a pedestrian — +2 stars!');
      } else if (best.kind === 'cop' && best.obj.hp <= 0) {
        best.obj.alive = false;
        best.obj.mesh.visible = false;
        addWanted(state, 2, 'You shot a cop — +2 stars!');
      }
    }
    addTracer(combat, origin, end);
  }
  if (hitSomething) state.lastShotAt = state.time;
  // Shooting near police draws attention.
  const px = p.x;
  const pz = p.z;
  const nearCop = state.police.cars.some((c) => !c.dead && Math.hypot(c.x - px, c.z - pz) < 35)
    || state.police.cops.some((c) => c.alive && Math.hypot(c.x - px, c.z - pz) < 35);
  if (nearCop && state.wanted < 5) addWanted(state, 1, 'Shots fired near police — +1 star!');
  state.danger = { x: px, z: pz, radius: 30 };
}

export function punch(state, audio) {
  const p = state.player;
  if (!p.onFoot || p.punchTimer > 0) return;
  p.punchTimer = 0.45;
  audio.punch();
  // Hit the nearest ped / enemy / cop in front of the player.
  const targets = [];
  for (const e of state.enemies) if (e.alive) targets.push(e);
  for (const ped of state.peds) if (ped.alive) targets.push(ped);
  for (const cop of state.police.cops) if (cop.alive) targets.push(cop);
  let best = null;
  let bestD = 2.4;
  for (const t of targets) {
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return;
  best.hp -= 25;
  const isEnemy = state.enemies.includes(best);
  if (!isEnemy) addWanted(state, 1, 'You hit a pedestrian — +1 star!');
  if (best.hp <= 0) {
    best.alive = false;
    best.mesh.visible = false;
    if (isEnemy) {
      state.stats.kills += 1;
      state.player.cash += 25;
    } else {
      addWanted(state, 1, 'You killed a pedestrian — +1 more star!');
    }
  }
  state.danger = { x: p.x, z: p.z, radius: 15 };
}

export function updateCombat(state, combat, dt, audio) {
  if (combat.shootTimer > 0) combat.shootTimer -= dt;
  for (const t of combat.tracers) {
    t.life -= dt;
    if (t.life <= 0) {
      combat.scene.remove(t.line);
      t.line.geometry.dispose();
    }
  }
  combat.tracers = combat.tracers.filter((t) => t.life > 0);
  // Enemies advance and shoot back.
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = px - e.x;
    const dz = pz - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist > 6) {
      e.x += (dx / dist) * e.speed * dt;
      e.z += (dz / dist) * e.speed * dt;
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = Math.atan2(dx, dz);
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && dist < 45) {
      e.shootTimer = 1.6 + Math.random() * 1.2;
      audio.gunshot();
      addTracer(combat, { x: e.x, y: 1.4, z: e.z }, { x: px, y: 1.2, z: pz });
      if (Math.random() < 0.55) {
        if (p.onFoot) {
          p.hp -= 7;
          p.hurtTimer = 0.4;
        } else if (p.car) {
          p.car.health -= 5;
        }
        state.lastShotAt = state.time;
      }
    }
  }
  // Slow health regen out of combat (10 s since last damage).
  if (p.onFoot && p.hp > 0 && p.hp < 100 && state.time - (state.lastHurtAt || 0) > 10) {
    p.hp = Math.min(100, p.hp + 4 * dt);
  }
}
