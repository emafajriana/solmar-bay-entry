// missions.js — the story: eight jobs for fixer Carmen "La Jefa" Duarte
// of La Perla bar, against the Los Tiburones and the Solmar PD.
//
// A mission is a list of stages, and a stage is one verb: go somewhere,
// deliver against a clock, clear a gang off a patch of ground, steal one
// specific car, or run. The system below walks the stages, keeps the
// objective text and the gold marker fed to the HUD, pays out, and fails
// the mission (back to the offer marker) when a timer dies or the player
// goes down. Between missions the offer marker waits at La Perla — the
// first one waits at the motel where the player wakes up.

import { Ped } from './pedestrians.js';
import { districtAt } from './config.js';

const GANG_OUTFIT = { shirt: 0xa3271e, pants: 0x22242a, hat: 0x7d1d14 };

const MISSIONS = [
  {
    name: 'Welcome to Solmar', reward: 200, offer: 'motel',
    intro: 'Carmen: "You made it to the bay. Come see me at La Perla — and try not to scratch the paint."',
    stages: [
      { type: 'goto', text: 'Drive to La Perla bar in the Marina', place: 'bar', r: 8 },
    ],
  },
  {
    name: 'Pizza Run', reward: 350, offer: 'bar',
    intro: 'Carmen: "A judge downtown owes me. His pizza leaves Café Brisa hot — keep it that way."',
    stages: [
      { type: 'goto', text: 'Pick up the pizza at Café Brisa', place: 'diner', r: 7 },
      { type: 'deliver', text: 'Deliver the pizza Downtown, while it is hot', x: 44, z: -52, r: 8, time: 150 },
    ],
  },
  {
    name: 'Getaway Driver', reward: 600, offer: 'bar',
    intro: 'Carmen: "My crew just lifted a payroll in Industrial. They need a wheel. Be that wheel."',
    stages: [
      { type: 'goto', text: 'Pick up the crew in Industrial', x: 152, z: -44, r: 8 },
      { type: 'escape', text: 'Lose the heat and reach Bay Garage', place: 'garage', r: 9, heat: 46 },
    ],
  },
  {
    name: 'Turf War', reward: 900, offer: 'bar',
    intro: 'Carmen: "Tiburones are selling on my beach. Five of them. Evict them."',
    stages: [
      { type: 'goto', text: 'Head to the Beachfront turf', x: 24, z: 66, r: 12 },
      { type: 'clear', text: 'Clear the Tiburones off the block', gx: 24, gz: 66, n: 5 },
    ],
  },
  {
    name: 'The Drop', reward: 1200, offer: 'bar',
    intro: 'Carmen: "A package waits in Old Town. The pier needs it. Fast, quiet, no sirens in the story."',
    stages: [
      { type: 'goto', text: 'Collect the package in Old Town', x: -152, z: 2, r: 8 },
      { type: 'deliver', text: 'Take the package to the end of the pier', place: 'pier', r: 9, time: 190 },
    ],
  },
  {
    name: 'Repo Job', reward: 1800, offer: 'bar',
    intro: 'Carmen: "A gold sports car in the Hills belongs to a man who stopped paying. Bring it home intact."',
    stages: [
      { type: 'steal', text: 'Steal the gold sports car in the Hills', x: -58, z: -141, angle: Math.PI / 2 },
      { type: 'deliver', text: 'Deliver the car to Bay Garage — intact', place: 'garage', r: 9, needsCar: true },
    ],
  },
  {
    name: 'Harbor Heist', reward: 3000, offer: 'bar',
    intro: 'Carmen: "Tonight we take the pier back. Clear it, then run like the bay is watching."',
    stages: [
      { type: 'goto', text: 'Go to the harbour pier', place: 'pier', r: 12 },
      { type: 'clear', text: 'Clear the Tiburones from the pier', gx: 131, gz: 246, n: 6 },
      { type: 'escape', text: 'Escape to La Perla', place: 'bar', r: 9, heat: 62 },
    ],
  },
  {
    name: 'King of the Bay', reward: 5000, offer: 'bar',
    intro: 'Carmen: "Club Tiburón. End of the war, one way or the other. Come back king."',
    stages: [
      { type: 'goto', text: 'Storm Club Tiburón', place: 'hq', r: 13 },
      { type: 'clear', text: 'Take the club — wave one', gx: 69, gz: 168, n: 4 },
      { type: 'clear', text: 'Take the club — the last of them', gx: 69, gz: 152, n: 4 },
      { type: 'goto', text: 'Return to La Perla', place: 'bar', r: 9 },
    ],
  },
];

export class MissionSystem {
  constructor() {
    this.index = 0;          // next mission to offer
    this.active = false;
    this.stageIdx = 0;
    this.stage = null;       // runtime state for the current stage
    this.done = false;       // whole story finished
    this.offerPlace = 'motel';
  }

  def() { return MISSIONS[this.index] ?? null; }

  targetOf(stageDef, G) {
    if (stageDef.place) {
      const p = G.places[stageDef.place];
      return { x: p.x, z: p.z };
    }
    return { x: stageDef.x, z: stageDef.z };
  }

