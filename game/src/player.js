// The player on foot: third-person WASD movement relative to the camera,
// jump with gravity, punch, and entering / exiting cars. The player mesh
// is a simple original character: shirt, head, legs, arms.

import * as THREE from 'three';
import { PALETTE, PLAYER } from './config.js';
import { clampToCity, collidesBuilding } from './city.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: PALETTE.playerSkin });
  const shirt = new THREE.MeshLambertMaterial({ color: PALETTE.playerShirt });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12),
    new THREE.MeshLambertMaterial({ color: 0xffd166 }),
  );
  cap.position.y = 1.92;
  group.add(cap);
  for (const sx of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.26), pants);
    leg.position.set(sx, 0.33, 0);
    group.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), skin);
    arm.position.set(sx * 2.1, 1.05, 0);
    group.add(arm);
  }
  return group;
}

export function createPlayer(scene) {
  const mesh = makePlayerMesh();
  scene.add(mesh);
  return {
    mesh,
    x: 20, z: 175, y: 0, vy: 0, yaw: Math.PI, // on the x=25 road, facing north into the city
    hp: PLAYER.maxHealth, cash: 150, ammo: 12, weapon: 'pistol',
    onFoot: true, car: null, speed: 0, punchTimer: 0, hurtTimer: 0,
    unlocked: { pistol: true, shotgun: false, rifle: false },
  };
}

export function resetPlayer(player, cash, missionsDone) {
  player.x = 20;
  player.z = 175;
  player.y = 0;
  player.vy = 0;
  player.yaw = Math.PI;
  player.hp = PLAYER.maxHealth;
  player.cash = cash;
  player.ammo = 12;
  player.weapon = 'pistol';
  player.onFoot = true;
  player.car = null;
  player.punchTimer = 0;
  player.hurtTimer = 0;
  player.unlocked = { pistol: true, shotgun: missionsDone >= 3, rifle: missionsDone >= 5 };
  player.mesh.visible = true;
}

// Move on foot. Returns metres per second moved.
export function updatePlayerOnFoot(player, input, dt, city) {
  const move = input.move();
  const look = input.lookDelta();
  player.yaw -= look.dx;
  const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  // Forward is (sin yaw, cos yaw): at yaw PI the player faces north (-Z),
  // away from the camera, which sits south of the player. Right is (-cos, sin).
  let dx = (sin * move.forward - cos * move.strafe) * speed * dt;
  let dz = (cos * move.forward + sin * move.strafe) * speed * dt;
  const nx = player.x + dx;
  const nz = player.z + dz;
  if (!collidesBuilding(nx, player.z, PLAYER.radius, city)) player.x = nx;
  if (!collidesBuilding(player.x, nz, PLAYER.radius, city)) player.z = nz;
  const clamped = clampToCity(player.x, player.z);
  player.x = clamped.x;
  player.z = clamped.z;
  player.speed = Math.hypot(dx, dz) / Math.max(dt, 0.001);
  // Jump + gravity.
  if (input.jumping() && player.y === 0) player.vy = PLAYER.jumpSpeed;
  player.vy -= PLAYER.gravity * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) { player.y = 0; player.vy = 0; }
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.y = player.yaw;
  // Walk bob.
  const bob = player.speed > 0.5 && player.y === 0 ? Math.sin(Date.now() / 90) * 0.08 : 0;
  player.mesh.position.y = player.y + Math.abs(bob);
  return player.speed;
}

export function nearestCar(player, cars, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(player, car) {
  player.onFoot = false;
  player.car = car;
  car.parked = false;
  car.traffic = false;
  player.mesh.visible = false;
  return car;
}

export function exitCar(player) {
  if (!player.car) return null;
  const car = player.car;
  player.onFoot = true;
  player.car = null;
  player.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.5;
  player.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.5;
  player.y = 0;
  player.yaw = car.angle;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  return car;
}
