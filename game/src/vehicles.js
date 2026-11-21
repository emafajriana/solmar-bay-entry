// vehicles.js — every car in SOLMAR BAY: the mesh factory, the parked
// cars, the traffic that drives the grid on its own, and the arcade
// physics of the car the player is driving. Police cars are built here
// too, but steered by police.js; this module skips them in its update.
//
// Traffic drives the street grid by target points: each car aims at the
// next intersection, offset into its right-hand lane, and chooses
// straight/left/right when it gets there. Cars brake for red lights and
// for anything solid in front of them.

import * as THREE from 'three';
import { WORLD, TUNING, streetLines } from './config.js';
import { collideCircle } from './city.js';

const PAINTS = [0xc0392b, 0x2471a3, 0x229954, 0xf39c12, 0x8e44ad, 0xecf0f1, 0x2e4053, 0xd35400, 0x17a589, 0xb03a2e, 0xf5b7b1, 0x566573];
const LINES = streetLines();
const LANE = 3.6;

function buildCarMesh(paint, kind) {
  const group = new THREE.Group();
  const sports = kind === 'marked';
  const paintMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, sports ? 0.42 : 0.55, 4.25), paintMat);
  body.position.y = sports ? 0.48 : 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.48, 2.0), kind === 'cop' ? new THREE.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.4 }) : glassMat);
  cabin.position.set(0, sports ? 0.9 : 1.02, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  if (kind === 'cop') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.2, 4.29), new THREE.MeshStandardMaterial({ color: 0x1b2631, roughness: 0.5 }));
    stripe.position.y = 0.42;
    group.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2266ff, emissiveIntensity: 0 }));
    blue.position.x = 0.3;
    bar.add(red, blue);
    bar.position.y = 1.36;
    group.add(bar);
    group.userData.lightbar = { red: red.material, blue: blue.material };
  }
  if (sports) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), paintMat);
    spoiler.position.set(0, 0.86, -2.0);
    group.add(spoiler);
  }
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [
    [-0.88, 1.35],
    [0.88, 1.35],
    [-0.88, -1.35],
    [0.88, -1.35],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.34, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8d6, emissive: 0xffedb0, emissiveIntensity: 0.9 });
  for (const hx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    lamp.position.set(hx, 0.62, 2.14);
    group.add(lamp);
  }
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x555b60, transparent: true, opacity: 0.4, roughness: 1 }),
  );
  smoke.position.set(0, 1.15, 1.6);
  smoke.visible = false;
  group.add(smoke);
  return { group, wheels, smoke, paintMat };
}

