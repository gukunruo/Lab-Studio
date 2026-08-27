const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

export function enhanceReaderDoc(root: HTMLElement | null, copyLabel: string) {
  if (!root) return

  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.learn__copy')) return
    const code = pre.querySelector('code')
    const rawText = code?.textContent ?? pre.textContent ?? ''
    const langMatch = code?.className?.match(/language-([\w+-]+)/)
    if (langMatch && langMatch[1]) {
      const tag = document.createElement('span')
      tag.className = 'learn__lang'
      tag.textContent = langMatch[1]
      pre.prepend(tag)
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'learn__copy'
    btn.setAttribute('aria-label', copyLabel)
    btn.setAttribute('title', copyLabel)
    btn.innerHTML = COPY_ICON
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawText)
        btn.innerHTML = CHECK_ICON
        btn.classList.add('learn__copy--done')
        window.setTimeout(() => {
          btn.innerHTML = COPY_ICON
          btn.classList.remove('learn__copy--done')
        }, 1500)
      } catch {
        /* clipboard unavailable */
      }
    })
    pre.appendChild(btn)
  })

  root.querySelectorAll('blockquote').forEach((bq) => {
    if (bq.classList.contains('callout')) return
    const strong = bq.querySelector('p > strong')
    const label = strong?.textContent ?? ''
    if (/(提示|小贴士|tip)/i.test(label)) bq.classList.add('callout', 'callout--tip')
    else if (/(警告|注意|warn)/i.test(label)) bq.classList.add('callout', 'callout--warn')
    else if (/(错误|危险|danger)/i.test(label)) bq.classList.add('callout', 'callout--danger')
  })
}
