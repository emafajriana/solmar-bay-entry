// SOLMAR BAY — boot, the one fixed-step loop, screens, shops, pickups,
// game-over / victory, and the ?shot= staging used for screenshots.
// The game is original: its city, characters, story and names are its own.

import * as THREE from 'three';
import { STEP, LANDMARKS, SHOPS, WEAPONS, districtAt } from './config.js';
import { createRandom, range } from './rng.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, ACTION_USE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { createPlayer, enterCar, exitCar, nearestCar, resetPlayer, updatePlayerOnFoot } from './player.js';
import { damageSmoke, driveCar, spawnParkedCars, spawnTraffic, updateTraffic } from './vehicles.js';
import { nearestPed, spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { addWanted, clearWanted, createPolice, updatePolice } from './police.js';
import { createCombat, punch, shoot, updateCombat } from './combat.js';
import { MISSIONS, failMission, missionObjective, retryMission, startMission, updateBeacon, updateMissions } from './missions.js';
import { createHud, renderMissionList, showBanner, updateHud } from './hud.js';
import { loadSave, writeSave } from './save.js';
import { SCREEN_HOWTO, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY, createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = createRenderer(canvas);
const scene = renderer.scene;
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud();
const city = buildCity(scene, rng);

// Test / autopilot input: shots and the play-test drive through this.
const testInput = {
  enabled: false, forward: 0, strafe: 0,
  move() { return { forward: this.forward, strafe: this.strafe }; },
  running() { return false; },
  jumping() { return false; },
  shooting() { return false; },
  lookDelta() { return { dx: 0, dy: 0 }; },
  weaponKey() { return null; },
  takeActions() { return 0; },
};
function effectiveInput() {
  return testInput.enabled ? testInput : input;
}

const saved = loadSave();
const player = createPlayer(scene);
const parkedCars = spawnParkedCars(scene, rng, city);
const trafficCars = spawnTraffic(scene, rng, city, 14);
const peds = spawnPedestrians(scene, rng, 24);
const police = createPolice(scene);
const combat = createCombat(scene);

const state = {
  THREE, scene, city, rng, input, testInput,
  player, peds, police, combat,
  cars: [...parkedCars, ...trafficCars],
  trafficCars, parkedCars,
  enemies: [],
  missions: MISSIONS,
  missionIndex: 0, missionStage: 0, missionTimer: 0,
  missionFailed: false, missionComplete: false,
  wanted: 0, wantedTimer: 0, lastCrimeAt: -1000,
  time: 0, screen: SCREEN_TITLE, district: 'Beachfront',
  message: '', prompt: '', bannerText: '', bannerUntil: 0,
  stats: { kills: 0, carsStolen: 0, cashEarned: 0 },
  missionsDone: saved ? saved.missionsDone : 0,
  bestCash: saved ? saved.bestCash : 0,
  busted: false, wasted: false,
  danger: null, lastShotAt: -1000, lastHurtAt: -1000,
  pickups: [],
  prevHp: 100,
};

// Cash-drop pickups scattered around the city.
function spawnPickups() {
  const spots = [[-25, -25], [75, 25], [-75, 75], [125, -75], [-125, -25], [25, 175]];
  for (const [x, z] of spots) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.25, 12),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71 }),
    );
    mesh.position.set(x, 0.5, z);
    scene.add(mesh);
    state.pickups.push({ mesh, x, z, amount: 50, taken: false });
  }
}
spawnPickups();

// A starter car parked right by the spawn, on the x=25 road facing north,
// so the first drive is seconds away and heads straight up a clear road.
const starterCar = parkedCars[0];
if (starterCar) {
  starterCar.x = 25;
  starterCar.z = 168;
  starterCar.angle = Math.PI;
  starterCar.mesh.position.set(25, 0, 168);
  starterCar.mesh.rotation.y = Math.PI;
}

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function setScreen(next) {
  state.screen = next;
  for (const name of ['title', 'howto', 'play', 'paused', 'over', 'victory']) {
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.toggle('active', name === next || (name === 'play' && next === SCREEN_PLAY));
  }
  // The HUD only shows while playing (or paused over the game).
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.style.display = (next === SCREEN_PLAY || next === SCREEN_PAUSED) ? 'block' : 'none';
}

