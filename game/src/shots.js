// Screenshot scenes behind ?shot=title|play|chase|mission (with &seed=N).
// Each one stages a real game state — a fresh world, the real rules run
// forward for fixed steps with a scripted autopilot — then the caller
// paints it twice and sets window.__shotReady. Same seed, same frame.

import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { addWanted } from './police.js';
import { startMission } from './missions.js';

export const SHOT_NAMES = ['title', 'play', 'chase', 'mission'];

function autopilotDrive(game, dt) {
  // Drive straight up the x=25 road — no steering toward the beacon, so
  // the car never ploughs into a building block and wrecks the shot.
  game.testInput.forward = 1;
  game.testInput.strafe = 0;
}

export function stageShot(name, game) {
  const state = game.state;
  const rng = game.rng;
  game.startGame(true);
  if (name === 'title') {
    state.screen = SCREEN_TITLE;
    state.time = 12;
    // Park a car and a few pedestrians in the panorama for the cover.
    return { screen: SCREEN_TITLE };
  }
  if (name === 'play') {
    state.screen = SCREEN_PLAY;
    // Walk the player up a Downtown street for 6 seconds.
    game.testInput.forward = 1;
    for (let i = 0; i < 6 * 60; i += 1) game.stepWorld(1 / 60, true);
    game.testInput.forward = 0;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    state.screen = SCREEN_PLAY;
    // Put the player in the parked car by the spawn, drive straight up
    // the x=25 road, then add heat. Two police cars are placed on the
    // road ahead, in frame, as the pursuit closes in.
    game.debugEnterNearestCar();
    addWanted(state, 3, '3 stars — Solmar PD in pursuit!');
    for (let i = 0; i < 4 * 60; i += 1) {
      autopilotDrive(game, 1 / 60);
      game.stepWorld(1 / 60, true);
    }
    game.testInput.forward = 0;
    game.testInput.strafe = 0;
    const car = state.player.car;
    if (car) {
      const ahead = state.police.cars.filter((c) => !c.dead).slice(0, 2);
      ahead.forEach((pc, i) => {
        pc.x = car.x + (i === 0 ? -4 : 4);
        pc.z = car.z - 26 - i * 6;
        pc.angle = 0; // facing south, toward the player
        pc.speed = 10;
        pc.mesh.position.set(pc.x, 0, pc.z);
        pc.mesh.rotation.y = 0;
      });
    }
    return { screen: SCREEN_PLAY };
  }
  // mission: Harbor Heist combat at the harbor, wanted level showing.
  state.screen = SCREEN_PLAY;
  startMission(state, 6, rng, null);
  // Stand the player at the harbor edge facing the gangsters (southeast),
  // then let the fight run 4 s. Enemies spawn around the harbor marker.
  state.player.x = 163;
  state.player.z = 163;
  state.player.yaw = Math.PI / 4;
  state.player.mesh.position.set(163, 0, 163);
  addWanted(state, 2, 'Harbor Heist — 2 stars!');
  for (let i = 0; i < 4 * 60; i += 1) game.stepWorld(1 / 60, true);
  return { screen: SCREEN_PLAY };
}