  // What the HUD shows: objective line + gold marker position (or null).
  objective(G) {
    if (this.done) return { text: 'The bay is yours. Free roam — the city keeps its heat.', marker: null };
    if (!this.active) {
      const place = G.places[this.def().offer];
      return { text: `Meet the fixer — new work: "${this.def().name}"`, marker: { x: place.x, z: place.z } };
    }
    const sd = this.def().stages[this.stageIdx];
    let text = sd.text;
    if (sd.type === 'clear' && this.stage) {
      const left = this.stage.gang.filter((p) => !p.dead).length;
      text += ` (${left} left)`;
    }
    if (this.stage?.tLeft !== undefined && this.stage.tLeft !== null) {
      text += ` — ${Math.max(0, Math.ceil(this.stage.tLeft))}s`;
    }
    const marker = sd.type === 'clear' && this.stage
      ? { x: this.stage.gx, z: this.stage.gz }
      : this.targetOf(sd, G);
    return { text, marker };
  }

  startMission(G) {
    this.active = true;
    this.stageIdx = 0;
    G.hud.banner(this.def().name, this.def().intro, 5200);
    G.audio.blip();
    this.beginStage(G);
  }

  beginStage(G) {
    const sd = this.def().stages[this.stageIdx];
    this.stage = { tLeft: sd.time ?? null, gang: [], gx: sd.gx, gz: sd.gz, car: null };
    if (sd.type === 'clear') {
      for (let i = 0; i < sd.n; i++) {
        const ped = new Ped(G.scene, G.rng, {
          role: 'gang',
          x: sd.gx + G.rng.range(-9, 9),
          z: sd.gz + G.rng.range(-9, 9),
          outfit: { ...GANG_OUTFIT, skin: undefined },
        });
        ped.state = 'stand';
        this.stage.gang.push(ped);
        G.peds.push(ped);
      }
    }
    if (sd.type === 'steal') {
      this.stage.car = G.fleet.spawnSports(sd.x, sd.z, sd.angle ?? 0);
    }
    if (sd.type === 'escape' && sd.heat) {
      const d = districtAt(G.playerPos.x, G.playerPos.z);
      const h = G.police.heatOf(d);
      h.value = Math.max(h.value, sd.heat);
      h.lastCrime = G.time;
    }
  }

  fail(G, why) {
    if (!this.active) return;
    this.cleanupStage(G);
    this.active = false;
    this.stage = null;
    G.hud.banner('MISSION FAILED', why, 3600);
    G.audio.jingle(false);
  }

  cleanupStage(G) {
    if (!this.stage) return;
    for (const ped of this.stage.gang) {
      const i = G.peds.indexOf(ped);
      if (i !== -1) G.peds.splice(i, 1);
      ped.dispose(G.scene);
    }
    if (this.stage.car && this.stage.car.role === 'parked') {
      // an un-stolen repo car goes back to being scenery
      this.stage.car = null;
    }
  }

  complete(G) {
    const reward = this.def().reward;
    G.state.cash += reward;
    G.state.stats.earned += reward;
    G.state.stats.missionsDone++;
    G.hud.banner('MISSION COMPLETE', `${this.def().name} — +$${reward.toLocaleString('en-US')}`, 4200);
    G.audio.jingle(true);
    G.audio.cash();
    if (this.index === 3) { G.unlockWeapon('shotgun'); G.hud.toast('Shotgun unlocked at the Gun Runner'); }
    if (this.index === 6) { G.unlockWeapon('rifle'); G.hud.toast('Rifle unlocked at the Gun Runner'); }
    this.cleanupStage(G);
    this.active = false;
    this.stage = null;
    this.index++;
    if (this.index >= MISSIONS.length) {
      this.done = true;
      G.onStoryComplete();
    }
    G.saveGame();
  }

  onPlayerDown(G) {
    if (this.active) this.fail(G, 'You went down. The job is off — come back to the marker.');
  }

  update(dt, G) {
    if (this.done) return;
    const def = this.def();
    if (!def) { this.done = true; return; }

    if (!this.active) {
      const place = G.places[def.offer];
      const d = Math.hypot(G.playerPos.x - place.x, G.playerPos.z - place.z);
      if (d < 6.5 && !G.playerInCar) this.startMission(G);
      return;
    }

    const sd = def.stages[this.stageIdx];
    const st = this.stage;

    if (st.tLeft !== null && st.tLeft !== undefined) {
      st.tLeft -= dt;
      if (st.tLeft <= 0) { this.fail(G, 'Out of time.'); return; }
    }

    let stageDone = false;
    if (sd.type === 'deliver' && sd.needsCar && this.missionCar && this.missionCar.health <= 0) {
      this.fail(G, 'The car is wrecked. Carmen wanted it intact.');
      return;
    }
    if (sd.type === 'goto' || sd.type === 'deliver' || sd.type === 'escape') {
      const t = this.targetOf(sd, G);
      const d = Math.hypot(G.playerPos.x - t.x, G.playerPos.z - t.z);
      if (sd.type === 'deliver' && sd.needsCar) {
        stageDone = d < sd.r && G.playerCar === this.missionCar;
      } else {
        stageDone = d < sd.r;
      }
    } else if (sd.type === 'clear') {
      let anyAlive = false;
      for (const ped of st.gang) {
        if (ped.dead) continue;
        anyAlive = true;
        const d = Math.hypot(ped.pos.x - G.playerPos.x, ped.pos.z - G.playerPos.z);
        ped.state = d < 38 ? 'fight' : 'stand';
      }
      stageDone = !anyAlive;
    } else if (sd.type === 'steal') {
      if (st.car.health <= 0) { this.fail(G, 'The car is wrecked. Carmen wanted it intact.'); return; }
      if (G.playerCar === st.car) {
        this.missionCar = st.car;
        stageDone = true;
      }
    }

    if (stageDone) {
      this.stageIdx++;
      if (this.stageIdx >= def.stages.length) this.complete(G);
      else {
        G.hud.toast('Objective updated');
        G.audio.blip();
        this.beginStage(G);
      }
    }
  }
}
