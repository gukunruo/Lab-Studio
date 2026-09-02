// 文件正文提取 —— 把用户上传的附件（文本类 / pdf / docx / xlsx / pptx）转成纯文本，
// 供对话注入给模型。纯函数、provider 无关；解析失败时降级为「仅文件名」，
// 保证上游至少收到一条可读的 `[文件：name]`，而不是整条消息被丢弃。

import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { unzipSync } from 'fflate'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** 注入给模型的单文件正文上限（与 context-engine 的 MSG_CONTENT_MAX 同量级），防上下文溢出。 */
export const FILE_TEXT_MAX = 6_000

// 无需解析器、直接按 UTF-8 读取的文本类扩展名。
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'log', 'yml', 'yaml',
  'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'java', 'c', 'cpp', 'h',
  'rb', 'rs', 'php', 'sql', 'sh', 'html',
])

export interface FileParseInput {
  bytes: Buffer
  mimeType?: string
  extension: string
  name?: string
}

function truncateTo(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

async function extractPdf(bytes: Buffer): Promise<string> {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: true,
  })
  const doc = await loadingTask.promise
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push(content.items.map((item) => (item as { str?: string }).str ?? '').join(' '))
    }
    return pages.join('\n').trim()
  } finally {
    await loadingTask.destroy()
  }
}

function extractXlsx(bytes: Buffer): string {
  const workbook = XLSX.read(bytes, { type: 'buffer' })
  const sheets: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) sheets.push(`${sheetName}\n${csv}`)
  }
  return sheets.join('\n\n').trim()
}

function extractPptx(bytes: Buffer): string {
  const files = unzipSync(new Uint8Array(bytes))
  const slideNames = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const num = (n: string) => Number(n.match(/slide(\d+)/i)?.[1] ?? 0)
      return num(a) - num(b)
    })
  const slides: string[] = []
  for (const name of slideNames) {
    const xml = new TextDecoder().decode(files[name])
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXmlEntities(match[1]))
    const text = texts.join('').replace(/\s+/g, ' ').trim()
    if (text) slides.push(text)
  }
  return slides.join('\n\n').trim()
}

// 提取文件正文；失败（非支持类型、解析抛错、空内容）时返回「仅文件名」作为降级标记。
export async function extractFileText(input: FileParseInput): Promise<string> {
  const { bytes, mimeType, extension, name } = input
  let text = ''
  try {
    if (extension === 'pdf') {
      text = await extractPdf(bytes)
    } else if (extension === 'docx') {
      text = (await mammoth.extractRawText({ buffer: bytes })).value
    } else if (extension === 'xlsx') {
      text = extractXlsx(bytes)
    } else if (extension === 'pptx') {
      text = extractPptx(bytes)
    } else if (TEXT_EXTENSIONS.has(extension) || mimeType?.startsWith('text/')) {
      text = bytes.toString('utf8')
    }
  } catch {
    text = ''
  }
  const nameLabel = name?.trim() || (extension ? `attachment.${extension}` : 'attachment')
  return text.trim() ? `${nameLabel}\n${truncateTo(text, FILE_TEXT_MAX)}` : nameLabel
}
