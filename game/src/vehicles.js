// vehicles.js — cars: the mesh factory, the arcade physics every driver
// shares, and the two brains that move them when the player doesn't
// (traffic following the road grid, police following the player).
//
// A car's heading `angle` uses the city convention: forward is
// (sin(angle), cos(angle)). Traffic drives on the right: the lane offset
// flips with direction, so two-way streets never head-on.

import * as THREE from 'three';
import { ROAD_LINES, GRID } from './config.js';
import { trafficPhase, collideCircle } from './city.js';

const PAINT = [0xd94f3d, 0x3d7bd9, 0xf2f0e6, 0x2b2f36, 0xe0a83c, 0x59a96a, 0x8a6fc9, 0xc0c6cc, 0x7a4a2b];
const smokeTexture = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(70,70,70,0.55)');
    grad.addColorStop(1, 'rgba(70,70,70,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

export function makeCarMesh(rng, kind = 'car', paintColor = null) {
  const grp = new THREE.Group();
  const isPolice = kind === 'police';
  const isSports = kind === 'sports';
  const isTaxi = kind === 'taxi';
  const paint = new THREE.MeshLambertMaterial({
    color: paintColor ?? (isPolice ? 0xf2f3f5 : isTaxi ? 0xf2b234 : rng.pick(PAINT)),
  });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x2c4256 });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c1c9 });

  const length = isSports ? 4.6 : 4.3;
  const bodyH = isSports ? 0.42 : 0.55;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, bodyH, length), paint);
  body.position.y = 0.42 + bodyH / 2;
  body.castShadow = true;
  grp.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.48, length * 0.48), isPolice ? darkMat : glassMat);
  cabin.position.set(0, 0.42 + bodyH + 0.24, -0.18);
  cabin.castShadow = true;
  grp.add(cabin);
  if (isSports) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.4), darkMat);
    spoiler.position.set(0, 1.06, -length / 2 + 0.25);
    grp.add(spoiler);
  }
  if (isTaxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    sign.position.set(0, 1.32, -0.18);
    grp.add(sign);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  const wheels = [], frontWheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    pivot.add(wheel);
    grp.add(pivot);
    wheels.push(wheel);
    if (wz > 0) frontWheels.push(pivot);
  }
  const lightGeo = new THREE.BoxGeometry(0.34, 0.12, 0.06);
  for (const dx of [-0.55, 0.55]) {
    const hl = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xfff6cf }));
    hl.position.set(dx, 0.72, length / 2 + 0.02);
    grp.add(hl);
    const tl = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xd92b1a }));
    tl.position.set(dx, 0.74, -length / 2 - 0.02);
    grp.add(tl);
  }
  let lightL = null, lightR = null;
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.5), darkMat);
    bar.position.set(0, 1.36, -0.18);
    grp.add(bar);
    lightL = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    lightL.position.set(-0.33, 1.38, -0.18);
    grp.add(lightL);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
    lightR.position.set(0.33, 1.38, -0.18);
    grp.add(lightR);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.2, length * 0.7), darkMat);
    stripe.position.y = 0.62;
    grp.add(stripe);
  }
  const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, opacity: 0.85 }));
  smoke.position.set(0, 1.5, length / 2 - 0.4);
  smoke.scale.set(1.6, 1.2, 1);
  smoke.visible = false;
  grp.add(smoke);
  return { grp, wheels, frontWheels, lightL, lightR, smoke };
}

let carSeq = 0;

