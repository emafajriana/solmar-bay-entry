// main.js — SOLMAR BAY's conductor. It builds the world (stage, city,
// traffic, crowds, police, missions), owns the player's profile (cash,
// health, weapons, stats), runs the fixed-step simulation, and moves the
// game between its states: title, brief, playing, shop, pause, over,
// victory — plus the frozen staged scenes the screenshots are taken from.
//
// The simulation always advances in fixed 1/30 s steps, however fast the
// display runs, so a seeded world plays out identically every time.

import * as THREE from 'three';
import { WORLD, PLACES, SHOPS, TUNING, WEAPONS, RADIO_STATIONS, districtAt } from './config.js';
import { makeRng } from './rng.js';
import { createStage } from './render.js';
import { buildCity } from './city.js';
import { createInput, createScriptedInput } from './input.js';
import { createAudio } from './audio.js';
import { createVehicles } from './vehicles.js';
import { createPeds } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { parseShot, stageShot, driveAutopilot } from './shots.js';

const canvas = document.getElementById('game');
const shotInfo = parseShot(window.location.search);
const seed = shotInfo ? shotInfo.seed : 20261117;
const rng = makeRng(seed);

const stage = createStage(canvas);
const city = buildCity(rng.fork(11));
stage.scene.add(city.group);
const vehicles = createVehicles(rng.fork(23), city);
stage.scene.add(vehicles.group);
const peds = createPeds(rng.fork(37), city);
stage.scene.add(peds.group);
const combat = createCombat(rng.fork(41), city, stage.scene);
const police = createPolice(rng.fork(53), city, vehicles, combat);
const avatar = createPlayer(rng.fork(67), city, { x: PLACES.motel.x + 4, z: PLACES.motel.z + 10 });
stage.scene.add(avatar.parts.group);
const audio = createAudio();
const hud = createHud();
const input = shotInfo ? createScriptedInput() : createInput(canvas);

vehicles.spawnTraffic(15);
vehicles.spawnParked(30);
peds.spawn(46);

// The mission beacon: a column of gold light over the current objective.
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(1.15, 1.15, 34, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false }),
);
beacon.visible = false;
stage.scene.add(beacon);

const G = {
  time: 0,
  rng,
  stage,
  city,
  vehicles,
  peds,
  combat,
  police,
  hud,
  audio,
  input,
  districtAt,
  playerAvatar: avatar,
  playerCar: null,
  missions: null,
  profile: {
    mode: 'foot',
    hp: TUNING.maxHealth,
    cash: 250,
    weapon: 'pistol',
    owned: { pistol: true, shotgun: false, rifle: false },
    ammo: { pistol: 48, shotgun: 0, rifle: 0 },
    fireCd: 0,
    lastHurtT: -99,
    hurtSndT: -99,
  },
  stats: { earned: 0, steals: 0, kills: 0, busts: 0, wasted: 0 },
  panic: null,
  clockMinutes: 10 * 60,
  clockText: '10:00',
  radioStation: RADIO_STATIONS[0],
  radioT: 0,
  state: shotInfo ? 'shot' : 'title',
  shotCam: null,
  auto: null,
  frozen: false,
};
G.missions = createMissions(G);

G.playerFocus = () =>
  G.profile.mode === 'car' && G.playerCar ? { x: G.playerCar.x, z: G.playerCar.z } : { x: avatar.x, z: avatar.z };
