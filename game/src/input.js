// SOLMAR BAY — keyboard and mouse state.
//
// Two kinds of input live here:
//   * held state (keys down, mouse button down) that the simulation reads
//     every step, and
//   * one-shot presses, which are queued on the physical keydown and stay
//     queued until a simulation step consumes them — a press is never lost
//     just because a frame happened to run no step.
//
// Mouse look works through pointer lock; when the pointer is not locked
// (menus, headless tests) the accumulated deltas simply stay at zero.

class Input {
  constructor() {
    this.keys = new Set();
    this.presses = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.locked = false;
    this.target = null;
  }

  attach(target) {
    this.target = target;
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.presses.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    target.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.clicked = true;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener("mousemove", (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === target;
    });
  }

  lockPointer() {
    if (!this.target || this.locked) return;
    const attempt = (options) => {
      try {
        const p = options ? this.target.requestPointerLock(options) : this.target.requestPointerLock();
        return p && typeof p.catch === "function" ? p : null;
      } catch {
        return null;
      }
    };
    // Prefer raw movement; if the browser refuses (no user gesture,
    // unsupported option), fall back once and then let it go — a later
    // click on the canvas will lock again.
    const first = attempt({ unadjustedMovement: true });
    if (first) first.catch(() => { const second = attempt(); if (second) second.catch(() => {}); });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True exactly once per physical press, whenever the next step asks.
  pressed(code) {
    if (this.presses.has(code)) {
      this.presses.delete(code);
      return true;
    }
    return false;
  }

  // Read and clear the mouse motion gathered since the last read.
  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  takeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
}

export const input = new Input();
