// SOLMAR BAY — cars: the mesh factory, the arcade physics every driver
// shares, and the traffic brain that keeps the city moving.
//
// A car's heading is an angle whose forward vector is (sin a, cos a) in
// the ground plane, so 0 faces south (toward the beach) and pi/2 faces
// east. Traffic cars steer between waypoints placed on the right-hand
// lane of each street, stop for red lights and for anything in front of
// them, and pick a new exit at every intersection. The player and the
// police drive the same physics with different hands on the wheel.

import * as THREE from "three";
import { streetCenter, PITCH, GRID, EXTENT } from "./config.js";
import { resolveCollisions } from "./city.js";

export const CAR_COLORS = [0xd94f30, 0x2e6f9e, 0xe8b13c, 0xdad5c8, 0x3f9142, 0x74569c, 0x22262a, 0x9fb6c3, 0xc76b98];
const KINDS = {
  sedan: { top: 36, accel: 13, len: 4.3, wid: 1.85 },
  sport: { top: 46, accel: 17, len: 4.2, wid: 1.8 },
  taxi: { top: 34, accel: 12, len: 4.4, wid: 1.85 },
  truck: { top: 27, accel: 9, len: 5.6, wid: 2.1 },
  police: { top: 41, accel: 16, len: 4.5, wid: 1.9 },
};

const smokeTex = (() => {
  let tex = null;
  return () => {
    if (!tex) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
      grad.addColorStop(0, "rgba(90,90,90,0.55)");
      grad.addColorStop(1, "rgba(90,90,90,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      tex = new THREE.CanvasTexture(c);
    }
    return tex;
  };
})();

class Smoke {
  constructor(scene) {
    this.pool = [];
    for (let i = 0; i < 42; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(), transparent: true, opacity: 0 }));
      s.scale.set(1.4, 1.4, 1);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, life: 0 });
    }
    this.cursor = 0;
  }

  puff(x, y, z) {
    const p = this.pool[this.cursor++ % this.pool.length];
    p.s.position.set(x, y, z);
    p.s.visible = true;
    p.life = 1;
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.7;
      p.s.position.y += dt * 2.2;
      const k = 1 - Math.max(0, p.life);
      p.s.scale.set(1.4 + k * 2.6, 1.4 + k * 2.6, 1);
      p.s.material.opacity = Math.max(0, p.life) * 0.5;
      if (p.life <= 0) p.s.visible = false;
    }
  }
}

let smoke = null;
export function initSmoke(scene) {
  smoke = new Smoke(scene);
}
export function updateSmoke(dt) {
  if (smoke) smoke.update(dt);
}