function startGame(fresh) {
  const keepCash = fresh ? (saved ? saved.cash : 150) : state.player.cash;
  resetPlayer(player, keepCash, state.missionsDone);
  state.wanted = 0;
  state.busted = false;
  state.wasted = false;
  state.time = 0;
  state.missionFailed = false;
  state.missionComplete = false;
  state.stats = { kills: 0, carsStolen: 0, cashEarned: 0 };
  clearWanted(state);
  for (const e of state.enemies) { e.alive = false; e.mesh.visible = false; }
  state.enemies = [];
  for (const pk of state.pickups) { pk.taken = false; pk.mesh.visible = true; }
  startMission(state, 0, rng, null);
  renderMissionList(state, hud);
  setScreen(SCREEN_PLAY);
  audio.unlock();
  announce('Playing SOLMAR BAY. Mission 1: drive to Carmen\'s bar.');
}

function endGame(kind) {
  const penalty = Math.min(100, Math.round(player.cash));
  player.cash = Math.max(0, player.cash - penalty);
  writeSave(state);
  const title = document.getElementById('over-title');
  const detail = document.getElementById('over-detail');
  if (title) title.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  if (detail) {
    detail.textContent = kind === 'busted'
      ? `Solmar PD arrested you. You lost $${penalty}. Missions done: ${state.missionsDone}.`
      : `You were wasted on the streets of Solmar. You lost $${penalty}. Missions done: ${state.missionsDone}.`;
  }
  setScreen(SCREEN_OVER);
  audio.fail();
  announce(kind === 'busted' ? 'Busted. Game over.' : 'Wasted. Game over.');
}

function victory() {
  writeSave(state);
  const detail = document.getElementById('victory-detail');
  if (detail) {
    detail.textContent = `All 8 missions done. Cash $${Math.round(player.cash)} • Kills ${state.stats.kills} • Cars stolen ${state.stats.carsStolen} • Cash earned $${state.stats.cashEarned}. Solmar Bay is yours, boss.`;
  }
  setScreen(SCREEN_VICTORY);
  audio.jingle();
  announce('Victory. You are the King of the Bay.');
}

function nearestShop() {
  const p = player;
  const x = p.onFoot ? p.x : p.car.x;
  const z = p.onFoot ? p.z : p.car.z;
  let best = null;
  let bestD = 9;
  for (const shop of SHOPS) {
    const d = Math.hypot(shop.x - x, shop.z - z);
    if (d < bestD) { bestD = d; best = shop; }
  }
  return best;
}

function useShop(shop) {
  const p = player;
  if (p.cash < shop.price) {
    state.message = `Not enough cash for ${shop.name} ($${shop.price}).`;
    return;
  }
  if (shop.kind === 'gun') {
    p.cash -= shop.price;
    p.ammo += 12;
    state.message = `+12 pistol ammo ($${shop.price}). Ammo: ${p.ammo}.`;
    audio.pickup();
  } else if (shop.kind === 'diner') {
    p.cash -= shop.price;
    p.hp = Math.min(100, p.hp + 50);
    state.message = `Ate at Diner Sol — +50 HP ($${shop.price}).`;
    audio.pickup();
  } else if (shop.kind === 'hospital') {
    p.cash -= shop.price;
    p.hp = 100;
    state.message = `Hospital patched you up — full health ($${shop.price}).`;
    audio.pickup();
  } else if (shop.kind === 'spray') {
    const car = nearestCar(player, state.cars, 10) || p.car;
    if (!car) {
      state.message = "Pay'n'Spray needs a car nearby — bring one in.";
      return;
    }
    p.cash -= shop.price;
    car.health = 100;
    if (car.smoke) { car.mesh.remove(car.smoke); car.smoke = null; }
    clearWanted(state);
    state.message = `Resprayed + repaired — wanted cleared ($${shop.price}).`;
    audio.pickup();
  }
}

