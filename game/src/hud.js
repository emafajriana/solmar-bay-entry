// hud.js — everything the player reads: the HUD (health, cash, stars,
// district + heat, objective, speed, ammo, clock, radio), the toast and
// banner announcements, the full-screen cards (title, how-to, pause,
// mission brief, busted/wasted, victory, shop), and the minimap — a live
// 2D canvas with the districts tinted by their heat, the roads, the
// mission marker, the shops and every police blip.

import { DISTRICTS, PLACES, SHOPS, streetLines } from './config.js';

const SCREENS = ['title', 'how', 'pause', 'brief', 'over', 'victory', 'shop'];

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const toastEl = el('toast');
  const bannerEl = el('banner');
  let toastUntil = 0;
  let bannerUntil = 0;

  function showScreen(name) {
    for (const screen of SCREENS) {
      const node = el('screen-' + screen);
      if (node) node.style.display = screen === name ? 'flex' : 'none';
    }
  }

  function drawMinimap(G) {
    const S = minimap.width;
    const x0 = -280;
    const z0 = -290;
    const scale = S / 580;
    const px = (x) => (x - x0) * scale;
    const pz = (z) => (z - z0) * scale;
    mapCtx.fillStyle = '#20313d';
    mapCtx.fillRect(0, 0, S, S);
    // Districts, tinted by heat: calm green through amber to hot red.
    for (const d of DISTRICTS) {
      const heat = G.police.heat[d.id] / 100;
      const r = Math.round(70 + heat * 170);
      const g = Math.round(120 - heat * 70);
      const b = Math.round(70 - heat * 40);
      mapCtx.fillStyle = `rgba(${r},${g},${b},0.5)`;
      const [dx0, dz0, dx1, dz1] = d.rect;
      mapCtx.fillRect(px(dx0), pz(dz0), (dx1 - dx0) * scale, (dz1 - dz0) * scale);
    }
    // Beach and ocean.
    mapCtx.fillStyle = '#d9bd7f';
    mapCtx.fillRect(0, pz(244), S, (272 - 244) * scale);
    mapCtx.fillStyle = '#1d6f9f';
    mapCtx.fillRect(0, pz(272), S, S - pz(272));
    // Roads.
    mapCtx.strokeStyle = 'rgba(230,236,240,0.75)';
    mapCtx.lineWidth = 1.6;
    mapCtx.beginPath();
    for (const line of streetLines()) {
      mapCtx.moveTo(px(line), pz(-244));
      mapCtx.lineTo(px(line), pz(244));
      mapCtx.moveTo(px(-244), pz(line));
      mapCtx.lineTo(px(244), pz(line));
    }
    mapCtx.stroke();
    // Shops and the bar.
    const dot = (x, z, color, size) => {
      mapCtx.fillStyle = color;
      mapCtx.beginPath();
      mapCtx.arc(px(x), pz(z), size, 0, Math.PI * 2);
      mapCtx.fill();
    };
    for (const shop of SHOPS) {
      dot(shop.x, shop.z + 12, shop.kind === 'spray' ? '#ff5d8f' : shop.kind === 'guns' ? '#ffb703' : '#52b788', 2.6);
    }
    dot(PLACES.bar.x, PLACES.bar.z, '#c77dff', 2.6);
    // Gang presence.
    for (const h of G.combat.hostiles) {
      if (!h.dead && h.kind === 'gang') dot(h.x, h.z, '#ff5964', 2.2);
    }
    // Police blips flash blue/red.
    const flash = Math.sin(G.time * 8) > 0;
    for (const car of G.vehicles.cars) {
      if (car.kind === 'cop' && !car.dead) dot(car.x, car.z, flash ? '#4da3ff' : '#ff4d4d', 3);
    }
    for (const h of G.combat.hostiles) {
      if (!h.dead && h.kind === 'cop') dot(h.x, h.z, '#4da3ff', 2.2);
    }
    // Mission marker: a pulsing gold diamond.
    const marker = G.missions ? G.missions.marker : null;
    if (marker) {
      const pulse = 4.4 + Math.sin(G.time * 5) * 1.1;
      mapCtx.fillStyle = '#ffd60a';
      mapCtx.save();
      mapCtx.translate(px(marker.x), pz(marker.z));
      mapCtx.rotate(Math.PI / 4);
      mapCtx.fillRect(-pulse / 1.4, -pulse / 1.4, pulse * 1.4, pulse * 1.4);
      mapCtx.restore();
    }
    // The player: a white arrow on the facing.
    const focus = G.playerFocus();
    const heading = G.profile.mode === 'car' && G.playerCar ? G.playerCar.heading : G.playerAvatar.heading;
    mapCtx.save();
    mapCtx.translate(px(focus.x), pz(focus.z));
    mapCtx.rotate(Math.PI - heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -5.4);
    mapCtx.lineTo(3.6, 4.4);
    mapCtx.lineTo(0, 2.4);
    mapCtx.lineTo(-3.6, 4.4);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  return {
    showScreen,
    on(id, event, fn) {
      const node = el(id);
      if (node) node.addEventListener(event, fn);
    },
    setText(id, text) {
      const node = el(id);
      if (node) node.textContent = text;
    },
    setHudVisible(visible) {
      hud.style.display = visible ? 'block' : 'none';
    },
    refresh(G) {
      const p = G.profile;
      el('healthfill').style.width = `${Math.max(0, p.hp)}%`;
      el('healthfill').style.background = p.hp > 30 ? '#52b788' : '#e63946';
      el('cash').textContent = `$${p.cash.toLocaleString('en-US')}`;
      el('stars').textContent = '★'.repeat(G.police.starsNow) + '☆'.repeat(5 - G.police.starsNow);
      el('stars').style.opacity = G.police.starsNow > 0 ? '1' : '0.25';
      const focus = G.playerFocus();
      const district = G.districtAt(focus.x, focus.z);
      el('district-name').textContent = district.name;
      el('heatfill').style.width = `${G.police.heat[district.id]}%`;
      const objective = G.missions ? G.missions.objectiveText : '';
      el('objective').textContent = objective || '';
      el('objdist').textContent = G.missions && G.missions.marker ? `${Math.round(G.missions.markerDist)} m` : '';
      el('speed').textContent = p.mode === 'car' && G.playerCar ? `${Math.round(Math.abs(G.playerCar.speed) * 3.6)} km/h` : '';
      el('weapon').textContent = p.weapon === 'fist' ? 'FISTS' : `${p.weapon.toUpperCase()} · ${p.ammo[p.weapon] ?? 0}`;
      el('clock').textContent = G.clockText;
      el('radio').textContent = p.mode === 'car' ? `♪ ${G.radioStation}` : '';
      const bust = G.police.bustMeter;
      el('bustwrap').style.display = bust > 0.05 ? 'block' : 'none';
      el('bustfill').style.width = `${Math.min(100, (bust / 2.2) * 100)}%`;
      drawMinimap(G);
    },
    setInteract(text) {
      const node = el('interact');
      node.style.display = text ? 'block' : 'none';
      if (text) node.textContent = text;
    },
    toast(msg, seconds = 3.2) {
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      toastUntil = performance.now() + seconds * 1000;
    },
    banner(title, sub = '', seconds = 2.6) {
      el('banner-title').textContent = title;
      el('banner-sub').textContent = sub;
      bannerEl.style.opacity = '1';
      bannerUntil = performance.now() + seconds * 1000;
    },
    update() {
      const now = performance.now();
      if (now > toastUntil) toastEl.style.opacity = '0';
      if (now > bannerUntil) bannerEl.style.opacity = '0';
    },
  };
}
