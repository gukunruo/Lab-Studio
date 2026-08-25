import { marked } from 'marked'

marked.use({
  gfm: true,
  breaks: true,
})

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const markdownRenderer = new marked.Renderer()
markdownRenderer.html = ({ text }) => escapeHtml(text)
markdownRenderer.link = ({ href, title, text }) => {
  const safeHref = /^(https:|mailto:|#)/i.test(href) ? href : '#'
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(safeHref)}"${titleAttribute} target="_blank" rel="noreferrer">${text}</a>`
}

export function renderMarkdown(value: string): string {
  return marked.parse(value, {
    async: false,
    renderer: markdownRenderer,
  }) as string
}
