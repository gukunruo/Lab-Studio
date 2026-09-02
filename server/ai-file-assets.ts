// 通用附件存储 —— 与图片共用 ai_image_assets 表（列通用，无迁移）与同一磁盘目录，
// 但只存「可解析正文」的文档类文件（文本 / pdf / docx / xlsx / pptx），供对话注入给模型。
// 图片仍走多模态视觉通道（src/ai-platform/api.ts 的 uploadImage），二者互不干扰。

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { aiImageAssets } from './db/schema'
import { ASSET_DIRECTORY, ASSET_ID_PATTERN } from './ai-image-assets'
import { extractFileText } from './ai-file-parser'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

// 上传白名单：与解析器支持一致，但刻意排除 text/html 与 image/svg+xml（同源服务用户二进制，防 XSS）。
const ALLOWED_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'log', 'yml', 'yaml',
  'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'java', 'c', 'cpp', 'h',
  'rb', 'rs', 'php', 'sql', 'sh',
  'pdf', 'docx', 'xlsx', 'pptx',
])

const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

export interface DecodedFile {
  bytes: Buffer
  mimeType: string
  extension: string
  fileName: string
}

export type StoredFileAsset = {
  id: string
  userKey: string
  mimeType: string
  extension: string
  byteLength: number
  createdAt: Date
}

function extensionFromFileName(fileName: unknown): string | null {
  if (typeof fileName !== 'string') return null
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim())
  return match ? match[1].toLowerCase() : null
}

export function decodeBase64File(
  value: unknown,
  opts?: { mimeType?: unknown; fileName?: unknown },
): DecodedFile | null {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null

  const bytes = Buffer.from(value, 'base64')
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) return null

  let extension = extensionFromFileName(opts?.fileName)
  const mimeType = typeof opts?.mimeType === 'string' && opts.mimeType ? opts.mimeType : 'application/octet-stream'
  if (!extension) extension = MIME_TO_EXTENSION[mimeType] ?? null
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) return null
  if (extension === 'html' || extension === 'svg' || mimeType === 'text/html' || mimeType === 'image/svg+xml') return null

  const fileName = typeof opts?.fileName === 'string' && opts.fileName.trim() ? opts.fileName.trim() : `attachment.${extension}`
  return { bytes, mimeType, extension, fileName }
}

function fileAssetPath(id: string, extension: string): string {
  return join(ASSET_DIRECTORY, `${id}.${extension}`)
}

function sidecarTextPath(id: string): string {
  return join(ASSET_DIRECTORY, '.text', `${id}.txt`)
}

export function fileAssetUrl(id: string): string | null {
  return ASSET_ID_PATTERN.test(id) ? `/api/ai-platform/files/${id}` : null
}

export async function storeFileAsset(userKey: string, file: DecodedFile): Promise<StoredFileAsset> {
  const id = randomUUID()
  const asset = {
    id,
    userKey,
    mimeType: file.mimeType,
    extension: file.extension,
    byteLength: file.bytes.length,
    createdAt: new Date(),
  }
  const path = fileAssetPath(id, file.extension)

  await mkdir(ASSET_DIRECTORY, { recursive: true })
  await writeFile(path, file.bytes, { flag: 'wx', mode: 0o600 })
  try {
    await db.insert(aiImageAssets).values(asset)
  } catch (error) {
    await rm(path, { force: true })
    throw error
  }
  return asset
}

export async function readFileAsset(userKey: string, id: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!ASSET_ID_PATTERN.test(id)) return null
  const asset = await db.select().from(aiImageAssets).where(eq(aiImageAssets.id, id)).get()
  if (!asset || asset.userKey !== userKey) return null

  try {
    const bytes = await readFile(fileAssetPath(asset.id, asset.extension))
    return { bytes, mimeType: asset.mimeType }
  } catch {
    return null
  }
}

export async function fileAssetResponse(userKey: string, id: string): Promise<Response> {
  const asset = await readFileAsset(userKey, id)
  if (!asset) {
    return Response.json({ error: '附件不存在或已不可用。' }, { status: 404 })
  }
  return new Response(asset.bytes, {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.bytes.length),
      'Content-Disposition': 'attachment',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}

// 读文件正文：优先读上传时写的旁路缓存 <id>.txt（O(1)），缺失兜底实时解析（并把结果写回缓存）。
export async function readFileAssetText(userKey: string, id: string): Promise<string> {
  if (!ASSET_ID_PATTERN.test(id)) return ''
  const asset = await db.select().from(aiImageAssets).where(eq(aiImageAssets.id, id)).get()
  if (!asset || asset.userKey !== userKey) return ''

  const sidecar = sidecarTextPath(id)
  try {
    return await readFile(sidecar, 'utf8')
  } catch {
    try {
      const bytes = await readFile(fileAssetPath(asset.id, asset.extension))
      const text = await extractFileText({ bytes, mimeType: asset.mimeType, extension: asset.extension })
      await mkdir(join(ASSET_DIRECTORY, '.text'), { recursive: true })
      await writeFile(sidecar, text, { flag: 'wx', mode: 0o600 }).catch(() => {})
      return text
    } catch {
      return ''
    }
  }
}
