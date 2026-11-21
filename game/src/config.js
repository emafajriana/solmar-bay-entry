// SOLMAR BAY — tuning constants, the city grid and the district map.
//
// The city is an 8x8 grid of blocks. Streets run along the gaps between
// blocks; street centre lines sit at i*PITCH + ROAD/2 for i in 0..8, so the
// built city spans EXTENT metres square, with the beach and the ocean
// beyond its south edge (positive z is south).

export const PITCH = 76; // one block plus one street
export const ROAD = 16; // street width
export const BLOCK = 60; // block width
export const GRID = 8; // blocks per side
export const EXTENT = GRID * PITCH + ROAD; // 624
export const BEACH_END = EXTENT + 56; // sand runs to here, then water
export const HARBOR = { x: 550, z: 668 }; // pier centre, over the water

export const streetCenter = (i) => i * PITCH + ROAD / 2;
export const blockMin = (i) => i * PITCH + ROAD;
export const blockMax = (i) => i * PITCH + ROAD + BLOCK;

// The six districts. `cool` is how many heat points per second the district
// sheds while the police are not actively watching the player there:
// Downtown's cameras make it hold a grudge, the Hills forget by sundown.
export const DISTRICTS = [
  { id: "hills", name: "The Hills", x0: 0, z0: 0, x1: EXTENT, z1: 150, cool: 2.2, tint: "#7fb069" },
  { id: "oldtown", name: "Old Town", x0: 0, z0: 150, x1: 310, z1: 410, cool: 1.1, tint: "#e0a458" },
  { id: "downtown", name: "Downtown", x0: 310, z0: 150, x1: EXTENT, z1: 410, cool: 0.6, tint: "#5aa9e6" },
  { id: "marina", name: "Marina", x0: 0, z0: 410, x1: 310, z1: EXTENT, cool: 1.4, tint: "#4ecdc4" },
  { id: "beachfront", name: "Beachfront", x0: 310, z0: 410, x1: 470, z1: EXTENT, cool: 1.5, tint: "#ffd166" },
  { id: "industrial", name: "Industrial", x0: 470, z0: 410, x1: EXTENT, z1: EXTENT, cool: 1.2, tint: "#b08968" },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[3]; // the Marina claims the beach and the water
}

// District Heat: what each crime adds to the heat of the district it
// happens in, and the heat thresholds that read as wanted stars.
export const CRIME_HEAT = {
  stealCar: 16,
  hitPed: 22,
  killPed: 40,
  killCop: 55,
  copCarHit: 10,
  shotsFired: 8,
  crash: 4,
  punch: 6,
};
export const STAR_THRESHOLDS = [8, 24, 42, 62, 84];
export function starsForHeat(heat) {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (heat >= t) stars++;
  return stars;
}

// Weapons. `slot` is the number key that selects the weapon.
export const WEAPONS = {
  fist: { slot: 1, name: "Fists", damage: 12, range: 2.4, rate: 0.34, mag: Infinity, spread: 0, pellets: 1 },
  pistol: { slot: 2, name: "Pistol", damage: 24, range: 70, rate: 0.27, mag: 12, spread: 0.012, pellets: 1, price: 400 },
  shotgun: { slot: 3, name: "Shotgun", damage: 11, range: 34, rate: 0.95, mag: 6, spread: 0.07, pellets: 6, price: 900 },
  rifle: { slot: 3, name: "Rifle", damage: 17, range: 90, rate: 0.115, mag: 30, spread: 0.02, pellets: 1, price: 1500 },
};

export const PRICES = { refill: 100, spray: 300, hospital: 120, diner: 25 };
export const START_CASH = 250;

// Radio stations shown on the HUD while driving (flavour, original names).
export const RADIO = ["Solmar Waves FM", "Calle Ocho Beats", "Night Drive 84", "La Perla Radio"];
