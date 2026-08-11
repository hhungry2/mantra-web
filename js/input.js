// Keyboard state. Attack tracks whether space is currently held, so the sword
// stays drawn for the duration of the hold.

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'attack',
};

export class Input {
  constructor(target = window) {
    this.left = false;
    this.right = false;
    this.up = false;
    this.down = false;
    this.run = false;
    this.attack = false;
    this.listeners = new Map();

    target.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (action) {
        e.preventDefault();
        if (!e.repeat) this[action] = true;
      }
      const handler = this.listeners.get(e.code);
      if (handler && !e.repeat) {
        e.preventDefault();
        handler();
      }
    });

    target.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (action) {
        e.preventDefault();
        this[action] = false;
      }
    });

    target.addEventListener('blur', () => {
      this.left = this.right = this.up = this.down = false;
      this.run = this.attack = false;
    });
  }

  // Used to swallow the space press that dismisses a dialog box, so it does
  // not also draw the sword.
  consumeAttack() {
    this.attack = false;
  }

  on(code, handler) {
    this.listeners.set(code, handler);
  }
}
