// shots.js — Deadlight Outpost: deterministic screenshot states.
// ?shot=start|play|end|win&seed=1 forces a fixed state for screenshots.
// No audio is touched here (never call ensure()).
export function getShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const rawSeed = parseInt(params.get('seed') || '1', 10);
  const seed = Number.isFinite(rawSeed) ? rawSeed : 1;
  return { shot: shot || null, seed };
}

// Deterministic PRNG (mulberry32) so positions are stable per seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applyHudState(game, { score, hp, mag, reserve }) {
  try { if (typeof game.setScore === 'function') game.setScore(score); } catch (_) {}
  try { if (game.hud) {
    if (typeof game.hud.setScore === 'function') game.hud.setScore(score);
    if (typeof game.hud.setHp === 'function') game.hud.setHp(hp, 100);
    if (typeof game.hud.setAmmo === 'function') game.hud.setAmmo(mag, reserve, false);
  } } catch (_) {}
  try {
    if (game.player) {
      if (typeof game.player.setHp === 'function') game.player.setHp(hp);
      else if ('hp' in game.player) game.player.hp = hp;
      else if ('health' in game.player) game.player.health = hp;
    }
  } catch (_) {}
  try {
    if (game.weapons) {
      if (typeof game.weapons.setAmmo === 'function') game.weapons.setAmmo(mag, reserve);
      else {
        if ('mag' in game.weapons) game.weapons.mag = mag;
        if ('reserve' in game.weapons) game.weapons.reserve = reserve;
        if ('ammo' in game.weapons) game.weapons.ammo = mag;
      }
    }
  } catch (_) {}
}

function spawnWave2(game, seed) {
  const rng = mulberry32(seed);
  // Six zombies at fixed seeded positions around the outpost centre.
  const positions = [];
  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 8 + rng() * 6;
    positions.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  }
  const zm = game.zombieManager;
  if (!zm) return;
  try {
    if (typeof zm.spawnWave === 'function') {
      zm.spawnWave(2, positions);
      // spawnWave only queues (drip-feed in update); spawn them now so the
      // horde is on screen before setupShot freezes the world.
      if (typeof zm.flushQueue === 'function') zm.flushQueue();
      return;
    }
    if (typeof zm.spawnZombies === 'function') { zm.spawnZombies(positions); return; }
    if (typeof zm.spawnZombie === 'function') {
      positions.forEach((p) => zm.spawnZombie(p));
      return;
    }
    if (typeof zm.spawn === 'function') { zm.spawn(2, positions); return; }
    if (typeof zm.startWave === 'function') { zm.startWave(2); return; }
  } catch (_) {}
}

function freezeZombies(game) {
  const zm = game.zombieManager;
  if (!zm) return;
  try {
    if (typeof zm.setFrozen === 'function') zm.setFrozen(true);
    else zm.frozen = true;
  } catch (_) {}
}

export function setupShot(game, shot, seed) {
  if (!game || !shot) return;
  const s = seed || 1;
  if (shot === 'start') {
    // Leave the menu state alone: orbit camera + title screen visible.
    return;
  }
  if (shot === 'play') {
    if (typeof game.startGame === 'function') game.startGame();
    spawnWave2(game, s);
    // Stage the horde near the player so the shot reads as a zombie game:
    // the spawn points sit at the arena edges, mostly out of frame.
    try {
      const zm2 = game.zombieManager;
      const px = (game.player && game.player.position) ? game.player.position.x : 0;
      const pz = (game.player && game.player.position) ? game.player.position.z : 8;
      const obstacles = (game.world && game.world.obstacles) || [];
      if (zm2 && Array.isArray(zm2.zombies)) {
        const rng2 = mulberry32(s * 7919 + 13);
        const staged = zm2.zombies.slice(0, 12);
        staged.forEach((z, i) => {
          let ang = (i / staged.length) * Math.PI * 2 + rng2() * 0.5;
          let rad = 6.5 + rng2() * 6.5;
          // Nudge out of obstacle circles (a couple of tries).
          for (let t = 0; t < 3; t += 1) {
            const x = px + Math.cos(ang) * rad;
            const zz = pz + Math.sin(ang) * rad;
            const blocked = obstacles.some((o) => {
              const dx = x - o.x;
              const dz = zz - o.z;
              const min = o.r + 1.2;
              return dx * dx + dz * dz < min * min;
            });
            if (!blocked) break;
            ang += 0.6;
          }
          const x = px + Math.cos(ang) * rad;
          const zz = pz + Math.sin(ang) * rad;
          z.group.position.set(x, 0, zz);
          z.group.rotation.y = Math.atan2(px - x, pz - zz);
        });
      }
    } catch (_) {}
    applyHudState(game, { score: 1250, hp: 78, mag: 24, reserve: 90 });
    try { if (game.hud && typeof game.hud.setWave === 'function') game.hud.setWave(2, 10); } catch (_) {}
    try { if (game.hud && typeof game.hud.setZombiesLeft === 'function') game.hud.setZombiesLeft(6); } catch (_) {}
    // Headless has no mouse: put the crosshair/aim at a sensible spot so
    // the player faces the horde instead of the top-left corner.
    try {
      if (game.input && game.input.mouse) {
        game.input.mouse.x = Math.round(window.innerWidth * 0.62);
        game.input.mouse.y = Math.round(window.innerHeight * 0.4);
      }
    } catch (_) {}
    freezeZombies(game);
    return;
  }
  if (shot === 'end') {
    if (typeof game.startGame === 'function') game.startGame();
    // Spawn wave 1 immediately so zombies are visible behind the overlay.
    if (game.zombieManager && typeof game.zombieManager.flushQueue === 'function') {
      game.zombieManager.flushQueue();
    }
    const stats = { score: 2450, wave: 4, kills: 31 };
    applyHudState(game, { score: 2450, hp: 0, mag: 12, reserve: 30 });
    if (typeof game.forceGameOver === 'function') game.forceGameOver(stats);
    // Kill the leftover "WAVE 1" banner so it cannot ghost behind the overlay.
    try { if (game.hud && typeof game.hud.hideBanner === 'function') game.hud.hideBanner(); } catch (_) {}
    return;
  }
  if (shot === 'win') {
    const stats = { score: 9800, wave: 10, kills: 142 };
    // forceWin is a no-op while state is 'menu': start a real game first.
    if (typeof game.startGame === 'function') game.startGame();
    // Clear the staged wave-1 zombies: a held outpost reads tidier with
    // an empty yard and "ZOMBIES LEFT: 0" behind the win overlay.
    if (game.zombieManager && typeof game.zombieManager.clear === 'function') {
      game.zombieManager.clear();
    }
    applyHudState(game, { score: 9800, hp: 64, mag: 24, reserve: 90 });
    if (typeof game.forceWin === 'function') game.forceWin(stats);
    try { if (game.hud && typeof game.hud.hideBanner === 'function') game.hud.hideBanner(); } catch (_) {}
    return;
  }
  // Unknown shot value: leave the game untouched.
}
