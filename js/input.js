// Keyboard state. Attack is edge-triggered so holding space swings once.

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

  // A swing consumes the press; the key must be released and hit again.
  consumeAttack() {
    this.attack = false;
  }

  on(code, handler) {
    this.listeners.set(code, handler);
  }
}
