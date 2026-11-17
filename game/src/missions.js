// Missions + story: 8 jobs for Carmen "La Jefa" Duarte against the
// Los Tiburones gang and Solmar PD. Each mission has a target beacon,
// a HUD objective, a timer where the brief says so, and a cash reward.
// Completing mission 8 ends the game in victory.

import { LANDMARKS, MISSION_REWARDS } from './config.js';
import { addWanted } from './police.js';
import { spawnEnemy } from './combat.js';

export const MISSIONS = [
  {
    id: 1, title: 'Welcome to Solmar',
    brief: "Carmen Duarte runs this bay. Drive to her bar, La Marea, and introduce yourself. Grab any car — the keys are in it.",
    target: LANDMARKS.bar, type: 'drive', reward: MISSION_REWARDS[0],
  },
  {
    id: 2, title: 'Pizza Run',
    brief: 'Pizza Solmar needs a delivery across town in 90 seconds. On foot or by car — just get there hot.',
    target: LANDMARKS.pizza, type: 'timed', timeLimit: 90, reward: MISSION_REWARDS[1],
  },
  {
    id: 3, title: 'Getaway Driver',
    brief: "Pick up Carmen's crew at the back alley, then lose the 2-star heat and bring them to the garage. The cops will come.",
    target: LANDMARKS.crew, type: 'pickup', thenTarget: LANDMARKS.garage, reward: MISSION_REWARDS[2],
  },
  {
    id: 4, title: 'Turf War',
    brief: 'Los Tiburones took a block in Beachfront. Clear all 5 gangsters off it. Your shotgun is unlocked — press 2.',
    target: LANDMARKS.turf, type: 'combat', enemies: 5, reward: MISSION_REWARDS[3],
  },
  {
    id: 5, title: 'The Drop',
    brief: 'A package for the pier gate, 100 seconds, and the cops are watching. Avoid the heat — do not get caught.',
    target: LANDMARKS.drop, type: 'timed', timeLimit: 100, reward: MISSION_REWARDS[4],
  },
  {
    id: 6, title: 'Repo Job',
    brief: 'A Sunset GT is parked by the garage — it belongs to a Tiburones lieutenant. Steal it and deliver it to the garage.',
    target: LANDMARKS.garage, type: 'steal', reward: MISSION_REWARDS[5],
  },
  {
    id: 7, title: 'Harbor Heist',
    brief: 'Hit the harbor stash: take out 6 Tiburones, grab the cash, then escape the 3-star heat to the bar.',
    target: LANDMARKS.harbor, type: 'combat', enemies: 6, thenTarget: LANDMARKS.bar, reward: MISSION_REWARDS[6],
  },
  {
    id: 8, title: 'King of the Bay',
    brief: 'Finale: storm the Tiburones HQ, survive all 8 gangsters, then drive to La Marea. Solmar is yours.',
    target: LANDMARKS.hq, type: 'combat', enemies: 8, thenTarget: LANDMARKS.bar, reward: MISSION_REWARDS[7],
  },
];

export function missionObjective(state) {
  const m = MISSIONS[state.missionIndex];
  if (!m) return 'Solmar is yours. Free roam — enjoy the bay.';
  const stage = state.missionStage || 0;
  const target = stage === 1 && m.thenTarget ? m.thenTarget : m.target;
  const dist = Math.round(distanceTo(state, target));
  return `${m.id}. ${m.title} — ${target.label} (${dist}m)`;
}

export function distanceTo(state, target) {
  const p = state.player;
  const x = p.onFoot ? p.x : p.car.x;
  const z = p.onFoot ? p.z : p.car.z;
  return Math.hypot(target.x - x, target.z - z);
}

