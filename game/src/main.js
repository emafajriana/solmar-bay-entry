// SOLMAR BAY — the game itself: boot, the fixed-step loop, the camera,
// and the routing of every event the subsystems emit (crimes into
// District Heat, knockouts into cash drops, busts and wastes into the
// game-over screen). The subsystems each own one job; this file owns the
// whole.

import * as THREE from "three";
import { createStage } from "./render.js";
import { buildCity, lightPhase } from "./city.js";
import { Rng } from "./rng.js";
import { input } from "./input.js";
import { audio } from "./audio.js";
import { Car, initSmoke, updateSmoke, updateTraffic, seedTrafficCar } from "./vehicles.js";
import { Ped, spawnPeds } from "./pedestrians.js";
import { Player, groundHeight } from "./player.js";
import { Combat } from "./combat.js";
import { Police } from "./police.js";
import { MissionRunner, MISSIONS } from "./missions.js";
import { Hud } from "./hud.js";
import { loadSave, storeSave, freshSave, wipeSave } from "./save.js";
import { districtAt, EXTENT, RADIO, PRICES, CRIME_HEAT } from "./config.js";
import { planShot } from "./shots.js";

const params = new URLSearchParams(location.search);
const shotName = params.get("shot");
const seed = Number(params.get("seed") ?? 11);

const canvas = document.getElementById("game");
const stage = createStage(canvas);
const { scene, camera, renderer } = stage;

const rng = new Rng(shotName ? seed : (Date.now() % 90000) + 7);
const city = buildCity(scene, rng.fork(1));
initSmoke(scene);

const SPAWN = { x: 352, z: 610 };
let save = loadSave();
const hadSave = save.missionIndex > 0 || save.stats.missionsDone > 0;

const player = new Player(scene, SPAWN.x, SPAWN.z);
const combat = new Combat(scene, save);
const police = new Police(scene, rng.fork(9));

const world = {
  time: 0,
  colliders: city.colliders,
  cars: [],
  peds: [],
  cops: [],
  player,
  combat,
  police,
  lightPhase,
  events: [],
  stats: save.stats,
  noEnemyFire: false,
  noBust: false,
};

// --- populate the streets -------------------------------------------------
const trafficRng = rng.fork(21);
const CAR_KINDS = ["sedan", "sedan", "sedan", "taxi", "sport", "truck"];
for (let k = 0; k < 16; k++) {
  const kind = trafficRng.pick(CAR_KINDS);
  const car = new Car(scene, { kind, color: trafficRng.pick([0xd94f30, 0x2e6f9e, 0xe8b13c, 0xdad5c8, 0x3f9142, 0x74569c, 0x9fb6c3]), mode: "traffic" });
  seedTrafficCar(car, trafficRng);
  world.cars.push(car);
}
for (const spot of city.parkingSpots.slice(0, 16)) {
  const kind = trafficRng.pick(["sedan", "sedan", "sport", "taxi"]);
  const car = new Car(scene, { kind, color: trafficRng.pick([0xd94f30, 0x2e6f9e, 0xe8b13c, 0xdad5c8, 0xc76b98]), x: spot.x, z: spot.z, angle: spot.angle, mode: "parked" });
  world.cars.push(car);
}
world.peds = spawnPeds(scene, rng.fork(31), 42);

// --- cash drops -------------------------------------------------------------
const drops = [];
const dropGeo = new THREE.BoxGeometry(0.55, 0.22, 0.4);
const dropMat = new THREE.MeshLambertMaterial({ color: 0x59d977, emissive: 0x1d5c2a });
function spawnDrop(x, z, amount) {
  if (drops.length > 8) return;
  const mesh = new THREE.Mesh(dropGeo, dropMat);
  mesh.position.set(x, 0.5, z);
  scene.add(mesh);
  drops.push({ mesh, x, z, amount });
}

