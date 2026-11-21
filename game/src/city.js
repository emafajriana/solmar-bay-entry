// SOLMAR BAY — the procedural city.
//
// An 8x8 grid of blocks on a canvas-textured ground plane: asphalt streets
// with dashes and crosswalks, raised sidewalks, and buildings whose style
// follows their district — glass towers Downtown, stucco in Old Town,
// pastel blocks at the Marina, warehouses in the Industrial grid, low
// houses up in the Hills. South of the last street the city gives up: sand,
// palms, open water, and the container harbor on its pier.
//
// The build returns everything the rest of the game needs to know about
// the place: building colliders, parking spots, the named places with
// their door points, and the traffic-light phase for any intersection.

import * as THREE from "three";
import {
  PITCH, ROAD, BLOCK, GRID, EXTENT, BEACH_END, HARBOR,
  streetCenter, blockMin, districtAt,
} from "./config.js";

// Named places: block indices plus the words on the sign. The door point
// is derived from the block's west edge, on the sidewalk facing the street.
export const PLACES = [
  { id: "bar", name: "La Perla", sub: "Carmen's bar", block: [1, 6], color: 0xd94f6a, sign: "LA PERLA" },
  { id: "gunshop", name: "Gun Runner", sub: "Weapons", block: [5, 3], color: 0x3d405b, sign: "GUN RUNNER" },
  { id: "spray", name: "Shine Auto", sub: "Pay'n'Spray", block: [6, 6], color: 0x2a9d8f, sign: "SHINE AUTO" },
  { id: "hospital", name: "St. Solmar", sub: "Hospital", block: [4, 2], color: 0xe8e6df, sign: "ST SOLMAR +" },
  { id: "diner", name: "Café Brisa", sub: "Diner", block: [4, 6], color: 0xf2a65a, sign: "CAFE BRISA" },
  { id: "garage", name: "Bay Garage", sub: "Lockup", block: [7, 5], color: 0x606c76, sign: "BAY GARAGE" },
  { id: "hq", name: "Tiburones HQ", sub: "Stay away", block: [1, 2], color: 0x7d8597, sign: "CLUB TIBURON" },
];

const DISTRICT_STYLE = {
  downtown: { palette: [0x9db4c8, 0xb8c4ce, 0x8fa3b8, 0xc7b299], minH: 42, maxH: 96, perBlock: 1 },
  oldtown: { palette: [0xd9a679, 0xc98f5f, 0xe3c09a, 0xb87b4f], minH: 9, maxH: 20, perBlock: 3 },
  marina: { palette: [0xf6e8d8, 0xf2d5c4, 0xd8e8e0, 0xf9f1e5], minH: 10, maxH: 24, perBlock: 2 },
  beachfront: { palette: [0xffe3b3, 0xffd6a5, 0xfdffb6, 0xcaffbf], minH: 8, maxH: 18, perBlock: 2 },
  industrial: { palette: [0x9a8c7a, 0x7d7466, 0xa89a86, 0x6f7d7a], minH: 10, maxH: 22, perBlock: 2 },
  hills: { palette: [0xf3ead8, 0xe8dcc4, 0xdfd0ae, 0xf7f2e6], minH: 5, maxH: 9, perBlock: 4 },
};