export class Car {
  constructor(scene, rng, { kind = 'car', x = 0, z = 0, angle = 0, role = 'parked', paint = null } = {}) {
    this.id = ++carSeq;
    this.kind = kind;
    const parts = makeCarMesh(rng, kind, paint);
    this.grp = parts.grp;
    this.wheels = parts.wheels;
    this.frontWheels = parts.frontWheels;
    this.lightL = parts.lightL;
    this.lightR = parts.lightR;
    this.smoke = parts.smoke;
    this.grp.position.set(x, 0, z);
    scene.add(this.grp);
    this.pos = this.grp.position;
    this.angle = angle;
    this.speed = 0;
    this.steerVis = 0;
    this.health = 100;
    this.role = role;
    this.occupied = role === 'traffic'; // an NPC driver is inside
    this.deployed = false;              // police: foot cops already out
    this.cruise = rng.bell(8.5, 12.5);
    this.route = null;                  // traffic: {axis, dir, line}
    this.maxSpeed = kind === 'sports' ? 33 : kind === 'police' ? 31 : 26;
    this.accel = kind === 'sports' ? 16.5 : kind === 'police' ? 15.5 : 13;
    this.lastCrashAt = -9;
  }

  forward() { return { x: Math.sin(this.angle), z: Math.cos(this.angle) }; }

  // The shared arcade step. throttle -1..1, steer -1..1 (left positive).
  physics(dt, G, throttle, steer, handbrake) {
    if (this.health <= 0) throttle = 0; // a wrecked engine does not pull
    const drag = handbrake ? 3.4 : 0.55;
    if (throttle > 0) this.speed += this.accel * throttle * dt * (this.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) this.speed += this.accel * 1.4 * throttle * dt * (this.speed > 0.5 ? 2.4 : 0.8);
    this.speed -= this.speed * drag * dt;
    if (!handbrake && Math.abs(throttle) < 0.01) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.6 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -8.5, this.maxSpeed);

    const steerTarget = steer * 0.62 * (1 - Math.min(0.55, Math.abs(this.speed) / this.maxSpeed * 0.6));
    this.steerVis += (steerTarget - this.steerVis) * Math.min(1, dt * 7);
    if (Math.abs(this.speed) > 0.05) {
      this.angle += this.steerVis * this.speed * dt * 0.34 * (this.speed < 0 ? -1 : 1);
    }
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;

    // body vs the built world: nose and tail as two circles
    const before = Math.abs(this.speed);
    for (const s of [1.35, -1.35]) {
      const probe = { x: this.pos.x + f.x * s, z: this.pos.z + f.z * s };
      if (collideCircle(probe, 1.02, G.colliders)) {
        this.pos.x += probe.x - (this.pos.x + f.x * s);
        this.pos.z += probe.z - (this.pos.z + f.z * s);
        if (before > 5.5 && G.time - this.lastCrashAt > 0.5) {
          this.lastCrashAt = G.time;
          G.onCarCrash(this, before);
          this.speed = -this.speed * 0.22;
        } else if (before > 0.5) {
          this.speed *= 0.4;
        }
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -192, 192);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -192, 233);

