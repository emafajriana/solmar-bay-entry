// player.js — the player's body on foot: third-person movement, running,
// jumping, and the little box-person animation that sells it. While the
// player drives, main.js hides this body in the car and moves the car
// instead; health, cash and crimes live on the shared game state.

import * as THREE from 'three';
import { TUNING } from './config.js';
import { makeHumanoid, animateHumanoid } from './pedestrians.js';
import { collideCircle } from './city.js';

export class Player {
  constructor(scene, rng) {
    this.body = makeHumanoid(rng, { shirt: 0x1f8a8c, pants: 0x2c3440, skin: 0xc98a5e });
    this.grp = this.body.grp;
    scene.add(this.grp);
    this.pos = this.grp.position;
    this.pos.set(8, 0, 141);
    this.velY = 0;
    this.grounded = true;
    this.angle = -Math.PI / 2; // facing west, toward the bar across the bay
    this.phase = 0;
    this.speedNow = 0;
    this.inCar = null;
  }

  placeAt(x, z, angle = 0) {
    this.pos.set(x, 0, z);
    this.angle = angle;
    this.velY = 0;
  }

  // One fixed step of on-foot movement. camYaw is the camera's heading:
  // W always walks away from the camera, like every third-person game.
  update(dt, G) {
    const input = G.input;
    let ix = 0, iz = 0;
    if (input.down('KeyW')) iz -= 1;
    if (input.down('KeyS')) iz += 1;
    if (input.down('KeyA')) ix -= 1;
    if (input.down('KeyD')) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? TUNING.runSpeed : TUNING.walkSpeed;

    let vx = 0, vz = 0;
    if (moving) {
      const len = Math.hypot(ix, iz);
      const lx = ix / len, lz = iz / len;
      const sin = Math.sin(G.camYaw), cos = Math.cos(G.camYaw);
      // rotate the local move vector by the camera heading (three.js Y
      // rotation): W ends up walking away from the camera, D to its right
      vx = (lx * cos + lz * sin) * speed;
      vz = (-lx * sin + lz * cos) * speed;
      this.angle = Math.atan2(vx, vz);
    }
    this.speedNow = moving ? speed : 0;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;

    if (input.pressed('Space') && this.grounded) {
      this.velY = TUNING.jumpSpeed;
      this.grounded = false;
    }
    this.velY -= TUNING.gravity * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.velY = 0;
      this.grounded = true;
    }

    collideCircle(this.pos, TUNING.playerRadius, G.colliders);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -196, 196);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -196, 292);

    this.phase += dt * (moving ? speed * 1.9 : 0);
    this.grp.rotation.y = this.angle;
    animateHumanoid(this.body, this.phase, moving ? (running ? 1 : 0.7) : 0);
    if (!moving) {
      // settle the limbs when standing still
      this.body.armL.rotation.x *= 0.8;
      this.body.armR.rotation.x *= 0.8;
      this.body.legL.rotation.x *= 0.8;
      this.body.legR.rotation.x *= 0.8;
    }
    // aiming a gun holds the right arm out along the camera heading
    if (G.aiming) {
      this.body.armR.rotation.x = -Math.PI / 2 + 0.1;
      this.grp.rotation.y = G.camYaw + Math.PI;
    }
  }

  setVisible(v) { this.grp.visible = v; }
}
