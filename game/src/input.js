// Keyboard + mouse input. WASD move, Shift run, Space jump / handbrake,
// E enter-exit car / use shop, F punch, click shoot, 1/2/3 weapons, R reload,
// P/Esc pause, arrows rotate the camera when the pointer is not locked.
// All state is polled each frame; edge-triggered actions are consumed once.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_USE = 4;
export const ACTION_PUNCH = 8;
export const ACTION_RELOAD = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyE') actions |= ACTION_USE;
    if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (locked) {
      mouseDX += event.movementX || 0;
      mouseDY += event.movementY || 0;
    }
  }
  function onMouseDown(event) {
    if (event.button === 0) mouseDown = true;
    if (document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch { /* pointer lock is optional */ }
    }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }
  function onBlur() {
    keys.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    move() {
      let f = 0;
      let s = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyA')) s -= 1;
      if (keys.has('KeyD')) s += 1;
      return { forward: f, strafe: s };
    },
    running() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    jumping() { return keys.has('Space'); },
    shooting() { return mouseDown; },
    lookDelta() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      let arrow = 0;
      if (keys.has('ArrowLeft')) arrow += 1;
      if (keys.has('ArrowRight')) arrow -= 1;
      return { dx: dx * 0.0028 + arrow * 0.045, dy: dy * 0.0028 };
    },
    weaponKey() {
      if (keys.has('Digit1')) return 'pistol';
      if (keys.has('Digit2')) return 'shotgun';
      if (keys.has('Digit3')) return 'rifle';
      return null;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    isLocked() { return locked; },
  };
}
