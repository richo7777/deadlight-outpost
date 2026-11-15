// main.js — Deadlight Outpost entry point.
// Wires renderer, world, player, zombies, weapons, audio and HUD together
// and runs the wave state machine: menu -> playing -> paused -> over / won.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import * as RandomMod from './random.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createZombieManager } from './zombies.js';
import { createWeapons } from './weapons.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { getShotParams, setupShot } from './shots.js';

// ---- seeded rng -----------------------------------------------------------
// random.js is a teammate module; accept any of its likely factory names and
// fall back to Math.random so the game still runs if the factory differs.
function resolveRng(seed) {
  const factory =
    RandomMod.createRandom ||
    RandomMod.createRng ||
    RandomMod.mulberry32 ||
    RandomMod.seededRandom ||
    RandomMod.default;
  if (typeof factory === 'function') {
    try {
      const r = factory(seed);
      if (typeof r === 'function') return r;
      if (r && typeof r.next === 'function') return () => r.next();
      if (r && typeof r.random === 'function') return () => r.random();
    } catch (_) {
      /* fall through to Math.random */
    }
  }
  return Math.random;
}

let shotParams = null;
try {
  shotParams = getShotParams();
} catch (_) {
  shotParams = null;
}
const rng = resolveRng(
  (shotParams && shotParams.seed) != null
    ? shotParams.seed
    : (Date.now() % 2147483647),
);

// ---- renderer / scene / camera -------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x0a0f1a, 0.016);

const camera = new THREE.PerspectiveCamera(
  (CONFIG.camera && CONFIG.camera.fov) || 60,
  window.innerWidth / window.innerHeight,
  0.1,
  220,
);
camera.position.set(0, 24, 24);

scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x1a1410, 0.55));
const moon = new THREE.DirectionalLight(0xbfd0ff, 1.1);
moon.position.set(-18, 30, -12);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -35;
moon.shadow.camera.right = 35;
moon.shadow.camera.top = 35;
moon.shadow.camera.bottom = -35;
scene.add(moon);

// ---- modules --------------------------------------------------------------
const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(canvas);
const player = createPlayer(scene);
const zombieManager = createZombieManager(scene, world, rng, audio);
const weapons = createWeapons(scene, world, zombieManager, audio);

// ---- state ----------------------------------------------------------------
let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'over' | 'won'
let score = 0;
let kills = 0;
let wave = 0;
let waveActive = false;
let betweenTimer = 0;
let menuAngle = 0;
let prevEnter = false;
let prevR = false;

const aimRaycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3(0, 0, 0);
const ndc = new THREE.Vector2();

const pickups = []; // { group, kind }

function computeAimPoint() {
  ndc.set(
    (input.mouse.x / window.innerWidth) * 2 - 1,
    -(input.mouse.y / window.innerHeight) * 2 + 1,
  );
  aimRaycaster.setFromCamera(ndc, camera);
  const hit = aimRaycaster.ray.intersectPlane(aimPlane, aimPoint);
  if (!hit) {
    // Mouse ray parallel to the ground: aim a short way ahead of the player.
    aimPoint.set(
      player.position.x + Math.sin(player.group.rotation.y) * 5,
      0,
      player.position.z + Math.cos(player.group.rotation.y) * 5,
    );
  }
  return aimPoint;
}

function spawnPickup(pos, kind) {
  const group = new THREE.Group();
  if (kind === 'health') {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2fae4e,
      emissive: 0x1d7a33,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    box.position.y = 0.45;
    box.castShadow = true;
    group.add(box);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.02), crossMat);
    c1.position.set(0, 0.45, 0.26);
    group.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.02), crossMat);
    c2.position.set(0, 0.45, 0.26);
    group.add(c2);
  } else {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe8b93a,
      emissive: 0x8a6a10,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      metalness: 0.4,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.45), mat);
    box.position.y = 0.45;
    box.castShadow = true;
    group.add(box);
  }
  group.position.set(pos.x, 0, pos.z);
  scene.add(group);
  pickups.push({ group, kind, phase: Math.random() * Math.PI * 2 });
}

function clearPickups() {
  for (const p of pickups) scene.remove(p.group);
  pickups.length = 0;
}