export class Car {
  constructor(scene, { kind = "sedan", color = 0xdad5c8, x = 0, z = 0, angle = 0, mode = "parked" }) {
    this.kind = kind;
    this.spec = KINDS[kind];
    this.mode = mode; // parked | traffic | police | player
    this.angle = angle;
    this.speed = 0;
    this.health = 100;
    this.steerVis = 0;
    this.smokeAcc = 0;
    this.waypoint = null;
    this.waitAt = null;
    this.reverseTimer = 0;

    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x2c4256 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(this.spec.wid, 0.62, this.spec.len), paint);
    body.position.y = 0.62;
    body.castShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(this.spec.wid * 0.86, 0.55, this.spec.len * 0.48), glass);
    cabin.position.set(0, 1.18, -this.spec.len * 0.05);
    cabin.castShadow = true;
    g.add(cabin);
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(wx * (this.spec.wid / 2 - 0.05), 0.36, wz * (this.spec.len / 2 - 0.85));
      g.add(w);
      this.wheels.push(w);
    }
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const sx of [-0.6, 0.6]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lampMat);
      lamp.position.set(sx, 0.66, this.spec.len / 2 + 0.02);
      g.add(lamp);
    }
    if (kind === "police") {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), dark);
      bar.position.set(0, 1.55, -0.2);
      g.add(bar);
      this.lightL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.44), new THREE.MeshBasicMaterial({ color: 0xff2a20 }));
      this.lightL.position.set(-0.32, 1.56, -0.2);
      g.add(this.lightL);
      this.lightR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.44), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
      this.lightR.position.set(0.32, 1.56, -0.2);
      g.add(this.lightR);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(this.spec.wid + 0.02, 0.3, this.spec.len * 0.7), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      stripe.position.y = 0.66;
      g.add(stripe);
    }
    if (kind === "taxi") {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
      sign.position.set(0, 1.58, -0.2);
      g.add(sign);
    }
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    scene.add(g);
    this.mesh = g;
  }

  get pos() {
    return this.mesh.position;
  }

  forward() {
    return { x: Math.sin(this.angle), z: Math.cos(this.angle) };
  }

  // Shared movement: advance along the heading, resolve building and car
  // collisions, animate the mesh. `events` collects crashes for the caller.
  step(dt, world, events) {
    const prev = { x: this.pos.x, z: this.pos.z };
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    const impact = resolveCollisions(this.pos, 1.7, world.colliders, prev);
    if (impact > 0.4 && Math.abs(this.speed) > 3) {
      const dmg = impact * Math.abs(this.speed) * 0.55;
      this.health = Math.max(0, this.health - dmg);
      events.push({ type: "crash", car: this, amount: dmg, x: this.pos.x, z: this.pos.z });
      this.speed = -this.speed * 0.22;
    }
    // Car-to-car: soft circles, a shared shove and mutual damage.
    for (const other of world.cars) {
      if (other === this) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 16 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (4 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        this.pos.x += nx * push;
        this.pos.z += nz * push;
        other.pos.x -= nx * push;
        other.pos.z -= nz * push;
        const rel = Math.abs(this.speed - other.speed);
        if (rel > 4) {
          const dmg = rel * 1.1;
          this.health = Math.max(0, this.health - dmg);
          other.health = Math.max(0, other.health - dmg);
          events.push({ type: "carHit", car: this, other, amount: dmg, x: this.pos.x, z: this.pos.z });
          this.speed *= 0.55;
          other.speed *= 0.55;
        }
      }
    }
    this.pos.x = Math.max(-30, Math.min(EXTENT + 30, this.pos.x));
    this.pos.z = Math.max(-30, Math.min(900, this.pos.z));
    this.mesh.rotation.y = this.angle;
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x += spin;
    if (this.wheels[0]) {
      this.wheels[0].rotation.y = this.steerVis;
      this.wheels[1].rotation.y = this.steerVis;
    }
    if (this.health < 45 && smoke) {
      this.smokeAcc += dt * (this.health < 20 ? 9 : 4);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        smoke.puff(this.pos.x, 1.2, this.pos.z);
      }
    }
    if (this.lightL) {
      const on = Math.floor(world.time * 3) % 2 === 0;
      this.lightL.material.color.setHex(on ? 0xff2a20 : 0x551512);
      this.lightR.material.color.setHex(on ? 0x112a66 : 0x2255ff);
    }
  }

  // Player/police hands: throttle -1..1, steer -1..1.
  drive(dt, throttle, steer, handbrake) {
    const spec = this.spec;
    if (this.health <= 0) throttle = 0;
    if (throttle > 0) this.speed += spec.accel * throttle * dt * (this.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += 26 * throttle * dt;
      else this.speed = Math.max(-9, this.speed + spec.accel * 0.7 * throttle * dt);
    }
    const drag = 0.35 + Math.abs(this.speed) * 0.012;
    this.speed -= this.speed * drag * dt * 0.28;
    if (handbrake) this.speed -= this.speed * 2.4 * dt;
    this.speed = Math.min(spec.top, Math.max(-9, this.speed));
    if (Math.abs(this.speed) < 0.02 && throttle === 0) this.speed = 0;
    const turn = 2.0 / (1 + Math.abs(this.speed) * 0.05);
    this.angle += steer * turn * dt * (this.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(this.speed) / 4 + 0.15);
    this.steerVis = steer * 0.45;
  }
}

// --- traffic -------------------------------------------------------------
// A traffic car always has a waypoint: the next intersection exit on its
// lane. Reaching it means choosing the next exit (straight, left or right,
// never a U-turn unless the street ends).

function lanePoint(streetIdx, axis, dir, along) {
  // The point on the right-hand lane of a street, `along` metres along it.
  const c = streetCenter(streetIdx);
  if (axis === "z") return { x: c - dir * 3.4, z: along };
  return { x: along, z: c + dir * 3.4 };
}

export function seedTrafficCar(car, rng) {
  const axis = rng.chance(0.5) ? "z" : "x";
  const streetIdx = rng.int(0, GRID);
  const dir = rng.chance(0.5) ? 1 : -1;
  const along = rng.range(30, EXTENT - 30);
  const p = lanePoint(streetIdx, axis, dir, along);
  car.pos.x = p.x;
  car.pos.z = p.z;
  car.angle = axis === "z" ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  car.traffic = { axis, dir, streetIdx };
  chooseWaypoint(car, rng, along);
}

