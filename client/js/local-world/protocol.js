import { Reader, Writer } from '../net/buffer.js';
import { BUILD_CEILING, FOUNDATION_Y } from './terrain.js';

export function readAction(bytes) {
  const r = new Reader(bytes);
  switch (r.varint()) {
    case 0x04: return { type: 'move', x: r.f64(), y: r.f64(), z: r.f64() };
    case 0x05: return { type: 'move', yaw: r.f32(), pitch: r.f32() };
    case 0x06: return { type: 'move', x: r.f64(), y: r.f64(), z: r.f64(), yaw: r.f32(), pitch: r.f32() };
    case 0x07: return { type: 'dig', status: r.u8(), target: r.position(), face: r.u8() };
    case 0x08: return { type: 'place', target: r.position(), face: r.u8() };
    case 0x09: return { type: 'select', slot: r.i16() };
    case 0x10: return { type: 'slot', slot: r.i16(), item: r.slot() };
    case 0x15:
      r.string();
      return { type: 'distance', distance: r.i8() };
    default: return null;
  }
}

export function positionPacket({ x, y, z, yaw, pitch }) {
  return new Writer().varint(0x08).f64(x).f64(y).f64(z).f32(yaw).f32(pitch).u8(0).build();
}

export function blockPacket({ x, y, z }, state) {
  return new Writer().varint(0x23).position(x, y, z).varint(state).build();
}

export function slotPacket(slot, item) {
  return new Writer().varint(0x2f).i8(0).i16(slot).slot(item).build();
}

function chunkHeader(cx, cz, sections) {
  return new Writer().varint(0x21).i32(cx).i32(cz).bool(true).u16(sections);
}

export function unloadPacket(cx, cz) {
  return chunkHeader(cx, cz, 0).varint(0).build();
}

export function chunkPacket(terrain, cx, cz) {
  const firstSection = FOUNDATION_Y >> 4;
  const sectionCount = (BUILD_CEILING >> 4) - firstSection + 1;
  const stateBytes = sectionCount * 8192;
  const lightBytes = sectionCount * 2048;
  const sections = ((1 << sectionCount) - 1) << firstSection;
  const data = new Uint8Array(stateBytes + 2 * lightBytes + 256);
  const view = new DataView(data.buffer);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      let sky = 15;
      for (let y = BUILD_CEILING; y >= FOUNDATION_Y; y--) {
        const i = ((y - FOUNDATION_Y) << 8) | (z << 4) | x;
        const state = terrain.get(cx * 16 + x, y, cz * 16 + z);
        view.setUint16(i * 2, state, true);
        if (state) sky = 0;
        data[stateBytes + lightBytes + (i >> 1)] |= sky << ((i & 1) * 4);
      }
    }
  }
  data.fill(1, stateBytes + 2 * lightBytes); // A valid sky-lit biome ID for the client.
  return chunkHeader(cx, cz, sections).varint(data.length).raw(data).build();
}
