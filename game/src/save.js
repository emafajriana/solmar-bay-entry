// save.js — the persistent record, kept in localStorage: cash, story
// progress, gun ownership, and the lifetime stats the victory screen
// reads back. One small JSON object under one key; anything unreadable
// falls back to a fresh start rather than breaking the title screen.

import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    cash: 250,
    missionIndex: 0,
    owned: { pistol: false, shotgun: false, rifle: false },
    unlocked: { shotgun: false, rifle: false },
    stats: { earned: 0, missionsDone: 0, steals: 0, busts: 0, wasteds: 0, playSeconds: 0 },
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const base = defaultSave();
    return {
      ...base,
      ...data,
      owned: { ...base.owned, ...(data.owned ?? {}) },
      unlocked: { ...base.unlocked, ...(data.unlocked ?? {}) },
      stats: { ...base.stats, ...(data.stats ?? {}) },
    };
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* private mode: the run just will not persist */ }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}
