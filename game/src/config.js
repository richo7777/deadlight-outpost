// Deadlight Outpost — central tuning. Plain data only, no logic.
export const CONFIG = {
  world: {
    half: 30,
    fenceHalf: 32,
  },
  camera: {
    height: 24,
    back: 16,
    fov: 55,
  },
  player: {
    speed: 7.5,
    sprint: 1.45,
    radius: 0.55,
    maxHp: 100,
  },
  weapon: {
    damage: 34,
    headshot: 2,
    fireInterval: 0.13,
    magSize: 30,
    reserveStart: 120,
    reloadTime: 1.4,
    range: 70,
    spread: 0.015,
  },
  zombies: {
    walker: { hp: 40, speed: 2.2, damage: 8, score: 100, scale: 1.0, color: 0x8aa864 },
    runner: { hp: 25, speed: 4.6, damage: 6, score: 150, scale: 0.95, color: 0xc2a24a },
    brute: { hp: 170, speed: 1.5, damage: 20, score: 300, scale: 1.4, color: 0x6a8a9a },
  },
  waves: {
    total: 10,
    baseCount: 5,
    perWave: 4,
    spawnInterval: 0.6,
    betweenWaves: 4,
  },
  pickups: {
    healthAmount: 30,
    ammoAmount: 60,
    bruteDropChance: 0.6,
  },
};
