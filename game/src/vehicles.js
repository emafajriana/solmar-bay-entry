// Cars: arcade physics for the player's car, waypoint AI for traffic,
// parked cars to steal, damage + smoke, and the Pay'n'Spray repair.
// A car is a box body + cabin + 4 wheels; colours are original paint jobs.

import * as THREE from 'three';
import { CAR, ROAD_LINES } from './config.js';
import { collidesBuilding } from './city.js';
import { pick, range } from './rng.js';

export const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a, 0x16a085, 0xd35400];
export const CAR_NAMES = ['Solmar Comet', 'Bay Runner', 'Sunset GT', 'Palm Cruiser', 'Marina S', 'Dune Buggy', 'Harbor Van', 'Street Hawk'];

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2a4a : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.0),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0xeaf2f8 : 0x1a2530 }),
  );
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    bar.position.set(0, 1.55, -0.2);
    group.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.22), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.7;
    group.add(stripe);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  group.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    group.userData.wheels.push(wheel);
  }
  // Headlights.
  for (const hx of [-0.6, 0.6]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.15, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0 }),
    );
    light.position.set(hx, 0.6, 2.12);
    group.add(light);
  }
  return group;
}

export function spawnCar(scene, rng, x, z, angle, opts) {
  const options = opts || {};
  const color = options.color !== undefined ? options.color : pick(rng, CAR_COLORS);
  const mesh = makeCarMesh(color, !!options.police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = angle;
  scene.add(mesh);
  const car = {
    mesh, x, z, angle, speed: 0, health: CAR.maxHealth,
    color, name: options.name || pick(rng, CAR_NAMES),
    police: !!options.police, parked: !!options.parked, occupied: !!options.occupied,
    traffic: !!options.traffic, smoke: null, dead: false,
    // Traffic AI state.
    targetX: x, targetZ: z, waitTimer: 0, axis: 'z', dir: 1,
  };
  return car;
}

export function spawnTraffic(scene, rng, city, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng() < 0.5;
    const line = pick(rng, ROAD_LINES);
    const along = range(rng, -175, 175);
    const car = spawnCar(scene, rng,
      vertical ? line : along, vertical ? along : line,
      vertical ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      { traffic: true, occupied: true });
    car.axis = vertical ? 'z' : 'x';
    car.dir = rng() < 0.5 ? 1 : -1;
    car.speed = range(rng, 7, 11);
    cars.push(car);
  }
  return cars;
}

export function spawnParkedCars(scene, rng, city) {
  const cars = [];
  const spots = city.parkedSpots.slice(0, 14);
  for (const spot of spots) {
    const car = spawnCar(scene, rng, spot.x, spot.z, spot.angle, { parked: true, occupied: rng() < 0.25 });
    cars.push(car);
  }
  return cars;
}

function trafficLightRed(time) {
  // 6 s green, 2 s red, alternating — traffic stops on red.
  return (time % 8) > 6;
}

// Arcade car physics: accelerate / brake / reverse / steer, handbrake drift.
export function driveCar(car, input, dt, city, others) {
  const move = input.move();
  const handbrake = input.jumping();
  if (move.forward > 0) car.speed += CAR.accel * dt;
  else if (move.forward < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 20 * dt);
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  const steerInput = move.strafe;
  const steerAmount = steerInput * CAR.steer * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 8);
  car.angle += steerAmount * (handbrake ? 1.6 : 1);
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  if (!collidesBuilding(nx, nz, 1.6, city)) {
    car.x = nx;
    car.z = nz;
  } else {
    car.speed *= -0.25;
    car.health -= 4;
  }
  // Bump into other cars: slow down, take a little damage.
  for (const other of others) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 12) {
      car.speed *= 0.5;
      car.health -= 2;
      other.speed = (other.speed || 0) * 0.5;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += car.speed * dt * 2;
  return Math.abs(car.speed);
}

export function updateTraffic(cars, dt, time, city, playerCar) {
  const red = trafficLightRed(time);
  for (const car of cars) {
    if (car.dead) continue;
    // Stop at a red light near an intersection.
    const nearIntersection = Math.abs(car.x % 50) < 6 || Math.abs(car.z % 50) < 6;
    if (red && nearIntersection && car.waitTimer <= 0) car.waitTimer = 0.4;
    if (car.waitTimer > 0) {
      car.waitTimer -= dt;
      continue;
    }
    const step = car.speed * dt * car.dir;
    if (car.axis === 'z') {
      car.z += step;
      if (car.z > 195) { car.z = -195; car.x = pickRoadLine(); }
      if (car.z < -195) { car.z = 195; car.x = pickRoadLine(); }
    } else {
      car.x += step;
      if (car.x > 195) { car.x = -195; car.z = pickRoadLine(); }
      if (car.x < -195) { car.x = 195; car.z = pickRoadLine(); }
    }
    // Keep off the player car: brake if too close ahead.
    if (playerCar) {
      const dx = playerCar.x - car.x;
      const dz = playerCar.z - car.z;
      if (dx * dx + dz * dz < 25) car.waitTimer = 0.3;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  function pickRoadLine() {
    return ROAD_LINES[Math.floor(Math.random() * ROAD_LINES.length)];
  }
}

export function damageSmoke(scene, car) {
  if (car.health < 45 && !car.smoke) {
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 }),
    );
    smoke.position.set(0, 1.2, 1.6);
    car.mesh.add(smoke);
    car.smoke = smoke;
  }
  if (car.smoke) {
    car.smoke.scale.setScalar(1 + Math.sin(Date.now() / 90) * 0.15);
    car.smoke.material.opacity = 0.35 + Math.random() * 0.2;
  }
}