function handleUse() {
  const p = player;
  if (p.onFoot) {
    const shop = nearestShop();
    const car = nearestCar(p, state.cars, 4.5);
    if (shop && (!car || Math.hypot(shop.x - p.x, shop.z - p.z) < Math.hypot(car.x - p.x, car.z - p.z))) {
      useShop(shop);
      return;
    }
    if (car) {
      const wasOccupied = car.occupied || car.traffic;
      enterCar(p, car);
      if (wasOccupied) {
        state.stats.carsStolen += 1;
        addWanted(state, 1, `You stole a ${car.name} — +1 star!`);
        audio.crash();
      } else {
        state.message = `Driving the ${car.name}. WASD to drive, Space handbrake, E to get out.`;
      }
      audio.unlock();
      return;
    }
    if (shop) useShop(shop);
  } else {
    exitCar(p);
    state.message = 'On foot. E near a car to drive it.';
  }
}

function handlePunch() {
  punch(state, audio);
}

function checkPickups() {
  const p = player;
  if (!p.onFoot) return;
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    if (Math.hypot(pk.x - p.x, pk.z - p.z) < 1.8) {
      pk.taken = true;
      pk.mesh.visible = false;
      p.cash += pk.amount;
      state.stats.cashEarned += pk.amount;
      state.message = `Cash pickup +$${pk.amount}!`;
      audio.pickup();
    }
  }
}

function stepWorld(dt, shotMode, frameActions) {
  const inp = effectiveInput();
  state.time += dt;
  const p = player;
  const prevHp = p.hp;

  // Actions (real input only; shots drive through testInput). The frame
  // loop owns takeActions() and hands this step's flags in, so a press
  // is never consumed twice or lost between steps.
  if (!shotMode) {
    const actions = frameActions || 0;
    if (actions & ACTION_USE) handleUse();
    if (actions & ACTION_PUNCH) handlePunch();
    if (actions & ACTION_RELOAD) state.message = 'Ammo is one pool — buy more at GUN RUNNER.';
    const weapon = inp.weaponKey();
    if (weapon && p.unlocked[weapon]) {
      p.weapon = weapon;
      state.message = `${WEAPONS[weapon].name} ready. Ammo ${p.ammo}.`;
    } else if (weapon) {
      state.message = `${WEAPONS[weapon].name} unlocks later — finish missions.`;
    }
    if (inp.shooting()) shoot(state, combat, audio);
  }

  // Player / car.
  if (p.onFoot) {
    updatePlayerOnFoot(p, inp, dt, city);
  } else if (p.car) {
    driveCar(p.car, inp, dt, city, state.cars);
    damageSmoke(scene, p.car);
    if (p.car.health <= 0) {
      const car = p.car;
      exitCar(p);
      car.dead = true;
      car.mesh.visible = false;
      state.message = 'Your car is wrecked! Find another ride.';
      audio.crash();
    }
  }

  // World life.
  updateTraffic(trafficCars, dt, state.time, city, p.car);
  updatePedestrians(peds, dt, rng, state.danger);
  state.danger = null;
  updatePolice(state, dt, rng);
  updateCombat(state, combat, dt, audio);
  checkPickups();

  // Car vs pedestrian: running one over is a crime.
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 4) {
    for (const ped of peds) {
      if (!ped.alive) continue;
      if (Math.hypot(ped.x - p.car.x, ped.z - p.car.z) < 2.2) {
        ped.alive = false;
        ped.mesh.visible = false;
        addWanted(state, 1, 'You hit a pedestrian — +1 star!');
        audio.crash();
      }
    }
  }

  // Shop prompt.
  const shop = nearestShop();
  const carNear = p.onFoot ? nearestCar(p, state.cars, 4.5) : null;
  state.prompt = shop ? `${shop.name}: ${shop.blurb}` : carNear ? `Press E to enter the ${carNear.name}` : '';

  // District + mission.
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  state.district = districtAt(px, pz);
  const result = updateMissions(state, dt, rng, shotMode ? null : audio);
  if (result === 'victory' && !shotMode) victory();

  // Damage bookkeeping + death.
  if (p.hp < prevHp) state.lastHurtAt = state.time;
  if (p.hp <= 0 && !shotMode) {
    p.hp = 0;
    endGame('wasted');
    return;
  }
  if (state.busted && !shotMode) {
    endGame('busted');
    return;
  }
  if (state.missionFailed && !shotMode) {
    // R retries: handled in the frame loop via key state — see below.
  }

  // Audio follows the world.
  audio.setEngine(p.onFoot ? 0 : Math.abs(p.car ? p.car.speed : 0), !p.onFoot);
  audio.setSiren(state.wanted >= 2, state.time);
  updateHud(state, hud);
}

