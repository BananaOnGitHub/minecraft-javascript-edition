// Legacy layer algorithms adapted from Cubitect/cubiomes (MIT).
// See third-party/cubiomes/LICENSE and docs/default-generation.md.
// This is a biome-stage implementation, not a complete terrain generator.
export const GENERATOR_ID = 'java-1.8.9-default-v1';

const step = (s, salt) => BigInt.asIntN(64, s * (s * 6364136223846793005n + 1442695040888963407n) + salt);
const ocean = id => id === 0 || id === 10 || id === 24;
const snowy = id => [10, 11, 12, 13, 26, 30, 31, 140, 158].includes(id);
const mesa = id => [37, 38, 39, 165, 166, 167].includes(id);
const mutations = new Set([1, 2, 3, 4, 5, 6, 12, 21, 23, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39]);
const mutated = id => mutations.has(id) ? id + 128 : -1;
const categories = new Map();
for (const group of [[16,26], [2,17,130], [3,20,34,131,162],
    [4,18,27,28,29,132,155,156,157], [12,13,140], [21,22,23,149,151],
    [37,38,39,165,166,167], [14,15], [25], [0,10,24], [1,129], [7,11],
    [35,36,163,164], [6,134], [5,19,30,31,32,33,133,158,160,161]]) {
  for (const id of group) categories.set(id, group[0]);
}
const category = id => categories.get(id) ?? -1;
// The plateau comparison is deliberately asymmetric in this version.
const similar = (a, b) => a === b || ((a === 38 || a === 39)
  ? b === 38 || b === 39 : category(a) === category(b));

class Layer {
  constructor(seed, salt, fn, parent, second) {
    let base = BigInt(salt);
    for (let i = 0; i < 3; i++) base = step(base, BigInt(salt));
    this.salt = seed;
    for (let i = 0; i < 3; i++) this.salt = step(this.salt, base);
    // Legacy Hills zooms were never initialized with the world seed.
    if (salt === 0) this.salt = 0n;
    this.start = salt === 0 ? 0n : step(this.salt, 0n);
    this.fn = fn;
    this.parent = parent;
    this.second = second;
    this.cache = new Map();
  }
  at(x, z) {
    const key = `${x},${z}`;
    let value = this.cache.get(key);
    if (value === undefined) {
      value = this.fn(this, x, z);
      this.cache.set(key, value);
    }
    return value;
  }
  random(x, z) {
    let state = BigInt.asIntN(64, this.start + BigInt(x));
    state = step(state, BigInt(z));
    state = step(state, BigInt(x));
    state = step(state, BigInt(z));
    return bound => {
      let value = Number((state >> 24n) % BigInt(bound));
      if (value < 0) value += bound;
      state = step(state, this.salt);
      return value;
    };
  }
}
const center = (l, x, z) => l.parent.at(x, z);
const sides = (l, x, z) => [l.parent.at(x,z-1), l.parent.at(x+1,z), l.parent.at(x-1,z), l.parent.at(x,z+1)];
const corners = (l, x, z) => [l.parent.at(x-1,z-1), l.parent.at(x+1,z-1), l.parent.at(x-1,z+1), l.parent.at(x+1,z+1)];
const continent = (l,x,z) => (x === 0 && z === 0) || l.random(x,z)(10) === 0 ? 1 : 0;

