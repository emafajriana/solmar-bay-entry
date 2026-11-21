// config.js — every shared constant for Solmar Bay lives here: the street
// grid, the six districts and their tempers, the price of everything, and
// the tuning knobs the other modules read. Nothing in this file moves.

export const GRID = {
  blocks: 8,          // 8 x 8 blocks of city
  pitch: 46,          // centre-to-centre distance between neighbouring roads
  roadHalf: 7,        // half the width of a road (roads are 14 m across)
  lotHalf: 16,        // half the width of a buildable lot inside the roads
  get extent() { return (this.blocks * this.pitch) / 2; }, // 184 m each way
};

// Road centre lines run at -184, -138, ... 0 ... 138, 184 on both axes.
export const ROAD_LINES = [];
for (let i = 0; i <= GRID.blocks; i++) ROAD_LINES.push(-GRID.extent + i * GRID.pitch);

// Block centres sit halfway between road lines.
export const BLOCK_CENTRES = [];
for (let i = 0; i < GRID.blocks; i++) BLOCK_CENTRES.push(-GRID.extent + GRID.pitch / 2 + i * GRID.pitch);

// The six districts. rect is [minX, minZ, maxX, maxZ]. cool is heat lost per
// second once a district has been quiet for a while — Downtown's cameras
// remember, the Hills forget. tint colours the minimap and the rooftops.
export const DISTRICTS = [
  { id: 'hills',      name: 'The Hills',  rect: [-184, -184,  184,  -92], cool: 2.2, tint: 0x8fbf6f },
  { id: 'oldtown',    name: 'Old Town',   rect: [-184,  -92,  -46,   46], cool: 1.2, tint: 0xd9a066 },
  { id: 'downtown',   name: 'Downtown',   rect: [ -46,  -92,   92,   46], cool: 0.6, tint: 0x7fb2d9 },
  { id: 'industrial', name: 'Industrial', rect: [  92,  -92,  184,  184], cool: 1.0, tint: 0xb08d6f },
  { id: 'marina',     name: 'Marina',     rect: [-184,   46,  -46,  184], cool: 1.4, tint: 0x5fc4b5 },
  { id: 'beachfront', name: 'Beachfront', rect: [ -46,   46,   92,  184], cool: 1.6, tint: 0xf2cf7e },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.rect;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return d;
  }
  // South of the city grid is beach and harbour frontage: Beachfront west
  // of the industrial fence line, Industrial to the east.
  if (z >= 184) return x < 92 ? DISTRICTS[5] : DISTRICTS[3];
  return DISTRICTS[2];
}

// District Heat -> wanted stars. Stars are read from the ground under the
// player's feet, never from a global counter.
export function starsForHeat(heat) {
  if (heat < 8) return 0;
  if (heat < 24) return 1;
  if (heat < 42) return 2;
  if (heat < 60) return 3;
  if (heat < 80) return 4;
  return 5;
}

// Heat each crime adds to the district where it happened.
export const CRIME_HEAT = {
  steal: 16,
  hitPed: 22,
  kill: 40,
  killCop: 55,
  shotsHeard: 8,
  punch: 6,
  hardCrash: 4,
};

export const PRICES = {
  pistol: 400,
  shotgun: 900,
  rifle: 1600,
  ammoBox: 60,      // pistol + shotgun + rifle top-up
  respray: 300,     // Pay'n'Spray: repair + the District Heat wash
  hospital: 150,    // full heal
  diner: 35,        // +35 health
};

export const WEAPONS = {
  fists:   { name: 'Fists',   damage: 34, range: 1.9,  rate: 0.38,  spread: 0,     pellets: 1, mag: Infinity, kick: 0 },
  pistol:  { name: 'Pistol',  damage: 34, range: 70,  rate: 0.27,  spread: 0.006, pellets: 1, mag: 12,       kick: 0.6 },
  shotgun: { name: 'Shotgun', damage: 13, range: 34,  rate: 0.95,  spread: 0.075, pellets: 6, mag: 6,        kick: 2.4 },
  rifle:   { name: 'Rifle',   damage: 26, range: 95,  rate: 0.115, spread: 0.01,  pellets: 1, mag: 30,       kick: 0.9 },
};

export const TUNING = {
  walkSpeed: 4.3,
  runSpeed: 7.6,
  jumpSpeed: 8.2,
  gravity: 23,
  playerRadius: 0.45,
  healthRegenDelay: 6,     // seconds out of combat before health creeps back
  healthRegenRate: 4,      // hp per second while regenerating
  quietBeforeCooling: 6,   // seconds a district must stay quiet before it cools
  chaseSpill: 0.85,        // heat/s the PD adds to the district you flee into
  bustSeconds: 2.4,        // standing next to a cop this long = arrested
  dayStartMinutes: 9 * 60, // the in-game clock starts at 09:00
  minutesPerSecond: 1,     // and ticks one game-minute per real second
};

export const SAVE_KEY = 'solmar-bay-save-v4';
