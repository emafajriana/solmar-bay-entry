// SOLMAR BAY — the HUD and the screens.
//
// Everything the player reads lives in the DOM above the canvas: health,
// cash, the clock, the wanted stars, the current district and its heat
// meter, the objective line, a bust meter, context prompts, toasts — and
// the minimap, a 2D canvas that draws the districts tinted by their live
// heat, the roads, the mission marker, the shops and the police. The
// title, briefing, pause, game-over and victory screens are DOM too; the
// main loop wires their buttons through bind().

import { DISTRICTS, EXTENT, streetCenter, GRID } from "./config.js";

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $("hud"),
      health: $("healthfill"),
      district: $("district-name"),
      heat: $("heatfill"),
      stars: $("stars"),
      cash: $("cash"),
      clock: $("clock"),
      objective: $("objective"),
      objectiveText: $("objective-text"),
      objectiveDist: $("objective-dist"),
      speedo: $("speedo"),
      weapon: $("weapon"),
      radio: $("radio"),
      toast: $("toast"),
      bust: $("bustwrap"),
      bustFill: $("bustfill"),
      prompt: $("prompt"),
      flash: $("flash"),
      flashText: $("flash-text"),
      flashSub: $("flash-sub"),
      minimap: $("minimap"),
    };
    this.mapCtx = this.el.minimap.getContext("2d");
    this.toastUntil = 0;
    this.flashUntil = 0;
    this.screens = ["title", "how", "pause", "brief", "over", "victory"];
  }

  bind(handlers) {
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener("click", fn);
    };
    on("btn-start", handlers.start);
    on("btn-continue", handlers.cont);
    on("btn-how", () => this.showScreen("how"));
    on("btn-how-back", () => this.showScreen("title"));
    on("btn-resume", handlers.resume);
    on("btn-restart", handlers.restart);
    on("btn-accept", handlers.accept);
    on("btn-decline", handlers.decline);
    on("btn-again", handlers.again);
    on("btn-victory-again", handlers.again);
  }

  showScreen(name) {
    for (const s of this.screens) {
      const el = $(`screen-${s}`);
      if (el) el.classList.toggle("visible", s === name);
    }
    this.el.hud.classList.toggle("visible", name === null);
  }

  setContinueVisible(v) {
    $("btn-continue").style.display = v ? "" : "none";
  }

  setBrief(title, text, reward) {
    $("brief-title").textContent = title;
    $("brief-text").textContent = text;
    $("brief-reward").textContent = reward ? `Reward $${reward}` : "";
  }

  setOver(title, sub) {
    $("over-title").textContent = title;
    $("over-title").style.color = title === "BUSTED" ? "#7ec3ff" : "#ff5d5d";
    $("over-sub").textContent = sub;
  }

  setVictory(stats, cash) {
    $("victory-stats").textContent =
      `Missions ${stats.missionsDone}/8 · Cars stolen ${stats.steals} · ` +
      `Knockouts ${stats.knockouts} · Highest heat ${stats.topStars} stars · Cash $${cash}`;
  }

  toast(msg, seconds = 3.2) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("visible");
    this.toastUntil = performance.now() + seconds * 1000;
  }

  flash(text, sub = "") {
    this.el.flashText.textContent = text;
    this.el.flashSub.textContent = sub;
    this.el.flash.classList.add("visible");
    this.flashUntil = performance.now() + 2600;
  }

  tick() {
    const now = performance.now();
    if (now > this.toastUntil) this.el.toast.classList.remove("visible");
    if (now > this.flashUntil) this.el.flash.classList.remove("visible");
  }

  update(s) {
    this.el.health.style.width = `${Math.max(0, (s.health / s.maxHealth) * 100)}%`;
    this.el.health.style.background = s.health < 30 ? "#ff5d5d" : "#7dd069";
    this.el.district.textContent = s.districtName;
    this.el.heat.style.width = `${s.heatFrac * 100}%`;
    this.el.stars.textContent = "★".repeat(s.stars) + "☆".repeat(5 - s.stars);
    this.el.stars.style.opacity = s.stars > 0 ? "1" : "0.25";
    this.el.cash.textContent = `$${s.cash}`;
    this.el.clock.textContent = s.clockText;
    if (s.objective) {
      this.el.objective.classList.add("visible");
      this.el.objectiveText.textContent = s.objective.label;
      this.el.objectiveDist.textContent = s.objective.dist !== null && s.objective.dist !== undefined ? `${Math.round(s.objective.dist)}m` : "";
    } else {
      this.el.objective.classList.remove("visible");
    }
    this.el.speedo.textContent = s.speedKmh !== null ? `${Math.round(Math.abs(s.speedKmh))} km/h` : "";
    if (s.weapon) {
      this.el.weapon.textContent = `${s.weapon.weapon}  ${s.weapon.mag} / ${s.weapon.reserve}${s.weapon.reloading ? "  (reloading)" : ""}`;
    } else {
      this.el.weapon.textContent = "";
    }
    this.el.radio.textContent = s.radio || "";
    this.el.bust.classList.toggle("visible", s.bustFrac > 0.02);
    this.el.bustFill.style.width = `${s.bustFrac * 100}%`;
    if (s.prompt) {
      this.el.prompt.textContent = s.prompt;
      this.el.prompt.classList.add("visible");
    } else {
      this.el.prompt.classList.remove("visible");
    }
  }

  drawMinimap(v) {
    const ctx = this.mapCtx;
    const W = this.el.minimap.width;
    const world = EXTENT + 140;
    const k = W / world;
    const px = (x) => (x + 40) * k;
    const pz = (z) => (z + 40) * k;
    ctx.fillStyle = "#274b63";
    ctx.fillRect(0, 0, W, W);
    // Districts, tinted by their live heat.
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.tint;
      ctx.fillRect(px(d.x0), pz(d.z0), (d.x1 - d.x0) * k, (d.z1 - d.z0) * k);
      const heat = v.heats.get(d.id) || 0;
      if (heat > 1) {
        ctx.fillStyle = `rgba(230, 40, 30, ${Math.min(0.62, heat / 130)})`;
        ctx.fillRect(px(d.x0), pz(d.z0), (d.x1 - d.x0) * k, (d.z1 - d.z0) * k);
      }
    }
    // Beach and harbor.
    ctx.fillStyle = "#e8cf9e";
    ctx.fillRect(px(0), pz(EXTENT), EXTENT * k, 60 * k);
    ctx.fillStyle = "#8d8578";
    ctx.fillRect(px(490), pz(642), 120 * k, 96 * k);
    // Roads.
    ctx.strokeStyle = "rgba(40,44,48,0.55)";
    ctx.lineWidth = Math.max(1, 5 * k);
    for (let i = 0; i <= GRID; i++) {
      const c = streetCenter(i);
      ctx.beginPath();
      ctx.moveTo(px(c), pz(0));
      ctx.lineTo(px(c), pz(EXTENT));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px(0), pz(c));
      ctx.lineTo(px(EXTENT), pz(c));
      ctx.stroke();
    }
    // Shops and places.
    ctx.font = `bold ${Math.round(9 * k * 3)}px system-ui`;
    ctx.textAlign = "center";
    for (const p of v.places) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px(p.door.x) - 3, pz(p.door.z) - 3, 6, 6);
      ctx.fillStyle = "#12303f";
      ctx.fillText(p.letter, px(p.door.x), pz(p.door.z) + 3);
    }
    // Police blips.
    ctx.fillStyle = Math.floor(v.time * 2.4) % 2 ? "#3d7bff" : "#ff4040";
    for (const c of v.policeCars) {
      ctx.beginPath();
      ctx.arc(px(c.pos.x), pz(c.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#3d7bff";
    for (const c of v.cops) {
      if (c.down) continue;
      ctx.fillRect(px(c.pos.x) - 2, pz(c.pos.z) - 2, 4, 4);
    }
    // The mission marker.
    if (v.marker) {
      const pulse = 4 + Math.sin(v.time * 5) * 1.4;
      ctx.fillStyle = "#ffd21f";
      ctx.beginPath();
      ctx.arc(px(v.marker.x), pz(v.marker.z), pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a5c00";
      ctx.stroke();
    }
    // Cash drops.
    ctx.fillStyle = "#59d977";
    for (const d of v.drops) {
      ctx.fillRect(px(d.x) - 2, pz(d.z) - 2, 4, 4);
    }
    // The player arrow.
    const x = px(v.player.x);
    const y = pz(v.player.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-v.player.angle);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-4, -5);
    ctx.lineTo(4, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
