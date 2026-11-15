// zombies.js — zombie manager for Deadlight Outpost.
// Original boxy humanoids (torso, head, arms stretched forward, legs) with
// red emissive eyes and a per-type skin colour from CONFIG. Zombies chase
// the player, bite at close range, keel over when killed and sink away.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const EYE_MAT = new THREE.MeshStandardMaterial({
  color: 0x330000,
  emissive: 0xff2211,
  emissiveIntensity: 2.2,
});

export function createZombieManager(scene, world, rng, audio = null) {
  // rng may be a function, an object with .next(), or absent.
  function rand() {
    if (typeof rng === 'function') return rng();
    if (rng && typeof rng.next === 'function') return rng.next();
    if (rng && typeof rng.random === 'function') return rng.random();
    return Math.random();
  }
  function pick(arr) {
    return arr[Math.floor(rand() * arr.length) % arr.length];
  }

  const zombies = [];
  const spawnQueue = [];
  let spawnTimer = 0;
  let spawnedCount = 0;
  let killedCount = 0;
  let frozen = false;

  const sharedGeo = {
    body: new THREE.BoxGeometry(0.72, 0.85, 0.4),
    head: new THREE.BoxGeometry(0.42, 0.42, 0.42),
    arm: new THREE.BoxGeometry(0.16, 0.16, 0.85),
    leg: new THREE.BoxGeometry(0.22, 0.7, 0.22),
    eye: new THREE.BoxGeometry(0.07, 0.07, 0.04),
  };

  function buildZombie(type, cfg, spawn) {
    const scale = cfg.scale || 1;
    const group = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.9,
    });
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0x4a3a3a,
      roughness: 0.95,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.95,
    });

    // Torso.
    const body = new THREE.Mesh(sharedGeo.body, clothMat);
    body.position.y = 1.05 * scale;
    body.castShadow = true;
    body.userData.part = 'body';
    group.add(body);

    // Head.
    const head = new THREE.Mesh(sharedGeo.head, skinMat);
    head.position.y = 1.72 * scale;
    head.castShadow = true;
    head.userData.part = 'head';
    group.add(head);

    // Red emissive eyes on the front (+Z) face of the head.
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(sharedGeo.eye, EYE_MAT);
      eye.position.set(0.11 * side, 1.76 * scale, 0.22 * scale);
      group.add(eye);
    }

    // Arms stretched forward toward the player (+Z), slight droop.
    const arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(sharedGeo.arm, skinMat);
      arm.position.set(0.46 * side * scale, 1.32 * scale, 0.42 * scale);
      arm.rotation.x = -0.12;
      arm.castShadow = true;
      group.add(arm);
      arms.push(arm);
    }

    // Legs.
    const legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.18 * side * scale, 0.72 * scale, 0);
      const leg = new THREE.Mesh(sharedGeo.leg, darkMat);
      leg.position.y = -0.33 * scale;
      leg.castShadow = true;
      pivot.add(leg);
      group.add(pivot);
      legs.push(pivot);
    }

    group.scale.setScalar(scale);
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);

    const zombie = {
      group,
      get position() {
        return group.position;
      },
      hp: cfg.hp,
      maxHp: cfg.hp,
      speed: cfg.speed,
      damage: cfg.damage,
      type,
      score: cfg.score,
      radius: 0.55 * scale,
      alive: true,
      dying: false,
      deathTimer: 0,
      attackCooldown: 0,
      walkPhase: rand() * Math.PI * 2,
      hitMeshes: [body, head],
      bodyMesh: body,
      headMesh: head,
      arms,
      legs,
      skinMat,
      flashTimer: 0,
      takeDamage(amount) {
        if (!zombie.alive) return false;
        zombie.hp -= amount;
        zombie.flashTimer = 0.08;
        if (zombie.hp <= 0) {
          zombie.alive = false;
          zombie.dying = true;
          zombie.deathTimer = 0;
          killedCount += 1;
          return true;
        }
        return false;
      },
    };

    body.userData.zombie = zombie;
    head.userData.zombie = zombie;
    group.userData.zombie = zombie;
    zombies.push(zombie);
    spawnedCount += 1;
    return zombie;
  }

  function spawnOne(type) {
    const cfg = CONFIG.zombies[type] || CONFIG.zombies.walker;
    let spawn = null;
    if (world && world.spawnPoints && world.spawnPoints.length > 0) {
      spawn = pick(world.spawnPoints);
    } else {
      // Fallback: ring near the arena edge, away from the player start.
      const a = rand() * Math.PI * 2;
      const r = CONFIG.world.half - 3;
      spawn = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }
    const z = buildZombie(type, cfg, spawn);
    if (audio && rand() < 0.35) {
      try {
        audio.groan();
      } catch (_) {
        /* audio is best-effort */
      }
    }
    return z;
  }

  return {
    zombies,
    get spawnedCount() {
      return spawnedCount;
    },
    get killedCount() {
      return killedCount;
    },
    // Zombies still queued to spawn for the current wave.
    get pendingCount() {
      return spawnQueue.length;
    },

    aliveCount() {
      let n = 0;
      for (const z of zombies) if (z.alive) n += 1;
      return n;
    },

    spawnWave(n) {
      const w = CONFIG.waves;
      const count = w.baseCount + n * w.perWave;
      const queue = [];
      let brutes = 0;
      if (n >= 3) brutes = 1 + Math.floor((n - 3) / 3);
      for (let i = 0; i < count; i += 1) {
        if (brutes > 0 && i % 5 === 4) {
          queue.push('brute');
          brutes -= 1;
        } else if (n >= 2 && rand() < 0.25) {
          queue.push('runner');
        } else {
          queue.push('walker');
        }
      }
      // Any brutes not placed by the stride rule go at the end.
      while (brutes > 0) {
        queue.push('brute');
        brutes -= 1;
      }
      // Shuffle the queue (Fisher-Yates with the seeded rng).
      for (let i = queue.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const t = queue[i];
        queue[i] = queue[j];
        queue[j] = t;
      }
      spawnQueue.push(...queue);
      spawnTimer = 0;
    },

    // Spawn everything still queued, immediately (used by the 'play'
    // screenshot setup so the horde is visible before the freeze).
    flushQueue() {
      while (spawnQueue.length > 0) spawnOne(spawnQueue.shift());
    },

    update(dt, playerPos, onBite) {
      // Drip-feed the spawn queue.
      if (!frozen && spawnQueue.length > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnOne(spawnQueue.shift());
          spawnTimer = CONFIG.waves.spawnInterval;
        }
      }

      for (let i = zombies.length - 1; i >= 0; i -= 1) {
        const z = zombies[i];

        // Dying: keel over, then sink and disappear after 1.2 s.
        if (z.dying) {
          z.deathTimer += dt;
          const t = Math.min(1, z.deathTimer / 0.35);
          z.group.rotation.x = -Math.PI * 0.5 * t;
          if (z.deathTimer > 0.7) {
            z.group.position.y -= dt * 1.2;
          }
          if (z.deathTimer >= 1.2) {
            scene.remove(z.group);
            zombies.splice(i, 1);
          }
          continue;
        }
        if (!z.alive) continue;

        // Hit flash fades back to the type colour.
        if (z.flashTimer > 0) {
          z.flashTimer -= dt;
          z.skinMat.emissive.setHex(0x881111);
          z.skinMat.emissiveIntensity = z.flashTimer > 0 ? 0.9 : 0;
          if (z.flashTimer <= 0) z.skinMat.emissiveIntensity = 0;
        }

        if (frozen) continue;

        z.attackCooldown -= dt;

        const dx = playerPos.x - z.group.position.x;
        const dz = playerPos.z - z.group.position.z;
        const dist = Math.hypot(dx, dz) || 0.0001;
        const nx = dx / dist;
        const nz = dz / dist;

        // Face the player.
        z.group.rotation.y = Math.atan2(dx, dz);

        // Bite when close enough.
        if (dist < z.radius + 0.9) {
          if (z.attackCooldown <= 0) {
            z.attackCooldown = 0.9;
            if (onBite) onBite(z.damage, z);
          }
        } else {
          // Chase, sliding tangentially around obstacle circles.
          const step = z.speed * dt;
          let tx = nx * step;
          let tz = nz * step;
          if (world && world.obstacles) {
            for (const o of world.obstacles) {
              const ox = z.group.position.x + tx - o.x;
              const oz = z.group.position.z + tz - o.z;
              const minDist = o.r + z.radius;
              if (ox * ox + oz * oz < minDist * minDist) {
                // Tangential slide: keep the component perpendicular to
                // the obstacle radius, drop the inward radial component.
                const od = Math.hypot(ox, oz) || 0.0001;
                const rx = ox / od;
                const rz = oz / od;
                const dot = tx * rx + tz * rz;
                if (dot < 0) {
                  tx -= dot * rx;
                  tz -= dot * rz;
                }
                // Nudge out of the circle so it does not stick.
                const px = z.group.position.x - o.x;
                const pz = z.group.position.z - o.z;
                const pd = Math.hypot(px, pz) || 0.0001;
                if (pd < minDist) {
                  z.group.position.x = o.x + (px / pd) * minDist;
                  z.group.position.z = o.z + (pz / pd) * minDist;
                }
              }
            }
          }
          z.group.position.x += tx;
          z.group.position.z += tz;
          // Keep inside the arena.
          const half = CONFIG.world.half - z.radius;
          z.group.position.x = Math.max(-half, Math.min(half, z.group.position.x));
          z.group.position.z = Math.max(-half, Math.min(half, z.group.position.z));
        }

        // Shamble: legs swing, arms bob slightly.
        z.walkPhase += dt * (z.type === 'runner' ? 11 : 6);
        const swing = Math.sin(z.walkPhase) * 0.5;
        z.legs[0].rotation.x = swing;
        z.legs[1].rotation.x = -swing;
        z.arms[0].position.y = 1.32 + Math.sin(z.walkPhase) * 0.04;
        z.arms[1].position.y = 1.32 - Math.sin(z.walkPhase) * 0.04;
      }
    },

    clear() {
      for (const z of zombies) scene.remove(z.group);
      zombies.length = 0;
      spawnQueue.length = 0;
      spawnTimer = 0;
      spawnedCount = 0;
      killedCount = 0;
    },

    setFrozen(f) {
      frozen = !!f;
    },
  };
}
