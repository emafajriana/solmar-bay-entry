// main.js — the game itself: boot, the frame loop, the third-person
// camera, and the wiring between every subsystem. Crimes flow into
// District Heat through the police, kills drop cash through the pickups,
// shops and the Pay'n'Spray hang off the E key, and the busted / wasted /
// victory screens all resolve here.

import * as THREE from 'three';
import { createStage } from './render.js';
import { buildCity } from './city.js';
import { RNG, setWorldRNG } from './rng.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Player } from './player.js';
import { Fleet } from './vehicles.js';
import { spawnCrowd } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { Combat } from './combat.js';
import { MissionSystem } from './missions.js';
import { HUD } from './hud.js';
import { loadSave, storeSave, defaultSave } from './save.js';
import { TUNING, PRICES, districtAt } from './config.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') ?? '20261117', 10) || 20261117;
const rng = new RNG(seed);
setWorldRNG(rng);

const canvas = document.getElementById('game-canvas');
const stage = createStage(canvas);
const city = buildCity(stage.scene, rng);
const input = new Input(canvas);
const audio = new AudioEngine();
const player = new Player(stage.scene, rng);
const fleet = new Fleet(stage.scene, rng);
fleet.spawnTraffic(14);
fleet.spawnParked(18);
const crowd = spawnCrowd(stage.scene, rng, 26);
const police = new PoliceSystem(stage.scene, rng);
const combat = new Combat(stage.scene);
const missions = new MissionSystem();
const hud = new HUD();

const G = {
  scene: stage.scene,
  camera: stage.camera,
  time: 0,
  mode: 'title',
  rng,
  input,
  audio,
  colliders: city.colliders,
  places: city.places,
  player,
  fleet,
  cars: fleet.cars,
  peds: [...crowd],
  police,
  combat,
  missions,
  hud,
  state: { cash: 250, health: 100, stats: defaultSave().stats, unlocked: { shotgun: false, rifle: false } },
  camYaw: Math.PI / 2,
  camPitch: 0.32,
  camKick: 0,
  aiming: false,
  playerInCar: false,
  playerCar: null,
  playerPos: player.pos,
  playerVel: { x: 0, z: 0 },
  aimDir: new THREE.Vector3(0, 0, -1),
  clockMinutes: TUNING.dayStartMinutes,
  lastHurtAt: -99,
};
window.__game = G;

// ---------- pickups: cash that falls out of trouble ----------
const pickups = [];
const pickupGeo = new THREE.BoxGeometry(0.5, 0.12, 0.28);
const pickupMat = new THREE.MeshBasicMaterial({ color: 0x7ddb4a });
function spawnPickup(x, z, value) {
  const mesh = new THREE.Mesh(pickupGeo, pickupMat);
  mesh.position.set(x, 0.5, z);
  stage.scene.add(mesh);
  pickups.push({ mesh, x, z, value, t: rng.range(0, 6) });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    p.mesh.position.y = 0.5 + Math.sin(p.t * 3.4) * 0.14;
    p.mesh.rotation.y = p.t * 2.2;
    if (G.mode === 'playing' && Math.hypot(p.x - G.playerPos.x, p.z - G.playerPos.z) < 1.7) {
      G.state.cash += p.value;
      audio.cash();
      hud.toast(`+$${p.value}`);
      stage.scene.remove(p.mesh);
      pickups.splice(i, 1);
    }
  }
}

// ---------- the event wiring the subsystems call back into ----------
G.onPedHit = (ped, car, speed) => {
  if (ped.dead) return;
  const died = ped.damage(16 + speed * 4.6);
  if (car.role === 'player') {
    if (died) {
      police.reportCrime(ped.role === 'cop' ? 'killCop' : 'kill', ped.pos.x, ped.pos.z, G);
      if (ped.role === 'civil' && rng.chance(0.5)) spawnPickup(ped.pos.x, ped.pos.z, rng.int(15, 65));
    } else {
      police.reportCrime('hitPed', ped.pos.x, ped.pos.z, G);
    }
    audio.crash(0.5);
  }
  for (const other of G.peds) {
    if (other.role === 'civil' && Math.hypot(other.pos.x - ped.pos.x, other.pos.z - ped.pos.z) < 13) {
      other.fleeFrom(ped.pos.x, ped.pos.z, G.time);
    }
  }
};