// --- missions ---------------------------------------------------------------
const hud = new Hud();
let gameState = shotName ? "shot" : "title";
let pendingBrief = -1;
let clockMinutes = 600; // 10:00
let camYaw = Math.PI;
let camPitch = 0.12;
let saveTimer = 0;
let radioIdx = 0;

const missions = new MissionRunner({
  spawnGang: (x, z, n) => {
    const gang = [];
    const grng = rng.fork(100 + n * 7 + Math.floor(x));
    for (let k = 0; k < n; k++) {
      const ped = new Ped(scene, grng, { x: x + grng.range(-9, 9), z: z + grng.range(-9, 9), kind: "gang" });
      ped.stationary = true;
      world.peds.push(ped);
      gang.push(ped);
    }
    return gang;
  },
  spawnTargetCar: (x, z) => {
    const car = new Car(scene, { kind: "sport", color: 0xffb703, x, z, angle: 0.4, mode: "parked" });
    car.isTarget = true;
    world.cars.push(car);
    return car;
  },
  retirePed: (ped) => {
    scene.remove(ped.mesh);
    const i = world.peds.indexOf(ped);
    if (i >= 0) world.peds.splice(i, 1);
  },
  retireCar: (car) => {
    scene.remove(car.mesh);
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  },
  toast: (msg) => hud.toast(msg),
  crimeAt: (kind, x, z) => police.addCrime(kind, x, z, world.time),
  coolDistrict: (x, z, amount) => police.cool(x, z, amount),
  pay: (reward, index) => {
    save.cash += reward;
    save.missionIndex = Math.max(save.missionIndex, index + 1);
    save.stats.missionsDone++;
    storeSave(save);
    audio.cash();
    hud.flash("MISSION COMPLETE", `${MISSIONS[index].title} — $${reward}`);
    if (save.missionIndex >= MISSIONS.length && !save.finished) {
      save.finished = true;
      storeSave(save);
      setTimeout(() => {
        if (gameState === "playing") {
          gameState = "victory";
          hud.setVictory(save.stats, save.cash);
          hud.showScreen("victory");
          document.exitPointerLock?.();
        }
      }, 2900);
    }
  },
  failed: (title, reason) => {
    audio.jingle(false);
    hud.flash("MISSION FAILED", `${title} — ${reason}`);
  },
});

// --- HUD wiring ---------------------------------------------------------------
hud.bind({
  start: () => {
    audio.unlock();
    wipeSave();
    save = freshSave();
    combat.owned = { fist: true, pistol: false, shotgun: false, rifle: false };
    world.stats = save.stats;
    beginPlay();
  },
  cont: () => {
    audio.unlock();
    beginPlay();
  },
  resume: () => {
    gameState = "playing";
    hud.showScreen(null);
    input.lockPointer();
  },
  restart: () => {
    resetToSpawn();
    gameState = "playing";
    hud.showScreen(null);
    input.lockPointer();
  },
  accept: () => {
    if (pendingBrief >= 0) missions.start(pendingBrief);
    pendingBrief = -1;
    gameState = "playing";
    hud.showScreen(null);
    input.lockPointer();
  },
  decline: () => {
    pendingBrief = -1;
    gameState = "playing";
    hud.showScreen(null);
    input.lockPointer();
  },
  again: () => {
    gameState = "playing";
    hud.showScreen(null);
    input.lockPointer();
  },
});
hud.setContinueVisible(hadSave);
if (!shotName) hud.showScreen("title");

function beginPlay() {
  gameState = "playing";
  hud.showScreen(null);
  input.lockPointer();
  if (save.missionIndex === 0 && !missions.busy) {
    hud.toast("Head to La Perla in the Marina — Carmen is waiting", 5);
  }
}

function resetToSpawn() {
  if (player.car) {
    player.car = null;
    player.mode = "foot";
  }
  player.pos.set(SPAWN.x, 0, SPAWN.z);
  player.health = player.maxHealth;
  player.dead = false;
  police.clearAll();
  world.cops.length = 0;
  missions.fail("You woke up somewhere else.");
}

