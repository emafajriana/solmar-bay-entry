// city.js — the procedural city of Solmar Bay.
//
// An 8x8 grid of lots over a canvas-painted ground plane: asphalt roads
// with dashes and crosswalks, tinted block interiors, a sand beach and
// open water to the south, and a container harbour in the south-east.
// Buildings are boxes wearing canvas window textures, taller and bluer
// Downtown, low and sun-baked in the Marina. Every solid thing registers
// an AABB collider; `collideCircle` keeps people and cars out of them.
//
// The named places the story needs (the bar, the gun shop, the spray shop,
// the hospital, the diner, the garage, the club, the pier) are fixed lots
// with painted signs, returned as marker points on the pavement outside.

import * as THREE from 'three';
import { GRID, ROAD_LINES, BLOCK_CENTRES, DISTRICTS, districtAt } from './config.js';

const FACADE_BASE = ['#cbb79a', '#b7c3c9', '#d9c6a5', '#a8b8a4', '#c9a689', '#bcc8d4', '#d4b8b0', '#bfc49a'];
const ROOF_TONE = ['#8d8578', '#7c766b', '#97897a', '#6f6a61'];

function facadeTexture(rng, base, floors, cols) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // weather streaks
  g.fillStyle = 'rgba(60,50,40,0.08)';
  for (let i = 0; i < 7; i++) g.fillRect(rng.range(0, 120), 0, rng.range(2, 7), 256);
  const winW = 128 / cols, winH = 256 / floors;
  for (let y = 0; y < floors; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(0.24);
      g.fillStyle = lit ? '#ffd98c' : (rng.chance(0.5) ? '#5d7484' : '#6e8698');
      g.fillRect(x * winW + winW * 0.22, y * winH + winH * 0.24, winW * 0.56, winH * 0.5);
    }
  }
  // ground floor: darker band, a door, an awning stripe
  g.fillStyle = 'rgba(40,34,28,0.55)';
  g.fillRect(0, 256 - winH, 128, winH);
  g.fillStyle = '#3a2f26';
  g.fillRect(56, 256 - winH + 4, 16, winH - 4);
  g.fillStyle = 'rgba(178,64,44,0.85)';
  g.fillRect(0, 256 - winH - 4, 128, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function signTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg;
  g.font = 'bold 54px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  const S = 2048, M = S / (GRID.extent * 2); // pixels per metre
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const px = (x) => (x + GRID.extent) * M;
  const pz = (z) => (z + GRID.extent) * M;

  g.fillStyle = '#a49a8b';
  g.fillRect(0, 0, S, S);

  // block interiors, tinted by district
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      const d = districtAt(cx, cz);
      const col = new THREE.Color(d.tint).lerp(new THREE.Color(0x9c9484), 0.55);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(px(cx - GRID.lotHalf - 3), pz(cz - GRID.lotHalf - 3), (GRID.lotHalf + 3) * 2 * M, (GRID.lotHalf + 3) * 2 * M);
    }
  }

  // roads
  g.fillStyle = '#3d4148';
  for (const line of ROAD_LINES) {
    g.fillRect(px(line - GRID.roadHalf), 0, GRID.roadHalf * 2 * M, S);
    g.fillRect(0, pz(line - GRID.roadHalf), S, GRID.roadHalf * 2 * M);
  }
  // centre dashes
  g.fillStyle = '#d8c25a';
  for (const line of ROAD_LINES) {
    for (let t = -GRID.extent + 4; t < GRID.extent - 4; t += 9) {
      g.fillRect(px(line) - 1, pz(t), 2, 4.2 * M);
      g.fillRect(px(t), pz(line) - 1, 4.2 * M, 2);
    }
  }
  // crosswalks at intersections
  g.fillStyle = 'rgba(230,230,225,0.75)';
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      for (let s = -5; s <= 5; s += 2.2) {
        g.fillRect(px(x + s) - 2, pz(z - GRID.roadHalf) - 4, 4, 6);
        g.fillRect(px(x + s) - 2, pz(z + GRID.roadHalf) - 2, 4, 6);
        g.fillRect(px(x - GRID.roadHalf) - 4, pz(z + s) - 2, 6, 4);
        g.fillRect(px(x + GRID.roadHalf) - 2, pz(z + s) - 2, 6, 4);
      }
    }
  }
  // speckle noise so the ground does not read as flat vector art
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,250,235' : '20,20,25'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2.4, 2.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Traffic light cycle shared with the traffic brain: 16.4 s loop.
export function trafficPhase(t) {
  const m = t % 16.4;
  if (m < 7) return 'NS';
  if (m < 8.2) return 'NS-Y';
  if (m < 15.2) return 'EW';
  return 'EW-Y';
}

