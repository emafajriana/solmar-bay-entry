// config.js — every constant that shapes SOLMAR BAY lives here: the street
// grid, the six districts, the tuning for feet, cars, guns and the law.
// Nothing in this file moves; it is the map the other modules read.

export const WORLD = {
  // Streets run on lines every 60 m; blocks sit between them. The city
  // square spans -240..240 on both axes, the beach and ocean lie south.
  pitch: 60,
  half: 240,
  roadHalf: 8, // asphalt extends this far either side of a street line
  walkHalf: 11.5, // sidewalks reach this far from a street line
  sandStart: 244, // z beyond this is beach sand
  waterStart: 272, // z beyond this is open water (impassable)
  waterEnd: 430,
};

export function streetLines() {
  const lines = [];
  for (let k = 0; k <= 8; k++) lines.push(-WORLD.half + k * WORLD.pitch);
  return lines;
}

export function blockCenters() {
  const centers = [];
  for (let k = 0; k < 8; k++) centers.push(-WORLD.half + WORLD.pitch / 2 + k * WORLD.pitch);
  return centers;
}

// The six districts. SOLMAR BAY's signature system — District Heat — hangs
// off this table: each district remembers the heat the player raises inside
// it, patrols at its own strength, cools at its own rate and charges its
// own respray price. `rect` is [x0, z0, x1, z1]; first match wins.
export const DISTRICTS = [
  { id: 'hills', name: 'The Hills', rect: [-244, -244, -20, -40], patrol: 0.65, cool: 0.85, sprayMult: 0.8, palette: ['#8a9a5b', '#a8b07c', '#6f8150'] },
  { id: 'oldtown', name: 'Old Town', rect: [-20, -244, 244, -40], patrol: 0.9, cool: 0.6, sprayMult: 1.0, palette: ['#b08968', '#c9a227', '#7f5539'] },
  { id: 'marina', name: 'Marina', rect: [-244, -40, -140, 244], patrol: 0.8, cool: 0.7, sprayMult: 0.9, palette: ['#2a9d8f', '#48cae4', '#0077b6'] },
  { id: 'downtown', name: 'Downtown', rect: [-140, -40, 60, 140], patrol: 1.3, cool: 0.45, sprayMult: 1.35, palette: ['#5a6b8c', '#7d8597', '#33415c'] },
  { id: 'beach', name: 'Beachfront', rect: [-140, 140, 60, 244], patrol: 1.0, cool: 0.65, sprayMult: 1.1, palette: ['#e9c46a', '#f4a261', '#ee6c4d'] },
  { id: 'industrial', name: 'Industrial', rect: [60, -40, 244, 244], patrol: 0.85, cool: 0.75, sprayMult: 0.85, palette: ['#6c757d', '#99582a', '#495057'] },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.rect;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return d;
  }
  return DISTRICTS[3]; // Downtown is the fallback heart of the city
}

// Named places the story and the shops hang off. Every building sits
// wholly inside its block (never across a street line), and `door` is the
// standable point in front of its entrance — missions and interactions
// measure distance to the door, never to the walled-off centre.
export const PLACES = {
  bar: { name: "Carmen's Bar", x: -44, z: 196, door: { x: -44, z: 184 } },
  motel: { name: 'Marina Motel', x: -196, z: 100, door: { x: -182, z: 100 } },
  bank: { name: 'Solmar Trust Bank', x: 24, z: 36, door: { x: 10, z: 36 } },
  hideout: { name: 'Hills Hideout', x: -160, z: -160, door: { x: -146, z: -160 } },
  garage: { name: 'Duarte Garage', x: 160, z: 84, door: { x: 146, z: 84 } },
  harbor: { name: 'Harbor Pier 9', x: -206, z: 232, door: { x: -206, z: 232 } },
  hq: { name: 'Tiburones HQ', x: 156, z: -156, door: { x: 142, z: -156 } },
  victory: { name: 'Marina Lookout', x: -216, z: 210, door: { x: -216, z: 210 } },
  hospital: { name: 'Bay General', x: -84, z: 96, door: { x: -70, z: 96 } },
};

export const SHOPS = [
  { kind: 'spray', name: "Pay'n'Spray", x: 126, z: 24, driveIn: true },
  { kind: 'spray', name: "Pay'n'Spray", x: 204, z: -96, driveIn: true },
  { kind: 'guns', name: 'Gun Runner', x: 96, z: -96, driveIn: false },
  { kind: 'diner', name: 'Bay General Diner', x: -78, z: 84, driveIn: false },
];

export const TUNING = {
  // On foot
  walkSpeed: 5.2,
  runSpeed: 9.0,
  jumpSpeed: 8.2,
  gravity: 24,
  playerRadius: 0.55,
  // Driving
  carAccel: 15,
  carBrake: 26,
  carReverseMax: 11,
  carDrag: 0.55,
  carTurn: 1.55,
  carRadius: 1.7,
  // The law
  starThresholds: [10, 26, 44, 64, 86],
  bustSeconds: 2.2,
  bustRange: 3.4,
  // Health
  maxHealth: 100,
  regenDelay: 6,
  regenRate: 7,
};

export const CRIME_HEAT = {
  stealParked: 12,
  stealOccupied: 20,
  hitPedestrian: 16,
  killPedestrian: 30,
  hitPoliceCar: 18,
  shotNearPolice: 8,
  punchCivilian: 10,
};

export const WEAPONS = {
  fist: { name: 'Fists', damage: 26, range: 1.9, cooldown: 0.38, auto: false },
  pistol: { name: 'Pistol', damage: 34, range: 65, cooldown: 0.34, auto: false, ammoCost: 1, price: 0, ammoPrice: 2 },
  shotgun: { name: 'Shotgun', damage: 13, pellets: 6, range: 34, cooldown: 0.95, auto: false, ammoCost: 1, price: 650, ammoPrice: 6 },
  rifle: { name: 'Rifle', damage: 21, range: 85, cooldown: 0.115, auto: true, ammoCost: 1, price: 1400, ammoPrice: 3 },
};

export const RADIO_STATIONS = ['SOLMAR FM 101.1', 'BAY WAVES 98.2', 'TIBURON RADIO', 'COASTLINE 104.7', 'NOCHE 88.9'];
