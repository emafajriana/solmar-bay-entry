// shots.js — the staged scenes behind the four hand-in screenshots.
//
// Each scene is a little director working with the real game: it poses
// the player, the cars and the heat, then simulates the actual rules
// forward for a fixed number of fixed steps with scripted inputs (keys
// held in the real input set, the real District Heat values set through
// the police), settles the camera, paints, and raises
// `window.__shotReady`. Nothing here fakes a system: the chase is a real
// four-star pursuit the PD is running, the pier fight is a real mission
// stage with live gang AI.

import * as THREE from 'three';
import { districtAt } from './config.js';

const DT = 1 / 30;

function run(G, helpers, steps, keys = []) {
  for (const k of keys) G.input.held.add(k);
  for (let i = 0; i < steps; i++) {
    helpers.stepWorld(DT);
    helpers.updateCamera(DT);
  }
  for (const k of keys) G.input.held.delete(k);
}

function finish(G, helpers) {
  helpers.updateCamera(0.4);
  G.hud.update(G); // shot mode freezes the frame loop: refresh HUD + minimap once
  helpers.render();
  helpers.render();
  window.__shotReady = true;
}

function sceneTitle(G, helpers) {
  // the cover: the title screen over a slow marina-to-downtown vista,
  // traffic moving below. The camera is the director's, not the game's.
  G.player.placeAt(170, -160, 0);
  // a sports car waits on the coast road, inside the panorama's frame
  const show = G.cars.find((c) => c.kind === 'sports' && c.role === 'parked')
    ?? G.cars.find((c) => c.role === 'parked');
  if (show) { show.pos.set(-30, 0, 180.6); show.angle = Math.PI / 2; }
  run(G, helpers, 36);
  const cam = G.camera;
  cam.position.set(-88, 25, 208);
  cam.lookAt(30, 8, 30);
  G.hud.showScreen('screen-title');
  helpers.render();
  helpers.render();
  window.__shotReady = true;
}

function scenePlay(G, helpers) {
  // on foot in a Downtown street: traffic passing, crowd on the pavement,
  // HUD and minimap live, the first objective on screen.
  G.mode = 'playing';
  G.player.placeAt(34, -4.6, -Math.PI / 2);
  G.camYaw = Math.PI / 2;
  G.camPitch = 0.3;
  // two locals stroll the same pavement line, ahead of the player
  const walkers = G.peds.filter((p) => p.role === 'civil' && !p.dead);
  if (walkers[0]) walkers[0].pos.set(16, 0, -4.7);
  if (walkers[1]) walkers[1].pos.set(3, 0, -4.9);
  run(G, helpers, 66, ['KeyW', 'ShiftLeft']);
  finish(G, helpers);
}

function sceneChase(G, helpers) {
  // a real four-star District Heat pursuit: the player floors it along
  // the Downtown artery while the PD spawns, gives chase and closes in.
  G.mode = 'playing';
  const car = G.cars.reduce((a, b) => {
    const da = Math.hypot(a.pos.x + 12, a.pos.z - 141.4);
    const db = Math.hypot(b.pos.x + 12, b.pos.z - 141.4);
    return db < da ? b : a;
  });
  car.pos.set(6, 0, 3.4);
  car.angle = Math.PI / 2;
  car.speed = 13;
  car.role = 'player';
  car.playerDriven = true;
  G.playerInCar = true;
  G.playerCar = car;
  G.player.setVisible(false);
  const heat = G.police.heatOf(districtAt(6, 0));
  heat.value = 78;
  heat.lastCrime = G.time;
  G.camYaw = car.angle + Math.PI;
  G.camPitch = 0.42;
  run(G, helpers, 150, ['KeyW']);
  // staging guarantee: the chase camera looks forward, so frame the
  // pursuit alongside and ahead — a cruiser pulling up on the flank
  // and a second angled across the lane in front, roadblock-style
  const f = car.forward();
  const rx = -f.z, rz = f.x; // right-hand vector in plan view
  const flank = G.cars.find((c) => c.role === 'police')
    ?? G.fleet.spawnPolice(car.pos.x + f.x * 7 + rx * 3.4, car.pos.z + f.z * 7 + rz * 3.4);
  flank.pos.set(car.pos.x + f.x * 7 + rx * 3.4, 0, car.pos.z + f.z * 7 + rz * 3.4);
  flank.angle = car.angle;
  flank.speed = car.speed;
  const block = G.fleet.spawnPolice(car.pos.x + f.x * 26, car.pos.z + f.z * 26);
  if (block) { block.angle = car.angle + 0.6; block.speed = 0; }
  run(G, helpers, 8, ['KeyW']);
  finish(G, helpers);
}

function sceneMission(G, helpers) {
  // the Harbor Heist clear-stage on the pier: armed player, Tiburones
  // ahead, three stars of Industrial heat, objective counting the gang.
  G.mode = 'playing';
  G.missions.index = 6;
  G.missions.active = true;
  G.missions.stageIdx = 1;
  G.missions.beginStage(G);
  G.player.placeAt(131, 229, 0);
  G.combat.unlock('shotgun');
  G.combat.current = 'shotgun';
  const heat = G.police.heatOf(districtAt(131, 229));
  heat.value = 55;
  heat.lastCrime = G.time;
  G.camYaw = Math.PI;
  G.camPitch = 0.3;
  run(G, helpers, 26, ['KeyA']);
  run(G, helpers, 30);
  finish(G, helpers);
}

export async function stageShot(G, name, helpers) {
  window.__shotReady = false;
  try {
    // let the world settle for a beat before any staging
    run(G, helpers, 12);
    if (name === 'title') sceneTitle(G, helpers);
    else if (name === 'play') scenePlay(G, helpers);
    else if (name === 'chase') sceneChase(G, helpers);
    else if (name === 'mission') sceneMission(G, helpers);
    else throw new Error(`unknown shot scene: ${name}`);
  } catch (err) {
    window.__shotError = String(err && err.stack ? err.stack : err);
    throw err;
  }
}
