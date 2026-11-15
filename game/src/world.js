// Deadlight Outpost — night world: fenced outpost, floodlights, moon, fog.
// Builds the static scene once; update() only animates light flicker and fog.
//
// Contract: createWorld(scene) returns
//   { obstacles, solids, spawnPoints, bounds, playerStart, update }
//   obstacles: [{ x, z, r }] circle colliders (player + zombies + pickups use these)
//   solids:    [meshes] used for weapon raycasts
//   spawnPoints: 8 points near the edges where zombies enter
//   bounds: 30 (playable half-extent), playerStart: { x: 0, z: 8 }

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mulberry32 } from './random.js';
import {
  makeGroundTexture,
  makeCrateTexture,
  makeSandbagTexture,
  makeFenceTexture,
  makeGlowTexture,
} from './textures.js';

const BOUNDS = CONFIG.world.bounds ?? CONFIG.world.half;
const FENCE = CONFIG.world.fenceHalf;

export function createWorld(scene) {
  const obstacles = [];
  const solids = [];

  // ---- Night sky, fog, moon, stars -------------------------------------
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x0a1220, 0.02);

  const glowTex = makeGlowTexture();

  // Moon: a pale emissive disc far away, plus a soft halo sprite.
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(4, 32),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }),
  );
  moon.position.set(-38, 36, -58);
  moon.lookAt(0, 6, 0);
  scene.add(moon);

  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x9fb4e8, transparent: true, opacity: 0.35,
    depthWrite: false, fog: false,
  }));
  moonGlow.position.copy(moon.position);
  moonGlow.scale.set(22, 22, 1);
  scene.add(moonGlow);

  // Stars: ~300 points on a high dome, deterministic placement.
  const starRng = mulberry32(20261116);
  const starCount = 300;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = starRng() * Math.PI * 2;
    const phi = starRng() * Math.PI * 0.42; // upper dome only
    const r = 75 + starRng() * 15;
    starPos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    starPos[i * 3 + 1] = 10 + Math.cos(phi) * r * 0.7;
    starPos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcdd8ff, size: 0.55, sizeAttenuation: true,
    transparent: true, opacity: 0.85, fog: false,
  }));
  scene.add(stars);

  // ---- Lights (perf budget: max 3 SpotLights + 1 Directional + Ambient) --
  const ambient = new THREE.AmbientLight(0x2a3648, 0.85);
  scene.add(ambient);

  const moonLight = new THREE.DirectionalLight(0x8fb0ff, 0.6);
  moonLight.position.set(-30, 45, -25);
  scene.add(moonLight);

  // ---- Ground ------------------------------------------------------------
  const groundTex = makeGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ---- Perimeter fence at +/-32 ------------------------------------------
  const fenceTex = makeFenceTexture();
  fenceTex.repeat.set(16, 1);
  const fenceMat = new THREE.MeshStandardMaterial({
    map: fenceTex, transparent: true, side: THREE.DoubleSide,
    color: 0x9aa4ae, metalness: 0.6, roughness: 0.5,
  });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.7, roughness: 0.45 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.7, roughness: 0.5 });

  function addFenceWall(x, z, rotY) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(64.4, 2.8, 0.16), fenceMat);
    wall.position.set(x, 1.4, z);
    wall.rotation.y = rotY;
    scene.add(wall);
    solids.push(wall);
    // Top rail.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(64.4, 0.12, 0.2), railMat);
    rail.position.set(x, 2.85, z);
    rail.rotation.y = rotY;
    scene.add(rail);
  }
  addFenceWall(0, -FENCE, 0);
  addFenceWall(0, FENCE, 0);
  addFenceWall(-FENCE, 0, Math.PI / 2);
  addFenceWall(FENCE, 0, Math.PI / 2);

  // Fence posts every 8 units along each side.
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.1, 8);
  for (let i = -32; i <= 32; i += 8) {
    for (const [x, z] of [[i, -FENCE], [i, FENCE], [-FENCE, i], [FENCE, i]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 1.55, z);
      scene.add(post);
    }
  }

  // ---- Floodlight poles at the four inner corners ------------------------
  // Only 3 of the 4 lamps carry a real SpotLight (perf budget);
  // the 4th is emissive + glow sprite only.
  const lampPositions = [
    { x: -26, z: -26, lit: true },
    { x: 26, z: -26, lit: true },
    { x: -26, z: 26, lit: true },
    { x: 26, z: 26, lit: false },
  ];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2e343c, metalness: 0.7, roughness: 0.45 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x333333, emissive: 0xffd27a, emissiveIntensity: 2.2,
  });
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 7, 8);
  const headGeo = new THREE.BoxGeometry(0.9, 0.45, 0.6);
  const spotlights = [];

  for (const lamp of lampPositions) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(lamp.x, 3.5, lamp.z);
    scene.add(pole);
    solids.push(pole);

    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(lamp.x, 7.1, lamp.z);
    // Aim the head toward the centre of the outpost.
    head.lookAt(0, 0, 0);
    scene.add(head);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffd27a, transparent: true, opacity: 0.85,
      depthWrite: false,
    }));
    glow.position.set(lamp.x, 7.1, lamp.z);
    glow.scale.set(5, 5, 1);
    scene.add(glow);

    if (lamp.lit) {
      const spot = new THREE.SpotLight(0xffc978, 520, 55, 0.55, 0.6, 1.2);
      spot.position.set(lamp.x, 7.1, lamp.z);
      // Target a point part-way toward the centre so the cone washes the yard.
      spot.target.position.set(lamp.x * 0.45, 0, lamp.z * 0.45);
      scene.add(spot);
      scene.add(spot.target);
      spotlights.push(spot);
    }

    obstacles.push({ x: lamp.x, z: lamp.z, r: 0.4 });
  }
  // The flickering lamp is the third (south-west) spotlight.
  const flickerSpot = spotlights[2];
  const flickerBase = flickerSpot.intensity;

  // ---- Watchtower (north-east yard, clear of lamps and spawns) ----------
  const towerX = 20;
  const towerZ = -20;
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 0.9, metalness: 0 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9, metalness: 0 });
  const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 5, 8);
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(towerX + dx, 2.5, towerZ + dz);
    scene.add(leg);
    solids.push(leg);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 4.6), woodMat);
  platform.position.set(towerX, 5.05, towerZ);
  scene.add(platform);
  solids.push(platform);
  // Railing.
  for (const [x, z, w, d] of [
    [towerX, towerZ - 2.2, 4.6, 0.08], [towerX, towerZ + 2.2, 4.6, 0.08],
    [towerX - 2.2, towerZ, 0.08, 4.6], [towerX + 2.2, towerZ, 0.08, 4.6],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), woodDark);
    rail.position.set(x, 5.65, z);
    scene.add(rail);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.0, 3.4), woodDark);
  cabin.position.set(towerX, 6.2, towerZ);
  scene.add(cabin);
  solids.push(cabin);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.1, 1.4, 4),
    new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.8, metalness: 0.3 }),
  );
  roof.position.set(towerX, 7.9, towerZ);
  roof.rotation.y = Math.PI / 4;
  scene.add(roof);
  // Small warm lamp inside the cabin so the tower reads at night.
  const cabinLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc978, emissiveIntensity: 1.6 }),
  );
  cabinLamp.position.set(towerX, 6.4, towerZ + 1.75);
  scene.add(cabinLamp);
  obstacles.push({ x: towerX, z: towerZ, r: 2.4 });

  // ---- Crates -------------------------------------------------------------
  const crateTex = makeCrateTexture();
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85, metalness: 0 });
  const crateSpots = [
    { x: -12, z: -14, s: 1.4 }, { x: -10.4, z: -13.2, s: 1.1 },
    { x: -11.2, z: -15.2, s: 1.0, y: 1.35 },
    { x: 12, z: 14, s: 1.4 }, { x: 13.6, z: 14.4, s: 1.1 },
    { x: -16, z: 10, s: 1.3 }, { x: 16, z: -12, s: 1.3 },
    { x: 8, z: -18, s: 1.2 }, { x: -6, z: 18, s: 1.2 },
    { x: 18, z: 4, s: 1.1 }, { x: -20, z: -6, s: 1.2 },
  ];
  for (const c of crateSpots) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.s, c.s), crateMat);
    crate.position.set(c.x, (c.y ?? 0) + c.s / 2, c.z);
    crate.rotation.y = (c.x * 0.37 + c.z * 0.53) % 0.9;
    scene.add(crate);
    solids.push(crate);
    if (!c.y) obstacles.push({ x: c.x, z: c.z, r: c.s * 0.75 });
  }

  // ---- Barrels ------------------------------------------------------------
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.15, 14);
  const barrelMats = [
    new THREE.MeshStandardMaterial({ color: 0x5a3a2e, metalness: 0.6, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x2e4a3a, metalness: 0.6, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x4a4a52, metalness: 0.6, roughness: 0.5 }),
  ];
  const barrelSpots = [
    { x: -8, z: -20 }, { x: -6.8, z: -19.2 }, { x: 10, z: 20 },
    { x: -18, z: 18 }, { x: 22, z: 10 }, { x: 4, z: -22 },
  ];
  barrelSpots.forEach((b, i) => {
    const barrel = new THREE.Mesh(barrelGeo, barrelMats[i % barrelMats.length]);
    barrel.position.set(b.x, 0.58, b.z);
    scene.add(barrel);
    solids.push(barrel);
    obstacles.push({ x: b.x, z: b.z, r: 0.7 });
  });

  // ---- Sandbag walls (low cover) ------------------------------------------
  const sandTex = makeSandbagTexture();
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, metalness: 0 });
  const sandSpots = [
    { x: -5, z: -6, rot: 0.4 }, { x: 5, z: 9, rot: -0.3 },
    { x: 0, z: -16, rot: 0.1 }, { x: -14, z: 2, rot: 1.2 },
    { x: 14, z: -4, rot: -1.1 },
  ];
  for (const s of sandSpots) {
    const bags = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 1.1), sandMat);
    bags.position.set(s.x, 0.48, s.z);
    bags.rotation.y = s.rot;
    scene.add(bags);
    solids.push(bags);
    obstacles.push({ x: s.x, z: s.z, r: 1.8 });
  }

  // ---- Spawn points: 8, near the edges, clear of lamps / tower / cover ----
  const spawnPoints = [
    { x: -28, z: -14 }, { x: 28, z: -14 },
    { x: -28, z: 14 }, { x: 28, z: 14 },
    { x: -14, z: -28 }, { x: 14, z: -28 },
    { x: -14, z: 28 }, { x: 14, z: 28 },
  ];

  // ---- Per-frame animation: lamp flicker + slow fog / moon-glow drift ----
  function update(dt, elapsed) {
    // One floodlight flickers subtly: mostly steady, with rare brief dips.
    const dip = Math.sin(elapsed * 43.7) > 0.985 ? -0.35 : 0;
    flickerSpot.intensity = flickerBase * (0.92 + 0.08 * Math.sin(elapsed * 11.3) + dip);
    // Fog breathes slowly; moon halo pulses even more slowly.
    if (scene.fog && scene.fog.isFogExp2) {
      scene.fog.density = 0.02 + 0.003 * Math.sin(elapsed * 0.23);
    }
    moonGlow.material.opacity = 0.32 + 0.06 * Math.sin(elapsed * 0.5);
  }

  return {
    obstacles,
    solids,
    spawnPoints,
    bounds: BOUNDS,
    playerStart: { x: 0, z: 8 },
    update,
  };
}
