// missions.js — Carmen Duarte's eight jobs: the story of SOLMAR BAY.
// A small step framework runs them: each mission is a list of steps with
// an objective line, a world marker, and a check that reports done/fail.
// Jobs are offered at the Marina Motel (the first) and at Carmen's Bar
// (the rest). Failing a job — timer out, death, the repo car destroyed —
// sends the player back to the offer point to take it again.

import { PLACES } from './config.js';

export function createMissions(G) {
  const goto = (place, radius, text) => {
    const t = place.door ?? place;
    return {
      text,
      marker: { x: t.x, z: t.z },
      radius,
      check() {
        const f = G.playerFocus();
        return Math.hypot(f.x - t.x, f.z - t.z) < radius ? 'done' : null;
      },
    };
  };
  const killStep = (tag, place, text) => ({
    text,
    marker: { x: place.x, z: place.z },
    radius: 30,
    check() {
      return G.combat.countAlive(tag) === 0 ? 'done' : null;
    },
  });

  const DEFS = [
    {
      title: 'Welcome to Solmar',
      reward: 300,
      brief: 'Carmen: "You made it to the bay, primo. Wheels up — get yourself a car and come see me at my bar on the Beachfront. We talk business face to face."',
      steps: [goto(PLACES.bar, 8, "Drive to Carmen's Bar on the Beachfront")],
    },
    {
      title: 'Pizza Run',
      reward: 450,
      brief: 'Carmen: "The diner owes me a favour and tonight I collect in pepperoni. Pick up the pizzas and drop them at my three buyers — hot, and before the clock runs out."',
      timer: 200,
      steps: [
        goto({ x: -78, z: 96 }, 6, 'Pick up the pizzas at Bay General Diner'),
        goto({ x: 66, z: 156 }, 7, 'Deliver to the Beachfront buyer'),
        goto({ x: -126, z: 66 }, 7, 'Deliver to the Downtown buyer'),
        goto({ x: 156, z: -30 }, 7, 'Deliver to the Industrial buyer'),
      ],
    },
    {
      title: 'Getaway Driver',
      reward: 800,
      brief: 'Carmen: "My crew walks out of Solmar Trust with heavy bags and no ride. Be at the door, wait while they load, then lose the law and reach the Hills hideout."',
      steps: [
        goto(PLACES.bank, 9, 'Get to Solmar Trust Bank'),
        {
          text: 'Wait while the crew loads up',
          marker: { x: PLACES.bank.door.x, z: PLACES.bank.door.z },
          radius: 10,
          dwell: 3,
          check() {
            return this.dwellDone ? 'done' : null;
          },
        },
        {
          text: 'Lose the law and reach the Hills hideout',
          marker: { x: PLACES.hideout.door.x, z: PLACES.hideout.door.z },
          radius: 10,
          start() {
            G.police.addHeat(PLACES.bank.x, PLACES.bank.z, 52);
            G.hud.toast('The crew is in — GO!', 2.4);
          },
          check() {
            const f = G.playerFocus();
            return Math.hypot(f.x - PLACES.hideout.door.x, f.z - PLACES.hideout.door.z) < 8 ? 'done' : null;
          },
        },
      ],
    },
    {
      title: 'Turf War',
      reward: 900,
      brief: 'Carmen: "Los Tiburones are selling on my Old Town block like they own it. Five of them. Correct that impression — the Gun Runner on that side of town sells what you need."',
      steps: [
        goto({ x: 30, z: -100 }, 16, 'Reach the Tiburones block in Old Town'),
        {
          ...killStep('m4', { x: 30, z: -100 }, 'Clear the Tiburones off the block'),
          start() {
            for (const [ox, oz] of [
              [0, 0],
              [8, 5],
              [-7, 6],
              [5, -8],
              [-6, -6],
            ]) {
              G.combat.spawnHostile('gang', 30 + ox, -100 + oz, { tag: 'm4' });
            }
          },
        },
      ],
    },
    {
      title: 'The Drop',
      reward: 1100,
      brief: 'Carmen: "A package comes in at Pier 9 tonight. Collect it, take it to Duarte Garage, and do not stop for anybody — the harbour patrol has been paid to be curious."',
      timer: 220,
      steps: [
        goto(PLACES.harbor, 9, 'Pick up the package at Pier 9'),
        {
          text: 'Deliver the package to Duarte Garage',
          marker: { x: PLACES.garage.door.x, z: PLACES.garage.door.z },
          radius: 9,
          start() {
            G.police.addHeat(PLACES.harbor.x, PLACES.harbor.z, 26);
          },
          check() {
            const f = G.playerFocus();
            return Math.hypot(f.x - PLACES.garage.door.x, f.z - PLACES.garage.door.z) < 9 ? 'done' : null;
          },
        },
      ],
    },
    {
      title: 'Repo Job',
      reward: 1300,
      brief: 'Carmen: "A gold sports car in Old Town belongs to a man who stopped paying. Take it — gently — and bring it to Duarte Garage with the paint still on it."',
      steps: [
        {
          text: 'Steal the gold sports car in Old Town',
          markerFn: () => (data.repoCar ? { x: data.repoCar.x, z: data.repoCar.z } : { x: 60, z: -186 }),
          radius: 4,
          start() {
            data.repoCar = G.vehicles.spawnCar(60, -186, Math.PI / 2, 'marked', 0xd4af37);
          },
          check() {
            return data.repoCar && G.playerCar === data.repoCar ? 'done' : null;
          },
        },
        {
          text: 'Deliver it to Duarte Garage — keep it alive',
          marker: { x: PLACES.garage.door.x, z: PLACES.garage.door.z },
          radius: 10,
          check() {
            if (data.repoCar && data.repoCar.dead) return 'fail';
            const f = G.playerFocus();
            return G.playerCar === data.repoCar && Math.hypot(f.x - PLACES.garage.door.x, f.z - PLACES.garage.door.z) < 10 ? 'done' : null;
          },
        },
      ],
    },
    {
      title: 'Harbor Heist',
      reward: 2200,
      brief: 'Carmen: "The Tiburones keep their cash in a container at Pier 9. Six guards, one strongbox. Take the money and disappear into the Hills — every badge in the Marina will be awake."',
      steps: [
        goto(PLACES.harbor, 11, 'Get to Pier 9'),
        {
          ...killStep('m7', PLACES.harbor, 'Clear the pier guards'),
          start() {
            for (const [ox, oz] of [
              [-8, 14],
              [6, 20],
              [-3, 30],
              [9, 36],
              [-10, 42],
              [2, 48],
            ]) {
              G.combat.spawnHostile('gang', PLACES.harbor.x + ox, PLACES.harbor.z + oz, { tag: 'm7' });
            }
          },
        },
        goto({ x: PLACES.harbor.x + 4, z: 262 }, 5, 'Grab the strongbox'),
        {
          text: 'Escape to the Hills hideout',
          marker: { x: PLACES.hideout.door.x, z: PLACES.hideout.door.z },
          radius: 10,
          start() {
            G.police.addHeat(PLACES.harbor.x, PLACES.harbor.z, 66);
            G.hud.toast('The whole Marina is awake — RUN!', 2.6);
          },
          check() {
            const f = G.playerFocus();
            return Math.hypot(f.x - PLACES.hideout.door.x, f.z - PLACES.hideout.door.z) < 8 ? 'done' : null;
          },
        },
      ],
    },
    {
      title: 'King of the Bay',
      reward: 5000,
      brief: 'Carmen: "Tonight it ends. The Tiburones HQ in Old Town — El Tiburón himself is home, and he does not travel light. Finish it, then meet me at the Marina lookout. The bay is watching."',
      steps: [
        goto(PLACES.hq, 13, 'Reach the Tiburones HQ'),
        {
          ...killStep('m8', PLACES.hq, 'Take down El Tiburón and his guard'),
          start() {
            for (const [ox, oz] of [
              [10, 4],
              [-9, 8],
              [6, -10],
              [-12, -6],
              [14, 12],
              [-4, 14],
              [0, -14],
            ]) {
              G.combat.spawnHostile('gang', PLACES.hq.x + ox, PLACES.hq.z + oz, { tag: 'm8' });
            }
            G.combat.spawnHostile('gang', PLACES.hq.x, PLACES.hq.z, { tag: 'm8', boss: true, hp: 320 });
          },
        },
        goto(PLACES.victory, 9, 'Meet Carmen at the Marina lookout'),
      ],
    },
  ];

  const data = { repoCar: null };
  let index = 0; // next mission to offer
  let active = null; // { def, stepIndex, step, missionT, dwellT }
  let marker = null;
  let markerDist = 0;
  let objectiveText = '';

  function currentStep() {
    return active ? active.def.steps[active.stepIndex] : null;
  }

  function beginStep() {
    const step = currentStep();
    active.dwellT = 0;
    if (step) step.dwellDone = false;
    if (step && step.start) step.start();
    refreshObjective();
  }

  function refreshObjective() {
    const step = currentStep();
    objectiveText = step ? step.text : '';
    marker = step ? (step.markerFn ? step.markerFn() : step.marker) : null;
  }

  function cleanup(def) {
    G.combat.clearTag('m4');
    G.combat.clearTag('m7');
    G.combat.clearTag('m8');
    if (data.repoCar && G.playerCar !== data.repoCar) {
      G.vehicles.removeCar(data.repoCar);
    }
    if (def) void def;
    data.repoCar = null;
  }

  return {
    defs: DEFS,
    get index() {
      return index;
    },
    set index(v) {
      index = v;
    },
    get active() {
      return active;
    },
    get marker() {
      return marker;
    },
    get markerDist() {
      return markerDist;
    },
    get objectiveText() {
      if (!active) return index < DEFS.length ? `See Carmen — new work at the ${index === 0 ? 'Marina Motel' : 'bar'}` : 'The bay is yours, King.';
      if (active.def.timer) {
        const left = Math.max(0, Math.ceil(active.def.timer - active.missionT));
        return `${objectiveText} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      }
      return objectiveText;
    },
    offerPoint() {
      return index === 0 ? PLACES.motel.door : PLACES.bar.door;
    },
    currentDef() {
      return index < DEFS.length ? DEFS[index] : null;
    },
    allDone() {
      return index >= DEFS.length;
    },
    begin() {
      const def = this.currentDef();
      if (!def || active) return;
      active = { def, stepIndex: 0, missionT: 0, dwellT: 0 };
      beginStep();
    },
    fail(reason) {
      if (!active) return;
      const def = active.def;
      active = null;
      marker = null;
      objectiveText = '';
      cleanup(def);
      G.onMissionFailed(def, reason);
    },
    complete() {
      const def = active.def;
      active = null;
      marker = null;
      objectiveText = '';
      cleanup(def);
      index++;
      G.onMissionComplete(def);
    },
    update(dt) {
      if (!active) return;
      active.missionT += dt;
      const step = currentStep();
      if (!step) return;
      if (step.markerFn) marker = step.markerFn();
      const focus = G.playerFocus();
      if (marker) markerDist = Math.hypot(focus.x - marker.x, focus.z - marker.z);
      if (active.def.timer && active.missionT > active.def.timer) {
        this.fail('Out of time.');
        return;
      }
      if (step.dwell) {
        if (markerDist < step.radius) {
          active.dwellT += dt;
          step.dwellDone = active.dwellT >= step.dwell;
        } else {
          active.dwellT = 0;
          step.dwellDone = false;
        }
      }
      const verdict = step.check ? step.check() : null;
      if (verdict === 'fail') {
        this.fail('The job fell apart.');
        return;
      }
      if (verdict === 'done') {
        active.stepIndex++;
        if (active.stepIndex >= active.def.steps.length) {
          this.complete();
        } else {
          G.audio.blip();
          beginStep();
        }
      }
    },
  };
}
