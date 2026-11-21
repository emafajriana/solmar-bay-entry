// save.js — the localStorage save: cash, story progress and lifetime
// stats, so CONTINUE on the title screen picks the bay up where the
// player left it. Every access is wrapped: a browser that refuses
// storage (or a headless run) simply plays without saving.

const KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: the run simply is not saved.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
