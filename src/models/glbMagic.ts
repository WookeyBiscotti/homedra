/** Tiny GLB helpers shared by upload / resolve (avoid circular imports). */

export const MAX_BYTES = 50 * 1024 * 1024
const GLB_MAGIC = 0x46546c67 // 'glTF'

export function readGlbMagic(buf: ArrayBuffer): number {
  if (buf.byteLength < 4) return 0
  return new DataView(buf).getUint32(0, true)
}

export function isGlbBuffer(buf: ArrayBuffer): boolean {
  return readGlbMagic(buf) === GLB_MAGIC
}
