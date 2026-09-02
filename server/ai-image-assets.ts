import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { aiImageAssets } from './db/schema'

const DATABASE_URL = process.env.DATABASE_URL ?? './data/lab-studio.db'
const DATABASE_PATH = DATABASE_URL.startsWith('file:') ? DATABASE_URL.slice(5) : DATABASE_URL
export const ASSET_DIRECTORY = process.env.AI_IMAGE_ASSET_DIR
  ? resolve(process.env.AI_IMAGE_ASSET_DIR)
  : join(dirname(resolve(DATABASE_PATH)), 'ai-images')
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ImageFileType = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  extension: 'png' | 'jpg' | 'webp'
}

export type DecodedImage = ImageFileType & {
  bytes: Buffer
}

export type StoredImageAsset = ImageFileType & {
  id: string
  byteLength: number
}

function imageFileType(bytes: Buffer): ImageFileType | null {
  if (
    bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mimeType: 'image/png', extension: 'png' }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).equals(Buffer.from('RIFF'))
    && bytes.subarray(8, 12).equals(Buffer.from('WEBP'))
  ) {
    return { mimeType: 'image/webp', extension: 'webp' }
  }
  return null
}

export function decodeBase64Image(value: unknown): DecodedImage | null {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null

  const bytes = Buffer.from(value, 'base64')
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null

  const fileType = imageFileType(bytes)
  return fileType ? { bytes, ...fileType } : null
}

export function imageAssetUrl(id: string): string | null {
  return ASSET_ID_PATTERN.test(id) ? `/api/ai-platform/images/${id}` : null
}

function imageAssetPath(id: string, extension: ImageFileType['extension']): string {
  return join(ASSET_DIRECTORY, `${id}.${extension}`)
}

export async function storeImageAsset(userKey: string, image: DecodedImage): Promise<StoredImageAsset> {
  const id = randomUUID()
  const asset = {
    id,
    userKey,
    mimeType: image.mimeType,
    extension: image.extension,
    byteLength: image.bytes.length,
    createdAt: new Date(),
  }
  const path = imageAssetPath(id, image.extension)

  await mkdir(ASSET_DIRECTORY, { recursive: true })
  await writeFile(path, image.bytes, { flag: 'wx', mode: 0o600 })
  try {
    await db.insert(aiImageAssets).values(asset)
  } catch (error) {
    await rm(path, { force: true })
    throw error
  }
  return asset
}

export async function readImageAsset(userKey: string, id: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!ASSET_ID_PATTERN.test(id)) return null
  const asset = await db.select().from(aiImageAssets).where(eq(aiImageAssets.id, id)).get()
  if (!asset || asset.userKey !== userKey) return null

  try {
    const bytes = await readFile(imageAssetPath(asset.id, asset.extension as ImageFileType['extension']))
    return { bytes, mimeType: asset.mimeType }
  } catch {
    return null
  }
}