function gameOver(kind) {
  if (gameState !== "playing") return;
  gameState = "over";
  missions.fail(kind === "BUSTED" ? "The PD took you in." : "You flatlined.");
  const penalty = Math.min(save.cash, kind === "BUSTED" ? 150 : 100);
  save.cash -= penalty;
  storeSave(save);
  audio.jingle(false);
  audio.setEngine(false, 0);
  audio.setSiren(false);
  const hospital = city.places.get("hospital");
  if (player.car) {
    player.car.mode = "parked";
    player.car = null;
    player.mode = "foot";
  }
  player.pos.set(hospital.door.x - 2, 0, hospital.door.z);
  player.health = player.maxHealth;
  player.dead = false;
  police.clearAll();
  world.cops.length = 0;
  hud.setOver(kind, kind === "BUSTED" ? `Bail and paperwork cost you $${penalty}. The heat map is wiped clean.` : `St. Solmar patched you up for $${penalty}. The heat map is wiped clean.`);
  hud.showScreen("over");
  document.exitPointerLock?.();
}

// --- interactions ---------------------------------------------------------------
function nearestCar(maxD) {
  let best = null;
  for (const car of world.cars) {
    if (car === player.car) continue;
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < maxD && (!best || d < best.d)) best = { car, d };
  }
  return best;
}

function currentPrompt() {
  if (gameState !== "playing") return null;
  if (player.mode === "car") {
    const spray = city.places.get("spray");
    if (Math.hypot(player.pos.x - spray.door.x, player.pos.z - spray.door.z) < 9) {
      return `E — Pay'n'Spray: wash the heat for $${PRICES.spray}`;
    }
    return "E — Get out";
  }
  const bar = city.places.get("bar");
  if (!missions.busy && save.missionIndex < MISSIONS.length && Math.hypot(player.pos.x - bar.door.x, player.pos.z - bar.door.z) < 4.5) {
    return "E — Talk to Carmen";
  }
  for (const [id, place] of city.places) {
    if (id === "bar") continue;
    if (Math.hypot(player.pos.x - place.door.x, player.pos.z - place.door.z) < 4) {
      if (id === "gunshop") return "E — Gun Runner: buy a weapon or refill ammo";
      if (id === "hospital") return `E — St. Solmar: full heal, $${PRICES.hospital}`;
      if (id === "diner") return `E — Café Brisa: a meal and a patch-up, $${PRICES.diner}`;
      if (id === "spray") return "Bring a car to the Pay'n'Spray";
      return `E — ${place.name}`;
    }
  }
  const near = nearestCar(3.4);
  if (near) return near.car.ownedByPlayer ? "E — Get in your car" : "E — Steal this car";
  return null;
}

