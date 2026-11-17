// Wanted level + Solmar PD pursuit. Stars rise on crime and decay after
// ~20 s with no crime and no police in sight. Police cars spawn and chase
// / ram the player; foot cops join at 2+ stars; roadblocks form at 4+.
// Busted = a cop gets close on foot while wanted; Wasted = health hits 0.

import { WANTED } from './config.js';
import { spawnCar } from './vehicles.js';

export function createPolice(scene) {
  return { cars: [], cops: [], scene, spawnTimer: 0, copTimer: 0 };
}

export function addWanted(state, amount, reason) {
  const before = state.wanted;
  state.wanted = Math.min(WANTED.max, state.wanted + amount);
  state.wantedTimer = 0;
  state.lastCrimeAt = state.time;
  if (state.wanted > before) state.message = reason || `Wanted level ${state.wanted} — Solmar PD is on you!`;
  return state.wanted;
}

export function clearWanted(state) {
  state.wanted = 0;
  state.wantedTimer = 0;
  for (const car of state.police.cars) {
    car.dead = true;
    car.mesh.visible = false;
  }
  state.police.cars = [];
  for (const cop of state.police.cops) {
    cop.alive = false;
    cop.mesh.visible = false;
  }
  state.police.cops = [];
}

function spawnPoliceCar(state, rng) {
  const p = state.player;
  const angle = rng() * Math.PI * 2;
  const x = p.onFoot ? p.x : p.car.x;
  const z = p.onFoot ? p.z : p.car.z;
  const car = spawnCar(state.police.scene, rng,
    x + Math.sin(angle) * 55, z + Math.cos(angle) * 55, angle, { police: true });
  car.speed = 18;
  state.police.cars.push(car);
  return car;
}

export function updatePolice(state, dt, rng) {
  const police = state.police;
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;

  // Decay: 20 s clean and no police within 40 m.
  if (state.wanted > 0) {
    const nearPolice = police.cars.some((c) => !c.dead && Math.hypot(c.x - px, c.z - pz) < 40)
      || police.cops.some((c) => c.alive && Math.hypot(c.x - px, c.z - pz) < 40);
    if (!nearPolice && state.time - state.lastCrimeAt > WANTED.decaySeconds) {
      state.wanted = Math.max(0, state.wanted - 1);
      state.lastCrimeAt = state.time;
      if (state.wanted === 0) {
        state.message = 'You lost them. Wanted level clear.';
        clearWanted(state);
        return;
      }
    }
  }

  const wantCars = state.wanted >= 1 ? Math.min(1 + state.wanted, 5) : 0;
  police.spawnTimer -= dt;
  if (police.cars.filter((c) => !c.dead).length < wantCars && police.spawnTimer <= 0) {
    spawnPoliceCar(state, rng);
    police.spawnTimer = 2.5;
  }

  // Chase: steer toward the player, ram on contact.
  for (const car of police.cars) {
    if (car.dead) continue;
    const dx = px - car.x;
    const dz = pz - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetAngle = Math.atan2(dx, dz);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
    const chaseSpeed = 16 + state.wanted * 2.5;
    car.speed = Math.min(chaseSpeed, car.speed + 10 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
    if (dist < 3.2) {
      // Ram: damage the player or their car (per second while touching).
      if (p.onFoot) {
        p.hp -= 18 * dt;
        p.hurtTimer = 0.5;
      } else if (p.car) {
        p.car.health -= 12 * dt;
      }
      car.speed *= 0.4;
    }
    if (dist > 220) { car.dead = true; car.mesh.visible = false; }
  }
  police.cars = police.cars.filter((c) => !c.dead || c.mesh.visible);

  // Foot cops at 2+ stars: walk at the player; touch = busted.
  if (state.wanted >= 2) {
    police.copTimer -= dt;
    if (police.cops.filter((c) => c.alive).length < state.wanted - 1 && police.copTimer <= 0) {
      const cop = spawnCopOnFoot(state, rng);
      if (cop) police.cops.push(cop);
      police.copTimer = 4;
    }
  }
  for (const cop of police.cops) {
    if (!cop.alive) continue;
    const dx = px - cop.x;
    const dz = pz - cop.z;
    const dist = Math.hypot(dx, dz) || 1;
    cop.x += (dx / dist) * 4.2 * dt;
    cop.z += (dz / dist) * 4.2 * dt;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = Math.atan2(dx, dz);
    if (dist < 1.6 && p.onFoot) {
      state.busted = true;
    }
  }
}

function spawnCopOnFoot(state, rng) {
  // Build the cop mesh here (kept in police.js so police owns its visuals).
  const THREE = state.THREE;
  const p = state.player;
  const angle = rng() * Math.PI * 2;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  const x = px + Math.sin(angle) * 22;
  const z = pz + Math.cos(angle) * 22;
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.4), navy);
  body.position.y = 1.0;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 1.6;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x0e1a33 }));
  hat.position.y = 1.8;
  group.add(hat);
  group.position.set(x, 0, z);
  state.police.scene.add(group);
  return { mesh: group, x, z, alive: true };
}
