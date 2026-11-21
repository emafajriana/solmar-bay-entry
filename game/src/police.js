// police.js — the law, and SOLMAR BAY's signature system: DISTRICT HEAT.
//
// Each of the six districts keeps its own heat meter (0..100). A crime
// raises the heat of the district it happens in — and only that district.
// Your wanted stars are read off the heat of the district you are standing
// in (plus a whisper of your worst heat elsewhere), so the map itself is
// the wanted system: cross into a cool district and the pressure drops,
// while the district you just terrorised stays hot, patrols hard and
// charges more at the Pay'n'Spray. Heat cools slowly everywhere, but the
// district you are in only cools while no officer can see you.
//
// This module owns the heat, the star rating, the pursuit cars (built by
// vehicles.js, steered here), the foot police (spawned through
// combat.js), the roadblocks at four stars, and the busted meter.

import { DISTRICTS, TUNING, CRIME_HEAT, districtAt } from './config.js';
import { collideCircle } from './city.js';

export function createPolice(rng, city, vehicles, combat) {
  const heat = {};
  for (const d of DISTRICTS) heat[d.id] = 0;
  let bustMeter = 0;
  let spawnCd = 0;
  let roadblockCd = 0;
  let starsNow = 0;

  function effectiveHeat(x, z) {
    const here = districtAt(x, z);
    let worstElsewhere = 0;
    for (const d of DISTRICTS) {
      if (d.id !== here.id) worstElsewhere = Math.max(worstElsewhere, heat[d.id]);
    }
    return heat[here.id] + worstElsewhere * 0.25;
  }

  function starsFor(x, z) {
    const eff = effectiveHeat(x, z);
    let stars = 0;
    for (const threshold of TUNING.starThresholds) if (eff >= threshold) stars++;
    return stars;
  }

  function copCars() {
    return vehicles.cars.filter((c) => c.kind === 'cop' && !c.dead);
  }

  function footCops() {
    return combat.hostiles.filter((h) => h.kind === 'cop' && !h.dead);
  }

  function spawnCopCar(G) {
    const focus = G.playerFocus();
    const angle = rng.range(0, Math.PI * 2);
    let x = focus.x + Math.cos(angle) * rng.range(52, 68);
    let z = focus.z + Math.sin(angle) * rng.range(52, 68);
    x = Math.max(-236, Math.min(236, x));
    z = Math.max(-236, Math.min(236, z));
    // Snap to the nearer street line so the car arrives on a road.
    if (Math.abs(x - Math.round(x / 60) * 60) < Math.abs(z - Math.round(z / 60) * 60)) {
      x = Math.round(x / 60) * 60;
    } else {
      z = Math.round(z / 60) * 60;
    }
    const heading = Math.atan2(focus.x - x, focus.z - z);
    return vehicles.spawnCar(x, z, heading, 'cop');
  }

  function spawnFootCop(G) {
    const focus = G.playerFocus();
    const angle = rng.range(0, Math.PI * 2);
    const x = Math.max(-240, Math.min(240, focus.x + Math.cos(angle) * rng.range(24, 34)));
    const z = Math.max(-240, Math.min(240, focus.z + Math.sin(angle) * rng.range(24, 34)));
    return combat.spawnHostile('cop', x, z, { tag: 'police' });
  }

  function steerCopCar(car, dt, G) {
    const focus = G.playerFocus();
    let tx = focus.x;
    let tz = focus.z;
    if (G.profile.mode === 'car' && G.playerCar) {
      tx += Math.sin(G.playerCar.heading) * G.playerCar.speed * 0.45;
      tz += Math.cos(G.playerCar.heading) * G.playerCar.speed * 0.45;
    }
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (car.roadblockT > 0) {
      car.roadblockT -= dt;
      car.speed = Math.max(0, car.speed - 30 * dt);
    } else {
      const desired = Math.atan2(dx, dz);
      let turn = desired - car.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      car.heading += Math.max(-2.1 * dt, Math.min(2.1 * dt, turn));
      let want = dist > 55 ? 41 : dist > 22 ? 31 : 24;
      if (G.profile.mode === 'foot' && dist < 8) want = 0; // pull up, don't run him down
      if (car.speed < want) car.speed = Math.min(want, car.speed + 17 * dt);
      else car.speed = Math.max(want, car.speed - 30 * dt);
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const [nx, nz] = collideCircle(city, car.x, car.z, TUNING.carRadius);
    if (nx !== car.x || nz !== car.z) car.speed *= 0.45;
    car.x = nx;
    car.z = nz;
    const bar = car.mesh.userData.lightbar;
    if (bar) {
      const flash = Math.sin(G.time * 10) > 0;
      bar.red.emissiveIntensity = flash ? 2.4 : 0.1;
      bar.blue.emissiveIntensity = flash ? 0.1 : 2.4;
    }
  }

  return {
    heat,
    get starsNow() {
      return starsNow;
    },
    get bustMeter() {
      return bustMeter;
    },
    effectiveHeat,
    districtHeat(x, z) {
      return heat[districtAt(x, z).id];
    },
    wantedActive() {
      return starsNow > 0;
    },
    anyCopWithin(x, z, r) {
      for (const car of copCars()) if (Math.hypot(car.x - x, car.z - z) < r) return true;
      for (const cop of footCops()) if (Math.hypot(cop.x - x, cop.z - z) < r) return true;
      return false;
    },
    addCrime(kind, x, z) {
      const points = CRIME_HEAT[kind];
      if (!points) return;
      const d = districtAt(x, z);
      heat[d.id] = Math.min(100, heat[d.id] + points);
    },
    addHeat(x, z, points) {
      const d = districtAt(x, z);
      heat[d.id] = Math.max(0, Math.min(100, heat[d.id] + points));
    },
    // Pay'n'Spray: full cool-down where you stand, half everywhere else.
    resprayCost(x, z) {
      const d = districtAt(x, z);
      return Math.round((150 + effectiveHeat(x, z) * 4) * d.sprayMult);
    },
    respray(x, z) {
      const here = districtAt(x, z);
      for (const d of DISTRICTS) {
        heat[d.id] = d.id === here.id ? 0 : heat[d.id] * 0.5;
      }
      bustMeter = 0;
    },
    halveAll() {
      for (const d of DISTRICTS) heat[d.id] *= 0.5;
    },
    clearAll() {
      for (const d of DISTRICTS) heat[d.id] = 0;
      bustMeter = 0;
    },

    update(dt, G) {
      const focus = G.playerFocus();
      const here = districtAt(focus.x, focus.z);
      starsNow = starsFor(focus.x, focus.z);

      // Cooling: everywhere slowly; the home district only while unseen.
      const seen = this.anyCopWithin(focus.x, focus.z, 48);
      for (const d of DISTRICTS) {
        if (heat[d.id] <= 0) continue;
        const frozen = d.id === here.id && seen && starsNow > 0;
        if (!frozen) heat[d.id] = Math.max(0, heat[d.id] - 0.5 * d.cool * dt);
      }
      starsNow = starsFor(focus.x, focus.z);

      // Manpower follows the stars and the district's patrol strength.
      const patrol = here.patrol;
      const wantCars = starsNow === 0 ? 0 : Math.max(1, Math.round((starsNow + 1) * patrol));
      const wantFoot = starsNow >= 2 ? Math.round((starsNow - 1) * patrol) : 0;
      spawnCd -= dt;
      const carsNow = copCars();
      if (spawnCd <= 0 && carsNow.length < wantCars) {
        spawnCopCar(G);
        spawnCd = 1.4;
      }
      if (spawnCd <= 0 && footCops().length < wantFoot) {
        spawnFootCop(G);
        spawnCd = 1.4;
      }
      // Surplus or distant units fall back and leave the world.
      for (const car of carsNow) {
        const dist = Math.hypot(car.x - focus.x, car.z - focus.z);
        if ((carsNow.length > wantCars && dist > 60) || dist > 150) {
          vehicles.removeCar(car);
        }
      }
      if (starsNow === 0 && footCops().length > 0) {
        combat.clearTag('police');
      }

      // Roadblocks at four stars: two units parked across the road ahead.
      roadblockCd -= dt;
      if (starsNow >= 4 && G.profile.mode === 'car' && G.playerCar && roadblockCd <= 0) {
        roadblockCd = 26;
        const car = G.playerCar;
        const ax = car.x + Math.sin(car.heading) * 48;
        const az = car.z + Math.cos(car.heading) * 48;
        for (const side of [-2.2, 2.2]) {
          const block = vehicles.spawnCar(
            ax + Math.cos(car.heading) * side,
            az - Math.sin(car.heading) * side,
            car.heading + Math.PI / 2,
            'cop',
          );
          block.roadblockT = 11;
        }
      }

      for (const car of copCars()) steerCopCar(car, dt, G);

      // The busted meter fills while an officer is on top of a slow or
      // on-foot player; it drains when they break away. A staged
      // screenshot never ends in an arrest — the shoot is a photo op.
      if (starsNow > 0 && G.state !== 'shot') {
        const slow = G.profile.mode === 'foot' || !G.playerCar || Math.abs(G.playerCar.speed) < 1.3;
        const near =
          copCars().some((c) => Math.hypot(c.x - focus.x, c.z - focus.z) < TUNING.bustRange + 1.6) ||
          footCops().some((c) => Math.hypot(c.x - focus.x, c.z - focus.z) < TUNING.bustRange);
        if (slow && near) {
          bustMeter += dt;
          if (bustMeter >= TUNING.bustSeconds) {
            bustMeter = 0;
            G.onBusted();
          }
        } else {
          bustMeter = Math.max(0, bustMeter - dt * 1.4);
        }
      } else {
        bustMeter = 0;
      }
    },
  };
}
