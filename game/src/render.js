// render.js — the Three.js stage: renderer, scene, camera and light.
//
// One warm coastal look held all day: a high sun with soft shadows, a pale
// horizon haze for depth, and a sky that grades from zenith blue to a
// sun-bleached band at the sea line. Nothing here knows about gameplay.

import * as THREE from 'three';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3e8);
  scene.fog = new THREE.Fog(0xc4dde8, 190, 620);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 26, 60);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(120, 190, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // The shadow camera follows the action so shadows stay crisp where the
  // player actually is instead of smeared across the whole map.
  function followShadows(x, z) {
    sun.position.set(x + 120, 190, z + 60);
    sun.target.position.set(x, 0, z);
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera, sun, followShadows };
}