G.onPedKilled = (ped, how) => {
  if (ped.role === 'civil') {
    police.reportCrime('kill', ped.pos.x, ped.pos.z, G);
    if (rng.chance(0.45)) spawnPickup(ped.pos.x, ped.pos.z, rng.int(15, 70));
  } else if (ped.role === 'cop') {
    police.reportCrime('killCop', ped.pos.x, ped.pos.z, G);
  }
  if (ped.role === 'gang') {
    G.state.stats.earned += 0; // gang kills pay through the mission, not the body
    if (rng.chance(0.3)) spawnPickup(ped.pos.x, ped.pos.z, rng.int(20, 55));
  }
};

G.onCarCrash = (car, impact) => {
  car.health -= Math.max(0, (impact - 5)) * 3.1;
  audio.crash(Math.min(1, impact / 22));
  if (car.role === 'player') {
    if (impact > 8.5) G.damagePlayer((impact - 7.5) * 1.15, 'crash');
    if (police.nearestUnitDistance(car.pos.x, car.pos.z, G) < 32) {
      police.reportCrime('hardCrash', car.pos.x, car.pos.z, G);
    }
  }
};

G.damagePlayer = (amount, cause) => {
  if (G.mode !== 'playing') return;
  G.state.health -= amount;
  G.lastHurtAt = G.time;
  audio.hurt();
  if (G.state.health <= 0) {
    G.state.health = 0;
    wasted();
  }
};

G.onBusted = () => {
  if (G.mode !== 'playing') return;
  G.state.stats.busts++;
  const fine = Math.floor(G.state.cash * 0.1);
  G.state.cash -= fine;
  missions.onPlayerDown(G);
  police.afterArrest();
  endRun('BUSTED', `The Solmar PD booked you in ${police.playerDistrict.name}. Fine: $${fine.toLocaleString('en-US')}. The city's heat remembers, a little less than before.`);
};

function wasted() {
  G.state.stats.wasteds++;
  const bill = Math.min(G.state.cash, 250);
  G.state.cash -= bill;
  missions.onPlayerDown(G);
  // waking up in hospital cools the whole map's grudge by half
  for (const h of police.heat.values()) h.value *= 0.5;
  endRun('WASTED', `Solmar General patched you up and billed you $${bill.toLocaleString('en-US')}. The bay is still out there.`);
}

function endRun(title, sub) {
  G.mode = 'over';
  exitVehicle(true);
  police.clearUnits(G);
  input.unlockPointer();
  audio.setEngine(false);
  audio.setSiren(false);
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-sub').textContent = sub;
  hud.showScreen('screen-over');
  G.saveGame();
}

function respawn() {
  const h = city.places.hospital;
  player.placeAt(h.x + 2.5, h.z + 1, Math.PI / 2);
  G.state.health = 100;
  G.mode = 'playing';
  hud.showScreen(null);
  hud.banner('BACK IN THE BAY', 'The city kept your cash, your car and your reputation.', 3000);
}

G.onStoryComplete = () => {
  const s = G.state.stats;
  document.getElementById('victory-stats').textContent =
    `Earned $${s.earned.toLocaleString('en-US')} · ${s.missionsDone} missions · ${s.steals} cars stolen · ` +
    `${s.busts} busts · ${s.wasteds} hospital trips`;
  G.mode = 'victory';
  input.unlockPointer();
  hud.showScreen('screen-victory');
  audio.jingle(true);
  G.saveGame();
};

G.unlockWeapon = (key) => {
  G.state.unlocked[key] = true;
  G.saveGame();
};

G.saveGame = () => {
  const data = defaultSave();
  data.cash = G.state.cash;
  data.missionIndex = missions.index;
  data.owned = { pistol: combat.owned.pistol, shotgun: combat.owned.shotgun, rifle: combat.owned.rifle };
  data.unlocked = { ...G.state.unlocked };
  data.stats = { ...G.state.stats };
  storeSave(data);
};

// ---------- entering / leaving cars, shops, the spray ----------
function exitVehicle(silent = false) {
  if (!G.playerInCar) return;
  const car = G.playerCar;
  car.role = 'parked';
  const side = { x: Math.cos(car.angle), z: -Math.sin(car.angle) };
  player.placeAt(car.pos.x + side.x * 2.2, car.pos.z + side.z * 2.2, car.angle);
  player.setVisible(true);
  G.playerInCar = false;
  G.playerCar = null;
  audio.setEngine(false);
  if (!silent) audio.door();
}

