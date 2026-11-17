// HUD: health bar, cash, wanted stars, ammo, speed, mission objective,
// in-game clock, radio label, shop prompt, message toast, and the 2D
// minimap canvas (roads, player arrow, mission marker, police blips,
// shop icons). All DOM is in index.html; this file only updates it.

import { LANDMARKS, ROAD_LINES, SHOPS } from './config.js';
import { missionObjective } from './missions.js';

const RADIO = ['SOLMAR FM 88.1 — Sunset Drive', 'BAY 97.4 — Neon Nights', 'TIBURON 101 — Cumbia Coast'];

export function createHud() {
  const el = (id) => document.getElementById(id);
  return {
    health: el('health-fill'),
    healthText: el('health-text'),
    cash: el('cash'),
    stars: el('stars'),
    ammo: el('ammo'),
    speed: el('speed'),
    objective: el('objective'),
    clock: el('clock'),
    radio: el('radio'),
    district: el('district'),
    message: el('message'),
    prompt: el('prompt'),
    minimap: el('minimap'),
    banner: el('banner'),
    bannerText: el('banner-text'),
    missionList: el('mission-list'),
  };
}

function drawMinimap(state, hud) {
  const canvas = hud.minimap;
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const size = canvas.width;
  const scale = size / 440; // world -220..220
  const toMap = (x, z) => [(x + 220) * scale, (z + 220) * scale];
  g.fillStyle = '#0d1b26';
  g.fillRect(0, 0, size, size);
  // Beach + ocean strip at the bottom (south).
  g.fillStyle = '#e8d29a';
  g.fillRect(0, (196 + 220) * scale, size, size - (196 + 220) * scale);
  g.fillStyle = '#1e7fa8';
  g.fillRect(0, (232 + 220) * scale, size, size - (232 + 220) * scale);
  // Roads.
  g.strokeStyle = '#5a6068';
  g.lineWidth = 5;
  for (const line of ROAD_LINES) {
    const [x1, y1] = toMap(line, -200);
    const [x2, y2] = toMap(line, 200);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const [hx1, hy1] = toMap(-200, line);
    const [hx2, hy2] = toMap(200, line);
    g.beginPath(); g.moveTo(hx1, hy1); g.lineTo(hx2, hy2); g.stroke();
  }
  // Shops.
  for (const shop of SHOPS) {
    const [x, y] = toMap(shop.x, shop.z);
    g.fillStyle = shop.kind === 'gun' ? '#e74c3c' : shop.kind === 'spray' ? '#9b59b6' : '#2ecc71';
    g.fillRect(x - 3, y - 3, 6, 6);
  }
  // Mission marker (pulsing gold).
  const m = state.missionIndex < 8 ? state : null;
  if (m) {
    const stage = state.missionStage || 0;
    const mission = state.missions[state.missionIndex];
    const target = mission && stage === 1 && mission.thenTarget ? mission.thenTarget : mission.target;
    const [x, y] = toMap(target.x, target.z);
    const pulse = 5 + Math.sin(state.time * 5) * 2;
    g.fillStyle = '#ffd166';
    g.beginPath(); g.arc(x, y, pulse, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 10px system-ui';
    g.textAlign = 'center';
    g.fillText('!', x, y + 3);
  }
  // Police blips (blue/red).
  for (const car of state.police.cars) {
    if (car.dead) continue;
    const [x, y] = toMap(car.x, car.z);
    g.fillStyle = '#3498db';
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
  }
  // Enemies (red).
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const [x, y] = toMap(e.x, e.z);
    g.fillStyle = '#e74c3c';
    g.fillRect(x - 2, y - 2, 4, 4);
  }
  // Player arrow.
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  const [mx, my] = toMap(px, pz);
  const yaw = p.onFoot ? p.yaw : p.car.angle;
  g.save();
  g.translate(mx, my);
  g.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
  g.fill();
  g.restore();
}

export function updateHud(state, hud) {
  const p = state.player;
  if (hud.health) hud.health.style.width = `${Math.max(0, p.hp)}%`;
  if (hud.healthText) hud.healthText.textContent = `HP ${Math.max(0, Math.round(p.hp))}`;
  if (hud.cash) hud.cash.textContent = `$${Math.round(p.cash)}`;
  if (hud.stars) {
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    hud.stars.textContent = stars;
    hud.stars.classList.toggle('hot', state.wanted >= 3);
  }
  if (hud.ammo) hud.ammo.textContent = `${p.weapon.toUpperCase()}  ${p.ammo}  •  [1/2/3] switch`;
  if (hud.speed) {
    const kmh = p.onFoot ? Math.round(p.speed * 3.6) : Math.round(Math.abs(p.car.speed) * 3.6);
    hud.speed.textContent = p.onFoot ? `${kmh} km/h on foot` : `${kmh} km/h — ${p.car.name}`;
  }
  if (hud.objective) hud.objective.textContent = missionObjective(state);
  if (hud.clock) {
    const total = 8 * 60 + Math.floor(state.time / 10);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    hud.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} — ${state.district}`;
  }
  if (hud.radio) hud.radio.textContent = RADIO[Math.floor(state.time / 45) % RADIO.length];
  if (hud.district) hud.district.textContent = state.district;
  if (hud.message) hud.message.textContent = state.message || '';
  if (hud.prompt) hud.prompt.textContent = state.prompt || '';
  if (hud.banner) {
    hud.banner.style.display = state.bannerUntil > state.time ? 'block' : 'none';
    if (hud.bannerText && state.bannerText) hud.bannerText.textContent = state.bannerText;
  }
  drawMinimap(state, hud);
}

export function showBanner(state, text, seconds) {
  state.bannerText = text;
  state.bannerUntil = state.time + seconds;
}

export function renderMissionList(state, hud) {
  if (!hud.missionList) return;
  hud.missionList.innerHTML = state.missions.map((m, i) => {
    const done = i < state.missionIndex;
    const current = i === state.missionIndex;
    return `<li class="${done ? 'done' : ''} ${current ? 'current' : ''}">${done ? '✓' : current ? '▶' : '·'} ${m.id}. ${m.title}</li>`;
  }).join('');
}
