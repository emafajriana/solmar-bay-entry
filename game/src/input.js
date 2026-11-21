// input.js — keyboard and mouse state for the whole game.
//
// Two flavours of key state live here: held keys (movement, driving) read
// through `down`, and one-shot presses (enter car, punch, pause) queued on
// keydown and drained once per frame through `pressed`, so a short tap can
// never fall between two simulation steps. Mouse look accumulates pixel
// deltas while the pointer is locked; the arrow keys feed the same deltas
// so the camera still works where pointer lock is unavailable.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.queue = [];
    this.lookX = 0;
    this.lookY = 0;
    this.mouseDown = false;
    this.locked = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (!this.held.has(e.code)) this.queue.push(e.code);
      this.held.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => { this.held.clear(); this.mouseDown = false; });

    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseDown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX || 0;
      this.lookY += e.movementY || 0;
    });
  }

  lockPointer() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') {
        p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* look is optional */ } });
      }
    } catch {
      try { this.canvas.requestPointerLock(); } catch { /* look is optional */ }
    }
  }

  unlockPointer() {
    if (this.locked) document.exitPointerLock();
  }

  down(code) {
    return this.enabled && this.held.has(code);
  }

  // True exactly once per physical press.
  pressed(code) {
    const i = this.queue.indexOf(code);
    if (i === -1) return false;
    this.queue.splice(i, 1);
    return true;
  }

  // Call at the end of every frame: stale presses and look deltas die here.
  endFrame() {
    this.queue.length = 0;
    this.lookX = 0;
    this.lookY = 0;
  }

  // Look deltas for this frame: real mouse movement when locked, arrow
  // keys as a standing fallback (used by tests and trackpads alike).
  lookDelta() {
    let x = this.lookX, y = this.lookY;
    if (this.down('ArrowLeft')) x -= 22;
    if (this.down('ArrowRight')) x += 22;
    if (this.down('ArrowUp')) y -= 14;
    if (this.down('ArrowDown')) y += 14;
    return { x, y };
  }
}