function updatePickups(dt, elapsed) {
  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const p = pickups[i];
    p.group.rotation.y += dt * 1.5;
    p.group.position.y = 0.08 + Math.sin(elapsed * 3 + p.phase) * 0.06;
    const dx = player.position.x - p.group.position.x;
    const dz = player.position.z - p.group.position.z;
    if (dx * dx + dz * dz < 1.2 * 1.2) {
      if (p.kind === 'health') {
        player.heal(CONFIG.pickups.healthAmount);
        hud.healFlash();
        hud.addFeed(`+${CONFIG.pickups.healthAmount} HP`);
      } else {
        weapons.addReserve(CONFIG.pickups.ammoAmount);
        hud.addFeed(`+${CONFIG.pickups.ammoAmount} ammo`);
      }
      if (audio) audio.pickup();
      scene.remove(p.group);
      pickups.splice(i, 1);
    }
  }
}

function startWave(n) {
  wave = n;
  waveActive = true;
  zombieManager.spawnWave(n);
  hud.setWave(n, CONFIG.waves.total);
  hud.banner(`WAVE ${n}`, n === 1 ? 'They are coming — hold the outpost!' : 'More of them…');
  if (audio) audio.horn();
}

function startGame() {
  // The start overlay must go in every case (button, Enter, restart, shot).
  hud.hideStart();
  const start = (world && world.playerStart) || { x: 0, z: 8 };
  player.hp = player.maxHp;
  player.group.position.set(start.x, 0, start.z);
  player.group.rotation.set(0, 0, 0);
  zombieManager.clear();
  zombieManager.setFrozen(false);
  clearPickups();
  weapons.ammo = weapons.magSize;
  weapons.reserve = CONFIG.weapon.reserveStart;
  weapons.reloading = false;
  weapons.fireTimer = 0;
  score = 0;
  kills = 0;
  wave = 0;
  waveActive = false;
  betweenTimer = 0;
  state = 'playing';
  hud.setScore(0);
  hud.setHp(player.hp, player.maxHp);
  hud.setAmmo(weapons.ammo, weapons.reserve, false);
  hud.setWave(1, CONFIG.waves.total);
  if (audio) {
    audio.ensure();
    audio.startAmbient();
  }
  startWave(1);
}

function gameOver() {
  if (state !== 'playing') return;
  state = 'over';
  zombieManager.setFrozen(true);
  hud.setWave(wave, CONFIG.waves.total);
  hud.setZombiesLeft(
    zombieManager.aliveCount() +
      (zombieManager.pendingCount != null ? zombieManager.pendingCount : 0),
  );
  if (audio) {
    audio.lose();
    audio.stopAmbient();
  }
  hud.showGameOver({ score, kills, wave }, startGame);
}

function winGame() {
  if (state !== 'playing') return;
  state = 'won';
  zombieManager.setFrozen(true);
  hud.setWave(wave, CONFIG.waves.total);
  hud.setZombiesLeft(
    zombieManager.aliveCount() +
      (zombieManager.pendingCount != null ? zombieManager.pendingCount : 0),
  );
  if (audio) {
    audio.win();
    audio.stopAmbient();
  }
  hud.showWin({ score, kills, wave }, startGame);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    zombieManager.setFrozen(true);
    hud.showPaused(true);
  } else if (state === 'paused') {
    state = 'playing';
    zombieManager.setFrozen(false);
    hud.showPaused(false);
  }
}

function onBite(damage) {
  if (state !== 'playing') return;
  const died = player.takeDamage(damage);
  if (audio) audio.bite();
  hud.damageFlash();
  hud.setHp(player.hp, player.maxHp);
  if (died) gameOver();
}

function onKill(result, zombiePos) {
  score += result.score;
  kills += 1;
  hud.setScore(score);
  const label = result.type === 'brute' ? 'Brute' : result.type === 'runner' ? 'Runner' : 'Walker';
  hud.addFeed(
    result.headshot ? `Headshot! ${label} +${result.score}` : `${label} down +${result.score}`,
  );
  // Brutes sometimes drop a pickup (health or ammo).
  if (result.type === 'brute' && Math.random() < CONFIG.pickups.bruteDropChance) {
    spawnPickup(zombiePos, Math.random() < 0.5 ? 'health' : 'ammo');
  }
}

// Pause keys: Esc / P. Ignore repeats from a held key.
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- the exposed game object (also used by shots.js) ----------------------
const game = {
  get state() {
    return state;
  },
  startGame,
  zombieManager,
  player,
  weapons,
  hud,
  world,
  input,
  audio,
  camera,
  get score() {
    return score;
  },
  setScore(v) {
    score = v;
    hud.setScore(score);
  },
  get kills() {
    return kills;
  },
  get wave() {
    return wave;
  },
  forceGameOver(stats) {
    // Shots pass display stats (score/wave/kills); apply them so the
    // game-over screen shows them instead of the reset run values.
    if (stats) {
      if (typeof stats.score === 'number') {
        score = stats.score;
        hud.setScore(score);
      }
      if (typeof stats.kills === 'number') kills = stats.kills;
      if (typeof stats.wave === 'number') wave = stats.wave;
    }
    gameOver();
  },
  forceWin(stats) {
    if (stats) {
      if (typeof stats.score === 'number') {
        score = stats.score;
        hud.setScore(score);
      }
      if (typeof stats.kills === 'number') kills = stats.kills;
      if (typeof stats.wave === 'number') wave = stats.wave;
    }
    winGame();
  },
};
window.__game = game;

