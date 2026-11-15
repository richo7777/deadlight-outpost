// input.js — keyboard + mouse input for Deadlight Outpost.
// Tracks held keys by KeyboardEvent.code and the mouse position / button state.
// No DOM input fields exist in this game, so no typing guard is needed.

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };

  function onKeyDown(e) {
    keys.add(e.code);
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function onMouseDown(e) {
    if (e.button === 0) mouse.down = true;
  }

  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  // A lost window focus must never leave a key or the fire button stuck on.
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    keys,
    mouse,
    isDown(code) {
      return keys.has(code);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      keys.clear();
      mouse.down = false;
    },
  };
}
