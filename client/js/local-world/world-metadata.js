import { parseJavaLong, resolveJavaSeed } from './java-random.js';
import { flatSettings } from './flat-world.js';
import { worldSettings } from './world-settings.js';

export const SAVE_VERSION = 3;
const MODES = ['survival', 'hardcore', 'creative'];
const GENERATORS = {
  natural: 'landscape-v1',
  highlands: 'landscape-v1',
  wide: 'landscape-v1',
  custom: 'landscape-v1',
  flat: 'layered-flat-v1',
  terraces: 'terraces-v1',
};

export function newCreationOptions() {
  return { gameMode: 'survival', hardcore: false, structures: true, cheats: false, cheatsTouched: false, bonusChest: false };
}

export function selectGameMode(options, mode) {
  if (!MODES.includes(mode)) throw new Error('Unknown game mode.');
  options.gameMode = mode;
  options.hardcore = mode === 'hardcore';
  if (!options.cheatsTouched) options.cheats = mode === 'creative';
}

export function creationOptions(input = {}) {
  const gameMode = input.gameMode ?? 'creative';
  if (!MODES.includes(gameMode)) throw new Error('Unknown game mode.');
  for (const key of ['structures', 'cheats', 'bonusChest']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error('Invalid world option.');
  }
  const hardcore = gameMode === 'hardcore';
  return {
    gameMode,
    hardcore,
    structures: input.structures ?? true,
    cheats: hardcore ? false : (input.cheats ?? gameMode === 'creative'),
    bonusChest: hardcore ? false : (input.bonusChest ?? false),
  };
}

export function saveDirectory(displayName) {
  // A portable identifier for display and export. IndexedDB uses a separate ID.
  let directory = displayName.trim().replace(/[<>:"/\\|?*\x00-\x1f.]/g, '_');
  if (!directory) directory = 'World';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(directory)) directory = '_' + directory + '_';
  return directory;
}

export function uniqueDirectory(base, directories) {
  const occupied = new Set([...directories].map(name => name.toLowerCase()));
  let directory = base;
  let suffix = 2;
  while (occupied.has(directory.toLowerCase())) directory = base + ' (' + suffix++ + ')';
  return directory;
}

export function newWorldState(options, resolve = resolveJavaSeed) {
  const displayName = options.name?.trim();
  if (!displayName || displayName.length > 32) throw new Error('Enter a world name of up to 32 characters.');
  const settings = worldSettings(options.settings);
  const seed = resolve(options.seed);
  if (parseJavaLong(seed) === null) throw new Error('Resolved seed must be a signed 64-bit decimal string.');
  const configuration = settings.worldType === 'flat' ? flatSettings(options.flat) : null;
  const creation = creationOptions(options.creation);
  return {
    version: SAVE_VERSION,
    id: crypto.randomUUID(),
    displayName,
    directory: saveDirectory(displayName),
    seed,
    settings,
    creation,
    generator: { id: GENERATORS[settings.worldType], version: 1, configuration },
    edits: [],
  };
}

export function validateGenerator(state) {
  if (state.version !== SAVE_VERSION) return;
  const expected = GENERATORS[state.settings?.worldType];
  if (!expected || state.generator?.id !== expected || state.generator.version !== 1) {
    throw new Error('This world requires an unavailable generator version. Its save has been preserved.');
  }
  if (parseJavaLong(state.seed) === null) throw new Error('This world has an invalid seed.');
}

export function creationStatus(settings, options) {
  const messages = [];
  if (options.gameMode !== 'creative') messages.push('Survival simulation is incomplete.');
  if (options.gameMode === 'hardcore') messages.push('Permanent death is pending.');
  if (options.structures) messages.push('Structure generation is pending.');
  if (options.bonusChest) messages.push('Starter chest generation is pending.');
  if (settings.worldType !== 'flat' && settings.worldType !== 'terraces') {
    messages.push('Original landscape generator. Native terrain parity is pending.');
  }
  return messages;
}