const game = {
  state, rng, testInput, startGame,
  stepWorld,
  debugEnterNearestCar() {
    const car = nearestCar(player, state.cars, 60);
    if (car) enterCar(player, car);
    return car;
  },
  debugTeleport(x, z) {
    player.x = x;
    player.z = z;
    if (player.car) { player.car.x = x; player.car.z = z; }
  },
};
window.__solmar = game;
window.__game = { state, start: () => startGame(true) };

function runShot(name) {
  testInput.enabled = true;
  const result = stageShot(name, game);
  state.screen = result.screen;
  setScreen(result.screen);
  updateHud(state, hud);
  // Paint many times, not twice: the chase camera lerps toward its target
  // each render, and only after ~30 frames has it settled behind the player.
  let painted = 0;
  function paint() {
    renderer.render(state, 1 / 60);
    painted += 1;
    if (painted < 40) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let retryHeld = false;

  function bindButton(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { audio.unlock(); fn(); });
  }
  bindButton('btn-start', () => startGame(true));
  bindButton('btn-continue', () => {
    if (saved) startGame(false);
    else startGame(true);
  });
  bindButton('btn-howto', () => setScreen(SCREEN_HOWTO));
  bindButton('btn-howto-back', () => setScreen(SCREEN_TITLE));
  bindButton('btn-resume', () => setScreen(SCREEN_PLAY));
  bindButton('btn-restart', () => startGame(true));
  bindButton('btn-retry-mission', () => { retryMission(state, rng, audio); setScreen(SCREEN_PLAY); });
  bindButton('btn-victory-restart', () => startGame(true));
  bindButton('btn-title', () => setScreen(SCREEN_TITLE));

  // Continue is only offered when a save exists.
  const cont = document.getElementById('btn-continue');
  if (cont && !saved) cont.style.display = 'none';
  renderMissionList(state, hud);
  setScreen(SCREEN_TITLE);
  announce('SOLMAR BAY. Press Start to play.');

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === SCREEN_PLAY) setScreen(SCREEN_PAUSED);
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (state.screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) startGame(true);
    else if (state.screen === SCREEN_OVER && (actions & ACTION_CONFIRM)) startGame(true);
    else if (state.screen === SCREEN_VICTORY && (actions & ACTION_CONFIRM)) startGame(true);
    else if ((actions & ACTION_PAUSE) && state.screen === SCREEN_PLAY) setScreen(SCREEN_PAUSED);
    else if ((actions & ACTION_PAUSE) && state.screen === SCREEN_PAUSED) setScreen(SCREEN_PLAY);
    else if ((actions & ACTION_CONFIRM) && state.screen === SCREEN_PAUSED) setScreen(SCREEN_PLAY);

    if (state.screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP) {
        stepWorld(STEP, false, firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
        if (state.screen !== SCREEN_PLAY) { accumulator = 0; break; }
      }
      // R retries a failed mission (held-key check, once per press).
      const retry = window.__retryKey || false;
      if (state.missionFailed && retry && !retryHeld) {
        retryHeld = true;
        retryMission(state, rng, audio);
      }
      if (!retry) retryHeld = false;
    } else {
      accumulator = 0;
      // Title screen still animates the city behind it.
      if (state.screen === SCREEN_TITLE) state.time += 1 / 60;
    }
    renderer.render(state, 1 / 60);
  }
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyR') window.__retryKey = true; });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyR') window.__retryKey = false; });
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
