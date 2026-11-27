export const WORLD_TYPES = ['natural', 'flat', 'highlands', 'wide', 'custom', 'terraces'];

export const WORLD_FEATURES = ['trees', 'lakes', 'caverns', 'landmarks', 'starterMaterials'];

export const TERRAIN_PARAMETERS = [
  { key: 'baseHeight', min: 32, max: 136, defaultValue: 67 },
  { key: 'relief', min: 2, max: 80, defaultValue: 21 },
  { key: 'regionSize', min: 48, max: 512, defaultValue: 112 },
  { key: 'waterLevel', min: 16, max: 112, defaultValue: 62 },
];

export function featureAvailable(worldType, feature) {
  if (feature === 'starterMaterials') return true;
  if (worldType === 'terraces') return false;
  if (worldType === 'flat' && feature === 'lakes') return false;
  return true;
}

export function worldSettings(options = {}) {
  const worldType = options.worldType ?? 'natural';
  if (!WORLD_TYPES.includes(worldType)) throw new Error('Unknown world terrain type.');
  const settings = { worldType };
  for (const feature of WORLD_FEATURES) {
    const value = options[feature];
    if (value !== undefined && typeof value !== 'boolean') throw new Error('Invalid world feature setting.');
    const defaultValue = worldType !== 'flat' || feature === 'starterMaterials';
    settings[feature] = featureAvailable(worldType, feature) && (value ?? defaultValue);
  }
  if (worldType === 'custom') {
    for (const { key, min, max, defaultValue } of TERRAIN_PARAMETERS) {
      const value = options[key] ?? defaultValue;
      if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid custom terrain setting.');
      settings[key] = value;
    }
  }
  return settings;
}

const MIN_SEED = -(1n << 63n);
const MAX_SEED = (1n << 63n) - 1n;

function numericSeed(text) {
  if (!/^[+-]?\d+$/.test(text.trim())) return null;
  const value = BigInt(text.trim());
  return value >= MIN_SEED && value <= MAX_SEED ? value : null;
}

export function randomSeed() {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return BigInt.asIntN(64, (BigInt(words[0]) << 32n) | BigInt(words[1])).toString();
}

export function resolveSeed(input = '') {
  if (typeof input !== 'string' || input.length > 80) throw new Error('Enter a seed of up to 80 characters.');
  if (!input.trim()) return randomSeed();
  const value = numericSeed(input);
  return value === null ? input : value.toString();
}

export function seedWords(text) {
  let value = numericSeed(text);
  if (value === null) {
    // Hash arbitrary Unicode text into a stable, unsigned 64-bit seed.
    value = 0xcbf29ce484222325n;
    for (const char of new TextEncoder().encode(text)) {
      value = BigInt.asUintN(64, (value ^ BigInt(char)) * 0x100000001b3n);
    }
  }
  const unsigned = BigInt.asUintN(64, value);
  return [Number(unsigned & 0xffffffffn), Number(unsigned >> 32n)];
}

export function describeWorld(state) {
  if (state.version === 1) {
    return { worldType: 'terraces', seed: String(state.seed), legacySeed: true };
  }
  if (state.version === 3) {
    return { worldType: worldSettings(state.settings).worldType, seed: state.seed, legacySeed: false,
      displayName: state.displayName, directory: state.directory, generator: state.generator.id };
  }
  return { worldType: worldSettings(state.settings).worldType, seed: state.seed, legacySeed: false };
}
