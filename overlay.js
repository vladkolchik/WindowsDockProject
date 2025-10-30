(function () {
  const canvas = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  window.addEventListener('resize', resize);

  let selecting = false;
  let startX = 0, startY = 0, curX = 0, curY = 0;
  let selectionRect = null; // {x,y,w,h}

  function normalizeRect(x1, y1, x2, y2) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    return { x, y, w, h };
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (selectionRect) {
      // Dim the screen first, only after user has a selection
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Punch a hole for the selection
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      ctx.restore();

      // Draw selection border
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(selectionRect.x + 1, selectionRect.y + 1, Math.max(0, selectionRect.w - 2), Math.max(0, selectionRect.h - 2));

      // HUD text (optional)
      if (hud) hud.textContent = `${Math.round(selectionRect.w)} x ${Math.round(selectionRect.h)}`;
    } else {
      if (hud) hud.textContent = '';
    }
  }

  function beginSelection(x, y) {
    selecting = true;
    startX = x; startY = y;
    curX = startX; curY = startY;
    selectionRect = normalizeRect(startX, startY, curX, curY);
    window.overlay.setIgnoreMouse(false);
    redraw();
  }

  function onMouseDown(e) {
    // Only allow selection start with Left Alt + Left Mouse
    if (!(e.altKey && e.button === 0)) return;
    beginSelection(e.clientX, e.clientY);
  }
  function onMouseMove(e) {
    if (!selecting) return;
    curX = e.clientX; curY = e.clientY;
    selectionRect = normalizeRect(startX, startY, curX, curY);
    redraw();
  }
  function onMouseUp() {
    if (!selecting) return;
    selecting = false;
    // keep selection visible; return to click-through
    window.overlay.setIgnoreMouse(true);
    redraw();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      selectionRect = null;
      selecting = false;
      redraw();
    }
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  // Also listen on window for safety
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);

  window.overlay.onClear(() => {
    selectionRect = null;
    selecting = false;
    redraw();
  });

  // Initial state
  resize();
  // Default to click-through; we'll enable capture only for Alt+LMB
  window.overlay.setIgnoreMouse(true);

  // While in click-through mode, we still receive mousemove events (forwarded)
  // If Alt is held, temporarily capture to allow LMB to start selection.
  window.addEventListener('mousemove', (e) => {
    if (!selecting && e.altKey) {
      window.overlay.setIgnoreMouse(false);
    } else if (!selecting && !e.altKey && !selectionRect) {
      window.overlay.setIgnoreMouse(true);
    }
  });

  // UI Panel wiring
  const btnClear = document.getElementById('btn-clear');
  const btnHide = document.getElementById('btn-hide');

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      selectionRect = null;
      selecting = false;
      window.overlay.setIgnoreMouse(false);
      redraw();
    });
  }
  
  if (btnHide) {
    btnHide.addEventListener('click', () => {
      window.overlay.hide();
    });
  }
})();

