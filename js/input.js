// js/input.js
// Клавиатура + мышь. Публичный API: window.Input
(function () {
  'use strict';

  const keys = Object.create(null);
  const mouse = {
    x: 0, y: 0,
    left: false, right: false,
    leftPressed: false, rightPressed: false,
    wheel: 0
  };

  const BLOCK = new Set([
    'KeyW','KeyA','KeyS','KeyD',
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'Space','KeyE','Tab'
  ]);

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (BLOCK.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });
  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
    mouse.left = mouse.right = false;
  });

  function attach(canvas) {
    canvas.addEventListener('mousemove', function (e) {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) * (canvas.width  / r.width);
      mouse.y = (e.clientY - r.top ) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) { mouse.left  = true; mouse.leftPressed  = true; }
      if (e.button === 2) { mouse.right = true; mouse.rightPressed = true; }
      e.preventDefault();
    });
    canvas.addEventListener('mouseup', function (e) {
      if (e.button === 0) mouse.left  = false;
      if (e.button === 2) mouse.right = false;
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) {
      mouse.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  function endFrame() {
    mouse.leftPressed  = false;
    mouse.rightPressed = false;
    mouse.wheel = 0;
  }

  window.Input = {
    keys: keys,
    mouse: mouse,
    attach: attach,
    endFrame: endFrame
  };
})();
