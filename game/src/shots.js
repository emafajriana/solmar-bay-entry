// shots.js — the staged scenes behind the entry's screenshots. Each
// scene is named by ?shot=<name>&seed=<n>: the world is built from that
// seed, the scene is set up here, and main.js then runs a fixed number of
// fixed-length simulation steps with the autopilot below driving the
// player, renders twice, and sets window.__shotReady. Same seed, same
// steps, same picture — every run.

import { PLACES } from './config.js';

export function parseShot(search) {
  const params = new URLSearchParams(search);
  const name = params.get('shot');
  if (!name) return null;
  const seed = Number(params.get('seed') ?? 1) || 1;
  return { name, seed };
}

const STEPS = { title: 120, play: 90, chase: 120, mission: 260 };

export function stageShot(G, name) {
  const avatar = G.playerAvatar;
  G.auto = { mode: 'none', target: null };
  if (name === 'title') {
    avatar.x = PLACES.bar.x;
    avatar.z = PLACES.bar.z;
    G.shotCam = { cx: -30, cz: 120, r: 200, h: 52, a: 1.35 };
    G.hud.showScreen('title');
    G.hud.setHudVisible(false);
    return STEPS.title;
  }
  G.hud.showScreen(null);
  G.hud.setHudVisible(true);
  if (name === 'play') {
    // A calm cruise along the beachfront promenade, ocean on the right,
    // the skyline on the left, the first job waiting at Carmen's bar.
    const car = G.vehicles.spawnCar(-196, 240, Math.PI / 2, 'traffic', 0xc96f2e);
    car.occupied = false;
    G.enterCar(car, true);
    G.missions.begin(); // "Drive to Carmen's Bar" — objective, marker, minimap
    avatar.camYaw = car.heading;
    G.auto = { mode: 'drive', target: { x: -52, z: 238 } }; // waypoint: stay on the promenade
    return STEPS.play;
  }
  if (name === 'chase') {
    // Start far up the x=0 street so the shot is open-road driving with
    // the patrol converging behind, not a car parked at the bank wall.
    const car = G.vehicles.spawnCar(0, 170, Math.PI, 'traffic', 0x2471a3);
    car.occupied = false;
    G.enterCar(car, true);
    G.missions.index = 2;
    G.missions.begin(); // "Get to Solmar Trust Bank"
    G.police.addHeat(car.x, car.z, 58); // three stars, patrols inbound
    avatar.camYaw = car.heading;
    G.auto = { mode: 'drive', target: null };
    return STEPS.chase;
  }
  if (name === 'mission') {
    avatar.x = PLACES.harbor.x;
    avatar.z = PLACES.harbor.z + 10;
    avatar.camYaw = 0.4;
    avatar.heading = 0.4;
    G.profile.owned.rifle = true;
    G.profile.weapon = 'rifle';
    G.profile.ammo.rifle = 120;
    G.missions.index = 6;
    G.missions.begin(); // Harbor Heist: the pier guards spawn as it advances
    G.auto = { mode: 'fight', target: null };
    return STEPS.mission;
  }
  return 60;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Drives the scripted input for one step, toward the mission marker (or
// the nearest hostile, when fighting).
export function driveAutopilot(G, dt) {
  const input = G.input;
  input.releaseAll();
  if (!G.auto || G.auto.mode === 'none') return;
  const focus = G.playerFocus();
  if (G.auto.mode === 'fight') {
    let best = null;
    let bestD = 60;
    for (const h of G.combat.hostiles) {
      if (h.dead) continue;
      const d = Math.hypot(h.x - focus.x, h.z - focus.z);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best) {
      const aim = Math.atan2(best.x - focus.x, best.z - focus.z);
      G.playerAvatar.heading = aim;
      G.playerAvatar.camYaw = aim;
      if (bestD > 16) input.hold('KeyW');
      else if (bestD < 9) input.hold('KeyS');
      input.hold('__fire');
    }
    return;
  }
  const marker = (G.auto && G.auto.target) || G.missions.marker;
  if (!marker) return;
  if (G.auto.target && Math.hypot(marker.x - focus.x, marker.z - focus.z) < 8) {
    G.auto.target = null; // waypoint reached: fall back to the mission marker
  }
  const dx = marker.x - focus.x;
  const dz = marker.z - focus.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  if (G.auto.mode === 'walk') {
    G.playerAvatar.camYaw = desired;
    if (dist > 3) input.hold('KeyW');
    return;
  }
  if (G.auto.mode === 'drive' && G.playerCar) {
    const diff = wrapAngle(desired - G.playerCar.heading);
    if (diff > 0.12) input.hold('KeyD');
    else if (diff < -0.12) input.hold('KeyA');
    if (dist > 6) input.hold('KeyW');
    G.playerAvatar.camYaw = G.playerCar.heading;
  }
  void dt;
}