G.crime = (kind, x, z) => police.addCrime(kind, x, z);
G.setPanic = (x, z) => {
  G.panic = { x, z, t: G.time };
};
G.addCash = (amount) => {
  G.profile.cash += amount;
  if (amount > 0) G.stats.earned += amount;
};
G.hurtPlayer = (damage, fromX, fromZ) => {
  void fromX;
  void fromZ;
  if (G.state !== 'playing' && G.state !== 'shot') return;
  if (G.state === 'shot') return; // staged scenes are photo ops: no damage
  const p = G.profile;
  p.hp -= damage * (p.mode === 'car' ? 0.55 : 1);
  p.lastHurtT = G.time;
  if (G.time - p.hurtSndT > 0.25) {
    p.hurtSndT = G.time;
    audio.hurt();
  }
  if (p.hp <= 0) {
    p.hp = 0;
    gameOver('wasted');
  }
};
G.onHostileDown = (hostile) => {
  if (hostile.kind === 'gang') G.stats.kills++;
};
G.onBusted = () => gameOver('busted');
G.onMissionComplete = (def) => {
  G.addCash(def.reward);
  audio.jingle(true);
  hud.banner('JOB COMPLETE', `${def.title} · +$${def.reward.toLocaleString('en-US')}`);
  const doneIndex = G.missions.index - 1;
  if (doneIndex === 3) {
    G.profile.owned.shotgun = true;
    G.profile.ammo.shotgun += 18;
    hud.toast('SHOTGUN unlocked — press 3. Carmen left shells with it.', 4);
  }
  if (doneIndex === 5) {
    G.profile.owned.rifle = true;
    G.profile.ammo.rifle += 90;
    hud.toast('RIFLE unlocked — press 4.', 4);
  }
  saveGame();
  if (G.missions.allDone()) victory();
};
G.onMissionFailed = (def, reason) => {
  audio.jingle(false);
  hud.banner('JOB FAILED', `${reason} Take it again — ${def.title}`);
};
G.enterCar = (car, silent = false) => {
  if (!silent) {
    if (car.occupied) G.crime('stealOccupied', car.x, car.z);
    else G.crime('stealParked', car.x, car.z);
    G.stats.steals++;
    audio.blip();
  }
  car.occupied = false;
  if (car.kind === 'traffic') {
    car.kind = 'parked';
    car.ai = null;
  }
  G.playerCar = car;
  G.profile.mode = 'car';
  avatar.parts.group.visible = false;
};
window.SOLMAR = G;

// ---------------------------------------------------------------- saves
function saveGame() {
  storeSave({
    cash: G.profile.cash,
    missionIndex: G.missions.index,
    owned: G.profile.owned,
    ammo: G.profile.ammo,
    stats: G.stats,
  });
}

function applySave(data) {
  if (!data) return false;
  G.profile.cash = data.cash ?? G.profile.cash;
  G.missions.index = Math.min(data.missionIndex ?? 0, G.missions.defs.length);
  Object.assign(G.profile.owned, data.owned ?? {});
  Object.assign(G.profile.ammo, data.ammo ?? {});
  Object.assign(G.stats, data.stats ?? {});
  return true;
}

// ---------------------------------------------------------------- states
function setState(next) {
  G.state = next;
  input.setLockWanted(next === 'playing');
  hud.setHudVisible(next === 'playing' || next === 'shot');
}

function resetProfile() {
  const p = G.profile;
  p.mode = 'foot';
  p.hp = TUNING.maxHealth;
  p.cash = 250;
  p.weapon = 'pistol';
  p.owned = { pistol: true, shotgun: false, rifle: false };
  p.ammo = { pistol: 48, shotgun: 0, rifle: 0 };
  G.playerCar = null;
  G.stats = { earned: 0, steals: 0, kills: 0, busts: 0, wasted: 0 };
  G.missions.index = 0;
  police.clearAll();
  avatar.parts.group.visible = true;
  avatar.x = PLACES.motel.x + 4;
  avatar.z = PLACES.motel.z + 10;
}

function startGame(useSave) {
  G.shotCam = null;
  if (useSave) applySave(loadSave());
  else {
    clearSave();
    resetProfile();
  }
  hud.showScreen(null);
  setState('playing');
  audio.unlock();
  audio.ambient(true);
  hud.toast(
    G.missions.index === 0 ? 'Find work: the phone at the Marina Motel is ringing.' : 'Back to work — see Carmen at her bar.',
    4.2,
  );
}

