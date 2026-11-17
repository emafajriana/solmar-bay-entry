// SOLMAR BAY — every tuning number, colour and landmark in one place.
// The city is an 8x8 block grid on the XZ plane. +Z is south, toward the
// beach and the ocean. Roads run between the blocks; buildings sit inside
// them. All distances are metres, all speeds metres per second.

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';

// City geometry: 8 blocks of 36 m with 14 m roads between them.
export const BLOCK = 36;
export const ROAD = 14;
export  const PITCH = BLOCK + ROAD;
export const GRID = 8;
export const CITY_HALF = (GRID * PITCH) / 2; // 200
export const BEACH_Z = 196; // south edge: sand starts here
export const OCEAN_Z = 232;

// Road centre lines: the gaps between blocks, from -175 to +175 in steps of 50.
export const ROAD_LINES = [];
for (let i = 0; i < GRID; i += 1) ROAD_LINES.push(-175 + i * 50);

export const DISTRICTS = [
  { name: 'Downtown', x0: -100, z0: -200, x1: 100, z1: -50 },
  { name: 'Marina', x0: 100, z0: -200, x1: 200, z1: 0 },
  { name: 'Old Town', x0: -200, z0: -50, x1: -50, z1: 100 },
  { name: 'Industrial', x0: -200, z0: 100, x1: 50, z1: 200 },
  { name: 'Beachfront', x0: 50, z0: 100, x1: 200, z1: 200 },
  { name: 'Hills', x0: -200, z0: -200, x1: -100, z1: -50 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  return 'Solmar Bay';
}

// Landmarks the missions and shops use. All lie on or beside a road.
export const LANDMARKS = {
  bar: { x: -125, z: -75, label: "Carmen's Bar — La Marea" },
  pizza: { x: 75, z: -125, label: 'Pizza Solmar' },
  crew: { x: -25, z: 125, label: 'Crew pickup — back alley' },
  turf: { x: 125, z: 75, label: 'Tiburones turf block' },
  drop: { x: -125, z: 125, label: 'The Drop — pier gate' },
  garage: { x: 125, z: -25, label: "Duarte's Garage" },
  harbor: { x: 175, z: 175, label: 'Solmar Harbor' },
  hq: { x: -175, z: -125, label: 'Tiburones HQ' },
  victory: { x: -125, z: -75, label: "Carmen's Bar — La Marea" },
};

export const SHOPS = [
  { kind: 'gun', name: 'GUN RUNNER', x: 25, z: -75, price: 50, blurb: 'Pistol ammo $50 — press E' },
  { kind: 'diner', name: 'DINER SOL', x: -75, z: 25, price: 30, blurb: 'Eat & heal $30 — press E' },
  { kind: 'hospital', name: 'HOSPITAL', x: 75, z: 125, price: 100, blurb: 'Full heal $100 — press E' },
  { kind: 'spray', name: "PAY'N'SPRAY", x: 175, z: 25, price: 150, blurb: 'Respray $150 — clears wanted — press E' },
];

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  jumpSpeed: 8,
  gravity: 22,
  radius: 0.6,
  height: 1.8,
  maxHealth: 100,
  punchDamage: 25,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,
  maxReverse: 10,
  steer: 1.9,
  grip: 6,
  maxHealth: 100,
};

export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 34, range: 60, rate: 0.28, ammo: 12, spread: 0.012 },
  shotgun: { name: 'Shotgun', damage: 22, range: 28, rate: 0.7, ammo: 6, spread: 0.09, pellets: 6 },
  rifle: { name: 'Rifle', damage: 45, range: 90, rate: 0.12, ammo: 30, spread: 0.006 },
};

export const WANTED = {
  decaySeconds: 20,
  steal: 1,
  hitPed: 1,
  killPed: 2,
  shootNearPolice: 1,
  max: 5,
};

export const MISSION_REWARDS = [200, 350, 800, 1200, 900, 1500, 3000, 5000];

export const PALETTE = {
  sky: 0x87bfe8,
  sun: 0xfff2d0,
  ocean: 0x1e7fa8,
  sand: 0xe8d29a,
  road: 0x33363d,
  sidewalk: 0x9a9a92,
  building: [0xd8c9a3, 0xc9a06a, 0x8fb8c9, 0xe0e0d8, 0xb0705a, 0x7a9a6a, 0xd0b090, 0x9a8ac0],
  palm: 0x2e8b57,
  trunk: 0x8a6a42,
  playerShirt: 0x2e86c1,
  playerSkin: 0xc98a5e,
  police: 0x1a2a4a,
  tiburones: 0x8a1a1a,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const TITLE = 'SOLMAR BAY';
export const SUBTITLE = 'An original sun-soaked coastal crime city';