function doInteract() {
  if (player.mode === "car") {
    const spray = city.places.get("spray");
    if (Math.hypot(player.pos.x - spray.door.x, player.pos.z - spray.door.z) < 9) {
      if (save.cash >= PRICES.spray) {
        save.cash -= PRICES.spray;
        police.wash(player.pos.x, player.pos.z);
        player.car.health = Math.min(100, player.car.health + 55);
        audio.cash();
        hud.toast("Shine Auto: fresh paint, cool district");
      } else {
        hud.toast("Not enough cash for a respray");
      }
      return;
    }
    // Step out beside the car.
    const car = player.car;
    player.mode = "foot";
    player.car = null;
    car.mode = car.wasTraffic ? "traffic" : "parked";
    if (car.mode === "traffic" && !car.traffic) seedTrafficCar(car, rng);
    player.pos.set(car.pos.x + Math.cos(car.angle) * 2.4, groundHeight(car.pos.x, car.pos.z), car.pos.z - Math.sin(car.angle) * 2.4);
    audio.door();
    return;
  }
  const bar = city.places.get("bar");
  if (!missions.busy && save.missionIndex < MISSIONS.length && Math.hypot(player.pos.x - bar.door.x, player.pos.z - bar.door.z) < 4.5) {
    pendingBrief = save.missionIndex;
    const def = MISSIONS[pendingBrief];
    hud.setBrief(def.title, def.brief, def.reward);
    gameState = "brief";
    hud.showScreen("brief");
    document.exitPointerLock?.();
    return;
  }
  for (const [id, place] of city.places) {
    if (Math.hypot(player.pos.x - place.door.x, player.pos.z - place.door.z) >= 4) continue;
    if (id === "gunshop") {
      const next = !combat.owned.pistol ? "pistol" : !combat.owned.shotgun ? "shotgun" : !combat.owned.rifle ? "rifle" : null;
      if (next && save.cash >= { pistol: 400, shotgun: 900, rifle: 1500 }[next]) {
        save.cash -= { pistol: 400, shotgun: 900, rifle: 1500 }[next];
        combat.give(next);
        storeSave(save);
        hud.toast(`${next[0].toUpperCase() + next.slice(1)} purchased`);
        audio.cash();
      } else if (save.cash >= PRICES.refill) {
        save.cash -= PRICES.refill;
        combat.refillAll();
        hud.toast("Ammo refilled");
        audio.cash();
      } else {
        hud.toast("Not enough cash at the Gun Runner");
      }
      return;
    }
    if (id === "hospital") {
      if (save.cash >= PRICES.hospital) {
        save.cash -= PRICES.hospital;
        player.heal(100);
        hud.toast("Patched up. Try not to bleed on the seats.");
        audio.pickup();
      } else hud.toast("The hospital needs cash up front");
      return;
    }
    if (id === "diner") {
      if (save.cash >= PRICES.diner) {
        save.cash -= PRICES.diner;
        player.heal(40);
        hud.toast("Café Brisa: fed and bandaged");
        audio.pickup();
      } else hud.toast("Not enough cash for the diner");
      return;
    }
    if (id === "hq") {
      hud.toast("Club Tiburón. The music is bad and everyone is armed.");
      return;
    }
    if (id === "garage") {
      hud.toast("The Bay Garage lockup. Carmen's people nod at you.");
      return;
    }
  }
  const near = nearestCar(3.4);
  if (near) {
    const car = near.car;
    if (!car.ownedByPlayer) {
      police.addCrime("stealCar", car.pos.x, car.pos.z, world.time);
      save.stats.steals++;
      car.ownedByPlayer = true;
      hud.toast("Car stolen — the district noticed");
    }
    car.wasTraffic = car.mode === "traffic";
    car.mode = "player";
    player.mode = "car";
    player.car = car;
    radioIdx = Math.floor(Math.random() * RADIO.length);
    audio.door();
  }
}

// --- event routing ---------------------------------------------------------------
function scareAt(x, z, seconds) {
  for (const ped of world.peds) ped.scare(x, z, world.time, seconds);
  for (const cop of world.cops) void cop;
}