    this.grp.position.y = 0;
    this.grp.rotation.y = this.angle;
    const spin = this.speed * dt / 0.36;
    for (const w of this.wheels) w.rotation.x += spin;
    for (const p of this.frontWheels) p.rotation.y = this.steerVis * 0.9;
    this.smoke.visible = this.health < 55;
    if (this.smoke.visible) {
      const s = 1.3 + Math.sin(G.time * 7 + this.id) * 0.35 + (55 - this.health) * 0.02;
      this.smoke.scale.set(s, s * 0.8, 1);
    }
  }

  // --- traffic brain: follow the lane, mind the lights and the car ahead ---
  trafficInputs(dt, G) {
    if (!this.route) {
      const axis = Math.abs(this.forward().x) > Math.abs(this.forward().z) ? 'x' : 'z';
      this.route = {
        axis,
        dir: axis === 'x' ? Math.sign(this.forward().x) || 1 : Math.sign(this.forward().z) || 1,
        line: axis === 'x' ? this.nearestLine(this.pos.z) : this.nearestLine(this.pos.x),
      };
    }
    const r = this.route;
    const along = r.axis === 'x' ? this.pos.x : this.pos.z;
    const cross = r.axis === 'x' ? this.pos.z : this.pos.x;
    const lane = r.line + (r.axis === 'x' ? 3.4 * r.dir : -3.4 * r.dir);

    // approaching the next intersection: maybe turn onto the crossing road
    const nextJunction = this.nextLineAhead(along, r.dir);
    if (nextJunction !== null && Math.abs(nextJunction - along) < 1.2 && G.rng.chance(0.3)) {
      const turnDir = G.rng.pick([-1, 1]);
      r.line = nextJunction;
      if (r.axis === 'x') { r.axis = 'z'; r.dir = turnDir; }
      else { r.axis = 'x'; r.dir = turnDir; }
    }

    // lookahead point on the lane, steered toward like a carrot
    const lookAhead = 11;
    const tx = r.axis === 'x' ? along + r.dir * lookAhead : lane;
    const tz = r.axis === 'x' ? lane : along + r.dir * lookAhead;
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.5, -1, 1);

    // reasons to slow: red light ahead, a car ahead, a person ahead
    let target = this.cruise;
    const phase = trafficPhase(G.time);
    const myGreen = (r.axis === 'z' && phase.startsWith('NS')) || (r.axis === 'x' && phase.startsWith('EW'));
    if (!myGreen && nextJunction !== null) {
      const d = (nextJunction - along) * r.dir;
      if (d > 0 && d < 10) target = 0;
    }
    for (const other of G.cars) {
      if (other === this) continue;
      const dx = other.pos.x - this.pos.x, dz = other.pos.z - this.pos.z;
      const ahead = dx * Math.sin(this.angle) + dz * Math.cos(this.angle);
      const side = Math.abs(dx * Math.cos(this.angle) - dz * Math.sin(this.angle));
      if (ahead > 0 && ahead < 8 && side < 1.8) target = Math.min(target, Math.max(0, (ahead - 4.5) * 1.6));
    }
    if (Math.abs(cross - lane) > 6) target = Math.min(target, 6);
    const throttle = this.speed < target ? 0.75 : -0.4;
    return { throttle, steer, handbrake: target === 0 && this.speed > 1 };
  }

  // --- pursuit brain: get to the player, stay on them ---
  pursuitInputs(dt, G) {
    const target = G.playerPos;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const lead = G.playerInCar ? 0.45 : 0.1;
    const px = target.x + (G.playerVel?.x ?? 0) * lead;
    const pz = target.z + (G.playerVel?.z ?? 0) * lead;
    const want = Math.atan2(px - this.pos.x, pz - this.pos.z);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.7, -1, 1);
    let throttle = 1;
    if (!G.playerInCar && dist < 5.5) throttle = dist < 3.2 ? -0.2 : 0.25; // pull up, cops get out
    if (Math.abs(diff) > 2.4 && this.speed > 4) throttle = -0.6;          // turned around: brake and swing
    if (this.health <= 0) throttle = 0;
    return { throttle, steer, handbrake: false };
  }

  nearestLine(v) {
    return ROAD_LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  }

  nextLineAhead(along, dir) {
    let best = null;
    for (const line of ROAD_LINES) {
      const d = (line - along) * dir;
      if (d > 0.5 && (best === null || d < best.d)) best = { line, d };
    }
    return best ? best.line : null;
  }

  update(dt, G) {
    if (this.role === 'traffic') {
      const { throttle, steer, handbrake } = this.trafficInputs(dt, G);
      this.physics(dt, G, throttle, steer, handbrake);
    } else if (this.role === 'police') {
      const { throttle, steer, handbrake } = this.pursuitInputs(dt, G);
      this.physics(dt, G, throttle, steer, handbrake);
    } else if (this.role === 'player') {
      const input = G.input;
      const throttle = (input.down('KeyW') ? 1 : 0) + (input.down('KeyS') ? -1 : 0);
      const steer = (input.down('KeyA') ? 1 : 0) + (input.down('KeyD') ? -1 : 0);
      this.physics(dt, G, throttle, steer, input.down('Space'));
    }
    if (this.lightL && this.lightR) {
      const flash = Math.floor(G.time * 5 + this.id) % 2 === 0;
      this.lightL.material.color.setHex(flash ? 0xff2a1a : 0x57120c);
      this.lightR.material.color.setHex(flash ? 0x1c3f7a : 0x2a6aff);
    }
  }
}

