// SOLMAR BAY — the story: eight missions for fixer Carmen "La Jefa"
// Duarte, against the Los Tiburones gang and the heat of the Solmar PD.
//
// A mission is a list of stages. The runner walks the stages, keeps the
// HUD objective and the world marker honest, spawns what a stage needs
// (gang crews, the repo target car), and calls back into the game to pay
// out, fail, or finish. Fail states are real: timers run out, the repo
// car can be destroyed, and getting wasted or busted mid-mission ends it
// — Carmen will offer the same job again at the bar.

import { HARBOR } from "./config.js";

const BAR = { x: 88.5, z: 502 };
const DINER = { x: 316.5, z: 502 };
const GARAGE = { x: 544.5, z: 426 };
const HQ = { x: 88.5, z: 198 };

export const MISSIONS = [
  {
    title: "Welcome to Solmar",
    reward: 200,
    brief: "Carmen: \"You made it to the bay, primo. I'm Carmen — I run La Perla, and half the favours in this town run through me. Get yourself across the Marina and come say hello properly.\"",
    stages: [{ type: "goto", x: BAR.x, z: BAR.z, r: 6, label: "Meet Carmen at La Perla" }],
  },
  {
    title: "Pizza Run",
    reward: 350,
    brief: "Carmen: \"Café Brisa owes me a favour and I owe a judge a pizza — still hot, that's the whole deal. Pick it up at the diner, drop it at the courthouse flats Downtown. Don't let it get cold.\"",
    stages: [
      { type: "goto", x: DINER.x, z: DINER.z, r: 6, label: "Pick up the delivery at Café Brisa" },
      { type: "timed", x: 468.5, z: 198, r: 7, seconds: 80, label: "Deliver it Downtown while it's hot" },
    ],
  },
  {
    title: "Getaway Driver",
    reward: 600,
    brief: "Carmen: \"Some friends of mine are making a withdrawal they didn't exactly schedule. Be outside the Gun Runner block when they come out, and when the heat comes — and it will — lose it, then bring them to the Bay Garage.\"",
    stages: [
      { type: "goto", x: 380, z: 306, r: 8, label: "Wait for the crew by the Gun Runner block" },
      { type: "escape", x: GARAGE.x, z: GARAGE.z, r: 8, label: "Get the crew to the Bay Garage, then shake the heat" },
    ],
  },
  {
    title: "Turf War",
    reward: 900,
    brief: "Carmen: \"Los Tiburones think Beachfront is theirs now. Five of them, hanging around the palms like they own the sunset. Go explain the property market to them.\"",
    stages: [{ type: "clear", x: 430, z: 512, r: 30, count: 5, label: "Clear Los Tiburones out of Beachfront" }],
  },
  {
    title: "The Drop",
    reward: 1200,
    brief: "Carmen: \"A package is waiting by the Marina warehouses. It goes to the harbor, fast and quiet, and nobody opens it. The Tiburones would love to know what's inside — don't give them the chance.\"",
    stages: [
      { type: "goto", x: 205, z: 436, r: 7, label: "Pick up the package at the Marina warehouses" },
      { type: "timed", x: HARBOR.x, z: 660, r: 12, seconds: 130, label: "Deliver it to the harbor pier" },
    ],
  },
  {
    title: "Repo Job",
    reward: 1800,
    brief: "Carmen: \"A man in the Hills borrowed money against a very pretty sports car and then forgot both. The car sits up there shining. Take it — carefully, it's the collateral — and park it at the Bay Garage.\"",
    stages: [
      { type: "steal", x: 505, z: 46, label: "Steal the marked sports car in the Hills" },
      { type: "goto", x: GARAGE.x, z: GARAGE.z, r: 8, label: "Deliver it to the Bay Garage, in one piece", needsTargetCar: true },
    ],
  },
  {
    title: "Harbor Heist",
    reward: 3000,
    brief: "Carmen: \"Tonight we take the Tiburones' whole shipment at the harbor. Their boys will be guarding the containers. Clear the pier, and when the PD comes down on the Industrial grid, get out.\"",
    stages: [
      { type: "goto", x: HARBOR.x, z: 664, r: 14, label: "Reach the harbor pier" },
      { type: "clear", x: HARBOR.x, z: 690, r: 46, count: 6, label: "Clear the Tiburones off the pier" },
      { type: "escape", x: GARAGE.x, z: GARAGE.z, r: 8, label: "Escape to the Bay Garage and shake the heat" },
    ],
  },
  {
    title: "King of the Bay",
    reward: 5000,
    brief: "Carmen: \"One job left, and it's the big one. Club Tiburón, in Old Town — their home, their whole crew. Walk in there and end this. Then come back to La Perla and we'll drink to a quieter bay.\"",
    stages: [
      { type: "clear", x: HQ.x + 24, z: HQ.z, r: 34, count: 8, label: "Assault Club Tiburón and clear the crew" },
      { type: "goto", x: BAR.x, z: BAR.z, r: 7, label: "Return to La Perla" },
    ],
  },
];