function drainEvents() {
  for (const ev of world.events) {
    switch (ev.type) {
      case "shot": {
        if (!ev.enemy) {
          scareAt(ev.x, ev.z, 4);
          let heard = false;
          for (const car of police.cars) if (Math.hypot(car.pos.x - ev.x, car.pos.z - ev.z) < 52) heard = true;
          for (const cop of world.cops) if (Math.hypot(cop.pos.x - ev.x, cop.pos.z - ev.z) < 52) heard = true;
          if (heard) police.addCrime("shotsFired", ev.x, ev.z, world.time);
        }
        break;
      }
      case "punchHit":
        police.addCrime("punch", ev.x, ev.z, world.time);
        scareAt(ev.x, ev.z, 3);
        break;
      case "pedDown": {
        const isCop = world.cops.includes(ev.ped);
        const byPlayer = ev.cause === "shot" || ev.cause === "punch" || ev.cause === "car";
        if (byPlayer) {
          police.addCrime(isCop ? "killCop" : "killPed", ev.x, ev.z, world.time);
          save.stats.knockouts++;
          if (ev.ped.kind === "gang") spawnDrop(ev.x, ev.z, 40 + Math.floor(Math.random() * 80));
        }
        scareAt(ev.x, ev.z, 5);
        break;
      }
      case "carShot":
        if (ev.car.kind === "police") police.addCrime("copCarHit", ev.x, ev.z, world.time);
        break;
      case "crash":
      case "carHit": {
        const involvesPlayer = player.car && (ev.car === player.car || ev.other === player.car);
        if (ev.amount > 6) audio.crash(Math.min(1, ev.amount / 30));
        if (involvesPlayer && ev.amount > 16) police.addCrime("crash", ev.x, ev.z, world.time);
        if (involvesPlayer) scareAt(ev.x, ev.z, 3);
        break;
      }
      case "playerShot":
        if (gameState === "playing" && !world.invulnerable) {
          player.hurt(ev.amount, world.time);
          const dmg = document.getElementById("damage");
          dmg.style.opacity = "1";
          setTimeout(() => (dmg.style.opacity = "0"), 130);
        }
        break;
      case "busted":
        gameOver("BUSTED");
        break;
    }
  }
  world.events.length = 0;
}

// Cars running people over (the player's car and police cars; traffic
// brakes for pedestrians instead).
function carPedCollisions() {
  const runners = [];
  if (player.car) runners.push(player.car);
  for (const car of police.cars) runners.push(car);
  for (const car of runners) {
    if (Math.abs(car.speed) < 3.5) continue;
    for (const ped of [...world.peds, ...world.cops]) {
      if (ped.down) continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 2.3) {
        ped.hurt(100, world.events, "car");
        car.speed *= 0.72;
        audio.thud();
      }
    }
  }
}

// --- the simulation step ------------------------------------------------------------
const gameFacade = {
  get player() { return player; },
  get police() { return police; },
  get combat() { return combat; },
  get world() { return world; },
  get events() { return world.events; },
  get time() { return world.time; },
  get noEnemyFire() { return world.noEnemyFire; },
  playerPos: () => (player.mode === "car" && player.car ? player.car.pos : player.pos),
};

function step(dt) {
  world.time += dt;
  clockMinutes = (clockMinutes + dt) % 1440;

  // Player hands.
  if (gameState === "playing" || gameState === "shot") {
    if (player.mode === "car" && player.car) {
      const throttle = input.down("KeyW") ? 1 : input.down("KeyS") ? -1 : 0;
      const steer = (input.down("KeyA") ? 1 : 0) + (input.down("KeyD") ? -1 : 0);
      player.car.drive(dt, throttle, steer, input.down("Space"));
      if (player.car.health <= 0) {
        player.car.mode = "parked";
        player.mode = "foot";
        player.car = null;
        hud.toast("The car is wrecked");
      }
    }
    player.update(dt, world, camYaw);
  }

  for (const car of world.cars) {
    if (car.mode === "traffic") updateTraffic(car, dt, { ...world, playerPos: gameFacade.playerPos(), time: world.time }, rng);
  }
  police.update(dt, world, world.events);
  for (const car of world.cars) car.step(dt, world, world.events);
  carPedCollisions();

  for (let i = world.peds.length - 1; i >= 0; i--) {
    const ped = world.peds[i];
    if (!ped.update(dt, world)) {
      scene.remove(ped.mesh);
      world.peds.splice(i, 1);
    }
  }
  missions.update(dt, gameFacade);
  combat.update(dt);
  updateSmoke(dt);

  // Cash drops: bob, spin, collect.
  const pp = gameFacade.playerPos();
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.mesh.rotation.y += dt * 2.4;
    d.mesh.position.y = 0.5 + Math.sin(world.time * 3 + i) * 0.12;
    if (Math.hypot(pp.x - d.x, pp.z - d.z) < 2) {
      save.cash += d.amount;
      audio.pickup();
      hud.toast(`+$${d.amount}`);
      scene.remove(d.mesh);
      drops.splice(i, 1);
    }
  }
  drainEvents();
  if (player.health <= 0 && !player.dead && gameState === "playing") {
    player.dead = true;
    gameOver("WASTED");
  }
  saveTimer += dt;
  if (saveTimer > 15) {
    saveTimer = 0;
    save.stats.playSeconds += 15;
    storeSave(save);
  }
}

