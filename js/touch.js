// Touch & Virtual D-Pad controls for mobile & tablet devices.

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.container = null;
    this.initUI();
  }

  initUI() {
    this.container = document.createElement('div');
    this.container.id = 'touch-controls';
    this.container.innerHTML = `
      <div class="dpad">
        <button id="btn-up" class="dpad-btn up">▲</button>
        <button id="btn-left" class="dpad-btn left">◄</button>
        <button id="btn-right" class="dpad-btn right">►</button>
        <button id="btn-down" class="dpad-btn down">▼</button>
      </div>
      <div class="action-buttons">
        <button id="btn-attack" class="action-btn btn-a">A (Sword)</button>
        <button id="btn-run" class="action-btn btn-b">B (Run)</button>
        <button id="btn-inv" class="action-btn btn-i">INV</button>
      </div>
    `;
    document.body.appendChild(this.container);

    this.bindTouch('btn-up', 'up');
    this.bindTouch('btn-down', 'down');
    this.bindTouch('btn-left', 'left');
    this.bindTouch('btn-right', 'right');
    this.bindTouch('btn-run', 'run');
    this.bindTouch('btn-attack', 'attack');

    const invBtn = document.getElementById('btn-inv');
    invBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const handler = this.input.listeners.get('KeyI');
      if (handler) handler();
    });
  }

  bindTouch(id, property) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.input[property] = true;
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.input[property] = false;
    });
  }
}
