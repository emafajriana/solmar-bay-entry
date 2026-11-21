// input.js — keyboard and mouse state for the simulation.
//
// Two kinds of key state are kept apart on purpose:
//   - `down`    — keys physically held right now (movement, throttle).
//   - `tapped`  — one-shot actions (enter car, punch, pause). A tap is
//                 queued on keydown and stays queued until a simulation
//                 step consumes it with take(), so a short press can never
//                 fall between two rendered frames and get lost.
// Mouse movement accumulates into mouseDX/mouseDY, drained by the camera
// once per step. Pointer lock is only requested while playing.

export function createInput(canvas) {
  const down = new Set();
  const tapped = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let lockWanted = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    down.add(event.code);
    tapped.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });
  window.addEventListener('blur', () => {
    down.clear();
    mouseDown = false;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouseDown = true;
    if (lockWanted && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      mouseDX += event.movementX || 0;
      mouseDY += event.movementY || 0;
    }
  });

  return {
    isDown(code) {
      return down.has(code);
    },
    // Consume a one-shot action: true exactly once per physical press.
    take(code) {
      if (!tapped.has(code)) return false;
      tapped.delete(code);
      return true;
    },
    peek(code) {
      return tapped.has(code);
    },
    clearTaps() {
      tapped.clear();
    },
    firing() {
      return mouseDown;
    },
    drainMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    setLockWanted(wanted) {
      lockWanted = wanted;
      if (!wanted && document.pointerLockElement === canvas) document.exitPointerLock();
    },
    locked() {
      return document.pointerLockElement === canvas;
    },
    // Movement axes from the held keys, each in -1..1.
    moveAxes() {
      const z = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      return { x, z };
    },
    steerAxis() {
      return (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0) - (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0);
    },
  };
}

// A stand-in with the same shape, driven by the screenshot autopilot:
// main.js swaps this in for the real thing when a ?shot= scene runs.
export function createScriptedInput() {
  const held = new Set();
  const taps = new Set();
  return {
    isDown: (code) => held.has(code),
    take(code) {
      if (!taps.has(code)) return false;
      taps.delete(code);
      return true;
    },
    peek: (code) => taps.has(code),
    clearTaps: () => taps.clear(),
    firing: () => held.has('__fire'),
    drainMouse: () => ({ dx: 0, dy: 0 }),
    setLockWanted: () => {},
    locked: () => false,
    moveAxes() {
      return {
        x: (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
        z: (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0),
      };
    },
    steerAxis() {
      return (held.has('KeyA') ? 1 : 0) - (held.has('KeyD') ? 1 : 0);
    },
    // Autopilot controls:
    hold(code) {
      held.add(code);
    },
    release(code) {
      held.delete(code);
    },
    releaseAll() {
      held.clear();
    },
    tap(code) {
      taps.add(code);
    },
  };
}