export class Fleet {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
  }

  add(car) { this.cars.push(car); return car; }

  spawnTraffic(count) {
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const horizontal = rng.chance(0.5);
      const line = rng.pick(ROAD_LINES.slice(1, -1));
      const along = rng.range(-170, 170);
      const dir = rng.pick([-1, 1]);
      const x = horizontal ? along : line + 3.4 * -dir;
      const z = horizontal ? line + 3.4 * dir : along;
      const angle = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const kind = rng.chance(0.14) ? 'taxi' : rng.chance(0.16) ? 'sports' : 'car';
      this.add(new Car(this.scene, rng, { kind, x, z, angle, role: 'traffic' }));
    }
  }

  spawnParked(count) {
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const horizontal = rng.chance(0.5);
      const line = rng.pick(ROAD_LINES.slice(1, -1));
      const along = rng.range(-168, 168);
      const side = rng.pick([-1, 1]);
      const off = (GRID.roadHalf + 2.1) * side;
      const x = horizontal ? along : line + off;
      const z = horizontal ? line + off : along;
      const angle = horizontal ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
      const kind = rng.chance(0.12) ? 'sports' : 'car';
      this.add(new Car(this.scene, rng, { kind, x, z, angle, role: 'parked' }));
    }
    // the player's first ride: a sedan stopped in the westbound lane of
    // the coast road, straight ahead of the spawn point, nose west
    const first = new Car(this.scene, rng, { kind: 'car', x: -12, z: 141.4, angle: -Math.PI / 2, role: 'parked' });
    this.add(first);
    return first;
  }

  spawnPolice(x, z) {
    const angle = Math.atan2(-x, -z);
    return this.add(new Car(this.scene, this.rng, { kind: 'police', x, z, angle, role: 'police' }));
  }

  // The Repo Job target: a gold sports car, parked, waiting to be stolen.
  spawnSports(x, z, angle) {
    return this.add(new Car(this.scene, this.rng, { kind: 'sports', x, z, angle, role: 'parked', paint: 0xe8b13c }));
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i !== -1) this.cars.splice(i, 1);
    this.scene.remove(car.grp);
  }

  update(dt, G) {
    for (const car of this.cars) car.update(dt, G);
    // car-to-car bumps and car-to-pedestrian hits, resolved once per step
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.01 && d2 < 3.1 * 3.1) {
          const d = Math.sqrt(d2);
          const push = (3.1 - d) / 2;
          const nx = dx / d, nz = dz / d;
          if (a.role !== 'parked') { a.pos.x -= nx * push; a.pos.z -= nz * push; }
          if (b.role !== 'parked') { b.pos.x += nx * push; b.pos.z += nz * push; }
          const closing = Math.abs(a.speed) + Math.abs(b.speed);
          if (closing > 7 && G.time - Math.max(a.lastCrashAt, b.lastCrashAt) > 0.6) {
            a.lastCrashAt = b.lastCrashAt = G.time;
            G.onCarCrash(a.speed !== 0 ? a : b, closing * 0.7);
            a.speed *= 0.35; b.speed *= 0.35;
          }
        }
      }
      for (const ped of G.peds) {
        if (ped.dead) continue;
        const dx = ped.pos.x - a.pos.x, dz = ped.pos.z - a.pos.z;
        if (dx * dx + dz * dz < 2.05 * 2.05 && Math.abs(a.speed) > 2.2) {
          const f = a.forward();
          ped.pos.x += f.x * 2.4;
          ped.pos.z += f.z * 2.4;
          G.onPedHit(ped, a, Math.abs(a.speed));
        }
      }
    }
  }
}