// --- per-frame work: input, camera, HUD ------------------------------------------------
function frameInput() {
  if (gameState !== "playing") return;
  const mouse = input.takeMouse();
  if (input.locked) {
    camYaw -= mouse.dx * 0.0026;
    camPitch = Math.max(-0.2, Math.min(0.6, camPitch + mouse.dy * 0.0022));
  }
  if (input.pressed("KeyE")) doInteract();
  if (input.pressed("KeyP")) {
    gameState = "paused";
    hud.showScreen("pause");
    document.exitPointerLock?.();
  }
  if (input.pressed("Digit1")) combat.selectSlot(1);
  if (input.pressed("Digit2")) combat.selectSlot(2);
  if (input.pressed("Digit3")) combat.selectSlot(3);
  if (input.pressed("KeyR")) combat.startReload();
  // Fire: mouse for guns, F or mouse for fists.
  const wantFire = combat.current === "fist" ? input.pressed("KeyF") || input.takeClick() : input.mouseDown;
  if (wantFire && player.mode === "foot") {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone();
    combat.attack(0, world, world.events, origin, dir);
    player.gunMesh.visible = combat.current !== "fist";
  } else if (combat.current === "fist") {
    input.takeClick();
  }
  player.gunMesh.visible = combat.current !== "fist" && player.mode === "foot";
}

function updateCamera(dt) {
  const pp = gameFacade.playerPos();
  if (shotDirector && shotDirector.camera) {
    shotDirector.camera(camera, pp);
    return;
  }
  if (player.mode === "car" && player.car) {
    // The chase camera settles behind the car.
    let diff = player.car.angle - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, dt * 3.2);
    const back = 10.5;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    camera.position.set(pp.x - fx * back, pp.y + 4.1 + camPitch * 3, pp.z - fz * back);
    camera.lookAt(pp.x + fx * 8, pp.y + 1.2, pp.z + fz * 8);
  } else {
    const back = 7.6;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const h = 3 + camPitch * 4.5;
    camera.position.set(pp.x - fx * back, Math.max(0.6, pp.y + h), pp.z - fz * back);
    camera.lookAt(pp.x + fx * 5, pp.y + 1.55 - camPitch * 2.4, pp.z + fz * 5);
  }
  camera.position.y = Math.max(0.55, camera.position.y);
}

const PLACE_LETTERS = { bar: "C", gunshop: "G", spray: "S", hospital: "H", diner: "D", garage: "B", hq: "T" };
function hudFrame() {
  if (gameState === "title") return;
  hud.tick();
  const pp = gameFacade.playerPos();
  const district = districtAt(pp.x, pp.z);
  const objective = missions.objective();
  const marker = objective ? { x: objective.x, z: objective.z } : null;
  const dist = objective ? Math.hypot(pp.x - objective.x, pp.z - objective.z) : null;
  const hh = Math.floor(clockMinutes / 60);
  const mm = Math.floor(clockMinutes % 60);
  hud.update({
    health: player.health,
    maxHealth: player.maxHealth,
    districtName: district.name,
    heatFrac: police.heatOf(district.id) / 100,
    stars: police.stars,
    cash: save.cash,
    clockText: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    objective: objective ? { label: objective.label, dist } : null,
    speedKmh: player.mode === "car" && player.car ? player.car.speed * 3.6 : null,
    weapon: player.mode === "foot" ? combat.hudState() : null,
    radio: player.mode === "car" ? `♪ ${RADIO[radioIdx]}` : "",
    bustFrac: police.bustMeter,
    prompt: currentPrompt(),
  });
  hud.drawMinimap({
    player: { x: pp.x, z: pp.z, angle: player.mode === "car" && player.car ? player.car.angle : player.angle },
    heats: police.heat,
    marker,
    policeCars: police.cars,
    cops: police.cops,
    places: [...city.places.values()].map((p) => ({ door: p.door, letter: PLACE_LETTERS[p.id] || "•" })),
    drops,
    time: world.time,
  });
  // Sound follows the world.
  const inCar = player.mode === "car" && player.car;
  audio.setEngine(!!inCar && gameState === "playing", inCar ? Math.abs(player.car.speed) / player.car.spec.top : 0);
  let sirenNear = false;
  for (const car of police.cars) {
    if (Math.hypot(car.pos.x - pp.x, car.pos.z - pp.z) < 70) sirenNear = true;
  }
  audio.setSiren(sirenNear && gameState === "playing");
}

