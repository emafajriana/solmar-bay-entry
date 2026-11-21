// city.js — builds the whole static world of SOLMAR BAY out of Three.js
// primitives and canvas textures: the street grid, six districts of
// buildings, the beach and ocean, palms, lamps, traffic lights, props, the
// harbor piers, and every signed building the story needs (Carmen's bar,
// the bank, the garage, the HQ, the shops). It also owns the collision
// boxes those buildings cast and the traffic-light clock.
//
// Nothing here moves except the water and the traffic-light lamps; the
// dynamic systems (cars, people, police) live in their own modules.

import * as THREE from 'three';
import { WORLD, DISTRICTS, PLACES, SHOPS, districtAt, streetLines, blockCenters } from './config.js';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture(rng, base, accent) {
  return canvasTexture(96, 160, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 8, w, 8);
    const cols = 6;
    const rows = 10;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const lit = rng.chance(0.42);
        g.fillStyle = lit ? '#ffd98a' : '#22303e';
        g.fillRect(6 + cx * 15, 12 + cy * 14, 9, 8);
      }
    }
  });
}

function signTexture(text, bg, fg) {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function box(group, w, h, d, material, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function solid(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export function buildCity(rng) {
  const group = new THREE.Group();
  const colliders = [];
  const lights = [];
  const lines = streetLines();
  const centers = blockCenters();

  // Facade library: a handful of window textures per district palette,
  // shared by every building so the city stays cheap to render.
  const facades = new Map();
  for (const d of DISTRICTS) {
    facades.set(
      d.id,
      d.palette.map((color) => facadeTexture(rng, color, '#1d2733')),
    );
  }
  const roofMat = solid(0x3c4147, 1);

  function addBuilding(cx, cz, w, h, d, districtId, sign) {
    const tex = rng.pick(facades.get(districtId));
    const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofMat, roofMat, side, side]);
    mesh.position.set(cx, h / 2 + 0.12, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
    if (sign) {
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.92, 17), 2.6),
        new THREE.MeshBasicMaterial({ map: signTexture(sign.text, sign.bg, sign.fg) }),
      );
      signMesh.position.set(cx, Math.min(h - 1.6, 5.2), cz + d / 2 + 0.06);
      group.add(signMesh);
    }
    return mesh;
  }

  // ---- Ground: base slab, roads, sidewalks, beach, ocean -----------------
  const base = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), solid(0x969ca1, 1));
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, 0, 30);
  base.receiveShadow = true;
  group.add(base);

  const asphaltTex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#33373c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e4c8';
    g.fillRect(w / 2 - 2, 4, 4, 24);
  });
  asphaltTex.wrapS = THREE.RepeatWrapping;
  asphaltTex.wrapT = THREE.RepeatWrapping;
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 1 });

  for (const x of lines) {
    const texV = asphaltTex.clone();
    texV.repeat.set(1, 34);
    texV.needsUpdate = true;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadHalf * 2, 500), new THREE.MeshStandardMaterial({ map: texV, roughness: 1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.02, 0);
    road.receiveShadow = true;
    group.add(road);
  }
  for (const z of lines) {
    const texH = asphaltTex.clone();
    texH.rotation = Math.PI / 2;
    texH.repeat.set(1, 34);
    texH.needsUpdate = true;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(500, WORLD.roadHalf * 2), new THREE.MeshStandardMaterial({ map: texH, roughness: 1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, z);
    road.receiveShadow = true;
    group.add(road);
  }

  const walkMat = solid(0xb9bdc0, 1);
  for (const cx of centers) {
    for (const cz of centers) {
      const slab = box(group, 44, 0.14, 44, walkMat, cx, 0.07, cz, { cast: false });
      slab.receiveShadow = true;
    }
  }

  const sandTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#ecd29a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#dfc084';
    for (let i = 0; i < 260; i++) g.fillRect(rng.range(0, w), rng.range(0, h), 2, 2);
  });
  sandTex.wrapS = THREE.RepeatWrapping;
  sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(18, 2);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(560, WORLD.waterStart - WORLD.sandStart + 8), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.04, (WORLD.sandStart + WORLD.waterStart) / 2);
  sand.receiveShadow = true;
  group.add(sand);

  const waterTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#1d6f9f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const y = rng.range(0, h);
      g.beginPath();
      g.moveTo(rng.range(0, w / 2), y);
      g.lineTo(rng.range(w / 2, w), y + rng.range(-4, 4));
      g.stroke();
    }
  });
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(22, 6);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(640, WORLD.waterEnd - WORLD.waterStart),
    new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.94 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.1, (WORLD.waterStart + WORLD.waterEnd) / 2);
  group.add(water);

  // ---- Reserved blocks: the named places --------------------------------
  // Each place is assigned to its nearest block, whose random buildings are
  // then replaced by the named one.
  const reserved = new Map();
  function nearestCenter(v) {
    return centers.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  }
  const reserve = (x, z, fn) => {
    const key = `${nearestCenter(x)},${nearestCenter(z)}`;
    if (!reserved.has(key)) reserved.set(key, []);
    reserved.get(key).push(fn);
  };
  const named = (place, sign, colorH) => () => {
    addBuilding(place.x, place.z, 20, colorH, 16, districtAt(place.x, place.z).id, sign);
  };
  reserve(PLACES.bar.x, PLACES.bar.z, named(PLACES.bar, { text: "CARMEN'S BAR", bg: '#7b1e3b', fg: '#ffd166' }, 11));
  reserve(PLACES.motel.x, PLACES.motel.z, named(PLACES.motel, { text: 'MARINA MOTEL', bg: '#0f4c5c', fg: '#ffffff' }, 9));
  reserve(PLACES.bank.x, PLACES.bank.z, named(PLACES.bank, { text: 'SOLMAR TRUST', bg: '#274156', fg: '#f1fa8c' }, 16));
  reserve(PLACES.hideout.x, PLACES.hideout.z, named(PLACES.hideout, { text: 'HILLS STORAGE', bg: '#3a3f44', fg: '#adb5bd' }, 8));
  reserve(PLACES.garage.x, PLACES.garage.z, named(PLACES.garage, { text: 'DUARTE GARAGE', bg: '#5a189a', fg: '#ffffff' }, 10));
  reserve(PLACES.hq.x, PLACES.hq.z, named(PLACES.hq, { text: 'TIBURONES', bg: '#101820', fg: '#ff5964' }, 15));
  reserve(PLACES.hospital.x, PLACES.hospital.z, named(PLACES.hospital, { text: 'BAY GENERAL +', bg: '#eef6f6', fg: '#c1121f' }, 13));
  reserve(SHOPS[0].x, SHOPS[0].z, named(SHOPS[0], { text: "PAY'N'SPRAY", bg: '#ff5d8f', fg: '#ffffff' }, 9));
  reserve(SHOPS[1].x, SHOPS[1].z, named(SHOPS[1], { text: "PAY'N'SPRAY", bg: '#ff5d8f', fg: '#ffffff' }, 9));
  reserve(SHOPS[2].x, SHOPS[2].z, named(SHOPS[2], { text: 'GUN RUNNER', bg: '#370617', fg: '#ffb703' }, 10));
  reserve(PLACES.victory.x, PLACES.victory.z, () => {
    // The lookout: an open platform and palms, no building.
    box(group, 18, 0.5, 14, solid(0xcfc4a5), PLACES.victory.x, 0.25, PLACES.victory.z, { cast: false });
  });

  const parkBlocks = new Set(['-120,-120', '120,180']);
  function buildPark(cx, cz) {
    box(group, 40, 0.18, 40, solid(0x6a994e, 1), cx, 0.16, cz, { cast: false });
    for (let i = 0; i < 7; i++) {
      const tx = cx + rng.range(-16, 16);
      const tz = cz + rng.range(-16, 16);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 6), solid(0x6f4e37));
      trunk.position.set(tx, 1.5, tz);
      trunk.castShadow = true;
      group.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(rng.range(1.8, 2.6), 8, 6), solid(0x386641));
      crown.position.set(tx, 3.6, tz);
      crown.castShadow = true;
      group.add(crown);
    }
  }

  // ---- Ordinary blocks ----------------------------------------------------
  for (const cx of centers) {
    for (const cz of centers) {
      const key = `${cx},${cz}`;
      const namedHere = reserved.get(key);
      if (namedHere) {
        for (const fn of namedHere) fn();
        continue;
      }
      if (parkBlocks.has(key)) {
        buildPark(cx, cz);
        continue;
      }
      const district = districtAt(cx, cz);
      if (district.id === 'downtown') {
        if (rng.chance(0.45)) {
          addBuilding(cx, cz, rng.range(19, 25), rng.range(42, 82), rng.range(19, 25), district.id);
        } else {
          addBuilding(cx - 11, cz, rng.range(15, 19), rng.range(22, 40), rng.range(15, 20), district.id);
          addBuilding(cx + 11, cz + 2, rng.range(15, 19), rng.range(18, 34), rng.range(15, 20), district.id);
        }
      } else {
        const n = rng.int(2, 3);
        const spots = [
          [-11, -11],
          [11, -11],
          [-11, 11],
          [11, 11],
        ];
        for (let i = 0; i < n; i++) {
          const [ox, oz] = spots[i];
          addBuilding(cx + ox, cz + oz, rng.range(13, 18), rng.range(7, 26), rng.range(13, 18), district.id);
        }
      }
    }
  }

  // ---- Palms, lamps, traffic lights, props --------------------------------
  const trunkMat = solid(0x7a5c3e);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e933c, roughness: 1, side: THREE.DoubleSide });
  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.22 * s, 4.6 * s, 6), trunkMat);
    trunk.position.y = 2.3 * s;
    trunk.rotation.z = rng.range(-0.08, 0.08);
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.32 * s, 3.1 * s, 4), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1 * s, 4.9 * s, Math.sin(a) * 1.1 * s);
      frond.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15);
      g.add(frond);
    }
    g.position.set(x, 0, z);
    group.add(g);
  }
  for (let x = -232; x <= 232; x += 16) {
    palm(x + rng.range(-2, 2), 236 + rng.range(-2, 2), rng.range(0.9, 1.25));
    if (rng.chance(0.6)) palm(x + rng.range(-3, 3), 256 + rng.range(0, 6), rng.range(0.8, 1.1));
  }
  for (let i = 0; i < 26; i++) {
    palm(rng.range(-238, -150), rng.range(-30, 235), rng.range(0.85, 1.2));
  }

  const poleMat = solid(0x2f3338, 0.6);
  for (const ix of lines) {
    for (const iz of lines) {
      // Streetlight on two diagonal corners.
      for (const [ox, oz] of [
        [9.5, 9.5],
        [-9.5, -9.5],
      ]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.4, 6), poleMat);
        pole.position.set(ix + ox, 3.2, iz + oz);
        group.add(pole);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffedb0, emissiveIntensity: 0.7 }),
        );
        head.position.set(ix + ox, 6.5, iz + oz);
        group.add(head);
      }
      // One traffic light per intersection, lamps for both axes.
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 6), poleMat);
      pole.position.set(ix + 9.5, 2.3, iz - 9.5);
      group.add(pole);
      const headBox = box(group, 0.5, 1.1, 0.5, solid(0x191c1f, 0.5), ix + 9.5, 4.9, iz - 9.5, { cast: false });
      void headBox;
      const nsMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 1 });
      const ewMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 1 });
      const nsLamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), nsMat);
      nsLamp.position.set(ix + 9.5, 4.9, iz - 9.16);
      group.add(nsLamp);
      const ewLamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), ewMat);
      ewLamp.position.set(ix + 9.16, 4.9, iz - 9.5);
      group.add(ewLamp);
      lights.push({ x: ix, z: iz, nsMat, ewMat, offset: ((ix + iz) / 60) % 2 === 0 ? 0 : 8 });
    }
  }

  // Hydrants and benches near corners and along the promenade.
  const hydrantMat = solid(0xc1121f, 0.5);
  for (let i = 0; i < 40; i++) {
    const x = rng.pick(lines) + rng.pick([10.5, -10.5]);
    const z = rng.pick(lines) + rng.pick([10.5, -10.5]);
    const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8), hydrantMat);
    hydrant.position.set(x, 0.4, z);
    hydrant.castShadow = true;
    group.add(hydrant);
  }
  for (let x = -210; x <= 210; x += 30) {
    box(group, 2.2, 0.5, 0.7, solid(0x8a5a2b), x, 0.35, 233, { cast: false });
  }

  // Billboards with hand-drawn canvas ads.
  const ads = [
    ['SOLMAR BAY', '#0f4c5c', '#ffd166'],
    ['VISIT PIER 9', '#0077b6', '#ffffff'],
    ['GUN RUNNER', '#370617', '#ffb703'],
    ["PAY'N'SPRAY", '#ff5d8f', '#ffffff'],
    ['BAY GENERAL', '#eef6f6', '#c1121f'],
    ['NOCHE 88.9 FM', '#3a0ca3', '#f72585'],
  ];
  const adSpots = [
    [-120, -8, 0],
    [68, 128, Math.PI],
    [-8, -128, Math.PI / 2],
    [128, -68, -Math.PI / 2],
    [-188, 128, Math.PI / 4],
    [188, 188, Math.PI],
  ];
  adSpots.forEach(([x, z, ry], i) => {
    const [text, bg, fg] = ads[i % ads.length];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 8), poleMat);
    pole.position.set(x, 4.5, z);
    group.add(pole);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 2.6),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), side: THREE.DoubleSide }),
    );
    board.position.set(x, 9.6, z);
    board.rotation.y = ry;
    group.add(board);
  });

  // ---- The harbor: piers, crates, containers, a crane ---------------------
  const woodMat = solid(0x8a6b45, 1);
  const pier = box(group, 14, 0.7, 64, woodMat, PLACES.harbor.x, 0.5, 282, { cast: false });
  pier.receiveShadow = true;
  box(group, 30, 0.7, 10, woodMat, PLACES.harbor.x, 0.5, 252, { cast: false });
  const containerColors = [0xb5651d, 0x1d6f9f, 0x7f5539, 0x386641, 0x9d0208];
  for (let i = 0; i < 7; i++) {
    const cxp = PLACES.harbor.x - 16 + (i % 4) * 7;
    const czp = 246 + Math.floor(i / 4) * 7;
    box(group, 6, 2.6, 3, solid(rng.pick(containerColors)), cxp, 1.3 + (i === 5 ? 2.6 : 0), czp);
    colliders.push({ x0: cxp - 3, x1: cxp + 3, z0: czp - 1.5, z1: czp + 1.5 });
  }
  for (let i = 0; i < 9; i++) {
    const cxp = PLACES.harbor.x + rng.range(-9, 9);
    const czp = 262 + rng.range(0, 34);
    box(group, 1.4, 1.4, 1.4, solid(0xa98467), cxp, 1.2, czp);
    colliders.push({ x0: cxp - 0.7, x1: cxp + 0.7, z0: czp - 0.7, z1: czp + 0.7 });
  }
  box(group, 1.2, 15, 1.2, solid(0xd9a404, 0.6), PLACES.harbor.x + 12, 7.5, 250);
  box(group, 16, 1, 1, solid(0xd9a404, 0.6), PLACES.harbor.x + 5, 14.6, 250);

  // Shop interaction rings: a flat glowing circle at every shop door.
  const rings = [];
  for (const shop of SHOPS) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(shop.driveIn ? 3.4 : 2.2, shop.driveIn ? 4.1 : 2.9, 28),
      new THREE.MeshBasicMaterial({ color: shop.kind === 'spray' ? 0xff5d8f : shop.kind === 'guns' ? 0xffb703 : 0x52b788, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(shop.x, 0.09, shop.z + 12);
    group.add(ring);
    rings.push({ shop, mesh: ring, x: shop.x, z: shop.z + 12 });
  }

  return {
    group,
    colliders,
    rings,
    // Traffic-light clock: a 16 s cycle, NS green, yellow, EW green, yellow.
    // Neighbouring intersections run half a cycle apart (see offsets above).
    lightAllows(axis, x, z, t) {
      let offset = 0;
      for (const l of lights) {
        if (Math.abs(l.x - x) < 31 && Math.abs(l.z - z) < 31) {
          offset = l.offset;
          break;
        }
      }
      const phase = (t + offset) % 16;
      if (axis === 'NS') return phase < 6.5;
      return phase >= 8 && phase < 14.5;
    },
    update(t) {
      waterTex.offset.y = (t * 0.012) % 1;
      waterTex.offset.x = Math.sin(t * 0.05) * 0.02;
      for (const light of lights) {
        const phase = (t + light.offset) % 16;
        const nsGo = phase < 6.5;
        const ewGo = phase >= 8 && phase < 14.5;
        light.nsMat.emissive.setHex(nsGo ? 0x22ff44 : 0xff2222);
        light.ewMat.emissive.setHex(ewGo ? 0x22ff44 : 0xff2222);
      }
      for (const ring of rings) {
        ring.mesh.material.opacity = 0.55 + 0.3 * Math.sin(t * 2.4);
      }
    },
  };
}

// Push a circle (x, z, radius r) out of every building box; returns the
// corrected position. Used by the player, the cars and anyone else solid.
export function collideCircle(city, x, z, r) {
  for (const c of city.colliders) {
    const nearX = Math.max(c.x0, Math.min(x, c.x1));
    const nearZ = Math.max(c.z0, Math.min(z, c.z1));
    let dx = x - nearX;
    let dz = z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      x = nearX + (dx / d) * r;
      z = nearZ + (dz / d) * r;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const left = x - c.x0;
      const right = c.x1 - x;
      const top = z - c.z0;
      const bottom = c.z1 - z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = c.x0 - r;
      else if (min === right) x = c.x1 + r;
      else if (min === top) z = c.z0 - r;
      else z = c.z1 + r;
    }
  }
  return [x, z];
}