export function startMission(state, index, rng, audio) {
  const m = MISSIONS[index];
  if (!m) return;
  state.missionIndex = index;
  state.missionStage = 0;
  state.missionTimer = m.timeLimit || 0;
  state.missionFailed = false;
  state.missionComplete = false;
  // Clear old enemies.
  for (const e of state.enemies) { e.alive = false; e.mesh.visible = false; }
  state.enemies = [];
  if (m.type === 'combat') {
    for (let i = 0; i < m.enemies; i += 1) {
      const a = (i / m.enemies) * Math.PI * 2;
      state.enemies.push(spawnEnemy(state.scene, rng, m.target.x + Math.sin(a) * 12, m.target.z + Math.cos(a) * 12));
    }
  }
  if (m.id === 3) {
    addWanted(state, 0, '');
    state.message = 'Crew picked up — now lose the heat!';
  }
  if (m.id === 4) state.player.unlocked.shotgun = true;
  if (m.id === 6) state.player.unlocked.rifle = true;
  state.message = `Mission ${m.id}: ${m.title} — ${m.brief}`;
  if (audio) audio.jingle();
  updateBeacon(state);
}

export function updateBeacon(state) {
  const m = MISSIONS[state.missionIndex];
  if (!m || !state.city || !state.city.beacon) return;
  const stage = state.missionStage || 0;
  const target = stage === 1 && m.thenTarget ? m.thenTarget : m.target;
  state.city.beacon.position.set(target.x, 0, target.z);
  state.city.beacon.visible = true;
}

export function completeMission(state, audio) {
  const m = MISSIONS[state.missionIndex];
  if (!m) return;
  state.player.cash += m.reward;
  state.stats.cashEarned += m.reward;
  state.missionsDone += 1;
  state.missionComplete = true;
  state.message = `Mission complete: ${m.title} — +$${m.reward}!`;
  if (audio) audio.jingle();
  if (state.city && state.city.beacon) state.city.beacon.visible = false;
}

export function failMission(state, reason, audio) {
  state.missionFailed = true;
  state.message = `Mission failed: ${reason} — press R to retry the mission.`;
  if (audio) audio.fail();
}

export function retryMission(state, rng, audio) {
  startMission(state, state.missionIndex, rng, audio);
  state.missionFailed = false;
}

// Called every frame while playing. Returns 'victory' when mission 8 ends.
export function updateMissions(state, dt, rng, audio) {
  const m = MISSIONS[state.missionIndex];
  if (!m) return null;
  if (state.missionFailed) return null;
  if (m.timeLimit) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      failMission(state, 'Out of time', audio);
      return null;
    }
  }
  const stage = state.missionStage || 0;
  const target = stage === 1 && m.thenTarget ? m.thenTarget : m.target;
  const dist = distanceTo(state, target);

  if (m.type === 'combat') {
    const alive = state.enemies.filter((e) => e.alive).length;
    if (alive === 0) {
      if (m.thenTarget && stage === 0) {
        state.missionStage = 1;
        updateBeacon(state);
        state.message = `Area clear — now get to ${m.thenTarget.label}!`;
        if (m.id === 7) addWanted(state, 3, 'Harbor heist — 3 stars! Lose them at the bar.');
      } else {
        completeMission(state, audio);
        return advance(state, rng, audio);
      }
    }
    return null;
  }

  if (m.type === 'pickup') {
    if (stage === 0 && dist < 9) {
      state.missionStage = 1;
      updateBeacon(state);
      addWanted(state, 2, 'The crew is in — 2 stars! Lose the cops, then reach the garage.');
      state.message = 'Crew picked up — lose the heat, then reach the garage.';
    } else if (stage === 1 && dist < 9) {
      completeMission(state, audio);
      return advance(state, rng, audio);
    }
    return null;
  }

  if (m.type === 'steal') {
    const p = state.player;
    if (!p.onFoot && p.car && dist < 9) {
      completeMission(state, audio);
      return advance(state, rng, audio);
    }
    if (p.onFoot && dist < 9) state.message = 'The Sunset GT is here — get in a car and deliver it to the garage.';
    return null;
  }

  // drive / timed: reach the marker.
  if (dist < 9) {
    completeMission(state, audio);
    return advance(state, rng, audio);
  }
  return null;
}

function advance(state, rng, audio) {
  if (state.missionIndex + 1 >= MISSIONS.length) {
    return 'victory';
  }
  startMission(state, state.missionIndex + 1, rng, audio);
  return null;
}
