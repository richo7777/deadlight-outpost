// hud.js — Deadlight Outpost: DOM HUD + menu overlays over the 3D canvas.
// All styling is inline (a single <style> injected once); no external CSS.
// The #hud container is pointer-events:none; overlays/buttons are auto.
export function createHud() {
  let root = document.getElementById('hud');
  if (!root) {
    root = document.createElement('div');
    root.id = 'hud';
    document.body.appendChild(root);
  }
  let vignette = document.getElementById('vignette');

  const STYLE_ID = 'deadlight-hud-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#hud{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:'Courier New',ui-monospace,monospace;color:#e8e4d8;user-select:none}
#hud .panel{background:rgba(8,10,8,.55);border:1px solid rgba(232,228,216,.25);border-radius:6px;padding:8px 12px}
#hud .label{font-size:11px;letter-spacing:2px;opacity:.75}
#hud .big{font-size:22px;font-weight:bold;line-height:1.1}
#hudScore{position:absolute;top:14px;left:16px}
#hudWave{position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center}
#hudFeed{position:absolute;top:14px;right:16px;text-align:right;font-size:12px;line-height:1.5}
#hudFeed div{background:rgba(8,10,8,.55);border-radius:4px;padding:2px 8px;margin-bottom:4px;display:inline-block}
#hudHp{position:absolute;left:16px;bottom:16px;width:240px}
#hudHpBarWrap{height:14px;background:rgba(0,0,0,.6);border:1px solid rgba(232,228,216,.35);border-radius:3px;overflow:hidden;margin-top:4px}
#hudHpBar{height:100%;width:100%;background:#c0392b;transition:width .2s ease}
#hudAmmo{position:absolute;right:16px;bottom:16px;text-align:right}
#hudCrosshair{position:absolute;width:22px;height:22px;left:50%;top:50%;margin:-11px 0 0 -11px;pointer-events:none}
#hudCrosshair::before,#hudCrosshair::after{content:'';position:absolute;background:#e8e4d8;box-shadow:0 0 3px #000}
#hudCrosshair::before{left:10px;top:0;width:2px;height:22px}
#hudCrosshair::after{top:10px;left:0;width:22px;height:2px}
#hudBanner{position:absolute;left:50%;top:26%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .4s ease;pointer-events:none}
#hudBanner h2{margin:0;font-size:44px;letter-spacing:8px;color:#ffd75e;text-shadow:0 0 18px rgba(0,0,0,.9)}
#hudBanner p{margin:6px 0 0;font-size:16px;letter-spacing:3px;text-shadow:0 0 10px #000}
#hudHeal{position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(40,200,90,.45) 100%);transition:opacity .5s ease}
#hud .overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:rgba(4,6,5,.78);pointer-events:auto;padding:20px}
#hud .overlay h1{margin:0 0 10px;font-size:52px;letter-spacing:10px;color:#ffd75e;text-shadow:0 0 24px rgba(255,80,40,.5)}
#hud .overlay h1.red{color:#ff5340}
#hud .overlay p{margin:6px 0;max-width:560px;font-size:15px;line-height:1.6}
#hud .overlay .stats{margin:14px 0;font-size:18px;line-height:1.8}
#hud .overlay button{pointer-events:auto;margin-top:18px;padding:12px 34px;font-family:inherit;font-size:18px;letter-spacing:3px;font-weight:bold;color:#111;background:#ffd75e;border:none;border-radius:6px;cursor:pointer}
#hud .overlay button:hover{background:#ffe98a}
#hud .overlay .hint{margin-top:14px;font-size:12px;opacity:.7;letter-spacing:1px}
#hud .hidden{display:none !important}
`;
    document.head.appendChild(style);
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined && html !== null) n.innerHTML = html;
    return n;
  }

  // --- HUD panels ---
  const scoreEl = el('div', 'panel');
  scoreEl.id = 'hudScore';
  scoreEl.innerHTML = '<div class="label">SCORE</div><div class="big" id="hudScoreVal">0</div>';
  root.appendChild(scoreEl);

  const waveEl = el('div', 'panel');
  waveEl.id = 'hudWave';
  waveEl.innerHTML = '<div class="label">WAVE</div><div class="big" id="hudWaveVal">1 / 10</div><div class="label" id="hudZombiesVal">ZOMBIES LEFT: 0</div>';
  root.appendChild(waveEl);

  const feedEl = el('div');
  feedEl.id = 'hudFeed';
  root.appendChild(feedEl);

  const hpEl = el('div', 'panel');
  hpEl.id = 'hudHp';
  hpEl.innerHTML = '<div class="label">HP — <span id="hudHpVal">100</span></div><div id="hudHpBarWrap"><div id="hudHpBar"></div></div>';
  root.appendChild(hpEl);

  const ammoEl = el('div', 'panel');
  ammoEl.id = 'hudAmmo';
  ammoEl.innerHTML = '<div class="label">AMMO</div><div class="big" id="hudAmmoVal">30 / 120</div>';
  root.appendChild(ammoEl);

  const crosshair = el('div');
  crosshair.id = 'hudCrosshair';
  root.appendChild(crosshair);

  const banner = el('div');
  banner.id = 'hudBanner';
  banner.innerHTML = '<h2 id="hudBannerTitle"></h2><p id="hudBannerSub"></p>';
  root.appendChild(banner);

  const healEl = el('div');
  healEl.id = 'hudHeal';
  root.appendChild(healEl);

  // --- Overlays ---
  function makeOverlay(id, titleHtml, bodyHtml, buttonText, hint) {
    const o = el('div', 'overlay hidden');
    o.id = id;
    o.innerHTML = titleHtml + bodyHtml +
      (buttonText ? `<button type="button">${buttonText}</button>` : '') +
      (hint ? `<div class="hint">${hint}</div>` : '');
    root.appendChild(o);
    return o;
  }

  const startOverlay = makeOverlay('hudStart',
    '<h1>DEADLIGHT<br>OUTPOST</h1>',
    '<p>Hold the outpost through <b>10 waves</b> of the dead. Scavenge ammo, ' +
    'watch your HP, and do not let them reach the light.</p>' +
    '<p><b>WASD</b> move &nbsp;·&nbsp; <b>Mouse</b> aim &nbsp;·&nbsp; <b>Click</b> shoot &nbsp;·&nbsp; ' +
    '<b>R</b> reload &nbsp;·&nbsp; <b>Esc / P</b> pause</p>',
    'START', 'Press Enter to start');
  const startBtn = startOverlay.querySelector('button');

  const overOverlay = makeOverlay('hudGameOver',
    '<h1 class="red">THE OUTPOST<br>HAS FALLEN</h1>',
    '<div class="stats" id="hudOverStats"></div>',
    'PLAY AGAIN', 'Press R or Enter to retry');
  const overBtn = overOverlay.querySelector('button');

  const winOverlay = makeOverlay('hudWin',
    '<h1>OUTPOST HELD</h1>',
    '<p>The dawn breaks. The outpost still stands — because of you.</p><div class="stats" id="hudWinStats"></div>',
    'PLAY AGAIN', 'Press R or Enter to play again');
  const winBtn = winOverlay.querySelector('button');

  const pauseOverlay = makeOverlay('hudPause',
    '<h1>PAUSED</h1>',
    '<p>Take a breath. The dead will wait.</p>',
    null, 'Press Esc / P to resume');
  pauseOverlay.style.background = 'rgba(4,6,5,.6)';

  function hideAllOverlays() {
    [startOverlay, overOverlay, winOverlay, pauseOverlay].forEach((o) => o.classList.add('hidden'));
  }
  function statsHtml(s) {
    const st = s || {};
    return `SCORE <b>${st.score ?? 0}</b><br>WAVE <b>${st.wave ?? 0}</b><br>KILLS <b>${st.kills ?? 0}</b>`;
  }

  // Keyboard: Enter starts, R / Enter restarts. Dispatch by visible overlay.
  let onStartCb = null;
  let onRestartCb = null;
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (!startOverlay.classList.contains('hidden') && e.key === 'Enter' && onStartCb) {
      onStartCb();
    } else if ((!overOverlay.classList.contains('hidden') || !winOverlay.classList.contains('hidden'))
      && (e.key === 'r' || e.key === 'R' || e.key === 'Enter') && onRestartCb) {
      onRestartCb();
    }
  });

  let bannerTimer = null;
  let vignetteTimer = null;
  let healTimer = null;

  return {
    setHp(hp, max) {
      const m = max > 0 ? max : 100;
      const pct = Math.max(0, Math.min(100, (hp / m) * 100));
      const bar = document.getElementById('hudHpBar');
      const val = document.getElementById('hudHpVal');
      if (bar) {
        bar.style.width = pct + '%';
        bar.style.background = pct > 50 ? '#27ae60' : pct > 25 ? '#e67e22' : '#c0392b';
      }
      if (val) val.textContent = String(Math.max(0, Math.round(hp)));
    },

    setAmmo(mag, reserve, reloading) {
      const v = document.getElementById('hudAmmoVal');
      if (v) v.textContent = reloading ? 'RELOADING...' : `${mag} / ${reserve}`;
    },

    setScore(n) {
      const v = document.getElementById('hudScoreVal');
      if (v) v.textContent = String(n);
    },

    setWave(n, total) {
      const v = document.getElementById('hudWaveVal');
      if (v) v.textContent = `${n} / ${total}`;
    },

    setZombiesLeft(n) {
      const v = document.getElementById('hudZombiesVal');
      if (v) v.textContent = `ZOMBIES LEFT: ${n}`;
    },

    hideBanner() {
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = null;
      banner.style.opacity = '0';
    },

    banner(title, sub) {
      const t = document.getElementById('hudBannerTitle');
      const s = document.getElementById('hudBannerSub');
      if (t) t.textContent = title || '';
      if (s) s.textContent = sub || '';
      banner.style.opacity = '1';
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.style.opacity = '0'; }, 2500);
    },

    damageFlash() {
      if (!vignette) vignette = document.getElementById('vignette');
      if (!vignette) return;
      vignette.style.opacity = '0.9';
      if (vignetteTimer) clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => { vignette.style.opacity = '0'; }, 350);
    },

    healFlash() {
      healEl.style.opacity = '1';
      if (healTimer) clearTimeout(healTimer);
      healTimer = setTimeout(() => { healEl.style.opacity = '0'; }, 500);
    },

    hideStart() {
      startOverlay.classList.add('hidden');
    },

    showStart(onStart) {
      onStartCb = onStart || null;
      hideAllOverlays();
      startOverlay.classList.remove('hidden');
      if (startBtn) startBtn.onclick = () => { if (onStartCb) onStartCb(); };
    },

    showGameOver(stats, onRestart) {
      onRestartCb = onRestart || null;
      const s = document.getElementById('hudOverStats');
      if (s) s.innerHTML = statsHtml(stats);
      hideAllOverlays();
      overOverlay.classList.remove('hidden');
      if (overBtn) overBtn.onclick = () => { if (onRestartCb) onRestartCb(); };
    },

    showWin(stats, onRestart) {
      onRestartCb = onRestart || null;
      const s = document.getElementById('hudWinStats');
      if (s) s.innerHTML = statsHtml(stats);
      hideAllOverlays();
      winOverlay.classList.remove('hidden');
      if (winBtn) winBtn.onclick = () => { if (onRestartCb) onRestartCb(); };
    },

    showPaused(b) {
      if (b) {
        hideAllOverlays();
        pauseOverlay.classList.remove('hidden');
      } else {
        pauseOverlay.classList.add('hidden');
      }
    },

    addFeed(text) {
      const row = el('div', null, '');
      row.textContent = text;
      feedEl.prepend(row);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.lastChild);
    },

    setCrosshair(x, y) {
      crosshair.style.left = x + 'px';
      crosshair.style.top = y + 'px';
      crosshair.style.margin = '-11px 0 0 -11px';
      crosshair.style.transform = 'none';
    },
  };
}
