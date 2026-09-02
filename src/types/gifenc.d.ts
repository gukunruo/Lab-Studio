// gifenc ships no types (just a bundled ESM/CJS dist). This is the minimal
// surface the bot exporter uses: encode GIF frames from an indexed palette.
declare module 'gifenc' {
  export interface GifFrameOpts {
    /** seconds per frame in centiseconds is derived from `delay` (ms) */
    delay?: number
    /** palette as [r,g,b][] triples; required on the first frame */
    palette?: number[][]
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    colorDepth?: number
    dispose?: number
    first?: boolean
  }

  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifFrameOpts): void
    finish(): void
    reset(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
  }

  /** Reduce RGBA image data (Uint8ClampedArray) to a palette of up to N colors. */
  export function quantize(rgba: Uint8ClampedArray, colors?: number): number[][]

  /** Map RGBA image data to palette indices (Uint8Array of length w*h). */
  export function applyPalette(rgba: Uint8ClampedArray, palette: number[][]): Uint8Array

  export function prequantize(...args: unknown[]): unknown
  export function nearestColorIndex(...args: unknown[]): unknown
  export function nearestColor(...args: unknown[]): unknown
  export function nearestColorIndexWithDistance(...args: unknown[]): unknown
  export function snapColorsToPalette(...args: unknown[]): unknown

  export default GIFEncoder
}