export function createVehicles(rng, city) {
  const cars = [];
  const group = new THREE.Group();

  function spawnCar(x, z, heading, kind, paint) {
    const color = paint ?? (kind === 'cop' ? 0xf2f3f4 : rng.pick(PAINTS));
    const built = buildCarMesh(color, kind);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = heading;
    group.add(built.group);
    const car = {
      kind,
      mesh: built.group,
      wheels: built.wheels,
      smoke: built.smoke,
      paintMat: built.paintMat,
      x,
      z,
      heading,
      speed: 0,
      hp: 100,
      dead: false,
      ai: null,
      occupied: kind === 'traffic',
    };
    cars.push(car);
    return car;
  }

  function laneTarget(car) {
    const ai = car.ai;
    if (ai.axis === 'NS') return { x: ai.line + (ai.dir > 0 ? LANE : -LANE), z: ai.junction };
    return { x: ai.junction, z: ai.line + (ai.dir > 0 ? -LANE : LANE) };
  }

  function nextLineBeyond(value, dir) {
    let best = dir > 0 ? Infinity : -Infinity;
    for (const line of LINES) {
      if (dir > 0 && line > value + 1 && line < best) best = line;
      if (dir < 0 && line < value - 1 && line > best) best = line;
    }
    return best === Infinity || best === -Infinity ? null : best;
  }

  function chooseAtJunction(car) {
    const ai = car.ai;
    const atEdge = Math.abs(ai.junction) >= WORLD.half - 1;
    let choice = rng.pick(['straight', 'straight', 'left', 'right']);
    if (atEdge) choice = rng.pick(['left', 'right']);
    if (choice === 'straight') {
      const next = nextLineBeyond(ai.junction, ai.dir);
      if (next === null) return chooseAtJunction(car);
      ai.junction = next;
      return;
    }
    // Turn: swap axes. Left of travel is -dir on the new axis, right is +dir.
    const turnDir = choice === 'left' ? -ai.dir : ai.dir;
    if (ai.axis === 'NS') {
      const newLine = ai.junction; // the horizontal street we are crossing
      ai.axis = 'EW';
      ai.line = newLine;
      const next = nextLineBeyond(car.x, turnDir);
      ai.dir = turnDir;
      ai.junction = next === null ? car.x + turnDir * 60 : next;
    } else {
      const newLine = ai.junction;
      ai.axis = 'NS';
      ai.line = newLine;
      const next = nextLineBeyond(car.z, turnDir);
      ai.dir = turnDir;
      ai.junction = next === null ? car.z + turnDir * 60 : next;
    }
  }

  function spawnTraffic(count) {
    for (let i = 0; i < count; i++) {
      const axis = rng.chance(0.5) ? 'NS' : 'EW';
      const line = rng.pick(LINES.slice(1, 8));
      const dir = rng.sign();
      const along = rng.range(-220, 220);
      const junction = nextLineBeyond(along, dir) ?? along + dir * 60;
      const car =
        axis === 'NS'
          ? spawnCar(line + (dir > 0 ? LANE : -LANE), along, dir > 0 ? 0 : Math.PI, 'traffic')
          : spawnCar(along, line + (dir > 0 ? -LANE : LANE), dir > 0 ? Math.PI / 2 : -Math.PI / 2, 'traffic');
      car.ai = { axis, line, dir, junction, cruise: rng.range(9.5, 12.5) };
      car.speed = car.ai.cruise * 0.7;
    }
  }

  function spawnParked(count) {
    for (let i = 0; i < count; i++) {
      const vertical = rng.chance(0.5);
      const line = rng.pick(LINES.slice(1, 8));
      const side = rng.sign();
      const along = rng.range(-225, 225);
      if (vertical) spawnCar(line + side * (WORLD.roadHalf + 1.6), along, side > 0 ? Math.PI : 0, 'parked');
      else spawnCar(along, line + side * (WORLD.roadHalf + 1.6), side > 0 ? -Math.PI / 2 : Math.PI / 2, 'parked');
    }
  }

  function obstacleAhead(car, G, dist) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const test = (ox, oz) => {
      const dx = ox - car.x;
      const dz = oz - car.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0.5 || ahead > dist) return false;
      const lateral = Math.abs(dx * fz - dz * fx);
      return lateral < 2.3;
    };
    for (const other of cars) {
      if (other !== car && test(other.x, other.z)) return true;
    }
    if (G && G.playerAvatar && G.profile.mode === 'foot' && test(G.playerAvatar.x, G.playerAvatar.z)) return true;
    if (G && G.peds) {
      for (const ped of G.peds.list) {
        if (!ped.dead && test(ped.x, ped.z)) return true;
      }
    }
    return false;
  }

  function updateTrafficCar(car, dt, G, t) {
    const ai = car.ai;
    const target = laneTarget(car);
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const distToTarget = Math.hypot(dx, dz);
    if (distToTarget < 5) chooseAtJunction(car);

    const desired = Math.atan2(dx, dz);
    let turn = desired - car.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    car.heading += Math.max(-1.7 * dt, Math.min(1.7 * dt, turn));

    // Stop for a red light at the junction ahead, and for obstacles.
    let want = ai.cruise;
    const axisAtJunction = ai.axis;
    const junctionDist = ai.axis === 'NS' ? Math.abs(ai.junction - car.z) : Math.abs(ai.junction - car.x);
    const nearJunction = junctionDist < 13 && distToTarget < 16;
    if (nearJunction && !G.city.lightAllows(axisAtJunction, ai.axis === 'NS' ? ai.line : ai.junction, ai.axis === 'NS' ? ai.junction : ai.line, t)) {
      want = junctionDist < 6.5 ? 0 : Math.min(want, 3.5);
    }
    if (obstacleAhead(car, G, 8)) want = 0;
    else if (obstacleAhead(car, G, 13)) want = Math.min(want, 4);

    if (car.speed < want) car.speed = Math.min(want, car.speed + 7 * dt);
    else car.speed = Math.max(want, car.speed - 18 * dt);

    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const [cx, cz] = collideCircle(city, car.x, car.z, TUNING.carRadius);
    car.x = cx;
    car.z = cz;
  }

  // The arcade drive model for the player's car. hooks.onHitCar(other,
  // impact) and hooks.onHitBuilding(impact) report collisions.
  function stepPlayerCar(car, input, dt, hooks) {
    if (car.dead) {
      car.speed = 0;
      return;
    }
    const axes = input.moveAxes();
    const throttle = axes.z;
    const maxForward = car.kind === 'marked' ? 46 : 38;
    if (throttle > 0) {
      car.speed += TUNING.carAccel * throttle * dt * (car.kind === 'marked' ? 1.25 : 1);
    } else if (throttle < 0) {
      if (car.speed > 0.6) car.speed -= TUNING.carBrake * dt;
      else car.speed = Math.max(-TUNING.carReverseMax, car.speed + TUNING.carAccel * throttle * dt);
    }
    // Rolling drag and a soft top speed.
    car.speed -= car.speed * TUNING.carDrag * 0.32 * dt;
    if (car.speed > maxForward) car.speed = Math.max(maxForward, car.speed - 20 * dt);
    if (Math.abs(car.speed) < 0.04 && throttle === 0) car.speed = 0;

    const handbrake = input.isDown('Space');
    const speedFactor = Math.max(-1, Math.min(1, car.speed / 9));
    const steer = input.steerAxis();
    car.heading += -steer * TUNING.carTurn * speedFactor * dt * (handbrake ? 1.6 : 1);
    if (handbrake) car.speed -= car.speed * 2.2 * dt;

    const prevSpeed = Math.abs(car.speed);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (car.z > WORLD.waterStart - 2) {
      car.z = WORLD.waterStart - 2;
      car.speed *= 0.4;
    }
    car.x = Math.max(-252, Math.min(252, car.x));
    car.z = Math.max(-252, Math.min(258, car.z));
    const [cx, cz] = collideCircle(city, car.x, car.z, TUNING.carRadius);
    if (cx !== car.x || cz !== car.z) {
      if (prevSpeed > 6 && hooks && hooks.onHitBuilding) hooks.onHitBuilding(prevSpeed);
      damageCar(car, prevSpeed * 0.55);
      car.x = cx;
      car.z = cz;
      car.speed *= 0.35;
    }
    // Car-to-car contact.
    for (const other of cars) {
      if (other === car) continue;
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const d2 = dx * dx + dz * dz;
      const min = TUNING.carRadius * 2 - 0.3;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        car.x += (dx / d) * push;
        car.z += (dz / d) * push;
        other.x -= (dx / d) * push * (other.kind === 'parked' ? 0.4 : 1);
        other.z -= (dz / d) * push * (other.kind === 'parked' ? 0.4 : 1);
        const impact = prevSpeed;
        if (impact > 4) {
          damageCar(car, impact * 0.5);
          damageCar(other, impact * 0.7);
          if (hooks && hooks.onHitCar) hooks.onHitCar(other, impact);
        }
        car.speed *= 0.45;
      }
    }
  }

  function damageCar(car, amount) {
    if (car.dead) return;
    car.hp -= amount;
    if (car.hp <= 0) {
      car.hp = 0;
      car.dead = true;
      car.speed = 0;
      car.paintMat.color.multiplyScalar(0.35);
    }
  }

  function syncMesh(car, t, dt) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const wheel of car.wheels) wheel.rotation.x += (car.speed / 0.34) * dt;
    const hurt = car.hp < 55;
    car.smoke.visible = hurt;
    if (hurt) {
      const s = 0.7 + (55 - car.hp) / 60 + Math.sin(t * 9 + car.x) * 0.12;
      car.smoke.scale.set(s, s * 1.25, s);
    }
  }

  return {
    group,
    cars,
    spawnCar,
    spawnTraffic,
    spawnParked,
    damageCar,
    stepPlayerCar,
    nearestCar(x, z, maxDist, filter) {
      let best = null;
      let bestD = maxDist;
      for (const car of cars) {
        if (car.dead) continue;
        if (filter && !filter(car)) continue;
        const d = Math.hypot(car.x - x, car.z - z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best;
    },
    removeCar(car) {
      const at = cars.indexOf(car);
      if (at >= 0) cars.splice(at, 1);
      group.remove(car.mesh);
    },
    update(dt, G, t) {
      for (const car of cars) {
        if (car.kind === 'traffic' && !car.dead) updateTrafficCar(car, dt, G, t);
        syncMesh(car, t, dt);
      }
    },
  };
}
