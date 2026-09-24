/**
 * Regenerates minimal box GLB fixtures under public/models/fixtures/.
 * Run: node scripts/generate-fixture-glbs.mjs
 */
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function createBoxGlb({ name, sx, sy, sz, color }) {
  const hx = sx / 2
  const hz = sz / 2
  const positions = new Float32Array([
    -hx, sy, -hz, hx, sy, -hz, hx, sy, hz, -hx, sy, hz,
    -hx, 0, -hz, -hx, 0, hz, hx, 0, hz, hx, 0, -hz,
    -hx, 0, hz, -hx, sy, hz, hx, sy, hz, hx, 0, hz,
    hx, 0, -hz, hx, sy, -hz, -hx, sy, -hz, -hx, 0, -hz,
    hx, 0, hz, hx, sy, hz, hx, sy, -hz, hx, 0, -hz,
    -hx, 0, -hz, -hx, sy, -hz, -hx, sy, hz, -hx, 0, hz,
  ])
  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ])
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14,
    15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
  ])

  let offset = 0
  const posOffset = offset
  offset += positions.byteLength
  while (offset % 4) offset++
  const normOffset = offset
  offset += normals.byteLength
  while (offset % 4) offset++
  const idxOffset = offset
  offset += indices.byteLength
  while (offset % 4) offset++

  const binBuf = new ArrayBuffer(offset)
  const u8 = new Uint8Array(binBuf)
  u8.set(new Uint8Array(positions.buffer), posOffset)
  u8.set(new Uint8Array(normals.buffer), normOffset)
  u8.set(new Uint8Array(indices.buffer), idxOffset)

  const [r, g, b] = color
  const gltf = {
    asset: { version: '2.0', generator: 'interior-fixtures' },
    scene: 0,
    scenes: [{ nodes: [0], name }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        name,
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: `${name}-mat`,
        pbrMetallicRoughness: {
          baseColorFactor: [r, g, b, 1],
          metallicFactor: 0.05,
          roughnessFactor: 0.75,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 24,
        type: 'VEC3',
        max: [hx, sy, hz],
        min: [-hx, 0, -hz],
      },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: posOffset,
        byteLength: positions.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: normOffset,
        byteLength: normals.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: idxOffset,
        byteLength: indices.byteLength,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: binBuf.byteLength }],
  }

  let json = JSON.stringify(gltf)
  while (json.length % 4) json += ' '
  const jsonBytes = new TextEncoder().encode(json)
  const binPad = (4 - (binBuf.byteLength % 4)) % 4
  const totalLen = 12 + 8 + jsonBytes.length + 8 + binBuf.byteLength + binPad
  const out = new ArrayBuffer(totalLen)
  const dv = new DataView(out)
  const ou = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, totalLen, true)
  dv.setUint32(12, jsonBytes.length, true)
  dv.setUint32(16, 0x4e4f534a, true)
  ou.set(jsonBytes, 20)
  const binChunkStart = 20 + jsonBytes.length
  dv.setUint32(binChunkStart, binBuf.byteLength + binPad, true)
  dv.setUint32(binChunkStart + 4, 0x004e4942, true)
  ou.set(new Uint8Array(binBuf), binChunkStart + 8)
  return Buffer.from(out)
}

const dir = join(__dirname, '../public/models/fixtures')
const fixtures = [
  { file: 'chair.glb', name: 'Chair', sx: 0.5, sy: 0.9, sz: 0.5, color: [0.45, 0.32, 0.22] },
  { file: 'table.glb', name: 'Table', sx: 1.2, sy: 0.75, sz: 0.7, color: [0.55, 0.4, 0.28] },
  { file: 'lamp.glb', name: 'Lamp', sx: 0.25, sy: 1.4, sz: 0.25, color: [0.85, 0.85, 0.8] },
  { file: 'sofa.glb', name: 'Sofa', sx: 1.8, sy: 0.7, sz: 0.8, color: [0.25, 0.35, 0.45] },
  { file: 'plant.glb', name: 'Plant', sx: 0.4, sy: 1.0, sz: 0.4, color: [0.2, 0.55, 0.25] },
]
for (const f of fixtures) {
  writeFileSync(join(dir, f.file), createBoxGlb(f))
  console.log('wrote', f.file)
}