export function buildCity(scene, rng) {
  const colliders = [];
  const lights = [];
  const addCollider = (cx, cz, hw, hd) => {
    colliders.push({ x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd });
  };

  // ---- ground, beach, sea ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID.extent * 2, GRID.extent * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID.extent * 2 + 160, 52),
    new THREE.MeshLambertMaterial({ color: 0xe6cf9e })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, 184 + 25);
  sand.receiveShadow = true;
  scene.add(sand);

  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = 128; seaCanvas.height = 128;
  const sg = seaCanvas.getContext('2d');
  sg.fillStyle = '#2f7d99';
  sg.fillRect(0, 0, 128, 128);
  sg.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 26; i++) sg.fillRect(Math.random() * 110, Math.random() * 128, 14 + Math.random() * 22, 2);
  sg.fillStyle = 'rgba(10,50,70,0.16)';
  for (let i = 0; i < 20; i++) sg.fillRect(Math.random() * 110, Math.random() * 128, 18 + Math.random() * 26, 3);
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(26, 16);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 760),
    new THREE.MeshPhongMaterial({ map: seaTex, color: 0x9fc8d4, shininess: 90 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.3, 236 + 380);
  scene.add(sea);

  // ---- buildings ----
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8d8578 });
  const facades = [];
  for (let i = 0; i < 8; i++) {
    facades.push(new THREE.MeshLambertMaterial({ map: facadeTexture(rng, rng.pick(FACADE_BASE), rng.int(6, 12), rng.int(4, 6)) }));
  }
  const boxGeoCache = new Map();
  const boxGeo = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  };

  // Lots reserved for named places: "cx,cz" -> sign text + colours.
  const namedLots = new Map([
    ['-115,115', { sign: 'LA PERLA', bg: '#173f35', fg: '#ffd98c' }],
    ['23,-23', { sign: 'GUN RUNNER', bg: '#26221e', fg: '#f2f2f2' }],
    ['-115,-23', { sign: "SHINE AUTO", bg: '#14425e', fg: '#bfe8ff' }],
    ['-23,-69', { sign: 'SOLMAR GENERAL', bg: '#e8ecec', fg: '#b03030' }],
    ['23,115', { sign: 'CAFÉ BRISA', bg: '#7a3b1e', fg: '#ffe6b0' }],
    ['115,23', { sign: 'BAY GARAGE', bg: '#3c3f45', fg: '#ffd34d' }],
    ['69,161', { sign: 'CLUB TIBURÓN', bg: '#101418', fg: '#ff5a4d' }],
  ]);

  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      const district = districtAt(cx, cz);
      const named = namedLots.get(`${cx},${cz}`);
      const pattern = named ? 0 : rng.int(0, 2);
      const lots = [];
      if (pattern === 0) lots.push([0, 0, 27, 27]);
      else if (pattern === 1) { lots.push([-8, -8, 13, 13]); lots.push([8, 8, 13, 13]); lots.push([-8, 8, 13, 10]); lots.push([8, -8, 10, 13]); }
      else { lots.push([-8, 0, 13, 27]); lots.push([9, 0, 12, 27]); }

      for (const [ox, oz, w, d] of lots) {
        let h;
        if (district.id === 'downtown') h = rng.bell(24, 62);
        else if (district.id === 'hills') h = rng.bell(7, 16);
        else if (district.id === 'industrial') h = rng.bell(9, 20);
        else h = rng.bell(10, 32);
        if (named && ox === 0) h = 13;
        const mat = facades[rng.int(0, facades.length - 1)];
        const b = new THREE.Mesh(boxGeo(w, h, d), [mat, mat, roofMat, mat, mat, mat]);
        b.position.set(cx + ox, h / 2, cz + oz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        addCollider(cx + ox, cz + oz, w / 2, d / 2);
        // rooftop clutter on the taller boxes
        if (h > 20 && rng.chance(0.6)) {
          const ac = new THREE.Mesh(boxGeo(rng.range(2, 4), 1.4, rng.range(2, 3)), roofMat);
          ac.position.set(cx + ox + rng.range(-4, 4), h + 0.7, cz + oz + rng.range(-4, 4));
          scene.add(ac);
        }
        if (named && ox === 0) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(15, 3.6),
            new THREE.MeshBasicMaterial({ map: signTexture(named.sign, named.bg, named.fg) })
          );
          sign.position.set(cx, 8.6, cz + d / 2 + 0.06);
          scene.add(sign);
          const signBack = sign.clone();
          signBack.rotation.y = Math.PI;
          signBack.position.z = cz - d / 2 - 0.06;
          scene.add(signBack);
        }
      }
    }
  }

  // ---- palms, streetlights, traffic lights, props ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.4, 6);
  const frondGeo = new THREE.BoxGeometry(0.16, 0.03, 3.1);
  function palm(x, z, lean) {
    const grp = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.7;
    trunk.rotation.z = lean;
    trunk.castShadow = true;
    grp.add(trunk);
    const topX = -Math.sin(lean) * 5.2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.position.set(topX, 5.5, 0);
      holder.rotation.y = -a;
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.position.z = 1.35;
      f.rotation.x = 0.48; // droop: the tip of each frond hangs
      holder.add(f);
      grp.add(holder);
    }
    grp.position.set(x, 0, z);
    scene.add(grp);
  }
  for (let x = -176; x <= 176; x += 16) palm(x + rng.range(-3, 3), 196 + rng.range(0, 14), rng.range(-0.1, 0.1));
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      const d = districtAt(cx, cz);
      if ((d.id === 'marina' || d.id === 'beachfront' || d.id === 'hills') && rng.chance(0.75)) {
        palm(cx + rng.pick([-1, 1]) * (GRID.lotHalf + 1.6), cz + rng.range(-12, 12), rng.range(-0.12, 0.12));
      }
    }
  }

  const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4f55 });
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.09, 6.4, 5);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0 });
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      if ((Math.round(x / GRID.pitch) + Math.round(z / GRID.pitch)) % 2 !== 0) continue;
      const lamp = new THREE.Mesh(lampGeo, poleMat);
      lamp.position.set(x + 7.6, 3.2, z + 7.6);
      scene.add(lamp);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lampHeadMat);
      head.position.set(x + 7.6, 6.5, z + 7.6);
      scene.add(head);
    }
  }

  const lightHeadGeo = new THREE.BoxGeometry(0.5, 1.3, 0.5);
  const bulbGeo = new THREE.SphereGeometry(0.13, 8, 6);
  for (let ix = 0; ix < ROAD_LINES.length; ix += 2) {
    for (let iz = 0; iz < ROAD_LINES.length; iz += 2) {
      const x = ROAD_LINES[ix], z = ROAD_LINES[iz];
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 5), poleMat);
      pole.position.set(x + 7.8, 2.3, z + 7.8);
      scene.add(pole);
      const headMesh = new THREE.Mesh(lightHeadGeo, poleMat);
      headMesh.position.set(x + 7.8, 5.1, z + 7.8);
      scene.add(headMesh);
      const bulbs = {};
      for (const [name, dy, color] of [['red', 0.42, 0xff2a1a], ['amber', 0, 0xffb020], ['green', -0.42, 0x2aff5a]]) {
        const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
        bulb.position.set(x + 7.8, 5.1 + dy, z + 7.8 - 0.3);
        bulb.userData.onColor = color;
        scene.add(bulb);
        bulbs[name] = bulb;
      }
      lights.push({ bulbs, axis: (ix + iz) % 4 === 0 ? 'NS' : 'EW' });
    }
  }

  // hydrants and benches: small street furniture, no colliders worth the name
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc23b2a });
  const hydrantGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 6);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6e4f30 });
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      if (rng.chance(0.7)) {
        const hyd = new THREE.Mesh(hydrantGeo, hydrantMat);
        hyd.position.set(cx + GRID.lotHalf + 1.2, 0.31, cz + rng.range(-13, 13));
        scene.add(hyd);
      }
      if (districtAt(cx, cz).id === 'beachfront' && rng.chance(0.8)) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), benchMat);
        bench.position.set(cx + rng.range(-10, 10), 0.5, cz + GRID.lotHalf + 1.4);
        scene.add(bench);
      }
    }
  }

  // billboards on legs beside the bigger roads
  const billboardTexts = [
    ['SOLMAR BAY', '#173f5e', '#ffe9a8'], ['VISIT THE HILLS', '#3c5a2a', '#ffffff'],
    ['LA PERLA · LIVE MUSIC', '#173f35', '#ffd98c'], ['SHINE AUTO', '#14425e', '#bfe8ff'],
    ['RADIO SOLMAR 101.4', '#5e1730', '#ffd1dc'], ['CLUB TIBURÓN', '#101418', '#ff5a4d'],
  ];
  billboardTexts.forEach(([text, bg, fg], i) => {
    const x = -150 + i * 58, z = -176;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 4.4),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), side: THREE.DoubleSide })
    );
    board.position.set(x, 9.5, z);
    scene.add(board);
    for (const dx of [-6, 6]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7.4, 6), poleMat);
      leg.position.set(x + dx, 3.7, z);
      scene.add(leg);
    }
  });

  // ---- the harbour: slab, crates, containers, crane, pier ----
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(88, 48), new THREE.MeshLambertMaterial({ color: 0x8f8b82 }));
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(140, 0.03, 208);
  slab.receiveShadow = true;
  scene.add(slab);

  const crateMats = [0xb0562f, 0x2f6db0, 0x3f9e58, 0xb02f4a, 0x777d84].map((col) => new THREE.MeshLambertMaterial({ color: col }));
  for (let i = 0; i < 16; i++) {
    const w = rng.pick([6, 12]), x = rng.range(104, 176), z = rng.range(190, 226);
    const crate = new THREE.Mesh(boxGeo(w, 2.6, 2.6), crateMats[i % crateMats.length]);
    crate.position.set(x, 1.3 + (rng.chance(0.4) ? 2.6 : 0), z);
    crate.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
    crate.castShadow = true;
    scene.add(crate);
    addCollider(x, z, w / 2, 1.3);
  }
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd9822b });
  for (const dx of [-9, 9]) {
    const leg = new THREE.Mesh(boxGeo(1.2, 17, 1.2), craneMat);
    leg.position.set(150 + dx, 8.5, 214);
    scene.add(leg);
    addCollider(150 + dx, 214, 0.6, 0.6);
  }
  const boom = new THREE.Mesh(boxGeo(30, 1.1, 1.4), craneMat);
  boom.position.set(150, 17.2, 214);
  scene.add(boom);

  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 56), pierMat);
  pier.position.set(131, 0.05, 258);
  pier.receiveShadow = true;
  scene.add(pier);
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6);
  for (let z = 234; z <= 284; z += 10) {
    for (const x of [121, 141]) {
      const post = new THREE.Mesh(postGeo, pierMat);
      post.position.set(x, -0.7, z);
      scene.add(post);
    }
  }

  // ---- named places: marker points on the pavement outside each lot ----
  const edge = GRID.lotHalf + 2.6;
  const places = {
    bar:      { x: -115, z: 115 + edge, name: 'La Perla' },
    gunShop:  { x: 23,   z: -23 + edge, name: 'Gun Runner' },
    spray:    { x: -115 + edge, z: -23, name: "Shine Auto Pay'n'Spray", zone: { x0: -104, z0: -33, x1: -84, z1: -13 } },
    hospital: { x: -23,  z: -69 + edge, name: 'Solmar General Hospital' },
    diner:    { x: 23,   z: 115 + edge, name: 'Café Brisa' },
    garage:   { x: 115 - edge, z: 23,   name: 'Bay Garage' },
    hq:       { x: 69,   z: 161 + edge, name: 'Club Tiburón' },
    pier:     { x: 131,  z: 252,        name: 'Solmar Pier' },
    motel:    { x: -23 + edge, z: 115,  name: 'Motel Brisa' },
  };

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    seaTex.offset.y = elapsed * 0.006;
    seaTex.offset.x = Math.sin(elapsed * 0.11) * 0.01;
    const phase = trafficPhase(elapsed);
    for (const light of lights) {
      const mine = phase.startsWith(light.axis);
      const yellow = phase.endsWith('Y');
      light.bulbs.green.material.color.setHex(mine && !yellow ? 0x2aff5a : 0x222222);
      light.bulbs.amber.material.color.setHex(mine && yellow ? 0xffb020 : 0x222222);
      light.bulbs.red.material.color.setHex(!mine ? 0xff2a1a : 0x222222);
    }
  }

  return { colliders, places, update, seaLevel: -0.3 };
}

// Push a circle (pos.x / pos.z, radius r) out of every AABB it overlaps.
// Returns true when a push happened. Buildings are tall: no Y test.
export function collideCircle(pos, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    if (pos.x > c.x0 - r && pos.x < c.x1 + r && pos.z > c.z0 - r && pos.z < c.z1 + r) {
      const pushLeft = pos.x - (c.x0 - r);
      const pushRight = (c.x1 + r) - pos.x;
      const pushUp = pos.z - (c.z0 - r);
      const pushDown = (c.z1 + r) - pos.z;
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) pos.x = c.x0 - r;
      else if (min === pushRight) pos.x = c.x1 + r;
      else if (min === pushUp) pos.z = c.z0 - r;
      else pos.z = c.z1 + r;
      hit = true;
    }
  }
  return hit;
}