function enterVehicle(car) {
  const firstSteal = !car.playerDriven;
  car.playerDriven = true;
  car.role = 'player';
  G.playerInCar = true;
  G.playerCar = car;
  player.setVisible(false);
  audio.door();
  audio.wake();
  if (firstSteal) {
    G.state.stats.steals++;
    police.reportCrime('steal', car.pos.x, car.pos.z, G);
    if (car.occupied) hud.toast('Driver ejected — the car is yours, the heat too');
  }
  car.occupied = false;
}

function nearestCar(maxDist) {
  let best = null, bestD = maxDist;
  for (const car of G.cars) {
    if (car.role === 'police' && car.health <= 0) continue;
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function inSprayZone() {
  const z = city.places.spray.zone;
  return G.playerPos.x > z.x0 && G.playerPos.x < z.x1 && G.playerPos.z > z.z0 && G.playerPos.z < z.z1;
}

function tryInteract() {
  if (G.playerInCar) {
    if (inSprayZone() && Math.abs(G.playerCar.speed) < 1.2) {
      if (G.state.cash >= PRICES.respray) {
        G.state.cash -= PRICES.respray;
        G.playerCar.health = 100;
        const d = districtAt(G.playerPos.x, G.playerPos.z);
        police.washDistrict(d);
        audio.cash();
        hud.banner("PAY'N'SPRAY", `${d.name} washed clean. Everywhere else cools by half.`, 2800);
      } else {
        hud.toast(`Respray costs $${PRICES.respray} — you are short`);
      }
      return;
    }
    if (Math.abs(G.playerCar.speed) < 14) exitVehicle();
    return;
  }
  const car = nearestCar(3.4);
  if (car) { enterVehicle(car); return; }
  const p = city.places;
  const near = (place, r) => Math.hypot(player.pos.x - place.x, player.pos.z - place.z) < r;
  if (near(p.gunShop, 5)) {
    const o = combat.owned, c = G.state.cash;
    if (!o.pistol && c >= PRICES.pistol) buyGun('pistol', PRICES.pistol);
    else if (G.state.unlocked.shotgun && !o.shotgun && c >= PRICES.shotgun) buyGun('shotgun', PRICES.shotgun);
    else if (G.state.unlocked.rifle && !o.rifle && c >= PRICES.rifle) buyGun('rifle', PRICES.rifle);
    else if (c >= PRICES.ammoBox) {
      G.state.cash -= PRICES.ammoBox;
      combat.addAmmo();
      audio.cash();
      hud.toast('Ammo box bought — magazines topped up');
    } else hud.toast('Not enough cash at the Gun Runner');
    return;
  }
  if (near(p.hospital, 5.5)) {
    if (G.state.health >= 100) hud.toast('Solmar General: "You are fine. Next."');
    else if (G.state.cash >= PRICES.hospital) {
      G.state.cash -= PRICES.hospital;
      G.state.health = 100;
      audio.cash();
      hud.toast('Patched up to full health');
    } else hud.toast(`Treatment costs $${PRICES.hospital}`);
    return;
  }
  if (near(p.diner, 5)) {
    if (G.state.health >= 100) hud.toast('Café Brisa: you are full already');
    else if (G.state.cash >= PRICES.diner) {
      G.state.cash -= PRICES.diner;
      G.state.health = Math.min(100, G.state.health + 35);
      audio.cash();
      hud.toast('A proper meal: +35 health');
    } else hud.toast(`A meal costs $${PRICES.diner}`);
  }
}

function buyGun(key, price) {
  G.state.cash -= price;
  combat.unlock(key);
  combat.current = key;
  audio.cash();
  hud.toast(`${key[0].toUpperCase() + key.slice(1)} bought — press ${key === 'pistol' ? '2' : '3'} to draw it`);
  G.saveGame();
}

function currentPrompt() {
  if (G.playerInCar) {
    if (inSprayZone()) return Math.abs(G.playerCar.speed) < 1.2
      ? `E — Pay'n'Spray ($${PRICES.respray}): repair + wash this district's heat`
      : 'Stop in the bay to use the Pay\'n\'Spray';
    return 'E — Exit vehicle';
  }
  if (nearestCar(3.4)) return 'E — Enter vehicle';
  const p = city.places;
  const near = (place, r) => Math.hypot(player.pos.x - place.x, player.pos.z - place.z) < r;
  if (near(p.gunShop, 5)) return 'E — Gun Runner: buy guns and ammo';
  if (near(p.hospital, 5.5)) return `E — Solmar General: full heal $${PRICES.hospital}`;
  if (near(p.diner, 5)) return `E — Café Brisa: eat $${PRICES.diner} (+35 health)`;
  return null;
}

// ---------- the mission beacon: a pillar of gold light ----------
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.95, 0.95, 34, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
);
beacon.position.y = 17;
stage.scene.add(beacon);

// ---------- one simulation step ----------
function stepWorld(dt) {
  G.time += dt;
  G.clockMinutes += dt * TUNING.minutesPerSecond;
  city.update(dt);

  // who is "the player" for everyone else this step
  G.playerPos = G.playerInCar ? G.playerCar.pos : player.pos;
  if (G.playerInCar) {
    const f = G.playerCar.forward();
    G.playerVel = { x: f.x * G.playerCar.speed, z: f.z * G.playerCar.speed };
  } else {
    G.playerVel = { x: Math.sin(player.angle) * player.speedNow, z: Math.cos(player.angle) * player.speedNow };
  }

  if (!G.playerInCar) player.update(dt, G);
  fleet.update(dt, G);
  for (const ped of G.peds) ped.update(dt, G);
  police.update(dt, G);
  combat.update(dt, G);
  combat.updateHostiles(dt, G);
  missions.update(dt, G);
  updatePickups(dt);

  // standing traffic is a hazard: cars knock the player down too
  if (!G.playerInCar && G.mode === 'playing') {
    for (const car of G.cars) {
      if (car.role === 'parked' || car.role === 'blockade') continue;
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < 2.1 && Math.abs(car.speed) > 3.2 && G.time - (car.lastRamAt ?? -9) > 1.1) {
        car.lastRamAt = G.time;
        const f = car.forward();
        player.pos.x += f.x * 2.3;
        player.pos.z += f.z * 2.3;
        G.damagePlayer(Math.abs(car.speed) * 0.85, 'ram');
        if (car.role === 'traffic') car.speed *= 0.25;
      }
    }
  }

  // slow health regen once the shooting has been over for a while
  if (G.mode === 'playing' && G.state.health > 0 && G.time - G.lastHurtAt > TUNING.healthRegenDelay) {
    G.state.health = Math.min(100, G.state.health + TUNING.healthRegenRate * dt);
  }

  // audio beds follow the action
  if (G.playerInCar) {
    const load = Math.abs(G.playerCar.speed) / G.playerCar.maxSpeed;
    audio.setEngine(true, load + (input.down('KeyW') ? 0.25 : 0));
  } else {
    audio.setEngine(false);
  }
  const sirenD = police.nearestUnitDistance(G.playerPos.x, G.playerPos.z, G);
  audio.setSiren(police.stars > 0 && sirenD < 65, sirenD === Infinity ? 65 : sirenD);

  // the beacon stands on the objective
  const obj = missions.objective(G);
  if (obj.marker && G.mode === 'playing') {
    beacon.visible = true;
    beacon.position.x = obj.marker.x;
    beacon.position.z = obj.marker.z;
    beacon.material.opacity = 0.15 + Math.sin(G.time * 3.2) * 0.05;
  } else {
    beacon.visible = false;
  }
}

