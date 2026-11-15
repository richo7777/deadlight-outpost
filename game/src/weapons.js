// weapons.js — the survivor's rifle. Hitscan shooting with a raycast
// against zombie hit meshes and world solids, tracer + muzzle flash +
// impact particles, magazine / reserve ammo and a timed reload.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const TRACER_LIFE = 0.06;
const FLASH_LIFE = 0.04;

export function createWeapons(scene, world, zombieManager, audio) {
  const w = CONFIG.weapon;
  const raycaster = new THREE.Raycaster();
  raycaster.far = w.range;

  const tracers = []; // { line, life }
  const flashes = []; // { sprite, life }
  const particles = []; // { mesh, vel, life }

  const tracerMat = new THREE.LineBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.95,
  });
  const tracerGeo = new THREE.BufferGeometry();
  const flashMat = new THREE.SpriteMaterial({
    color: 0xffc861,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particleGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const particleMats = {
    blood: new THREE.MeshBasicMaterial({ color: 0x8a1f1f }),
    dust: new THREE.MeshBasicMaterial({ color: 0x9a8a6a }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  };

  const weapons = {
    ammo: w.magSize,
    reserve: w.reserveStart,
    magSize: w.magSize,
    reloading: false,
    fireTimer: 0,
    reloadTimer: 0,

    update(dt) {
      if (weapons.fireTimer > 0) weapons.fireTimer -= dt;

      if (weapons.reloading) {
        weapons.reloadTimer -= dt;
        if (weapons.reloadTimer <= 0) {
          const need = weapons.magSize - weapons.ammo;
          const moved = Math.min(need, weapons.reserve);
          weapons.ammo += moved;
          weapons.reserve -= moved;
          weapons.reloading = false;
          if (audio) audio.reloadDone();
        }
      }

      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        const t = tracers[i];
        t.life -= dt;
        t.line.material.opacity = Math.max(0, (t.life / TRACER_LIFE) * 0.9);
        if (t.life <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
          t.line.material.dispose();
          tracers.splice(i, 1);
        }
      }

      for (let i = flashes.length - 1; i >= 0; i -= 1) {
        const f = flashes[i];
        f.life -= dt;
        f.sprite.material.opacity = Math.max(0, f.life / FLASH_LIFE);
        const s = 0.55 + (1 - Math.max(0, f.life / FLASH_LIFE)) * 0.4;
        f.sprite.scale.set(s, s, 1);
        if (f.life <= 0) {
          scene.remove(f.sprite);
          f.sprite.material.dispose();
          flashes.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        p.vel.y -= 9.8 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.45));
        if (p.life <= 0 || p.mesh.position.y < 0.02) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
        }
      }
    },

    tryFire(origin, aimPoint) {
      if (weapons.reloading || weapons.fireTimer > 0) return null;
      if (weapons.ammo <= 0) {
        if (audio) audio.dryFire();
        weapons.reload();
        return null;
      }

      weapons.fireTimer = w.fireInterval;
      weapons.ammo -= 1;
      if (audio) audio.shot();

      const dir = new THREE.Vector3()
        .subVectors(aimPoint, origin)
        .normalize();
      // A touch of spread so full-auto is not laser-perfect.
      dir.x += (Math.random() - 0.5) * w.spread * 2;
      dir.y += (Math.random() - 0.5) * w.spread * 2;
      dir.z += (Math.random() - 0.5) * w.spread * 2;
      dir.normalize();

      const muzzle = origin.clone().addScaledVector(dir, 1.0);
      muzzle.y = Math.max(0.4, muzzle.y);
      spawnFlash(muzzle);

      raycaster.set(origin, dir);

      // Targets: every living zombie's body/head meshes, then world solids.
      const targets = [];
      if (zombieManager && zombieManager.zombies) {
        for (const z of zombieManager.zombies) {
          if (z.alive && z.hitMeshes) targets.push(...z.hitMeshes);
        }
      }
      const solids = (world && world.solids) || [];
      const hits = raycaster.intersectObjects([...targets, ...solids], false);

      const farPoint = origin.clone().addScaledVector(dir, w.range);
      let endPoint = farPoint;
      let result = { hit: false, killed: false, headshot: false, type: null, score: 0 };

      if (hits.length > 0) {
        const hit = hits[0];
        endPoint = hit.point.clone();
        const mesh = hit.object;
        const zombie = mesh.userData && mesh.userData.zombie;
        if (zombie && zombie.alive) {
          const headshot = mesh.userData.part === 'head';
          const damage = w.damage * (headshot ? w.headshot : 1);
          const killed = zombie.takeDamage ? zombie.takeDamage(damage) : false;
          spawnParticles(endPoint, 'blood', 10);
          if (audio) audio.hit();
          result = {
            hit: true,
            killed,
            headshot,
            type: zombie.type,
            score: killed ? zombie.score : 0,
            point: endPoint,
          };
          if (killed && audio) audio.kill();
        } else {
          // Solid cover / ground: spark + dust, no damage.
          spawnParticles(endPoint, 'spark', 5);
          spawnParticles(endPoint, 'dust', 4);
          result = { hit: true, killed: false, headshot: false, type: null, score: 0, point: endPoint, blocked: true };
        }
      } else {
        // Clean miss: dust where the round lands at max range.
        const ground = farPoint.clone();
        ground.y = Math.max(0.05, ground.y);
        spawnParticles(ground, 'dust', 5);
      }

      spawnTracer(muzzle, endPoint);
      return result;
    },

    reload() {
      if (weapons.reloading) return;
      if (weapons.reserve <= 0 || weapons.ammo >= weapons.magSize) return;
      weapons.reloading = true;
      weapons.reloadTimer = w.reloadTime;
      if (audio) audio.reloadStart();
    },

    addAmmo(n) {
      weapons.ammo = Math.min(weapons.magSize, weapons.ammo + n);
    },

    addReserve(n) {
      weapons.reserve += n;
    },
  };

  function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = tracerMat.clone();
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: TRACER_LIFE });
  }

  function spawnFlash(pos) {
    const sprite = new THREE.Sprite(flashMat.clone());
    sprite.position.copy(pos);
    sprite.scale.set(0.55, 0.55, 1);
    scene.add(sprite);
    flashes.push({ sprite, life: FLASH_LIFE });
  }

  function spawnParticles(pos, kind, count) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(particleGeo, particleMats[kind] || particleMats.dust);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 0.5,
        (Math.random() - 0.5) * 4,
      );
      scene.add(mesh);
      particles.push({ mesh, vel, life: 0.35 + Math.random() * 0.15 });
    }
  }

  return weapons;
}
