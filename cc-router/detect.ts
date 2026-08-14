type ContentBlock = { type?: string; [key: string]: unknown }

function isMultimodalBlock(block: unknown): boolean {
  if (typeof block !== 'object' || block === null) return false
  const type = (block as ContentBlock).type
  return type === 'image' || type === 'document'
}

function contentHasMultimodal(content: unknown): boolean {
  if (typeof content === 'string') return false
  if (!Array.isArray(content)) return false
  return content.some(isMultimodalBlock)
}

export function hasMultimodalContent(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>

  const system = b.system
  if (contentHasMultimodal(system)) return true

  const messages = b.messages
  if (!Array.isArray(messages)) return false
  return messages.some((msg) => {
    if (typeof msg !== 'object' || msg === null) return false
    return contentHasMultimodal((msg as Record<string, unknown>).content)
  })
}