// ---------- camera ----------
const camTargetPos = new THREE.Vector3(0, 30, 90);
function updateCamera(dt) {
  const look = input.lookDelta();
  G.camYaw -= look.x * 0.0026;
  G.camPitch = THREE.MathUtils.clamp(G.camPitch + look.y * 0.0022, -0.14, 0.85);
  G.camKick *= Math.pow(0.001, dt); // recoil settles fast
  if (G.camKick < 0.0001) G.camKick = 0;

  const cam = stage.camera;
  if (G.mode === 'title' || G.mode === 'shot') {
    if (G.mode === 'title') {
      const t = G.time * 0.05;
      camTargetPos.set(Math.sin(t) * 95 - 30, 30 + Math.sin(G.time * 0.13) * 4, Math.cos(t) * 95 + 90);
      cam.position.lerp(camTargetPos, 1 - Math.exp(-dt * 2));
      cam.lookAt(-30, 6, 80);
    }
    return;
  }
  const focus = G.playerInCar ? G.playerCar.pos : player.pos;
  if (G.playerInCar) {
    // the camera swings behind a driven car unless the player is looking
    let want = G.playerCar.angle + Math.PI;
    let diff = want - G.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(look.x) < 0.5) G.camYaw += diff * Math.min(1, dt * 1.6);
  }
  const dist = G.playerInCar ? 8.8 : 5.7;
  const pitch = G.camPitch + G.camKick;
  const cx = focus.x + Math.sin(G.camYaw) * Math.cos(pitch) * dist;
  const cz = focus.z + Math.cos(G.camYaw) * Math.cos(pitch) * dist;
  const cy = focus.y + 1.6 + Math.sin(pitch) * dist + (G.playerInCar ? 1.1 : 0.4);
  camTargetPos.set(cx, Math.max(1.1, cy), cz);
  cam.position.lerp(camTargetPos, 1 - Math.exp(-dt * (G.playerInCar ? 7 : 11)));
  const lookAt = new THREE.Vector3(
    focus.x - Math.sin(G.camYaw) * 4,
    focus.y + 1.7,
    focus.z - Math.cos(G.camYaw) * 4
  );
  cam.lookAt(lookAt);
  G.aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
  stage.followShadows(focus.x, focus.z);
}

