// combat.js — guns, fists, and the people who shoot back. The player
// fires hitscan weapons from the camera; hostile pedestrians (Tiburones
// gang members and foot police) advance, strafe and return fire with
// distance-based accuracy. Dead hostiles fall and sometimes drop cash.
// Tracers are short-lived lines so every shot can be seen.

import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { makeHumanoid, animateWalk, layDown } from './pedestrians.js';
import { collideCircle } from './city.js';

const GANG_PALETTE = { shirt: 0x0b525b, pants: 0x101820, cap: 0xff5964 };
const BOSS_PALETTE = { shirt: 0x5f0f40, pants: 0x101820, cap: 0xffd166, vest: 0x101820 };
const COP_PALETTE = { shirt: 0x1d3557, pants: 0x14213d, cap: 0x1d3557, vest: 0xe9c46a };

export function createCombat(rng, city, scene) {
  const hostiles = [];
  const tracers = [];
  const pickups = [];
  const group = new THREE.Group();
  scene.add(group);

  function addGun(parts) {
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.5 }),
    );
    gun.position.set(0, -0.62, 0.18);
    parts.armR.add(gun);
    parts.armR.rotation.x = -Math.PI / 2 + 0.12;
  }

  function spawnHostile(kind, x, z, opts = {}) {
    const palette = kind === 'cop' ? COP_PALETTE : opts.boss ? BOSS_PALETTE : GANG_PALETTE;
    const parts = makeHumanoid(rng, palette);
    if (opts.boss) parts.group.scale.setScalar(1.14);
    addGun(parts);
    parts.group.position.set(x, 0, z);
    group.add(parts.group);
    const hostile = {
      kind,
      tag: opts.tag ?? null,
      boss: !!opts.boss,
      parts,
      x,
      z,
      heading: rng.range(0, Math.PI * 2),
      hp: opts.hp ?? (kind === 'cop' ? 60 : 80),
      dead: false,
      shootCd: rng.range(0.5, 1.6),
      strafeDir: rng.sign(),
      strafeT: rng.range(1.5, 3.5),
      phase: rng.range(0, 6),
      speed: kind === 'cop' ? 3.6 : 3.3,
    };
    hostiles.push(hostile);
    return hostile;
  }

  function tracer(from, to, color = 0xffe9a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }

  function dropPickup(x, z, amount) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14),
      new THREE.MeshStandardMaterial({ color: 0xf4d35e, emissive: 0xa67c00, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.6 }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 0.7, z);
    scene.add(mesh);
    pickups.push({ mesh, x, z, amount, spin: rng.range(0, 6) });
  }

  function damageHostile(hostile, amount, G) {
    if (hostile.dead) return;
    hostile.hp -= amount;
    if (hostile.hp <= 0) {
      hostile.dead = true;
      layDown(hostile.parts);
      if (hostile.kind === 'gang' && rng.chance(0.5)) {
        dropPickup(hostile.x, hostile.z, rng.int(20, 95));
      }
      if (G && G.onHostileDown) G.onHostileDown(hostile);
    }
  }

  // One shot from the player's current weapon, from the camera's eye.
  function playerFire(G) {
    const profile = G.profile;
    const weaponId = profile.weapon;
    const weapon = WEAPONS[weaponId];
    const focus = G.playerFocus();
    if (weaponId === 'fist') {
      G.audio.shot('fist');
      const fx = Math.sin(G.playerAvatar.heading);
      const fz = Math.cos(G.playerAvatar.heading);
      const hit = (target, isHostile) => {
        const dx = target.x - focus.x;
        const dz = target.z - focus.z;
        return Math.hypot(dx, dz) < weapon.range && dx * fx + dz * fz > 0;
      };
      for (const h of hostiles) if (!h.dead && hit(h, true)) return damageHostile(h, weapon.damage, G);
      for (const ped of G.peds.list) {
        if (!ped.dead && hit(ped)) {
          G.peds.damage(ped, weapon.damage);
          G.crime('punchCivilian', ped.x, ped.z);
          G.setPanic(ped.x, ped.z);
          return;
        }
      }
      return;
    }
    if ((profile.ammo[weaponId] ?? 0) <= 0) {
      G.audio.dryFire();
      return;
    }
    profile.ammo[weaponId] -= weapon.ammoCost;
    G.audio.shot(weaponId);
    G.setPanic(focus.x, focus.z);
    if (G.police.anyCopWithin(focus.x, focus.z, 34)) G.crime('shotNearPolice', focus.x, focus.z);

    const camera = G.stage.camera;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const pellets = weapon.pellets ?? 1;
    for (let p = 0; p < pellets; p++) {
      const spread = pellets > 1 ? 0.045 : weaponId === 'rifle' ? 0.008 : 0.004;
      const d = dir.clone();
      d.x += rng.range(-spread, spread);
      d.y += rng.range(-spread, spread) * 0.6;
      d.z += rng.range(-spread, spread);
      d.normalize();
      castRay(G, origin, d, weapon);
    }
    G.playerAvatar.camPitch = Math.min(1.15, G.playerAvatar.camPitch + 0.01);
  }

  function rayHits(origin, dir, cx, cy, cz, radius, maxRange) {
    const ox = cx - origin.x;
    const oy = cy - origin.y;
    const oz = cz - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0.5 || t > maxRange) return -1;
    const px = origin.x + dir.x * t;
    const py = origin.y + dir.y * t;
    const pz = origin.z + dir.z * t;
    const miss = Math.hypot(cx - px, cy - py, cz - pz);
    return miss <= radius ? t : -1;
  }

  function castRay(G, origin, dir, weapon) {
    let bestT = weapon.range;
    let bestHit = null;
    const consider = (x, y, z, radius, apply) => {
      const t = rayHits(origin, dir, x, y, z, radius, weapon.range);
      if (t > 0 && t < bestT) {
        bestT = t;
        bestHit = apply;
      }
    };
    for (const h of hostiles) {
      if (h.dead) continue;
      consider(h.x, 1.05, h.z, 0.62, () => damageHostile(h, weapon.damage, G));
    }
    for (const ped of G.peds.list) {
      if (ped.dead) continue;
      consider(ped.x, 1.05, ped.z, 0.58, () => {
        const wasAlive = !ped.dead;
        G.peds.damage(ped, weapon.damage);
        if (wasAlive && ped.dead) G.crime('killPedestrian', ped.x, ped.z);
        else G.crime('hitPedestrian', ped.x, ped.z);
      });
    }
    for (const car of G.vehicles.cars) {
      consider(car.x, 0.75, car.z, 2.1, () => G.vehicles.damageCar(car, weapon.damage * 0.7));
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
    const gunPos =
      G.profile.mode === 'foot'
        ? [G.playerAvatar.x + Math.sin(G.playerAvatar.camYaw) * 0.5, 1.45, G.playerAvatar.z + Math.cos(G.playerAvatar.camYaw) * 0.5]
        : [G.playerCar.x, 1.2, G.playerCar.z];
    tracer(gunPos, [end.x, end.y, end.z]);
    if (bestHit) bestHit();
  }

  function updateHostile(hostile, dt, G) {
    const focus = G.playerFocus();
    const dx = focus.x - hostile.x;
    const dz = focus.z - hostile.z;
    const dist = Math.hypot(dx, dz) || 1;
    // A foot officer with no wanted level to enforce walks away and
    // holsters: police.js clears them out once they are far enough.
    if (hostile.kind === 'cop' && G.police && !G.police.wantedActive()) {
      hostile.x -= (dx / dist) * hostile.speed * dt;
      hostile.z -= (dz / dist) * hostile.speed * dt;
      hostile.heading = Math.atan2(-dx, -dz);
      hostile.phase += hostile.speed * dt * 2.4;
      animateWalk(hostile.parts, hostile.phase, 1);
      hostile.parts.group.position.set(hostile.x, 0, hostile.z);
      hostile.parts.group.rotation.y = hostile.heading;
      return;
    }
    const wantRange = hostile.kind === 'cop' ? 24 : 19;
    let mx = 0;
    let mz = 0;
    if (dist > wantRange + 5) {
      mx = dx / dist;
      mz = dz / dist;
    } else if (dist < wantRange - 7) {
      mx = -dx / dist;
      mz = -dz / dist;
    }
    hostile.strafeT -= dt;
    if (hostile.strafeT <= 0) {
      hostile.strafeT = rng.range(1.5, 3.5);
      hostile.strafeDir = rng.sign();
    }
    mx += (-dz / dist) * hostile.strafeDir * 0.45;
    mz += (dx / dist) * hostile.strafeDir * 0.45;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 0.05) {
      hostile.x += (mx / mLen) * hostile.speed * dt;
      hostile.z += (mz / mLen) * hostile.speed * dt;
      const [nx, nz] = collideCircle(city, hostile.x, hostile.z, 0.45);
      hostile.x = nx;
      hostile.z = nz;
      hostile.phase += hostile.speed * dt * 2.4;
      animateWalk(hostile.parts, hostile.phase, 1);
    }
    hostile.heading = Math.atan2(dx, dz);
    hostile.parts.group.position.set(hostile.x, 0, hostile.z);
    hostile.parts.group.rotation.y = hostile.heading;

    hostile.shootCd -= dt;
    const gunRange = hostile.boss ? 46 : 38;
    if (dist < gunRange && hostile.shootCd <= 0) {
      hostile.shootCd = hostile.boss ? rng.range(0.55, 0.9) : rng.range(0.8, 1.5);
      const hitChance = Math.max(0.08, 0.52 - dist * 0.009 + (hostile.boss ? 0.12 : 0));
      const from = [hostile.x, 1.35, hostile.z];
      if (rng.chance(hitChance)) {
        tracer(from, [focus.x, 1.1, focus.z], 0xff9d7a);
        G.hurtPlayer(rng.range(5, hostile.boss ? 13 : 10), hostile.x, hostile.z);
      } else {
        tracer(from, [focus.x + rng.range(-2.5, 2.5), rng.range(0.4, 2), focus.z + rng.range(-2.5, 2.5)], 0xff9d7a);
      }
      G.audio.shot('pistol');
    }
  }

  return {
    hostiles,
    pickups,
    spawnHostile,
    playerFire,
    damageHostile,
    countAlive(tag) {
      return hostiles.filter((h) => !h.dead && (tag === undefined || h.tag === tag)).length;
    },
    clearTag(tag) {
      for (let i = hostiles.length - 1; i >= 0; i--) {
        if (hostiles[i].tag === tag) {
          group.remove(hostiles[i].parts.group);
          hostiles.splice(i, 1);
        }
      }
    },
    update(dt, G) {
      for (const hostile of hostiles) {
        if (!hostile.dead) updateHostile(hostile, dt, G);
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
        if (t.life <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
          t.line.material.dispose();
          tracers.splice(i, 1);
        }
      }
      const focus = G.playerFocus();
      for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        pickup.spin += dt * 3;
        pickup.mesh.rotation.z = pickup.spin;
        pickup.mesh.position.y = 0.7 + Math.sin(pickup.spin * 1.7) * 0.12;
        if (Math.hypot(pickup.x - focus.x, pickup.z - focus.z) < 1.9) {
          G.addCash(pickup.amount);
          G.audio.cash();
          scene.remove(pickup.mesh);
          pickups.splice(i, 1);
        }
      }
    },
  };
}
