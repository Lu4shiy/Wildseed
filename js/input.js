// ===== Ввод: клавиатура + мышь =====

const Input = {
  keys: {},
  mouse: { x: 0, y: 0, down: false },

  init(canvas) {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      // чтобы пробел/стрелки не скроллили страницу
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      // переводим координаты мыши в «виртуальные пиксели» (VW × VH)
      this.mouse.x = (e.clientX - r.left) * (canvas.width  / r.width);
      this.mouse.y = (e.clientY - r.top ) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', () => { this.mouse.down = true; });
    window.addEventListener('mouseup',   () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  isDown(code) { return !!this.keys[code]; }
};