// ---------- screens and buttons ----------
const shotName = params.get('shot');
function startRun(useSave) {
  const save = useSave ? loadSave() : null;
  if (save) {
    G.state.cash = save.cash;
    missions.index = save.missionIndex;
    if (save.missionIndex >= 8) missions.done = true;
    combat.owned.pistol = save.owned.pistol;
    combat.owned.shotgun = save.owned.shotgun;
    combat.owned.rifle = save.owned.rifle;
    if (save.owned.shotgun) combat.unlock('shotgun');
    if (save.owned.rifle) combat.unlock('rifle');
    if (save.owned.pistol) combat.unlock('pistol');
    G.state.unlocked = { ...save.unlocked };
    G.state.stats = { ...save.stats };
  } else {
    missions.index = 0;
    missions.done = false;
    G.state.cash = 250;
    G.state.stats = defaultSave().stats;
    G.state.unlocked = { shotgun: false, rifle: false };
    combat.owned = { fists: true, pistol: false, shotgun: false, rifle: false };
    combat.current = 'fists';
  }
  G.state.health = 100;
  G.mode = 'playing';
  hud.showScreen(null);
  audio.wake();
  hud.banner('SOLMAR BAY', missions.done ? 'The story is told. The city is yours.' : 'Meet the fixer. Mind the heat — it belongs to the district, not to you.', 4600);
}

document.getElementById('btn-start').addEventListener('click', () => startRun(false));
document.getElementById('btn-continue').addEventListener('click', () => startRun(true));
document.getElementById('btn-howto').addEventListener('click', () => {
  document.getElementById('howto-panel').classList.toggle('show');
});
document.getElementById('btn-resume').addEventListener('click', () => {
  G.mode = 'playing';
  hud.showScreen(null);
});
document.getElementById('btn-again').addEventListener('click', respawn);
document.getElementById('btn-roam').addEventListener('click', () => {
  G.mode = 'playing';
  hud.showScreen(null);
});
canvas.addEventListener('click', () => {
  audio.wake();
  if (G.mode === 'playing') input.lockPointer();
});
document.addEventListener('pointerlockchange', () => {
  if (!input.locked && G.mode === 'playing' && !shotName) {
    G.mode = 'paused';
    hud.showScreen('screen-pause');
  }
});
if (loadSave()) document.getElementById('btn-continue').classList.add('show');

// ---------- the frame loop ----------
let last = performance.now();
let saveTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (shotName) {
    // screenshot scenes step themselves deterministically; the loop only
    // keeps the canvas warm between the director's own steps
    stage.renderer.render(stage.scene, stage.camera);
    return;
  }
  if (G.mode === 'playing') {
    stepWorld(dt);
    if (input.pressed('KeyE')) tryInteract();
    if (input.pressed('KeyP')) {
      G.mode = 'paused';
      hud.showScreen('screen-pause');
      input.unlockPointer();
    }
    hud.setPrompt(currentPrompt());
    G.state.stats.playSeconds += dt;
    saveTimer += dt;
    if (saveTimer > 20) { saveTimer = 0; G.saveGame(); }
  } else if (G.mode === 'title') {
    G.time += dt;
    city.update(dt);
    fleet.update(dt, G);
    for (const ped of G.peds) ped.update(dt, G);
  } else if (G.mode === 'paused' && input.pressed('KeyP')) {
    G.mode = 'playing';
    hud.showScreen(null);
  }
  updateCamera(dt);
  if (G.mode === 'playing' || G.mode === 'paused') hud.update(G);
  stage.renderer.render(stage.scene, stage.camera);
  input.endFrame();
}
requestAnimationFrame(frame);

if (shotName) {
  hud.showScreen(null);
  document.getElementById('hud').classList.add('show');
  stageShot(G, shotName, { stepWorld, updateCamera, render: () => stage.renderer.render(stage.scene, stage.camera) });
}