function zoom(fuzzy = false) {
  return (l,x,z) => {
    const px = Math.floor(x/2), pz = Math.floor(z/2);
    const a = l.parent.at(px,pz), b = l.parent.at(px+1,pz);
    const c = l.parent.at(px,pz+1), d = l.parent.at(px+1,pz+1);
    if (!(x & 1) && !(z & 1)) return a;
    const r = l.random(px*2,pz*2);
    const south = r(2) === 0 ? a : c;
    if (!(x & 1)) return south;
    const east = r(2) === 0 ? a : b;
    if (!(z & 1)) return east;
    if (!fuzzy) {
      const ca = +(a===b) + +(a===c) + +(a===d);
      const cb = +(b===c) + +(b===d), cc = +(c===d);
      if (ca > cb && ca > cc) return a;
      if (cb > ca) return b;
      if (cc > ca) return c;
    }
    return [a,b,c,d][r(4)];
  };
}
function land(l,x,z) {
  const a = center(l,x,z), n = corners(l,x,z);
  const r = l.random(x,z);
  if (a === 0 && n.some(v => v !== 0)) {
    let count = 1, selected = 1;
    for (const v of n) if (v !== 0 && r(count++) === 0) selected = v;
    return r(3) === 0 || selected === 4 ? selected : 0;
  }
  if (a !== 0 && a !== 4 && n.includes(0) && r(5) === 0) return 0;
  return a;
}
const island = (l,x,z) => center(l,x,z) === 0 && sides(l,x,z).every(v => v === 0) && l.random(x,z)(2) === 0 ? 1 : center(l,x,z);
function snow(l,x,z) {
  if (center(l,x,z) === 0) return 0;
  const v = l.random(x,z)(6);
  return v === 0 ? 4 : v === 1 ? 3 : 1;
}
const cool = (l,x,z) => center(l,x,z) === 1 && sides(l,x,z).some(v => v === 3 || v === 4) ? 2 : center(l,x,z);
const heat = (l,x,z) => center(l,x,z) === 4 && sides(l,x,z).some(v => v === 1 || v === 2) ? 3 : center(l,x,z);
function special(l,x,z) {
  let v = center(l,x,z);
  const r = l.random(x,z);
  if (v !== 0 && r(13) === 0) v |= ((1+r(15)) << 8) & 0xf00;
  return v;
}
const mushroom = (l,x,z) => center(l,x,z) === 0 && corners(l,x,z).every(v => v === 0) && l.random(x,z)(100) === 0 ? 14 : center(l,x,z);
const deep = (l,x,z) => center(l,x,z) === 0 && sides(l,x,z).every(v => v === 0) ? 24 : center(l,x,z);
function biome(l,x,z) {
  const v = center(l,x,z), id = v & ~0xf00, high = v & 0xf00, r = l.random(x,z);
  if (ocean(id) || id === 14) return id;
  switch (id) {
    case 1: return high ? (r(3) === 0 ? 39 : 38) : [2,2,2,35,35,1][r(6)];
    case 2: return high ? 21 : [4,29,3,1,27,6][r(6)];
    case 3: return high ? 32 : [4,3,5,1][r(4)];
    case 4: return [12,12,12,30][r(4)];
    default: return 14;
  }
}
const noise = (l,x,z) => center(l,x,z) > 0 ? l.random(x,z)(299999)+2 : 0;
function edge(l,x,z) {
  const a = center(l,x,z), n = sides(l,x,z);
  if ([38,39,32].includes(a)) return n.every(v => similar(v,a)) ? a : a === 32 ? 5 : 37;
  if (a === 2 && n.includes(12)) return 34;
  if (a === 6) {
    if (n.some(v => [2,30,12].includes(v))) return 1;
    if (n.includes(21)) return 23;
  }
  return a;
}
function hills(l,x,z) {
  const a = center(l,x,z), b = l.second.at(x,z), bn = (b-2)%29;
  if (bn === 1 && b >= 2 && a !== 0 && a !== 10) return mutated(a) > 0 ? mutated(a) : a;
  const r = l.random(x,z), chance = r(3);
  if (chance !== 0 && bn !== 0) return a;
  const variants = {2:17,4:18,27:28,29:1,5:19,32:33,30:31,12:13,21:22,0:24,3:34,35:36};
  let h = variants[a] ?? a;
  if (a === 1) h = r(3) === 0 ? 18 : 4;
  else if (similar(a,38)) h = 37;
  else if (a === 24 && r(3) === 0) h = r(2) === 0 ? 1 : 4;
  if (bn === 0 && h !== a) h = mutated(h) > 0 ? mutated(h) : a;
  return h !== a && sides(l,x,z).filter(v => similar(v,a)).length >= 3 ? h : a;
}
const sunflower = (l,x,z) => center(l,x,z) === 1 && l.random(x,z)(57) === 0 ? 129 : center(l,x,z);
function shore(l,x,z) {
  const a = center(l,x,z), n = sides(l,x,z), wet = n.some(ocean);
  if (a === 14) return n.includes(0) ? 15 : a;
  if (category(a) === 21) {
    if (!n.every(v => category(v) === 21 || v === 4 || v === 5 || ocean(v))) return 23;
    return wet ? 16 : a;
  }
  if (a === 3 || a === 34) return wet ? 25 : a;
  if (snowy(a)) return !ocean(a) && wet ? 26 : a;
  if (a === 37 || a === 38) return !wet && !n.every(mesa) ? 2 : a;
  return ![0,24,7,6].includes(a) && wet ? 16 : a;
}
const reduce = v => v >= 2 ? 2+(v&1) : v;
const river = (l,x,z) => sides(l,x,z).every(v => reduce(v) === reduce(center(l,x,z))) ? -1 : 7;
function smooth(l,x,z) {
  let a = center(l,x,z);
  const [n,e,w,s] = sides(l,x,z);
  if (w === e && n === s) a = l.random(x,z)(2) === 0 ? w : n;
  else { if (w === e) a = w; if (n === s) a = n; }
  return a;
}
function mix(l,x,z) {
  const a = center(l,x,z);
  if (ocean(a) || l.second.at(x,z) !== 7) return a;
  return a === 12 ? 11 : a === 14 || a === 15 ? 15 : 7;
}
function voronoi(l,x,z) {
  x -= 2; z -= 2;
  const px = Math.floor(x/4), pz = Math.floor(z/4);
  const dx = x-px*4, dz = z-pz*4;
  const offsets = [[0,0],[1,0],[0,1],[1,1]];
  const distances = offsets.map(([cx,cz]) => {
    const r = l.random((px+cx)*4,(pz+cz)*4);
    const vx = (r(1024)/1024-0.5)*3.6+cx*4;
    const vz = (r(1024)/1024-0.5)*3.6+cz*4;
    return (dx-vx)*(dx-vx)+(dz-vz)*(dz-vz);
  });
  let selected = 3;
  for (let i=0; i<3; i++) if (distances.every((v,j) => i === j || distances[i] < v)) { selected=i; break; }
  return l.parent.at(px+offsets[selected][0],pz+offsets[selected][1]) & 255;
}