function gameOver(kind) {
  if (G.state === 'over') return;
  const p = G.profile;
  if (kind === 'busted') G.stats.busts++;
  else G.stats.wasted++;
  const fine = Math.min(p.cash, Math.max(50, Math.floor(p.cash * 0.1)));
  p.cash -= fine;
  police.halveAll();
  hud.setText('over-title', kind === 'busted' ? 'BUSTED' : 'WASTED');
  hud.setText(
    'over-text',
    kind === 'busted'
      ? `Solmar PD walks you out of the station $${fine} lighter. Your heat is halved — the bay forgets, slowly.`
      : `You wake up at Bay General with a $${fine} hospital bill. Your heat is halved while you recover.`,
  );
  setState('over');
  hud.showScreen('over');
}

function respawn() {
  const p = G.profile;
  p.hp = TUNING.maxHealth;
  p.mode = 'foot';
  G.playerCar = null;
  avatar.parts.group.visible = true;
  avatar.x = PLACES.hospital.x;
  avatar.z = PLACES.hospital.z + 14;
  avatar.y = 0;
  avatar.vy = 0;
  hud.showScreen(null);
  setState('playing');
}

function victory() {
  const s = G.stats;
  hud.setText(
    'victory-stats',
    `Jobs done: 8 · Earned: $${s.earned.toLocaleString('en-US')} · Cars stolen: ${s.steals} · Tiburones down: ${s.kills} · Busted: ${s.busts} · Wasted: ${s.wasted}`,
  );
  saveGame();
  setState('victory');
  hud.showScreen('victory');
}

// ---------------------------------------------------------------- shops
function openShop() {
  setState('shop');
  hud.showScreen('shop');
  renderShop();
}

function renderShop() {
  const p = G.profile;
  const items = [];
  const gun = (id, label, price, can, onBuy) => ({ id, label, price, can, onBuy });
  if (!p.owned.shotgun) items.push(gun('shotgun', 'Shotgun', WEAPONS.shotgun.price, p.cash >= WEAPONS.shotgun.price, () => { p.owned.shotgun = true; p.ammo.shotgun += 12; }));
  if (!p.owned.rifle) items.push(gun('rifle', 'Rifle', WEAPONS.rifle.price, p.cash >= WEAPONS.rifle.price, () => { p.owned.rifle = true; p.ammo.rifle += 40; }));
  items.push(gun('ammo-pistol', 'Pistol rounds ×24', 48, p.cash >= 48, () => { p.ammo.pistol += 24; }));
  if (p.owned.shotgun) items.push(gun('ammo-shotgun', 'Shotgun shells ×12', 72, p.cash >= 72, () => { p.ammo.shotgun += 12; }));
  if (p.owned.rifle) items.push(gun('ammo-rifle', 'Rifle rounds ×40', 120, p.cash >= 120, () => { p.ammo.rifle += 40; }));
  const list = document.getElementById('shop-items');
  list.innerHTML = '';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'shop-item';
    btn.textContent = `${item.label} — $${item.price}`;
    btn.disabled = !item.can;
    btn.addEventListener('click', () => {
      if (G.profile.cash < item.price) return;
      G.profile.cash -= item.price;
      item.onBuy();
      audio.cash();
      renderShop();
    });
    list.appendChild(btn);
  }
  hud.setText('shop-cash', `Cash: $${p.cash.toLocaleString('en-US')}`);
}

