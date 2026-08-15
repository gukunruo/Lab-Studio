export interface FullscreenDocument {
  fullscreenElement?: Element | null
  webkitFullscreenElement?: Element | null
  exitFullscreen?: () => Promise<void>
  webkitExitFullscreen?: () => void
}

export interface FullscreenTarget {
  requestFullscreen?: () => Promise<void>
  webkitRequestFullscreen?: () => void
}

export function fullscreenElement(doc: FullscreenDocument): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

export function fullscreenState(doc: FullscreenDocument): boolean {
  return fullscreenElement(doc) !== null
}

export async function enterFullscreen(
  target: FullscreenTarget,
  doc: FullscreenDocument,
): Promise<boolean> {
  if (fullscreenElement(doc)) return true
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen()
      return true
    }
    if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen()
      return true
    }
  } catch {
    return false
  }
  return false
}

export async function exitFullscreen(doc: FullscreenDocument): Promise<boolean> {
  if (!fullscreenElement(doc)) return true
  try {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen()
      return true
    }
    if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen()
      return true
    }
  } catch {
    return false
  }
  return false
}
