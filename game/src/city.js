// SOLMAR BAY city: a procedural Three.js city on an 8x8 road grid.
// Buildings get canvas window textures, the south edge is beach + ocean,
// palms, streetlights, traffic lights and street props fill the rest.
// Nothing here is copied from any commercial game: all names and shapes
// are original. Exports buildCity(scene, rng) and the collision helpers.

import * as THREE from 'three';
import { BEACH_Z, BLOCK, CITY_HALF, DISTRICTS, OCEAN_Z, PALETTE, ROAD, ROAD_LINES } from './config.js';
import { pick, range } from './rng.js';

const BLOCK_CENTRES = [-150, -100, -50, 0, 50, 100, 150];

function buildingTexture(baseColor, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(20,30,50,0.75)';
      g.fillRect(10 + col * 22, 22 + row * 22, 14, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function districtHeight(x, z, rng) {
  if (x >= -100 && x < 100 && z >= -200 && z < -50) return range(rng, 22, 55); // Downtown towers
  if (x >= 100 && z < 0) return range(rng, 12, 30); // Marina
  if (z >= 100) return range(rng, 6, 16); // Beachfront low-rise
  return range(rng, 8, 24);
}

export function buildCity(scene, rng) {
  const city = {
    buildings: [], // {x0,z0,x1,z1,h}
    trafficLights: [], // {mesh, material, x, z}
    palms: [],
    parkedSpots: [],
    beacon: null,
    ocean: null,
    sun: null,
  };

  // Ground: city slab, then road strips, sidewalks and the beach.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 80, CITY_HALF * 2 + 220),
    new THREE.MeshLambertMaterial({ color: 0x6a7a5a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 60);
  ground.receiveShadow = true;
  scene.add(ground);

  for (const line of ROAD_LINES) {
    const vRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD, CITY_HALF * 2),
      new THREE.MeshLambertMaterial({ color: PALETTE.road }),
    );
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(line, 0, 0);
    vRoad.receiveShadow = true;
    scene.add(vRoad);
    const hRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2, ROAD),
      new THREE.MeshLambertMaterial({ color: PALETTE.road }),
    );
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0, line);
    hRoad.receiveShadow = true;
    scene.add(hRoad);
    // Centre dashes.
    for (let t = -175; t <= 175; t += 20) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 5),
        new THREE.MeshBasicMaterial({ color: 0xd8d8c8 }),
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(line, 0.02, t);
      scene.add(dash);
    }
  }

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 80, 70),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, BEACH_Z + 18);
  sand.receiveShadow = true;
  scene.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 400, 300),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.2, OCEAN_Z + 130);
  scene.add(ocean);
  city.ocean = ocean;

  // Buildings: one or two per block, taller downtown, varied colours.
  const paletteHex = PALETTE.building.map((c) => '#' + c.toString(16).padStart(6, '0'));
  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      const count = rng() < 0.45 ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const w = count === 1 ? range(rng, 22, 30) : range(rng, 12, 16);
        const d = count === 1 ? range(rng, 22, 30) : range(rng, 12, 16);
        const ox = count === 1 ? 0 : (k === 0 ? -8 : 8);
        const oz = count === 1 ? 0 : (k === 0 ? -8 : 8);
        const h = districtHeight(bx, bz, rng);
        const color = pick(rng, paletteHex);
        const tex = buildingTexture(color, rng);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(bx + ox, h / 2, bz + oz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        // Roof rim so towers read at a distance.
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
          new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
        );
        roof.position.set(bx + ox, h + 0.4, bz + oz);
        scene.add(roof);
        city.buildings.push({ x0: bx + ox - w / 2, z0: bz + oz - d / 2, x1: bx + ox + w / 2, z1: bz + oz + d / 2, h });
      }
    }
  }

  // Palms: beach row plus scattered street palms.
  function palm(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 6, 6),
      new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
    );
    trunk.position.y = 3;
    trunk.castShadow = true;
    group.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 3.4, 4),
        new THREE.MeshLambertMaterial({ color: PALETTE.palm }),
      );
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.4, 6.2, Math.sin(a) * 1.4);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      group.add(leaf);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    city.palms.push(group);
  }
  for (let x = -190; x <= 190; x += 24) palm(x + range(rng, -4, 4), BEACH_Z + 8 + range(rng, 0, 14));
  for (let i = 0; i < 26; i += 1) palm(pick(rng, ROAD_LINES) + 8, range(rng, -180, 180));

  // Streetlights along the roads, traffic lights at intersections.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x44484e });
  for (const line of ROAD_LINES) {
    for (let t = -150; t <= 150; t += 50) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), lampMat);
      pole.position.set(line + 8, 3.5, t);
      scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
      );
      head.position.set(line + 8, 7, t);
      scene.add(head);
    }
  }
  for (const lx of [-75, 25, 125]) {
    for (const lz of [-75, 25, 125]) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x22cc44 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), mat);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), lampMat);
      pole.position.set(lx + 8, 2.5, lz + 8);
      box.position.set(lx + 8, 5.4, lz + 8);
      scene.add(pole);
      scene.add(box);
      city.trafficLights.push({ mesh: box, material: mat, x: lx, z: lz });
    }
  }

  // Billboards and props: hydrants, benches, a big SOLMAR BAY sign downtown.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 128;
  const sg = signCanvas.getContext('2d');
  sg.fillStyle = '#0e4a6e';
  sg.fillRect(0, 0, 512, 128);
  sg.fillStyle = '#ffd166';
  sg.font = 'bold 64px system-ui, sans-serif';
  sg.textAlign = 'center';
  sg.textBaseline = 'middle';
  sg.fillText('SOLMAR BAY', 256, 66);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 9),
    new THREE.MeshBasicMaterial({ map: signTex }),
  );
  sign.position.set(0, 26, -182);
  scene.add(sign);
  const signPole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 22, 6), lampMat);
  signPole1.position.set(-16, 11, -182);
  scene.add(signPole1);
  const signPole2 = signPole1.clone();
  signPole2.position.x = 16;
  scene.add(signPole2);

  for (let i = 0; i < 18; i += 1) {
    const hx = pick(rng, ROAD_LINES) + 8;
    const hz = range(rng, -180, 180);
    const hyd = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8),
      new THREE.MeshLambertMaterial({ color: 0xc0392b }),
    );
    hyd.position.set(hx, 0.45, hz);
    scene.add(hyd);
  }

  // Mission beacon: a glowing column + floating diamond, moved by missions.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 30;
  beacon.add(column);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }),
  );
  diamond.position.y = 12;
  beacon.add(diamond);
  beacon.visible = false;
  scene.add(beacon);
  city.beacon = beacon;
  city.beaconDiamond = diamond;

  // Parked-car spots along road edges (vehicles.js fills them).
  for (let i = 0; i < 22; i += 1) {
    const along = pick(rng, ROAD_LINES);
    const cross = range(rng, -175, 175);
    const vertical = rng() < 0.5;
    city.parkedSpots.push({
      x: vertical ? along + 5.5 : cross,
      z: vertical ? cross : along + 5.5,
      angle: vertical ? 0 : Math.PI / 2,
    });
  }
  return city;
}

export function collidesBuilding(x, z, r, city) {
  for (const b of city.buildings) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return b;
  }
  return null;
}

export function clampToCity(x, z) {
  return {
    x: Math.max(-CITY_HALF - 10, Math.min(CITY_HALF + 10, x)),
    z: Math.max(-CITY_HALF - 10, Math.min(OCEAN_Z + 40, z)),
  };
}

export function nearestRoadLine(v) {
  let best = ROAD_LINES[0];
  let bestD = Infinity;
  for (const line of ROAD_LINES) {
    const d = Math.abs(v - line);
    if (d < bestD) { bestD = d; best = line; }
  }
  return best;
}