// ---------------------------------------------------------------- wiring
hud.on('btn-start', 'click', () => startGame(false));
hud.on('btn-continue', 'click', () => startGame(true));
hud.on('btn-how', 'click', () => hud.showScreen('how'));
hud.on('btn-how-back', 'click', () => hud.showScreen(G.state === 'paused' ? 'pause' : 'title'));
hud.on('btn-resume', 'click', () => {
  hud.showScreen(null);
  setState('playing');
});
hud.on('btn-quit-title', 'click', () => {
  G.shotCam = { cx: -30, cz: 120, r: 200, h: 52, a: 1.35 };
  hud.showScreen('title');
  setState('title');
});
hud.on('btn-over-restart', 'click', respawn);
hud.on('btn-victory-roam', 'click', () => {
  hud.showScreen(null);
  setState('playing');
});
hud.on('btn-brief-accept', 'click', () => {
  G.missions.begin();
  hud.showScreen(null);
  setState('playing');
  audio.blip();
});
hud.on('btn-brief-close', 'click', () => {
  hud.showScreen(null);
  setState('playing');
});
hud.on('btn-shop-close', 'click', () => {
  hud.showScreen(null);
  setState('playing');
});
if (!loadSave()) {
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = 'none';
}
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// ---------------------------------------------------------------- steps
function interact() {
  const p = G.profile;
  const focus = G.playerFocus();
  if (p.mode === 'foot') {
    // A new job?
    if (!G.missions.active && G.missions.currentDef()) {
      const offer = G.missions.offerPoint();
      if (Math.hypot(focus.x - offer.x, focus.z - offer.z) < 6) {
        const def = G.missions.currentDef();
        hud.setText('brief-title', def.title);
        hud.setText('brief-text', def.brief);
        hud.setText('brief-reward', `Pays $${def.reward.toLocaleString('en-US')}`);
        setState('brief');
        hud.showScreen('brief');
        return;
      }
    }
    // A car?
    const car = vehicles.nearestCar(focus.x, focus.z, 3.4);
    if (car) {
      G.enterCar(car);
      return;
    }
    // A shop?
    for (const ring of city.rings) {
      if (Math.hypot(focus.x - ring.x, focus.z - ring.z) > 3.6) continue;
      if (ring.shop.kind === 'guns') openShop();
      else if (ring.shop.kind === 'diner') {
        if (p.hp >= TUNING.maxHealth) hud.toast('You feel fine. The coffee is still good.');
        else if (p.cash < 40) hud.toast('A meal and a patch-up costs $40 — you are short.');
        else {
          p.cash -= 40;
          p.hp = TUNING.maxHealth;
          audio.cash();
          hud.toast('Patched up and fed. Full health.');
        }
      }
      return;
    }
  } else if (p.mode === 'car' && G.playerCar) {
    // Drive-in respray?
    for (const ring of city.rings) {
      if (ring.shop.kind !== 'spray') continue;
      if (Math.hypot(focus.x - ring.x, focus.z - ring.z) < 5.5) {
        const cost = police.resprayCost(focus.x, focus.z);
        if (G.playerCar.hp >= 100 && police.effectiveHeat(focus.x, focus.z) < 1) {
          hud.toast('The car is mint and nobody is looking for it.');
        } else if (p.cash < cost) {
          hud.toast(`Respray and repairs cost $${cost} — you are short.`);
        } else {
          p.cash -= cost;
          police.respray(focus.x, focus.z);
          G.playerCar.hp = 100;
          G.playerCar.dead = false;
          audio.cash();
          hud.banner("PAY'N'SPRAY", 'Fresh paint. This district forgets you.');
        }
        return;
      }
    }
    // Otherwise: get out.
    const car = G.playerCar;
    G.playerCar = null;
    p.mode = 'foot';
    avatar.parts.group.visible = true;
    avatar.x = car.x + Math.cos(car.heading) * 2.2;
    avatar.z = car.z - Math.sin(car.heading) * 2.2;
    avatar.heading = car.heading;
    audio.engine(0, false);
  }
}

