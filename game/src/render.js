// render.js — the Three.js stage: renderer, scene, camera, sun and sky.
// The sun is a single shadow-casting directional light whose shadow box
// follows the player, so shadows stay crisp in a city far too big to
// shadow all at once. Everything else (the city, the cars, the people) is
// built by the other modules and added to stage.scene.

import * as THREE from 'three';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xa8cfe6, 190, 620);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 30, 80);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 1.3);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
  sun.position.set(120, 190, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // A soft golden disc of a sun billboard and a few flat clouds, so the sky
  // is never bare in the title panorama.
  const sunSprite = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false }),
  );
  sunSprite.position.set(420, 330, -560);
  sunSprite.lookAt(0, 40, 0);
  scene.add(sunSprite);

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  return {
    renderer,
    scene,
    camera,
    // Keep the shadow box centred on the action.
    followShadows(x, z) {
      sun.position.set(x + 120, 190, z + 60);
      sun.target.position.set(x, 0, z);
    },
    lookThrough(position, target) {
      camera.position.copy(position);
      camera.lookAt(target);
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