// ---- menu -----------------------------------------------------------------
// Register the start screen BEFORE setupShot: a shot may start the game
// immediately, and showStart must not re-cover the screen afterwards.
hud.showStart(() => {
  if (audio) audio.ensure();
  startGame();
});

if (shotParams && shotParams.shot) {
  try {
    setupShot(game, shotParams.shot, shotParams.seed != null ? shotParams.seed : 0);
  } catch (err) {
    console.warn('[deadlight] setupShot failed:', err);
  }
}

// ---- main loop ------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (world && typeof world.update === 'function') world.update(dt, elapsed);

  if (state === 'menu') {
    // Slow orbit around the outpost while the start screen is up.
    menuAngle += dt * 0.1;
    camera.position.set(Math.cos(menuAngle) * 26, 17, Math.sin(menuAngle) * 26);
    camera.lookAt(0, 1, 0);
    zombieManager.setFrozen(true);
  } else if (state === 'playing' || state === 'paused') {
    computeAimPoint();

    if (state === 'playing') {
      player.update(dt, input, world, aimPoint);
      weapons.update(dt);

      // Hold mouse to fire from the muzzle toward the aim point.
      if (input.mouse.down) {
        const fwd = new THREE.Vector3(
          Math.sin(player.group.rotation.y),
          0,
          Math.cos(player.group.rotation.y),
        );
        const origin = player.position
          .clone()
          .addScaledVector(fwd, 0.9);
        origin.y = 1.35;
        const result = weapons.tryFire(origin, aimPoint);
        if (result && result.killed) {
          // The kill position is the shot's impact point on the ground.
          const zp = result.point
            ? { x: result.point.x, z: result.point.z }
            : { x: player.position.x, z: player.position.z };
          onKill(result, zp);
        }
      }

      // R reload (edge-triggered).
      const rDown = input.isDown('KeyR');
      if (rDown && !prevR) weapons.reload();
      prevR = rDown;

      zombieManager.update(dt, player.position, onBite);
      updatePickups(dt, elapsed);

      // Wave cleared: all spawned zombies dead and none queued.
      if (waveActive) {
        const pending = zombieManager.pendingCount != null ? zombieManager.pendingCount : 0;
        if (zombieManager.aliveCount() === 0 && pending === 0) {
          waveActive = false;
          const bonus = wave * 250;
          score += bonus;
          hud.setScore(score);
          if (wave >= CONFIG.waves.total) {
            winGame();
          } else {
            hud.banner('WAVE CLEAR', `Wave bonus +${bonus}`);
            hud.addFeed(`Wave ${wave} clear — bonus +${bonus}`);
            betweenTimer = CONFIG.waves.betweenWaves;
          }
        }
      } else if (wave > 0 && wave < CONFIG.waves.total) {
        betweenTimer -= dt;
        if (betweenTimer <= 0) startWave(wave + 1);
      }
    } else {
      // Paused: freeze the world, keep rendering the scene.
      weapons.update(0);
    }

    // Camera follows the player, biased toward the aim point.
    const camTarget = player.position
      .clone()
      .addScaledVector(
        aimPoint.clone().sub(player.position).setY(0),
        0.2,
      );
    camera.position.set(
      player.position.x,
      24,
      player.position.z + 16,
    );
    camera.lookAt(camTarget.x, 0, camTarget.z);

    hud.setHp(player.hp, player.maxHp);
    hud.setAmmo(weapons.ammo, weapons.reserve, weapons.reloading);
    hud.setZombiesLeft(
      zombieManager.aliveCount() +
        (zombieManager.pendingCount != null ? zombieManager.pendingCount : 0),
    );
    hud.setCrosshair(input.mouse.x, input.mouse.y);
  }

  // Enter / R restarts from menu / game-over / win screens (edge-triggered).
  const enterDown = input.isDown('Enter');
  if (enterDown && !prevEnter) {
    if (state === 'menu' || state === 'over' || state === 'won') startGame();
  }
  prevEnter = enterDown;
  if (state === 'over' || state === 'won') {
    const rDown = input.isDown('KeyR');
    if (rDown && !prevR) startGame();
    prevR = rDown;
  }

  renderer.render(scene, camera);
}

animate();
