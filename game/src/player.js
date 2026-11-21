// player.js — the player's body on foot: WASD movement relative to the
// camera, running, jumping, building collision, and the third-person
// camera that follows both the walker and (from main.js) the car. The
// avatar is a makeHumanoid in a yellow shirt and a red cap, so the player
// can always pick themselves out of a crowd.

import * as THREE from 'three';
import { TUNING, WORLD } from './config.js';
import { makeHumanoid, animateWalk } from './pedestrians.js';
import { collideCircle } from './city.js';

export function createPlayer(rng, city, start) {
  const parts = makeHumanoid(rng, { shirt: 0xffd166, pants: 0x1d3557, cap: 0xe63946 });
  parts.group.position.set(start.x, 0, start.z);

  const player = {
    parts,
    x: start.x,
    z: start.z,
    y: 0,
    vy: 0,
    heading: Math.PI, // avatar facing
    camYaw: Math.PI, // direction the camera looks toward
    camPitch: 0.34,
    walkPhase: 0,
    moving: 0,

    update(dt, input, G) {
      const mouse = input.drainMouse();
      this.camYaw -= mouse.dx * 0.0026;
      this.camPitch = Math.max(-0.12, Math.min(1.15, this.camPitch + mouse.dy * 0.0022));

      const axes = input.moveAxes();
      const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      const speed = running ? TUNING.runSpeed : TUNING.walkSpeed;
      let mx = 0;
      let mz = 0;
      if (axes.x !== 0 || axes.z !== 0) {
        const fx = Math.sin(this.camYaw);
        const fz = Math.cos(this.camYaw);
        const rx = Math.cos(this.camYaw);
        const rz = -Math.sin(this.camYaw);
        mx = fx * axes.z + rx * axes.x;
        mz = fz * axes.z + rz * axes.x;
        const len = Math.hypot(mx, mz) || 1;
        mx /= len;
        mz /= len;
        this.x += mx * speed * dt;
        this.z += mz * speed * dt;
        const desired = Math.atan2(mx, mz);
        let turn = desired - this.heading;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        this.heading += Math.max(-11 * dt, Math.min(11 * dt, turn));
        this.moving = 1;
      } else {
        this.moving = 0;
      }

      if (input.take('Space') && this.y <= 0.001) {
        this.vy = TUNING.jumpSpeed;
      }
      if (this.y > 0 || this.vy !== 0) {
        this.y += this.vy * dt;
        this.vy -= TUNING.gravity * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
        }
      }

      const [nx, nz] = collideCircle(city, this.x, this.z, TUNING.playerRadius);
      this.x = Math.max(-252, Math.min(252, nx));
      this.z = Math.max(-252, Math.min(WORLD.waterStart - 1.2, nz));

      this.walkPhase += (this.moving ? speed : 0) * dt * 2.3;
      animateWalk(parts, this.walkPhase, this.moving);
      parts.group.position.set(this.x, this.y, this.z);
      parts.group.rotation.y = this.heading;
    },

    // Third-person camera: behind and above the look direction.
    placeCamera(stage, focus, dist) {
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      const flat = Math.cos(this.camPitch) * dist;
      const up = Math.sin(this.camPitch) * dist;
      const pos = new THREE.Vector3(focus.x - fx * flat, focus.y + 1.7 + up, focus.z - fz * flat);
      stage.lookThrough(pos, new THREE.Vector3(focus.x, focus.y + 1.5, focus.z));
      stage.followShadows(focus.x, focus.z);
    },

    speedNow(input) {
      const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      return this.moving ? (running ? TUNING.runSpeed : TUNING.walkSpeed) : 0;
    },
  };
  return player;
}
