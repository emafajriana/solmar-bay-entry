// hud.js — everything the player reads: the DOM heads-up display and the
// minimap. The minimap is the District Heat map as much as a navigation
// aid: each district's ground flushes red as its heat climbs, police are
// blue blips, the mission marker is gold, and the player is the white
// arrow in the middle of their own mess.

import { ROAD_LINES, DISTRICTS, districtAt } from './config.js';

const RADIO = {
  hills: 'HILLS FM 98.2 — easy listening',
  oldtown: 'RADIO ANTIGUA — boleros',
  downtown: 'SOLMAR 101.4 — city pop',
  industrial: 'FORGE RADIO — metal hour',
  marina: 'MARINA WAVE — yacht rock',
  beachfront: 'BRISA BEACH RADIO — surf & soul',
};

const SHOP_MARKS = [
  ['gunShop', 'G', '#ffd34d'],
  ['spray', 'S', '#7ad0ff'],
  ['hospital', '+', '#ff8a7a'],
  ['diner', 'D', '#ffc98a'],
  ['bar', 'B', '#8affc1'],
  ['garage', 'R', '#d9d9d9'],
];

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), healthFill: $('health-fill'), healthText: $('health-text'),
      cash: $('cash'), stars: $('stars'), bustWrap: $('bust-wrap'), bustFill: $('bust-fill'),
      objective: $('objective'), objectiveDist: $('objective-dist'),
      clock: $('clock'), district: $('district-name'), heatFill: $('heat-fill'),
      speed: $('speed'), weapon: $('weapon-name'), ammo: $('ammo'),
      prompt: $('prompt'), banner: $('banner'), bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'), toast: $('toast'), radio: $('radio-label'),
      minimap: $('minimap'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.cache = {};
  }

  setText(key, node, text) {
    if (this.cache[key] !== text) {
      this.cache[key] = text;
      node.textContent = text;
    }
  }

  banner(title, sub = '', ms = 3400) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.el.banner.classList.remove('show'), ms);
  }

  toast(text, ms = 2300) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  setPrompt(text) {
    this.setText('prompt', this.el.prompt, text ?? '');
    this.el.prompt.style.opacity = text ? '1' : '0';
  }

  showScreen(id) {
    for (const s of ['screen-title', 'screen-pause', 'screen-over', 'screen-victory']) {
      document.getElementById(s).classList.toggle('show', s === id);
    }
    this.el.hud.classList.toggle('show', id === null);
  }

  update(G) {
    const s = G.state;
    // health + cash
    this.el.healthFill.style.width = `${Math.max(0, s.health)}%`;
    this.el.healthFill.style.background = s.health > 35 ? 'linear-gradient(90deg,#59d977,#a8e063)' : 'linear-gradient(90deg,#d93a2b,#e07a3c)';
    this.setText('health', this.el.healthText, `${Math.ceil(Math.max(0, s.health))}`);
    this.setText('cash', this.el.cash, `$${s.cash.toLocaleString('en-US')}`);
    // stars
    const stars = G.police.stars;
    this.setText('stars', this.el.stars, '★'.repeat(stars) + '☆'.repeat(5 - stars));
    this.el.stars.classList.toggle('flash', stars >= 4);
    this.el.stars.style.opacity = stars > 0 ? '1' : '0.25';
    // bust meter
    const bust = G.police.bust;
    this.el.bustWrap.style.opacity = bust > 0.02 ? '1' : '0';
    this.el.bustFill.style.width = `${bust * 100}%`;
    // clock + district + its heat
    const mins = Math.floor(G.clockMinutes) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.setText('clock', this.el.clock, `${hh}:${mm}`);
    const d = districtAt(G.playerPos.x, G.playerPos.z);
    this.setText('district', this.el.district, d.name);
    this.el.heatFill.style.width = `${G.police.heatOf(d).value}%`;
    // objective
    const obj = G.missions.objective(G);
    this.setText('objective', this.el.objective, obj.text);
    if (obj.marker) {
      const dist = Math.hypot(obj.marker.x - G.playerPos.x, obj.marker.z - G.playerPos.z);
      this.setText('objdist', this.el.objectiveDist, `${Math.round(dist)} m`);
    } else {
      this.setText('objdist', this.el.objectiveDist, '');
    }
    // driving + weapons
    if (G.playerInCar) {
      this.setText('speed', this.el.speed, `${Math.round(Math.abs(G.playerCar.speed) * 3.6)} km/h`);
      this.setText('radio', this.el.radio, RADIO[d.id] ?? '');
    } else {
      this.setText('speed', this.el.speed, '');
      this.setText('radio', this.el.radio, '');
    }
    this.setText('weapon', this.el.weapon, G.combat.current === 'fists' ? '' : G.combat.current.toUpperCase());
    this.setText('ammo', this.el.ammo, G.combat.current === 'fists' ? '' : G.combat.ammoLabel());
    this.drawMinimap(G);
  }

  drawMinimap(G) {
    const ctx = this.mm;
    const S = 220, K = S / 440; // world [-220, 220] on both axes
    const X = (x) => (x + 220) * K;
    const Y = (z) => (z + 220) * K;
    ctx.fillStyle = '#274b3a';
    ctx.fillRect(0, 0, S, S);
    // sea and beach to the south
    ctx.fillStyle = '#2f7d99';
    ctx.fillRect(0, Y(236), S, S - Y(236));
    ctx.fillStyle = '#e6cf9e';
    ctx.fillRect(0, Y(184), S, Y(236) - Y(184));
    // districts, flushed by their own heat
    for (const d of DISTRICTS) {
      const [x0, z0, x1, z1] = d.rect;
      const heat = G.police.heatOf(d).value / 100;
      ctx.fillStyle = `rgba(214,48,32,${(heat * 0.62).toFixed(3)})`;
      ctx.fillRect(X(x0), Y(z0), (x1 - x0) * K, (z1 - z0) * K);
    }
    // roads
    ctx.strokeStyle = 'rgba(230,230,225,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const line of ROAD_LINES) {
      ctx.moveTo(X(line), Y(-184)); ctx.lineTo(X(line), Y(184));
      ctx.moveTo(X(-184), Y(line)); ctx.lineTo(X(184), Y(line));
    }
    ctx.stroke();
    // shops
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    for (const [key, letter, color] of SHOP_MARKS) {
      const p = G.places[key];
      if (!p) continue;
      ctx.fillStyle = color;
      ctx.fillText(letter, X(p.x), Y(p.z) + 3);
    }
    // mission marker: a gold ring that breathes
    const obj = G.missions.objective(G);
    if (obj.marker) {
      const pulse = 4.5 + Math.sin(G.time * 5) * 1.3;
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(obj.marker.x), Y(obj.marker.z), pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    // police blips
    const blink = Math.floor(G.time * 3) % 2 === 0;
    for (const car of G.cars) {
      if (car.role !== 'police' && car.role !== 'blockade') continue;
      ctx.fillStyle = blink ? '#3d8bff' : '#bfe0ff';
      ctx.fillRect(X(car.pos.x) - 2, Y(car.pos.z) - 2, 4, 4);
    }
    for (const ped of G.peds) {
      if (ped.role !== 'cop' || ped.dead) continue;
      ctx.fillStyle = '#3d8bff';
      ctx.fillRect(X(ped.pos.x) - 1.5, Y(ped.pos.z) - 1.5, 3, 3);
    }
    // gang blips while a clear-stage runs
    for (const ped of G.peds) {
      if (ped.role !== 'gang' || ped.dead) continue;
      ctx.fillStyle = '#ff4a3d';
      ctx.fillRect(X(ped.pos.x) - 1.5, Y(ped.pos.z) - 1.5, 3, 3);
    }
    // the player arrow
    const px = X(G.playerPos.x), py = Y(G.playerPos.z);
    const facing = G.playerInCar ? G.playerCar.angle : G.player.angle;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - facing);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
