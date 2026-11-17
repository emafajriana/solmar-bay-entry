// Three.js rendering: scene, sun + shadows, fog, third-person camera
// (behind the player on foot, chase cam in a car), ocean shimmer and the
// traffic-light cycle. The camera never clips through buildings on the
// title screen's slow orbit.

import * as THREE from 'three';
import { BEACH_Z, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0x9fc4e0, 120, 420);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
  sun.position.set(120, 180, -80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd9ee, 0.9));
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x8a7a5a, 0.7);
  scene.add(hemi);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
  camera.position.set(0, 40, 220);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let camYaw = Math.PI;
  let camPitch = 0.32;

  function updateCamera(state, dt) {
    const p = state.player;
    if (state.screen === SCREEN_TITLE) {
      const t = state.time * 0.05;
      camera.position.set(Math.sin(t) * 190, 55 + Math.sin(t * 0.7) * 12, Math.cos(t) * 150 + 40);
      camera.lookAt(0, 12, 0);
      return;
    }
    const driving = !p.onFoot && p.car;
    const yaw = driving ? p.car.angle : p.yaw;
    const look = state.input ? state.input.lookDelta() : { dx: 0, dy: 0 };
    if (!driving) {
      camYaw = p.yaw;
      camPitch = Math.max(0.08, Math.min(0.7, camPitch + look.dy));
    } else {
      camYaw = yaw;
      camPitch = 0.3;
    }
    const dist = driving ? 11 : 7.5;
    const height = driving ? 4.2 : 3.2;
    const cx = (driving ? p.car.x : p.x) - Math.sin(camYaw) * dist * Math.cos(camPitch);
    const cz = (driving ? p.car.z : p.z) - Math.cos(camYaw) * dist * Math.cos(camPitch);
    const cy = (driving ? 0 : p.y) + height + Math.sin(camPitch) * dist * 0.4;
    // Smooth the camera so it does not snap.
    camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 10);
    camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 10);
    camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 10);
    const lx = driving ? p.car.x : p.x;
    const lz = driving ? p.car.z : p.z;
    camera.lookAt(lx, (driving ? 1.5 : p.y + 1.6), lz);
  }

  function render(state, dt) {
    // Ocean shimmer and traffic lights.
    if (state.city && state.city.ocean) {
      state.city.ocean.position.y = -0.2 + Math.sin(state.time * 0.8) * 0.15;
    }
    if (state.city) {
      const red = (state.time % 8) > 6;
      for (const light of state.city.trafficLights) {
        light.material.color.setHex(red ? 0xcc2222 : 0x22cc44);
      }
      if (state.city.beaconDiamond) {
        state.city.beaconDiamond.rotation.y += dt * 2;
        state.city.beaconDiamond.position.y = 12 + Math.sin(state.time * 3) * 0.8;
      }
    }
    updateCamera(state, dt);
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, render };
}