function chooseWaypoint(car, rng, fromAlong) {
  const t = car.traffic;
  // The next intersection along the direction of travel.
  let best = null;
  for (let k = 0; k <= GRID; k++) {
    const c = streetCenter(k);
    const d = (c - fromAlong) * t.dir;
    if (d > 6 && (best === null || d < best.d)) best = { k, c, d };
  }
  if (!best) {
    // Street's end: turn around.
    t.dir *= -1;
    car.angle += Math.PI;
    chooseWaypoint(car, rng, fromAlong);
    return;
  }
  t.nextCross = best.k;
  t.crossAlong = best.c;
  const alongNow = t.axis === "z" ? car.pos.z : car.pos.x;
  const exit = lanePoint(t.streetIdx, t.axis, t.dir, best.c + t.dir * 30);
  exit.x = t.axis === "z" ? exit.x : best.c + t.dir * 30;
  exit.z = t.axis === "z" ? best.c + t.dir * 30 : exit.z;
  car.waypoint = exit;
  car.crossDecided = false;
  void alongNow;
}

function decideAtCross(car, rng) {
  const t = car.traffic;
  const crossIdx = t.nextCross;
  const options = ["straight"];
  // Turning swaps the axis: the new street is the one we are crossing.
  options.push("left", "right");
  let choice = rng.pick(options);
  if (crossIdx === 0 || crossIdx === GRID) choice = "straight";
  if (choice === "straight") {
    const fromAlong = t.axis === "z" ? car.pos.z : car.pos.x;
    chooseWaypoint(car, rng, fromAlong + t.dir * 2);
    return;
  }
  const oldAxis = t.axis;
  // Heading after the turn, from the current forward vector: a left turn
  // rotates the heading by +90 degrees, which in (sin a, cos a) terms maps
  // the forward (x, z) to (z, -x).
  const f = { x: Math.sin(car.angle), z: Math.cos(car.angle) };
  const left = { x: f.z, z: -f.x };
  const turnVec = choice === "left" ? left : { x: -left.x, z: -left.z };
  const newAngle = Math.atan2(turnVec.x, turnVec.z);
  car.angle = newAngle;
  t.axis = oldAxis === "z" ? "x" : "z";
  t.streetIdx = crossIdx;
  t.dir = t.axis === "z" ? Math.sign(turnVec.z) : Math.sign(turnVec.x);
  const fromAlong = t.axis === "z" ? car.pos.z : car.pos.x;
  chooseWaypoint(car, rng, fromAlong);
}

export function updateTraffic(car, dt, world, rng) {
  if (!car.traffic) seedTrafficCar(car, rng);
  const t = car.traffic;
  const wp = car.waypoint;
  const dx = wp.x - car.pos.x;
  const dz = wp.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const targetAngle = Math.atan2(dx, dz);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  car.angle += steer * 1.7 * dt * Math.min(1, Math.abs(car.speed) / 5 + 0.2);
  car.steerVis = steer * 0.4;

  // Decide the exit shortly before the crossing, so the waypoint the car
  // steers for already bends the right way.
  const along = t.axis === "z" ? car.pos.z : car.pos.x;
  const toCross = (t.crossAlong - along) * t.dir;
  if (!car.crossDecided && toCross < 26 && toCross > -4) {
    car.crossDecided = true;
    decideAtCross(car, rng);
  }
  if (dist < 5) {
    const fromAlong = t.axis === "z" ? car.pos.z : car.pos.x;
    chooseWaypoint(car, rng, fromAlong);
  }

  // Stop lines and neighbours.
  let target = 11;
  const light = world.lightPhase(t.axis, world.time);
  if ((light === "red" || (light === "amber" && toCross < 10)) && toCross > 2 && toCross < 16) target = 0;
  const f = car.forward();
  for (const other of world.cars) {
    if (other === car) continue;
    const ox = other.pos.x - car.pos.x;
    const oz = other.pos.z - car.pos.z;
    const ahead = ox * f.x + oz * f.z;
    const side = Math.abs(ox * -f.z + oz * f.x);
    if (ahead > 0 && ahead < 11 && side < 2.8) target = Math.min(target, other.speed > 0 ? other.speed * 0.8 : 0);
  }
  if (world.playerPos) {
    const ox = world.playerPos.x - car.pos.x;
    const oz = world.playerPos.z - car.pos.z;
    const ahead = ox * f.x + oz * f.z;
    const side = Math.abs(ox * -f.z + oz * f.x);
    if (ahead > 0 && ahead < 8 && side < 2.4) target = 0;
  }
  for (const ped of world.peds) {
    if (ped.down) continue;
    const ox = ped.pos.x - car.pos.x;
    const oz = ped.pos.z - car.pos.z;
    const ahead = ox * f.x + oz * f.z;
    const side = Math.abs(ox * -f.z + oz * f.x);
    if (ahead > 0 && ahead < 9 && side < 2.6) target = 0;
  }
  if (car.speed < target) car.speed = Math.min(target, car.speed + car.spec.accel * 0.7 * dt);
  else car.speed = Math.max(target, car.speed - 22 * dt);
  if (car.health <= 0) car.speed = Math.max(0, car.speed - 20 * dt);
}
