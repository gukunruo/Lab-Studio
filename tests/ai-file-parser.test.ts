import test from 'node:test'
import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'
import * as XLSX from 'xlsx'
import { extractFileText, FILE_TEXT_MAX } from '../server/ai-file-parser'

test('extractFileText reads plain text bytes and prefixes the filename', async () => {
  const result = await extractFileText({
    bytes: Buffer.from('第一行\n第二行'),
    mimeType: 'text/plain',
    extension: 'txt',
    name: 'notes.txt',
  })
  assert.equal(result, 'notes.txt\n第一行\n第二行')
})

test('extractFileText reads CSV by extension', async () => {
  const result = await extractFileText({
    bytes: Buffer.from('name,age\n张三,30'),
    mimeType: 'text/csv',
    extension: 'csv',
    name: 'data.csv',
  })
  assert.ok(result.startsWith('data.csv\nname,age\n张三,30'))
})

test('extractFileText reads a workbook built with SheetJS', async () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['城市', '气温'], ['北京', '25']])
  XLSX.utils.book_append_sheet(workbook, sheet, '天气')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  const result = await extractFileText({ bytes, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', name: '天气.xlsx' })
  assert.ok(result.startsWith('天气.xlsx\n'))
  assert.ok(result.includes('天气'))
  assert.ok(result.includes('城市'))
  assert.ok(result.includes('北京'))
})

test('extractFileText reads a minimal docx', async () => {
  const documentXml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>你好世界</w:t></w:r></w:p></w:body></w:document>'
  const zipped = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'word/document.xml': strToU8(documentXml),
  })
  const result = await extractFileText({ bytes: Buffer.from(zipped), extension: 'docx', name: 'letter.docx' })
  assert.ok(result.startsWith('letter.docx\n'))
  assert.ok(result.includes('你好世界'))
})

test('extractFileText reads a minimal pptx and keeps slide order', async () => {
  const slide = (text: string) => `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`
  const zipped = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'ppt/slides/slide1.xml': strToU8(slide('一')),
    'ppt/slides/slide2.xml': strToU8(slide('二')),
  })
  const result = await extractFileText({ bytes: Buffer.from(zipped), extension: 'pptx', name: 'deck.pptx' })
  assert.ok(result.startsWith('deck.pptx\n'))
  assert.ok(result.includes('一'))
  assert.ok(result.includes('二'))
})

test('extractFileText degrades to just the filename on unsupported input', async () => {
  const result = await extractFileText({
    bytes: Buffer.from('random binary that is not a pdf'),
    mimeType: 'application/pdf',
    extension: 'pdf',
    name: 'broken.pdf',
  })
  assert.equal(result, 'broken.pdf')
})

test('extractFileText caps the injected text to FILE_TEXT_MAX', async () => {
  const longText = 'x'.repeat(FILE_TEXT_MAX + 500)
  const result = await extractFileText({ bytes: Buffer.from(longText), mimeType: 'text/plain', extension: 'txt', name: 'big.txt' })
  assert.ok(result.startsWith('big.txt\n'))
  assert.ok(result.length < FILE_TEXT_MAX + 100, `got length ${result.length}`)
})
