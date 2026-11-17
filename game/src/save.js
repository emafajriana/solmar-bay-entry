// Save / load through localStorage: cash, missions completed, best stats.
// Nothing else is persisted; the city itself is rebuilt from the seed.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 150,
      missionsDone: typeof data.missionsDone === 'number' ? data.missionsDone : 0,
      bestCash: typeof data.bestCash === 'number' ? data.bestCash : 0,
      kills: typeof data.kills === 'number' ? data.kills : 0,
      carsStolen: typeof data.carsStolen === 'number' ? data.carsStolen : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.round(state.player.cash),
      missionsDone: state.missionsDone,
      bestCash: Math.max(state.bestCash || 0, Math.round(state.player.cash)),
      kills: state.stats.kills,
      carsStolen: state.stats.carsStolen,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