function interactHint() {
  if (G.state !== 'playing') return null;
  const p = G.profile;
  const focus = G.playerFocus();
  if (p.mode === 'foot') {
    if (!G.missions.active && G.missions.currentDef()) {
      const offer = G.missions.offerPoint();
      if (Math.hypot(focus.x - offer.x, focus.z - offer.z) < 6) return 'E — Talk to Carmen';
    }
    const car = vehicles.nearestCar(focus.x, focus.z, 3.4);
    if (car) return car.occupied ? 'E — Steal the car' : 'E — Enter car';
    for (const ring of city.rings) {
      if (Math.hypot(focus.x - ring.x, focus.z - ring.z) < 3.6) {
        if (ring.shop.kind === 'guns') return 'E — Gun Runner';
        if (ring.shop.kind === 'diner') return 'E — Eat & heal ($40)';
      }
    }
  } else {
    for (const ring of city.rings) {
      if (ring.shop.kind === 'spray' && Math.hypot(focus.x - ring.x, focus.z - ring.z) < 5.5) {
        return `E — Respray & repair ($${police.resprayCost(focus.x, focus.z)})`;
      }
    }
    return 'E — Exit car';
  }
  return null;
}

let prevFiring = false;
function stepPlaying(dt) {
  const p = G.profile;
  if (input.take('KeyE')) interact();
  if (input.take('KeyP')) {
    setState('paused');
    hud.showScreen('pause');
    return;
  }
  for (const [code, weapon] of [
    ['Digit1', 'fist'],
    ['Digit2', 'pistol'],
    ['Digit3', 'shotgun'],
    ['Digit4', 'rifle'],
  ]) {
    if (input.take(code) && (weapon === 'fist' || p.owned[weapon])) {
      p.weapon = weapon;
      audio.blip();
    }
  }
  if (p.mode === 'foot') {
    avatar.update(dt, input, G);
    if (input.take('KeyF')) {
      const keep = p.weapon;
      p.weapon = 'fist';
      combat.playerFire(G);
      p.weapon = keep;
    }
  } else if (G.playerCar) {
    const mouse = input.drainMouse();
    avatar.camYaw -= mouse.dx * 0.0026;
    avatar.camPitch = Math.max(-0.1, Math.min(1.1, avatar.camPitch + mouse.dy * 0.0022));
    // The camera settles in behind the car.
    let diff = G.playerCar.heading - avatar.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    avatar.camYaw += diff * Math.min(1, 2.6 * dt);
    avatar.x = G.playerCar.x;
    avatar.z = G.playerCar.z;
    vehicles.stepPlayerCar(G.playerCar, input, dt, {
      onHitCar(other, impact) {
        audio.crash(impact);
        if (other.kind === 'cop') G.crime('hitPoliceCar', other.x, other.z);
      },
      onHitBuilding(impact) {
        audio.crash(impact);
      },
    });
    // Running people down is a crime and a mess.
    if (Math.abs(G.playerCar.speed) > 4) {
      for (const ped of peds.list) {
        if (!ped.dead && Math.hypot(ped.x - G.playerCar.x, ped.z - G.playerCar.z) < 2.0) {
          peds.damage(ped, 65);
          G.crime('hitPedestrian', ped.x, ped.z);
          G.setPanic(ped.x, ped.z);
          audio.crash(4);
        }
      }
      for (const h of combat.hostiles) {
        if (!h.dead && Math.hypot(h.x - G.playerCar.x, h.z - G.playerCar.z) < 2.0) {
          combat.damageHostile(h, 75, G);
          if (h.kind === 'cop') police.addHeat(h.x, h.z, 18);
          audio.crash(4);
        }
      }
    }
  }
  // Firing: click for semi-auto, hold for the rifle.
  p.fireCd -= dt;
  const firing = input.firing();
  const weapon = WEAPONS[p.weapon];
  const trigger = weapon.auto ? firing : firing && !prevFiring;
  prevFiring = firing;
  if (trigger && p.fireCd <= 0 && p.weapon !== 'fist') {
    p.fireCd = weapon.cooldown;
    combat.playerFire(G);
  }
  // Health regen, out of combat.
  if (p.hp > 0 && G.time - p.lastHurtT > TUNING.regenDelay) {
    p.hp = Math.min(TUNING.maxHealth, p.hp + TUNING.regenRate * dt);
  }
  hud.setInteract(interactHint());
}

