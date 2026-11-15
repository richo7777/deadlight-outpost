// player.js — the survivor. Original low-poly survivor built from
// three.js primitives: capsule torso, head + helmet, boxy rifle, swinging
// arms and legs. Movement is world-aligned (W = world -Z).

import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createPlayer(scene) {
  const cfg = CONFIG.player;
  let hp = cfg.maxHp;
  let walkPhase = 0;
  let moving = false;

  const group = new THREE.Group();

  const jacket = new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.5, metalness: 0.35 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.6 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });

  // Torso (capsule, chest height ~1.15) + vest plate.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 6, 12), jacket);
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.16), vestMat);
  vest.position.set(0, 1.22, 0.3);
  group.add(vest);

  // Head + helmet brim.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
  helmet.position.y = 1.84;
  group.add(helmet);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), helmetMat);
  brim.position.y = 1.86;
  group.add(brim);

  // Arms: pivots at the shoulders so they can swing while walking.
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.42 * side, 1.5, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), jacket);
    arm.position.y = -0.28;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), skin);
    hand.position.y = -0.6;
    pivot.add(hand);
    group.add(pivot);
    return pivot;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Legs: pivots at the hips.
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.18 * side, 0.82, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.2), pants);
    leg.position.y = -0.39;
    leg.castShadow = true;
    pivot.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), gunMat);
    boot.position.set(0, -0.78, 0.06);
    pivot.add(boot);
    group.add(pivot);
    return pivot;
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // Rifle held across the front, pointing along the group's +Z (its facing).
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.85), gunMat);
  barrel.position.set(0, 0, 0.35);
  barrel.castShadow = true;
  gun.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.3), gunMat);
  stock.position.set(0, -0.02, -0.12);
  gun.add(stock);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), gunMat);
  grip.position.set(0, -0.12, 0.05);
  grip.rotation.x = 0.35;
  gun.add(grip);
  gun.position.set(0.22, 1.28, 0.42);
  group.add(gun);

  // Right arm stays near the rifle grip; the left arm steadies the barrel.
  rightArm.rotation.x = -1.1;
  leftArm.rotation.x = -1.25;
  leftArm.rotation.z = 0.35;

  group.position.set(0, 0, 8);
  scene.add(group);

  const player = {
    group,
    get position() {
      return group.position;
    },
    get hp() {
      return hp;
    },
    set hp(v) {
      hp = Math.max(0, Math.min(cfg.maxHp, v));
    },
    maxHp: cfg.maxHp,
    radius: cfg.radius,
    speed: cfg.speed,
    get alive() {
      return hp > 0;
    },
    gun,

    update(dt, input, world, aimPoint) {
      // World-aligned WASD: W = -Z, S = +Z, A = -X, D = +X.
      let mx = 0;
      let mz = 0;
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz -= 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz += 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;

      moving = mx !== 0 || mz !== 0;
      if (moving) {
        const len = Math.hypot(mx, mz);
        mx /= len;
        mz /= len;
        const sprinting =
          input.isDown('ShiftLeft') || input.isDown('ShiftRight');
        const speed = cfg.speed * (sprinting ? cfg.sprint : 1);
        group.position.x += mx * speed * dt;
        group.position.z += mz * speed * dt;
      }

      // Clamp inside the arena.
      const half = CONFIG.world.half - cfg.radius;
      group.position.x = Math.max(-half, Math.min(half, group.position.x));
      group.position.z = Math.max(-half, Math.min(half, group.position.z));

      // Push out of obstacle circles.
      if (world && world.obstacles) {
        for (const o of world.obstacles) {
          const dx = group.position.x - o.x;
          const dz = group.position.z - o.z;
          const minDist = o.r + cfg.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < minDist * minDist && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            group.position.x = o.x + (dx / d) * minDist;
            group.position.z = o.z + (dz / d) * minDist;
          }
        }
      }

      // Face the aim point (group forward is +Z).
      if (aimPoint) {
        const dx = aimPoint.x - group.position.x;
        const dz = aimPoint.z - group.position.z;
        if (dx * dx + dz * dz > 0.0001) {
          group.rotation.y = Math.atan2(dx, dz);
        }
      }

      // Simple walk cycle: swing legs, bob the torso, keep arms on the rifle.
      if (moving) {
        walkPhase += dt * 11;
        const swing = Math.sin(walkPhase) * 0.55;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        leftArm.rotation.x = -1.25 + Math.sin(walkPhase) * 0.12;
        rightArm.rotation.x = -1.1 - Math.sin(walkPhase) * 0.12;
        body.position.y = 1.15 + Math.abs(Math.sin(walkPhase)) * 0.05;
      } else {
        walkPhase = 0;
        leftLeg.rotation.x *= 0.85;
        rightLeg.rotation.x *= 0.85;
        leftArm.rotation.x += (-1.25 - leftArm.rotation.x) * 0.2;
        rightArm.rotation.x += (-1.1 - rightArm.rotation.x) * 0.2;
        body.position.y += (1.15 - body.position.y) * 0.2;
      }
    },

    takeDamage(amount) {
      hp = Math.max(0, hp - amount);
      return hp <= 0;
    },

    heal(amount) {
      hp = Math.min(cfg.maxHp, hp + amount);
      return hp;
    },
  };

  return player;
}
