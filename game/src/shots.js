// SOLMAR BAY — the staged scenes behind the four hand-in screenshots.
//
// Each scene is a little director: it poses the world (a teleported
// player, a set heat level, a live mission objective, a crew of
// Tiburones), lets the real simulation run a fixed number of steps so
// traffic and crowds settle into natural places, and — for two of the
// scenes — holds the camera itself. Because the world is seeded and the
// step count is fixed, a scene frames the same shot every time. The main
// loop sets window.__shotReady once the steps are done and two frames
// have been painted.

import * as THREE from "three";
import { Ped } from "./pedestrians.js";
import { Car } from "./vehicles.js";
import { Rng } from "./rng.js";
import { groundHeight } from "./player.js";

export function planShot(api, name) {
  const { world, player, police, combat } = api;

  if (name === "title") {
    // The cover: the skyline across the water at golden hour, a sports
    // car on the sand, the title screen over it all.
    let posed = false;
    return {
      steps: 36,
      run() {
        if (posed) return;
        posed = true;
        player.pos.set(140, 0, 662);
        player.angle = 0.7;
        const car = world.cars.find((c) => c.mode === "parked" && c.kind === "sport") || world.cars.find((c) => c.mode === "parked");
        if (car) {
          car.pos.set(148, 0, 670);
          car.angle = 0.9;
        }
      },
      camera(cam) {
        const t = world.time;
        cam.position.set(196 + Math.sin(t * 0.11) * 7, 26, 694);
        cam.lookAt(360, 14, 330);
      },
    };
  }

  if (name === "play") {
    // On foot Downtown at mid-morning: traffic passing, the first
    // objective on the HUD, the minimap alive.
    let posed = false;
    return {
      steps: 46,
      run() {
        if (posed) return;
        posed = true;
        player.pos.set(314, 0, 336);
        player.angle = Math.PI;
        // One traffic car rolling down the street toward the player.
        const car = world.cars.find((c) => c.mode === "traffic");
        if (car) {
          car.traffic = { axis: "z", dir: 1, streetIdx: 4 };
          car.pos.set(308.6, 0, 248);
          car.angle = 0;
          car.speed = 11;
          car.waypoint = { x: 308.6, z: 330 };
          car.crossDecided = true;
        }
        api.startMission(0);
      },
    };
  }

  if (name === "chase") {
    // Three stars in Old Town: the player is already rolling north with
    // the PD converging, speedo and stars on the HUD.
    let posed = false;
    let behind = null;
    let alongside = null;
    return {
      steps: 80,
      run(step) {
        if (!posed) {
          posed = true;
          const car = world.cars.find((c) => c.mode === "parked");
          car.pos.set(239.4, 0, 430);
          car.angle = Math.PI;
          car.mode = "player";
          player.mode = "car";
          player.car = car;
          api.setHeat("oldtown", 80);
          api.setHeat("marina", 80);
          // Cruisers already in the scene: one on the tail, and one
          // pacing the player in the next lane. The pacing car is
          // re-pinned to its mark every step — left to the pursuit AI,
          // the pack scatters into the blocks and out of the frame.
          behind = new Car(api.scene, { kind: "police", color: 0x1d2733, x: 233, z: 482, angle: Math.PI, mode: "police" });
          behind.speed = 17;
          alongside = new Car(api.scene, { kind: "police", color: 0x1d2733, x: 232.5, z: 428, angle: Math.PI, mode: "police" });
          alongside.speed = 15.5;
          police.cars.push(behind, alongside);
          world.cars.push(behind, alongside);
          api.startMission(0);
        }
        if (player.car) {
          // The stage car cannot be wrecked out from under the shot.
          player.car.health = 100;
          player.car.speed = 15.5;
          player.car.angle = Math.PI;
          // Hold the lane on street 3.
          player.car.pos.x += (239.4 - player.car.pos.x) * 0.2;
        }
        for (const c of police.cars) c.health = 100;
        if (behind) behind.speed = Math.min(behind.speed, 17);
        if (alongside && player.car) {
          alongside.pos.set(player.car.pos.x - 6.9, 0, player.car.pos.z + 2.5);
          alongside.angle = Math.PI;
          alongside.speed = 15.5;
          alongside.health = 100;
        }
        void step;
      },
    };
  }

  // "mission": the Harbor Heist — on the pier at dusk-side light, rifle
  // up, the Tiburones crew in the container lanes, heat on the Industrial
  // grid and the objective on screen. Late in the scene the player opens
  // fire down the lane, so the frame catches the fight itself.
  let posed = false;
  let crew = [];
  return {
    steps: 52,
    run(step) {
      if (!posed) {
        posed = true;
        player.pos.set(545, groundHeight(545, 652), 652);
        player.angle = Math.atan2(572 - 545, 656 - 652);
        combat.give("rifle");
        const grng = new Rng(99);
        // On the open apron north of the container rows — nothing
        // between the camera, the player, and the crew.
        const spots = [
          [565, 656], [578, 652], [570, 662], [584, 660], [560, 646],
        ];
        for (const [x, z] of spots) {
          const ped = new Ped(api.scene, grng, { x, z, kind: "gang" });
          ped.stationary = true;
          ped.angle = Math.atan2(545 - x, 652 - z);
          ped.mesh.rotation.y = ped.angle;
          world.peds.push(ped);
          crew.push(ped);
        }
        api.setHeat("industrial", 58);
        api.setHeat("marina", 58);
        api.startMission(6);
      }
      if (step >= 30 && step % 2 === 0) {
        const target = crew.find((p) => !p.down) || crew[0];
        if (target) {
          const origin = new THREE.Vector3(player.pos.x, player.pos.y + 1.5, player.pos.z);
          const dir = new THREE.Vector3(target.pos.x - origin.x, -0.02, target.pos.z - origin.z).normalize();
          combat.attack(0, world, world.events, origin, dir);
        }
      }
    },
    camera(cam) {
      cam.position.set(531, 4.0, 646);
      cam.lookAt(574, 1.5, 657);
    },
  };
}
