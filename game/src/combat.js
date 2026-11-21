// combat.js — fists and firearms, for the player and for everyone
// shooting back. Hitscan with a little spread, tracer lines that live
// for a blink, and the crime reports that feed District Heat: a shot is
// only a crime if a unit is close enough to hear it (police.js decides).

import * as THREE from 'three';
import { WEAPONS } from './config.js';

const TRACER_MAX = 28;

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.current = 'fists';
    this.owned = { fists: true, pistol: false, shotgun: false, rifle: false };
    this.mag = { pistol: 12, shotgun: 6, rifle: 30 };
    this.reserve = { pistol: 0, shotgun: 0, rifle: 0 };
    this.cooldown = 0;
    this.reloadT = 0;
    this.tracers = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACER_MAX * 2 * 3), 6));
    this.tracerLines = new THREE.LineSegments(geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    this.puffs = [];
  }

  unlock(key) {
    this.owned[key] = true;
    if (key === 'pistol') this.reserve.pistol = Math.max(this.reserve.pistol, 24);
    if (key === 'shotgun') this.reserve.shotgun = Math.max(this.reserve.shotgun, 12);
    if (key === 'rifle') this.reserve.rifle = Math.max(this.reserve.rifle, 60);
  }

  addAmmo() {
    this.reserve.pistol += 48;
    this.reserve.shotgun += 18;
    this.reserve.rifle += 60;
  }

  ammoLabel() {
    if (this.current === 'fists') return '—';
    return `${this.mag[this.current]} / ${this.reserve[this.current]}`;
  }

  spawnTracer(a, b, color = 0xffe9a8) {
    this.tracers.push({ a: a.clone(), b: b.clone(), life: 0.06, color });
    if (this.tracers.length > TRACER_MAX) this.tracers.shift();
  }

  update(dt, G) {
    this.cooldown -= dt;
    // --- tracers ---
    const attr = this.tracerLines.geometry.getAttribute('position');
    let w = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.tracers.splice(i, 1); continue; }
    }
    for (const t of this.tracers) {
      attr.setXYZ(w++, t.a.x, t.a.y, t.a.z);
      attr.setXYZ(w++, t.b.x, t.b.y, t.b.z);
    }
    for (let i = w; i < TRACER_MAX * 2; i++) attr.setXYZ(i, 0, -50, 0);
    attr.needsUpdate = true;

    if (G.mode !== 'playing' || G.playerInCar) { G.aiming = false; return; }

    // --- weapon switching ---
    const input = G.input;
    if (input.pressed('Digit1')) this.current = 'fists';
    if (input.pressed('Digit2') && this.owned.pistol) this.current = 'pistol';
    if (input.pressed('Digit3')) {
      if (this.current !== 'shotgun' && this.owned.shotgun) this.current = 'shotgun';
      else if (this.owned.rifle) this.current = 'rifle';
    }
    if (input.pressed('Digit4') && this.owned.rifle) this.current = 'rifle';
    G.aiming = this.current !== 'fists';

    // --- reloading ---
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload(G);
      return;
    }
    if (input.pressed('KeyR')) this.startReload(G);

    // --- firing: click shoots a gun; fists swing on F or click ---
    const trigger = this.current === 'fists'
      ? (input.mouseDown || input.pressed('KeyF'))
      : input.mouseDown;
    if (trigger && this.cooldown <= 0) this.fire(G);
  }

  startReload(G) {
    const key = this.current;
    if (key === 'fists') return;
    const spec = WEAPONS[key];
    if (this.mag[key] >= spec.mag || this.reserve[key] <= 0) return;
    this.reloadT = key === 'shotgun' ? 1.6 : key === 'rifle' ? 1.4 : 0.9;
    G.audio.reload();
  }

  finishReload(G) {
    const key = this.current;
    const spec = WEAPONS[key];
    const take = Math.min(spec.mag - this.mag[key], this.reserve[key]);
    this.mag[key] += take;
    this.reserve[key] -= take;
  }

  fire(G) {
    const key = this.current;
    const spec = WEAPONS[key];
    this.cooldown = spec.rate;
    const origin = G.playerPos.clone();
    origin.y += 1.45;
    const aim = G.aimDir; // unit vector the camera looks along

    if (key === 'fists') {
      G.audio.punch();
      let best = null, bestD = spec.range;
      for (const ped of G.peds) {
        if (ped.dead) continue;
        const dx = ped.pos.x - origin.x, dz = ped.pos.z - origin.z;
        const d = Math.hypot(dx, dz);
        if (d < bestD && (dx * aim.x + dz * aim.z) / (d || 1) > 0.3) { best = ped; bestD = d; }
      }
      if (best) {
        const died = best.damage(spec.damage);
        G.police.reportCrime('punch', best.pos.x, best.pos.z, G);
        if (died) G.onPedKilled(best, 'fists');
        else best.fleeFrom(origin.x, origin.z, G.time);
      }
      return;
    }

    if (this.mag[key] <= 0) {
      G.audio.dryFire();
      this.cooldown = 0.3;
      this.startReload(G);
      return;
    }
    this.mag[key]--;
    G.audio.shot(key);
    G.camKick += spec.kick * 0.0035;
    G.police.reportCrime('shotsHeard', origin.x, origin.z, G);
    for (const ped of G.peds) {
      if (ped.role === 'civil' && Math.hypot(ped.pos.x - origin.x, ped.pos.z - origin.z) < 15) {
        ped.fleeFrom(origin.x, origin.z, G.time);
      }
    }
    const muzzle = origin.clone().addScaledVector(aim, 0.7);
    muzzle.y -= 0.12;
    for (let p = 0; p < spec.pellets; p++) {
      const dir = aim.clone();
      dir.x += (Math.random() - 0.5) * 2 * spec.spread;
      dir.y += (Math.random() - 0.5) * 2 * spec.spread;
      dir.z += (Math.random() - 0.5) * 2 * spec.spread;
      dir.normalize();
      this.castShot(G, muzzle, dir, spec);
    }
    if (this.mag[key] === 0) this.startReload(G);
  }

  // One hitscan ray against peds (cylinders), cars (spheres) and the
  // built world (AABBs). Nearest hit wins; a tracer shows the path.
  castShot(G, origin, dir, spec) {
    let bestT = spec.range;
    let hitPed = null, hitCar = null;
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const ox = ped.pos.x - origin.x, oz = ped.pos.z - origin.z;
      const t = ox * dir.x + oz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
      const side = Math.hypot(px - ped.pos.x, pz - ped.pos.z);
      const y = origin.y + dir.y * t;
      if (side < 0.44 && y > 0.05 && y < 1.85) { bestT = t; hitPed = ped; hitCar = null; }
    }
    for (const car of G.cars) {
      const ox = car.pos.x - origin.x, oy = 0.8 - origin.y, oz = car.pos.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      if (Math.hypot(px - car.pos.x, py - 0.8, pz - car.pos.z) < 2.25) { bestT = t; hitCar = car; hitPed = null; }
    }
    for (const c of G.colliders) {
      // slab test against the box, capped at the current best
      let tmin = 0, tmax = bestT;
      const axes = [
        [origin.x, dir.x, c.x0, c.x1],
        [origin.z, dir.z, c.z0, c.z1],
      ];
      let ok = true;
      for (const [o, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { ok = false; break; } }
        else {
          let t1 = (lo - o) / d, t2 = (hi - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin > 0.2 && tmin < bestT) { bestT = tmin; hitPed = null; hitCar = null; }
    }
    const end = origin.clone().addScaledVector(dir, bestT);
    this.spawnTracer(origin, end);
    if (hitPed) {
      const died = hitPed.damage(spec.damage);
      if (died) G.onPedKilled(hitPed, 'shot');
      else if (hitPed.role === 'civil') hitPed.fleeFrom(origin.x, origin.z, G.time);
    } else if (hitCar) {
      hitCar.health -= spec.damage * 0.7;
      if (hitCar.role === 'police' || hitCar.role === 'blockade') {
        G.police.reportCrime('shotsHeard', hitCar.pos.x, hitCar.pos.z, G);
      }
    }
  }

  // Enemy fire: gang members in a fight and cops in a shooting stance.
  // Accuracy falls off with range and with a moving, driving target.
  updateHostiles(dt, G) {
    if (G.mode !== 'playing') return;
    for (const ped of G.peds) {
      const hostile = (ped.role === 'gang' && ped.state === 'fight') || (ped.role === 'cop' && ped.state === 'shoot');
      if (!hostile || ped.dead) continue;
      ped.shootCd -= dt;
      const dx = G.playerPos.x - ped.pos.x, dz = G.playerPos.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      const range = ped.role === 'gang' ? 30 : 28;
      if (ped.shootCd > 0 || dist > range) continue;
      ped.shootCd = ped.role === 'gang' ? 0.85 + Math.random() * 0.7 : 1.05 + Math.random() * 0.75;
      const from = ped.pos.clone(); from.y += 1.38;
      const target = G.playerPos.clone(); target.y += 1.1;
      let chance = ped.role === 'gang' ? 0.36 : 0.32;
      chance *= THREE.MathUtils.clamp(1.15 - dist / range * 0.55, 0.4, 1);
      if (G.playerInCar) chance *= 0.55;
      else if (G.player.speedNow > 5) chance *= 0.6;
      const hit = Math.random() < chance;
      if (!hit) {
        target.x += (Math.random() - 0.5) * 3.4;
        target.z += (Math.random() - 0.5) * 3.4;
        target.y += Math.random() * 0.8;
      }
      this.spawnTracer(from, target, 0xff9a7a);
      G.audio.shot('pistol');
      if (hit) G.damagePlayer(ped.role === 'gang' ? 6 + Math.random() * 5 : 5 + Math.random() * 5, 'shot');
    }
  }
}