function makeFacadeTexture(rng, baseHex, floors, cols) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  const base = new THREE.Color(baseHex);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(0, 246, 128, 10);
  const winW = 128 / cols;
  const winH = 256 / floors;
  for (let y = 0; y < floors; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(0.24);
      g.fillStyle = lit ? "rgba(255,214,140,0.95)" : "rgba(38,54,72,0.9)";
      g.fillRect(x * winW + 3, y * winH + 4, winW - 6, winH - 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeSignTexture(text, bgHex) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = bgHex;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = "#ffffff";
  g.font = "bold 52px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture() {
  const S = 2048;
  const scale = S / EXTENT;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d");
  // Sidewalk base everywhere; streets are painted over it.
  g.fillStyle = "#b9b3a8";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#3f4448";
  for (let i = 0; i <= GRID; i++) {
    const p = i * PITCH * scale;
    const w = ROAD * scale;
    g.fillRect(p, 0, w, S);
    g.fillRect(0, p, S, w);
  }
  // Centre dashes along every street.
  g.fillStyle = "#e8c547";
  for (let i = 0; i <= GRID; i++) {
    const ctr = streetCenter(i) * scale;
    for (let d = 0; d < EXTENT; d += 24) {
      g.fillRect(ctr - 1.5, d * scale, 3, 10 * scale * 0.4);
      g.fillRect(d * scale, ctr - 1.5, 10 * scale * 0.4, 3);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = "rgba(240,240,235,0.85)";
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const x = i * PITCH * scale;
      const z = j * PITCH * scale;
      const w = ROAD * scale;
      for (let s = 0; s < 4; s++) {
        g.fillRect(x + 3 + s * ((w - 6) / 4), z - 7, (w - 6) / 4 - 3, 5);
        g.fillRect(x + 3 + s * ((w - 6) / 4), z + w + 2, (w - 6) / 4 - 3, 5);
        g.fillRect(x - 7, z + 3 + s * ((w - 6) / 4), 5, (w - 6) / 4 - 3);
        g.fillRect(x + w + 2, z + 3 + s * ((w - 6) / 4), 5, (w - 6) / 4 - 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeOceanTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#2e7fa8";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.16)";
  g.lineWidth = 3;
  for (let y = 12; y < 256; y += 26) {
    g.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      const yy = y + Math.sin(x * 0.11 + y) * 3;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Traffic lights run on one city-wide cycle: north-south green, a breath
// of amber, east-west green, amber again.
export function lightPhase(axis, t) {
  const p = t % 14;
  if (axis === "z") return p < 6 ? "green" : p < 7 ? "amber" : "red";
  return p < 6 ? "red" : p < 7 ? "amber" : p < 13 ? "green" : "amber";
}

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const parkingSpots = [];
  const places = new Map();
  const lightHeads = [];

  // ---- ground: city slab, aprons, beach, ocean, backdrop hills --------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(EXTENT, EXTENT),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(EXTENT / 2, 0, EXTENT / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const apronMat = new THREE.MeshLambertMaterial({ color: 0xa8a294 });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(EXTENT + 500, EXTENT + 500), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(EXTENT / 2, -0.05, EXTENT / 2);
  group.add(apron);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(EXTENT + 160, BEACH_END - EXTENT + 30),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9e })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(EXTENT / 2, 0.01, (EXTENT + BEACH_END) / 2 + 8);
  sand.receiveShadow = true;
  group.add(sand);

  const oceanTex = makeOceanTexture();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(EXTENT + 700, 460),
    new THREE.MeshLambertMaterial({ map: oceanTex, color: 0xbfe3ef })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(EXTENT / 2, -0.25, BEACH_END + 218);
  group.add(ocean);

  const hillMat = new THREE.MeshLambertMaterial({ color: 0x86a860 });
  for (let i = 0; i < 7; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rng.range(70, 130), rng.range(28, 52), 7), hillMat);
    hill.position.set(-60 + i * 120 + rng.range(-20, 20), 0, -rng.range(120, 190));
    group.add(hill);
  }

  // ---- blocks, buildings, special places ------------------------------
  const facadeCache = new Map();
  const facadeFor = (hex, tall) => {
    const key = `${hex}/${tall}`;
    if (!facadeCache.has(key)) {
      facadeCache.set(key, makeFacadeTexture(rng, hex, tall ? 14 : 6, tall ? 8 : 6));
    }
    return facadeCache.get(key);
  };
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6259 });
  const placeBlocks = new Map(PLACES.map((p) => [`${p.block[0]},${p.block[1]}`, p]));

  function addBuilding(cx, cz, w, d, h, hex, tall) {
    const tex = facadeFor(hex, tall);
    const side = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofMat, roofMat, side, side]);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    return mesh;
  }

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x0 = blockMin(i);
      const z0 = blockMin(j);
      const cx = x0 + BLOCK / 2;
      const cz = z0 + BLOCK / 2;
      const district = districtAt(cx, cz);
      const style = DISTRICT_STYLE[district.id];
      const place = placeBlocks.get(`${i},${j}`);

      if (place) {
        // One signature building, a sign over the west door, and room to
        // park out front.
        addBuilding(cx + 6, cz, 38, 44, district.id === "downtown" ? 34 : 16, place.color, false);
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 3.1, 17),
          new THREE.MeshBasicMaterial({ map: makeSignTexture(place.sign, `#${new THREE.Color(place.color).getHexString()}`) })
        );
        sign.position.set(x0 + 2, 8.5, cz);
        group.add(sign);
        const door = { x: x0 - 3.5, z: cz };
        places.set(place.id, { ...place, door, x: cx, z: cz });
        parkingSpots.push({ x: x0 - 8, z: cz - 14, angle: Math.PI / 2 });
        parkingSpots.push({ x: x0 - 8, z: cz + 14, angle: Math.PI / 2 });
        continue;
      }

      const roll = rng.next();
      if (roll < 0.1) {
        // A little park: grass, palms, benches.
        const grass = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 4, 0.3, BLOCK - 4), new THREE.MeshLambertMaterial({ color: 0x77a75a }));
        grass.position.set(cx, 0.15, cz);
        grass.receiveShadow = true;
        group.add(grass);
        continue;
      }
      if (roll < 0.2) {
        // An open parking lot; the vehicle system fills the marked bays.
        const lot = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 4, 0.16, BLOCK - 4), new THREE.MeshLambertMaterial({ color: 0x555b60 }));
        lot.position.set(cx, 0.08, cz);
        lot.receiveShadow = true;
        group.add(lot);
        for (let s = 0; s < 4; s++) {
          parkingSpots.push({ x: x0 + 12 + s * 12, z: z0 + 14, angle: 0 });
          parkingSpots.push({ x: x0 + 12 + s * 12, z: z0 + BLOCK - 14, angle: Math.PI });
        }
        continue;
      }

      const n = style.perBlock;
      for (let b = 0; b < n; b++) {
        const hex = style.palette[Math.floor(rng.next() * style.palette.length)];
        if (n === 1) {
          const w = rng.range(34, 46);
          const h = rng.range(style.minH, style.maxH);
          addBuilding(cx + rng.range(-4, 4), cz + rng.range(-4, 4), w, w, h, hex, h > 30);
        } else {
          const w = rng.range(16, 24);
          const d = rng.range(16, 24);
          const h = rng.range(style.minH, style.maxH);
          const ox = (b % 2 === 0 ? -1 : 1) * (BLOCK / 4) + rng.range(-3, 3);
          const oz = (b < 2 ? -1 : 1) * (BLOCK / 4) + rng.range(-3, 3);
          addBuilding(cx + ox, cz + oz, w, d, h, hex, h > 30);
        }
      }
    }
  }

  // ---- palms, streetlights, hydrants, benches, billboards -------------
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.6, 6);
  trunkGeo.translate(0, 2.8, 0);
  const frondGeo = new THREE.ConeGeometry(3.4, 1.1, 7);
  frondGeo.translate(0, 5.9, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x4e9b47 });
  const palmSpots = [];
  for (let x = 6; x < EXTENT - 140; x += rng.range(11, 17)) palmSpots.push({ x, z: EXTENT + rng.range(8, 40) });
  for (let x = 20; x < EXTENT; x += rng.range(30, 46)) palmSpots.push({ x, z: streetCenter(8) + 11 });
  for (let k = 0; k < 26; k++) palmSpots.push({ x: rng.range(10, 460), z: rng.range(420, 610) });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  palmSpots.forEach((p, idx) => {
    eul.set(rng.range(-0.06, 0.06), rng.range(0, Math.PI * 2), rng.range(-0.06, 0.06));
    quat.setFromEuler(eul);
    m4.compose(new THREE.Vector3(p.x, 0, p.z), quat, new THREE.Vector3(1, rng.range(0.85, 1.25), 1));
    trunks.setMatrixAt(idx, m4);
    fronds.setMatrixAt(idx, m4);
  });
  trunks.castShadow = true;
  group.add(trunks);
  group.add(fronds);

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.4, 5);
  poleGeo.translate(0, 2.7, 0);
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  lampGeo.translate(0, 5.5, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4247 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  const lampSpots = [];
  for (let i = 0; i <= GRID; i++) {
    for (let d = 20; d < EXTENT; d += 38) {
      lampSpots.push({ x: streetCenter(i) - 7.4, z: d });
      lampSpots.push({ x: d, z: streetCenter(i) + 7.4 });
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  lampSpots.forEach((p, idx) => {
    m4.makeTranslation(p.x, 0, p.z);
    poles.setMatrixAt(idx, m4);
    lamps.setMatrixAt(idx, m4);
  });
  group.add(poles);
  group.add(lamps);

  const hydrantGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.9, 7);
  hydrantGeo.translate(0, 0.45, 0);
  const hydrants = new THREE.InstancedMesh(hydrantGeo, new THREE.MeshLambertMaterial({ color: 0xc23b2e }), 40);
  for (let k = 0; k < 40; k++) {
    m4.makeTranslation(rng.range(14, EXTENT - 14), 0, rng.range(14, EXTENT - 14));
    hydrants.setMatrixAt(k, m4);
  }
  group.add(hydrants);

  const boardTexts = ["SOLMAR COLA", "LA PERLA", "HOTEL BRISA", "SHINE AUTO", "BAY RADIO 84"];
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  for (let k = 0; k < 6; k++) {
    const bx = rng.range(60, EXTENT - 60);
    const bz = rng.range(60, EXTENT - 60);
    const by = rng.range(15, 22);
    const alongX = rng.chance(0.5);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(16, 5, 0.6),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(boardTexts[k % boardTexts.length], k % 2 ? "#20506e" : "#7e2d43") })
    );
    board.position.set(bx, by, bz);
    board.rotation.y = alongX ? 0 : Math.PI / 2;
    group.add(board);
    // Two legs so the board stands on the street furniture, not the sky.
    for (const off of [-6, 6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, by - 2.5, 0.5), legMat);
      leg.position.set(bx + (alongX ? off : 0), (by - 2.5) / 2, bz + (alongX ? 0 : off));
      group.add(leg);
    }
  }

  // ---- traffic lights ---------------------------------------------------
  const lampOff = new THREE.MeshBasicMaterial({ color: 0x2b2f33 });
  const lampRed = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const lampAmber = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const lampGreen = new THREE.MeshBasicMaterial({ color: 0x35e065 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x22262a });
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const x = streetCenter(i);
      const z = streetCenter(j);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.6, 6), poleMat);
      pole.position.set(x + 8.6, 2.8, z + 8.6);
      group.add(pole);
      const head = new THREE.Group();
      head.position.set(x + 8.6, 5.6, z + 8.6);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.7), headMat);
      head.add(box);
      const bulbs = {};
      [["red", 0.6, lampRed], ["amber", 0, lampAmber], ["green", -0.6, lampGreen]].forEach(([name, dy]) => {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), lampOff);
        bulb.position.set(0, dy, 0);
        head.add(bulb);
        bulbs[name] = bulb;
      });
      group.add(head);
      lightHeads.push({ bulbs, lampRed, lampAmber, lampGreen, lampOff });
    }
  }

  // ---- the harbor: pier, containers, crane, a moored boat --------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8d8578 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(120, 2.4, 96), pierMat);
  pier.position.set(HARBOR.x, 0.4, HARBOR.z + 22);
  pier.receiveShadow = true;
  group.add(pier);
  colliders.push({ x0: HARBOR.x - 60, z0: HARBOR.z + 70, x1: HARBOR.x + 60, z1: HARBOR.z + 76 });
  const containerCols = [0xc44536, 0x2e6f9e, 0x3f9142, 0xd9a441, 0x74569c, 0x4a4e57];
  const crng = rng.fork(77);
  for (let k = 0; k < 16; k++) {
    const w = 12;
    const d = 5;
    const h = 5;
    const cxp = HARBOR.x - 48 + (k % 4) * 26 + crng.range(-2, 2);
    const czp = HARBOR.z + 6 + Math.floor(k / 4) * 16;
    const stack = crng.chance(0.4) ? 2 : 1;
    for (let s = 0; s < stack; s++) {
      const boxMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: containerCols[(k + s) % containerCols.length] })
      );
      boxMesh.position.set(cxp, 1.6 + h / 2 + s * h, czp);
      boxMesh.castShadow = true;
      group.add(boxMesh);
    }
    colliders.push({ x0: cxp - w / 2, z0: czp - d / 2, x1: cxp + w / 2, z1: czp + d / 2 });
  }
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd9a441 });
  const crane = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(1.6, 26, 1.6);
  for (const [lx, lz] of [[-14, -8], [14, -8], [-14, 8], [14, 8]]) {
    const leg = new THREE.Mesh(legGeo, craneMat);
    leg.position.set(lx, 13, lz);
    crane.add(leg);
  }
  const boom = new THREE.Mesh(new THREE.BoxGeometry(52, 2, 2.4), craneMat);
  boom.position.set(6, 26.5, 0);
  crane.add(boom);
  crane.position.set(HARBOR.x + 18, 1.6, HARBOR.z + 34);
  group.add(crane);

  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 20), new THREE.MeshLambertMaterial({ color: 0xe8e3d8 }));
  hull.position.y = 0.6;
  boat.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x2e6f9e }));
  cabin.position.set(0, 2.8, -2);
  boat.add(cabin);
  boat.position.set(HARBOR.x - 78, 0.2, HARBOR.z + 40);
  group.add(boat);

  let elapsed = 0;
  function update(dt, t) {
    elapsed = t;
    oceanTex.offset.y = (t * 0.008) % 1;
    oceanTex.offset.x = Math.sin(t * 0.05) * 0.02;
    boat.position.y = 0.2 + Math.sin(t * 0.9) * 0.16;
    boat.rotation.z = Math.sin(t * 0.7) * 0.02;
    const ns = lightPhase("z", t);
    const ew = lightPhase("x", t);
    for (const head of lightHeads) {
      // One head per intersection shows the north-south state; the colour
      // logic is shared so every head agrees with the phase function.
      head.bulbs.red.material = ns === "red" ? head.lampRed : head.lampOff;
      head.bulbs.amber.material = ns === "amber" ? head.lampAmber : head.lampOff;
      head.bulbs.green.material = ns === "green" ? head.lampGreen : head.lampOff;
    }
    return { ns, ew };
  }

  return { group, colliders, parkingSpots, places, update, lightPhase };
}

// Push a circle (x, z, radius) out of every AABB collider it overlaps.
// Returns the strongest impact speed absorbed, for crash sounds and damage.
export function resolveCollisions(pos, radius, colliders, prev) {
  let impact = 0;
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (prev) {
        impact = Math.max(impact, Math.hypot(pos.x - prev.x, pos.z - prev.z));
      }
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = pos.x - c.x0;
        const right = c.x1 - pos.x;
        const top = pos.z - c.z0;
        const bottom = c.z1 - pos.z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = c.x0 - radius;
        else if (min === right) pos.x = c.x1 + radius;
        else if (min === top) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
      }
    }
  }
  return impact;
}
