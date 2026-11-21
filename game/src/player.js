// SOLMAR BAY — the player: an on-foot body, the car they are driving, and
// the health that decides between the hospital and the wasted screen.
//
// Movement on foot is relative to the camera yaw the main loop passes in.
// Cars are driven through the shared vehicle physics. The player mesh is
// a simple figure — shirt, cap, swinging limbs — that hides itself while
// its owner is behind a wheel.

import * as THREE from "three";
import { input } from "./input.js";
import { resolveCollisions } from "./city.js";
import { EXTENT, HARBOR } from "./config.js";

// The harbor pier deck is the one raised surface in the city.
export function groundHeight(x, z) {
  if (x > HARBOR.x - 60 && x < HARBOR.x + 60 && z > HARBOR.z - 26 && z < HARBOR.z + 70) return 1.6;
  return 0;
}

export class Player {
  constructor(scene, x, z) {
    this.health = 100;
    this.maxHealth = 100;
    this.mode = "foot"; // foot | car
    this.car = null;
    this.angle = Math.PI; // facing north, up the street from the Marina
    this.vy = 0;
    this.height = 0;
    this.lastHurtAt = -99;
    this.walkPhase = 0;
    this.dead = false;

    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0xff7847 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.74, 0.3), shirt);
    torso.position.y = 1.07;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    head.position.y = 1.69;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x20506e }));
    cap.position.y = 1.86;
    g.add(cap);
    const legMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.74, 0.2), legMat);
    this.legL.position.set(-0.14, 0.37, 0);
    g.add(this.legL);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.74, 0.2), legMat);
    this.legR.position.set(0.14, 0.37, 0);
    g.add(this.legR);
    const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.16);
    this.armL = new THREE.Mesh(armGeo, shirt);
    this.armL.position.set(-0.35, 1.09, 0);
    g.add(this.armL);
    this.armR = new THREE.Mesh(armGeo, shirt);
    this.armR.position.set(0.35, 1.09, 0);
    g.add(this.armR);
    this.gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.52), new THREE.MeshLambertMaterial({ color: 0x14161a }));
    this.gunMesh.position.set(0.35, 1.0, 0.3);
    this.gunMesh.visible = false;
    g.add(this.gunMesh);
    g.position.set(x, 0, z);
    scene.add(g);
    this.mesh = g;
  }

  get pos() {
    return this.mesh.position;
  }

  syncToCar() {
    if (this.car) {
      this.pos.copy(this.car.pos);
      this.angle = this.car.angle;
    }
  }

  hurt(amount, now) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.lastHurtAt = now;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  update(dt, world, camYaw) {
    // Slow recovery once the shooting stops.
    if (!this.dead && world.time - this.lastHurtAt > 6 && this.health > 0) {
      this.health = Math.min(this.maxHealth, this.health + 3.5 * dt);
    }
    if (this.mode === "car") {
      this.syncToCar();
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    let mx = 0;
    let mz = 0;
    if (input.down("KeyW")) mz += 1;
    if (input.down("KeyS")) mz -= 1;
    if (input.down("KeyA")) mx -= 1;
    if (input.down("KeyD")) mx += 1;
    const running = input.down("ShiftLeft") || input.down("ShiftRight");
    const speed = running ? 8.8 : 5.4;
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      const lx = mx / len;
      const lz = mz / len;
      // Camera-relative: W follows the camera's facing F = (sin, cos);
      // D follows its right hand R = (-cos, sin).
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const wx = lz * sin - lx * cos;
      const wz = lz * cos + lx * sin;
      const targetAngle = Math.atan2(wx, wz);
      let diff = targetAngle - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.angle += Math.max(-11 * dt, Math.min(11 * dt, diff));
      this.pos.x += Math.sin(this.angle) * speed * dt * Math.max(0.25, Math.cos(diff));
      this.pos.z += Math.cos(this.angle) * speed * dt * Math.max(0.25, Math.cos(diff));
      resolveCollisions(this.pos, 0.5, world.colliders);
      this.pos.x = Math.max(1, Math.min(EXTENT + 90, this.pos.x));
      this.pos.z = Math.max(1, Math.min(920, this.pos.z));
      this.walkPhase += dt * (running ? 11 : 7.5);
    }
    // Gravity and the jump.
    const ground = groundHeight(this.pos.x, this.pos.z);
    if ((input.pressed("Space")) && this.height <= ground + 0.01) {
      this.vy = 5.4;
    }
    this.vy -= 15 * dt;
    this.height += this.vy * dt;
    if (this.height < ground) {
      this.height = ground;
      this.vy = 0;
    }
    this.pos.y = this.height;
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.mesh.rotation.y = this.angle;
  }
}