// --- shot mode (set up after `api` exists, below) -------------------------
let shotDirector = null;

// --- the loop ----------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
let shotSteps = 0;
let shotPaints = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (shotDirector) {
    // Deterministic: fixed steps, a set number of them, then two paints.
    const sdt = 1 / 30;
    if (shotSteps < shotDirector.steps) {
      shotDirector.run(shotSteps, api);
      step(sdt);
      step(sdt);
      shotSteps++;
      updateCamera(sdt);
      if (shotName !== "title") hudFrame();
      city.update(sdt, world.time);
      stage.update(camera.position, 0.42);
      renderer.render(scene, camera);
    } else {
      renderer.render(scene, camera);
      shotPaints++;
      if (shotPaints >= 2) window.__shotReady = true;
    }
    return;
  }

  if (gameState === "playing") {
    frameInput();
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) {
      step(STEP);
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
  } else {
    input.takeMouse();
    input.takeClick();
    if (gameState === "title") {
      // A slow orbit over the Marina while the title is up.
      const t = now / 1000;
      camera.position.set(200 + Math.sin(t * 0.05) * 60, 46, 640 + Math.cos(t * 0.04) * 30);
      camera.lookAt(330, 8, 320);
    }
  }
  if (gameState !== "title" || shotName) updateCamera(dt);
  hudFrame();
  city.update(dt, world.time);
  stage.update(camera.position, 0.3 + (clockMinutes / 1440) * 0.4);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// A click on the canvas re-locks the pointer during play, and any first
// gesture wakes the audio.
canvas.addEventListener("click", () => {
  audio.unlock();
  if (gameState === "playing") input.lockPointer();
});
input.attach(canvas);

// --- the test/debug surface ---------------------------------------------------------------
const api = {
  scene, camera, renderer, world, player, police, combat, missions, city, hud,
  get state() { return gameState; },
  get save() { return save; },
  playerPos: () => gameFacade.playerPos(),
  teleport(x, z) {
    if (player.car) {
      player.car.pos.set(x, groundHeight(x, z), z);
    }
    player.pos.set(x, groundHeight(x, z), z);
  },
  setHeat(districtId, v) {
    police.heat.set(districtId, v);
  },
  heatOf: (id) => police.heatOf(id),
  startMission(i) {
    missions.start(i);
    gameState = "playing";
    hud.showScreen(null);
  },
  begin: () => beginPlay(),
  damagePlayer(n) {
    player.hurt(n, world.time);
  },
  setInvulnerable(v) {
    world.invulnerable = v;
  },
};
window.__solmar = api;

// In shot mode the world is a stage set: nobody dies, nobody gets
// busted, and a director poses the scene the screenshots are taken from.
if (shotName) {
  world.noEnemyFire = true;
  world.noBust = true;
  world.invulnerable = true;
  shotDirector = planShot(api, shotName);
  hud.showScreen(shotName === "title" ? "title" : null);
}