function stepWorld(dt, full) {
  G.time += dt;
  G.clockMinutes = (G.clockMinutes + dt) % (24 * 60);
  const hh = Math.floor(G.clockMinutes / 60);
  const mm = Math.floor(G.clockMinutes % 60);
  G.clockText = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  G.radioT += dt;
  if (G.radioT > 45) {
    G.radioT = 0;
    const at = RADIO_STATIONS.indexOf(G.radioStation);
    G.radioStation = RADIO_STATIONS[(at + 1) % RADIO_STATIONS.length];
  }
  city.update(G.time);
  vehicles.update(dt, G, G.time);
  peds.update(dt, G);
  combat.update(dt, G);
  if (full) {
    police.update(dt, G);
    G.missions.update(dt);
  }
  const marker = G.missions.marker;
  beacon.visible = !!marker && (G.state === 'playing' || G.state === 'shot');
  if (marker) beacon.position.set(marker.x, 17, marker.z);
}

function stepSim(dt) {
  if (G.state === 'playing' || G.state === 'shot') {
    if (G.state === 'shot') driveAutopilot(G, dt);
    stepPlaying(dt);
    stepWorld(dt, true);
  } else if (['title', 'how', 'victory', 'over'].includes(G.state)) {
    stepWorld(dt, false);
  }
}

// ---------------------------------------------------------------- loop
function placeGameCamera() {
  if (G.shotCam) {
    const c = G.shotCam;
    const a = c.a + G.time * 0.03;
    const pos = new THREE.Vector3(c.cx + Math.cos(a) * c.r, c.h, c.cz + Math.sin(a) * c.r);
    stage.lookThrough(pos, new THREE.Vector3(c.cx, 4, c.cz - 10));
    stage.followShadows(c.cx, c.cz);
    return;
  }
  if (G.profile.mode === 'car' && G.playerCar) {
    avatar.placeCamera(stage, { x: G.playerCar.x, y: 0.6, z: G.playerCar.z }, 10.5);
  } else {
    avatar.placeCamera(stage, { x: avatar.x, y: avatar.y, z: avatar.z }, 7.4);
  }
}

if (shotInfo) {
  hud.showScreen(null);
  const steps = stageShot(G, shotInfo.name);
  // Step the staged scene with the camera placed every step, exactly as
  // the live loop would, so aimed fire and chases play out truly.
  for (let i = 0; i < steps; i++) {
    stepSim(1 / 30);
    placeGameCamera();
  }
  stage.render();
  stage.render();
  G.frozen = true;
  window.__shotReady = true;
} else {
  hud.showScreen('title');
  hud.setHudVisible(false);
  // A slow orbit over the bay behind the title card.
  G.shotCam = { cx: -30, cz: 120, r: 200, h: 52, a: 1.35 };
}

let last = performance.now();
let acc = 0;
const STEP = 1 / 30;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.12) dt = 0.12;
  if (!G.frozen) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      stepSim(STEP);
      acc -= STEP;
      n++;
    }
    if (n === 5) acc = 0;
    // Audio beds follow the action.
    if (G.state === 'playing') {
      const inCar = G.profile.mode === 'car' && G.playerCar;
      audio.engine(inCar ? Math.abs(G.playerCar.speed) / 40 : 0, !!inCar);
      let nearestCop = Infinity;
      for (const car of vehicles.cars) {
        if (car.kind !== 'cop' || car.dead) continue;
        const focus = G.playerFocus();
        nearestCop = Math.min(nearestCop, Math.hypot(car.x - focus.x, car.z - focus.z));
      }
      audio.siren(nearestCop < 65, nearestCop === Infinity ? 0 : 1 - nearestCop / 65);
    } else {
      audio.engine(0, false);
      audio.siren(false, 0);
    }
  }
  if (G.state !== 'shot') {
    if (G.state === 'playing' || G.state === 'title' || G.state === 'how') placeGameCamera();
  } else {
    placeGameCamera();
  }
  if (G.state === 'playing' || G.state === 'shot') hud.refresh(G);
  hud.update();
  stage.render();
}
requestAnimationFrame(frame);
