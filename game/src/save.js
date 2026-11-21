// SOLMAR BAY — the persistent save, kept in localStorage.
//
// One small record: the player's cash, how far the story has advanced,
// which weapons are owned, and a handful of lifetime stats for the victory
// screen. Anything unreadable falls back to a fresh save.

const KEY = "solmar-bay-save-v1";

export function freshSave() {
  return {
    cash: 250,
    missionIndex: 0, // next story mission to offer
    weapons: { pistol: false, shotgun: false, rifle: false },
    stats: { steals: 0, knockouts: 0, missionsDone: 0, topStars: 0, playSeconds: 0 },
    finished: false,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const data = JSON.parse(raw);
    const base = freshSave();
    return {
      ...base,
      ...data,
      weapons: { ...base.weapons, ...(data.weapons || {}) },
      stats: { ...base.stats, ...(data.stats || {}) },
    };
  } catch {
    return freshSave();
  }
}

export function storeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // A full or blocked store should never break the game.
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to wipe.
  }
}