export class MissionRunner {
  constructor(hooks) {
    this.hooks = hooks; // { spawnGang, spawnTargetCar, toast, pay, crimeAt, setBanner }
    this.active = null; // { def, stageIdx, timer, enemies, targetCar, stage }
    this.offerIndex = 0;
  }

  get busy() {
    return this.active !== null;
  }

  currentDef(index) {
    return MISSIONS[index] || null;
  }

  start(index) {
    const def = MISSIONS[index];
    if (!def) return;
    this.active = { def, index, stageIdx: -1, timer: 0, enemies: [], targetCar: null };
    this.nextStage();
  }

  nextStage() {
    const a = this.active;
    a.stageIdx++;
    // Retire the previous stage's survivors.
    for (const e of a.enemies) if (!e.down) this.hooks.retirePed(e);
    a.enemies = [];
    const stage = a.def.stages[a.stageIdx];
    if (!stage) {
      this.complete();
      return;
    }
    a.stage = stage;
    a.timer = stage.type === "timed" ? stage.seconds : 0;
    if (stage.type === "clear") {
      a.enemies = this.hooks.spawnGang(stage.x, stage.z, stage.count);
      this.hooks.toast(`${stage.count} Tiburones in the zone`);
    }
    if (stage.type === "steal") {
      a.targetCar = this.hooks.spawnTargetCar(stage.x, stage.z);
      this.hooks.toast("The marked car is on the minimap");
    }
    if (a.def.title === "Getaway Driver" && a.stageIdx === 1) {
      this.hooks.crimeAt("killPed", 380, 306); // the crew's exit draws the PD
      this.hooks.toast("The crew is in! Drive!");
    }
    if (a.def.title === "Harbor Heist" && a.stageIdx === 2) {
      this.hooks.crimeAt("killCop", HARBOR.x, 690);
      this.hooks.toast("The pier is ours — now run!");
    }
  }

  complete() {
    const a = this.active;
    this.active = null;
    this.hooks.pay(a.def.reward, a.index);
  }

  fail(reason) {
    if (!this.active) return;
    const a = this.active;
    this.active = null;
    for (const e of a.enemies) if (!e.down) this.hooks.retirePed(e);
    if (a.targetCar) this.hooks.retireCar(a.targetCar);
    this.hooks.failed(a.def.title, reason);
  }

  // HUD facts for the current stage.
  objective() {
    if (!this.active) return null;
    const s = this.active.stage;
    let label = s.label;
    if (s.type === "clear") {
      const left = this.active.enemies.filter((e) => !e.down).length;
      label = `${s.label} (${left} left)`;
    }
    if (s.type === "timed") label = `${s.label} — ${Math.max(0, Math.ceil(this.active.timer))}s`;
    if (s.type === "escape" && this.active.atDrop) label = "Lose the heat — break line of sight and let the district cool";
    return { label, x: s.x, z: s.z };
  }

  update(dt, game) {
    const a = this.active;
    if (!a) return;
    const s = a.stage;
    const p = game.playerPos();

    // Enemy crews fight back while their stage is live.
    if (a.enemies.length > 0) {
      for (const e of a.enemies) {
        if (e.down) continue;
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        e.angle = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
        e.mesh.rotation.y = e.angle;
        if (d > 20) {
          e.pos.x += Math.sin(e.angle) * 3.4 * dt;
          e.pos.z += Math.cos(e.angle) * 3.4 * dt;
        } else if (d < 7) {
          e.pos.x -= Math.sin(e.angle) * 2 * dt;
          e.pos.z -= Math.cos(e.angle) * 2 * dt;
        }
        if (d < 36 && !game.noEnemyFire) {
          game.combat.enemyShoot(e, { x: p.x, z: p.z }, game.world, game.events, game.time);
        }
      }
    }

    switch (s.type) {
      case "goto": {
        if (s.needsTargetCar && a.targetCar && a.targetCar.health <= 0) {
          this.fail("The collateral burned. Carmen is not pleased.");
          return;
        }
        const inCar = s.needsTargetCar ? game.player.car === a.targetCar : true;
        if (Math.hypot(p.x - s.x, p.z - s.z) < s.r && inCar) this.nextStage();
        break;
      }
      case "timed": {
        a.timer -= dt;
        if (a.timer <= 0) {
          this.fail("Out of time.");
          return;
        }
        if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) this.nextStage();
        break;
      }
      case "clear": {
        if (a.enemies.every((e) => e.down)) this.nextStage();
        break;
      }
      case "steal": {
        if (game.player.car && game.player.car === a.targetCar) {
          this.hooks.toast("That's the car — get it to the garage");
          this.nextStage();
        } else if (a.targetCar && a.targetCar.health <= 0) {
          this.fail("The car was destroyed before you could take it.");
        }
        break;
      }
      case "escape": {
        const atDrop = Math.hypot(p.x - s.x, p.z - s.z) < s.r + 6;
        a.atDrop = atDrop;
        // Parked up at the drop, out of sight: the district cools fast.
        if (atDrop && game.police.seenAgo > 2) this.hooks.coolDistrict(p.x, p.z, 3.4 * dt);
        if (atDrop && game.police.stars === 0) this.nextStage();
        break;
      }
    }
  }
}