/** Minecraft 1.8.9 Default biome graph. Caches live only for one rectangular query. */
export class Biomes189 {
  constructor(seed) {
    if (typeof seed !== 'bigint' && typeof seed !== 'string') throw new TypeError('Use an exact BigInt or decimal seed');
    if(typeof seed==='string' && !/^[+-]?\d+$/.test(seed)) throw new RangeError('Resolved decimal seed required');
    this.seed = BigInt(seed);
    if(BigInt.asIntN(64,this.seed)!==this.seed) throw new RangeError('Seed must be a signed 64-bit integer');
    this.layers = [];
    const add = (salt,fn,p,p2) => { const l = new Layer(this.seed,salt,fn,p,p2); this.layers.push(l); return l; };
    let p = add(1,continent);
    for (const [salt,fn] of [[2000,zoom(true)],[1,land],[2001,zoom()],[2,land],[50,land],
        [70,land],[2,island],[2,snow],[3,land],[2,cool],[2,heat],[3,special],
        [2002,zoom()],[2003,zoom()],[4,land],[5,mushroom],[4,deep]]) p=add(salt,fn,p);
    const climate = p;
    const riverInit = add(100,noise,climate);
    const hillNoise = add(0,zoom(),add(0,zoom(),riverInit));
    p = add(200,biome,climate);
    p = add(1000,edge,add(1001,zoom(),add(1000,zoom(),p)));
    p = add(1000,hills,p,hillNoise);
    for (const [salt,fn] of [[1001,sunflower],[1000,zoom()],[3,land],[1001,zoom()],
        [1000,shore],[1002,zoom()],[1003,zoom()],[1000,smooth]]) p=add(salt,fn,p);
    let r = riverInit;
    for (const salt of [1000,1001,1000,1001,1002,1003]) r=add(salt,zoom(),r);
    r = add(1000,smooth,add(1,river,r));
    this.quarter = add(100,mix,p,r);
    this.blocks = add(10,voronoi,this.quarter);
  }
  sample(x,z,width,height,{ scale = 1 } = {}) {
    for (const v of [x,z,width,height]) if (!Number.isSafeInteger(v)) throw new RangeError('Integer biome rectangle required');
    if (width < 1 || height < 1 || width*height > 1048576) throw new RangeError('Invalid biome rectangle size');
    if (scale !== 1 && scale !== 4) throw new RangeError('Biome scale must be 1 or 4');
    const layer = scale === 4 ? this.quarter : this.blocks;
    const out = new Uint8Array(width*height);
    try {
      for (let dz=0; dz<height; dz++) for (let dx=0; dx<width; dx++) out[dz*width+dx]=layer.at(x+dx,z+dz);
    } finally { for (const l of this.layers) l.cache.clear(); }
    return out;
  }
}
