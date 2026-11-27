import { LandscapeTerrain } from './landscape.js';

export const FLAT_PRESETS = [
  { name: 'Garden foundation', biome: 1, layers: [{ id: 7, count: 1 }, { id: 1, count: 28 }, { id: 3, count: 3 }, { id: 2, count: 1 }] },
  { name: 'Stone workshop', biome: 1, layers: [{ id: 7, count: 1 }, { id: 1, count: 46 }, { id: 98, count: 1 }] },
  { name: 'Sandstone foundation', biome: 2, layers: [{ id: 7, count: 1 }, { id: 1, count: 20 }, { id: 24, count: 10 }, { id: 12, count: 3 }] },
  { name: 'Shallow reservoir', biome: 0, layers: [{ id: 7, count: 1 }, { id: 1, count: 28 }, { id: 13, count: 3 }, { id: 9, count: 8 }] },
];

export function flatSettings(input = FLAT_PRESETS[0]) {
  if (!input || !Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > 32) {
    throw new Error('Add between 1 and 32 layers.');
  }
  const layers = input.layers.map(({ id, count, metadata = 0 }) => {
    if (!Number.isInteger(id) || id < 0 || id > 197 ||
        !Number.isInteger(metadata) || metadata < 0 || metadata > 15 ||
        !Number.isInteger(count) || count < 1 || count > 256) {
      throw new Error('Each layer needs a block ID (0–197), metadata (0–15), and thickness (1–256).');
    }
    return { id, metadata, count };
  });
  if (layers.reduce((height, layer) => height + layer.count, 0) > 256) {
    throw new Error('The combined layers must fit within 256 blocks.');
  }
  const biome = input.biome ?? 1;
  if (!Number.isInteger(biome) || biome < 0 || biome > 255) throw new Error('Biome ID must be 0–255.');
  return { biome, layers };
}

export class LayeredFlatTerrain extends LandscapeTerrain {
  constructor(seed, config, edits = []) {
    super(seed, { worldType: 'flat', starterMaterials: false }, edits);
    this.flat = flatSettings(config);
    this.solidHeight = 0;
    this.height = 0;
    this.vertical = new Uint16Array(256);
    for (const layer of this.flat.layers) {
      const state = (layer.id << 4) | layer.metadata;
      this.vertical.fill(state, this.height, this.height + layer.count);
      this.height += layer.count;
      if (layer.id !== 0 && ![8, 9, 10, 11].includes(layer.id)) this.solidHeight = this.height;
    }
    let top = 255;
    while (top > 0 && this.vertical[top] === 0) top--;
    this.top = top;
  }

  sample() {
    return { height: this.top, top: this.vertical[this.top], soil: 0, biome: this.flat.biome, cover: 0 };
  }

  generate() {
    const states = new Uint16Array(65536);
    for (let y = 0; y < 256; y++) states.fill(this.vertical[y], y * 256, (y + 1) * 256);
    return { states, biomes: new Uint8Array(256).fill(this.flat.biome) };
  }

  spawn() {
    return { x: 0.5, y: this.height || 64, z: 0.5, yaw: 0, pitch: 0 };
  }
}
