// SOLMAR BAY — the Three.js stage: renderer, scene, camera and light.
//
// One warm coastal look, held all day: a high sun with soft shadows, a
// pale haze on the horizon, and a sky that matches the fog so the city
// fades instead of ending. The shadow camera follows the player so shadows
// stay crisp where the action is and the far city can stay cheap.

import * as THREE from "three";

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd4e8);
  scene.fog = new THREE.Fog(0xc4dde8, 150, 780);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(0, 4, 12);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5f, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xbcd8ff, 0.35);
  fill.position.set(-80, 60, -120);
  scene.add(fill);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  // Keep the sun (and its shadow box) centred on the action, and lean it
  // gently across the day without ever leaving daylight.
  function update(focus, dayFrac) {
    const lean = (dayFrac - 0.5) * 140;
    sun.position.set(focus.x + 130 + lean, 210, focus.z + 70);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.target.updateMatrixWorld();
  }

  return { renderer, scene, camera, sun, resize, update };
}
