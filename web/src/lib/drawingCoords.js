/**
 * Normalized spatial coordinates for drawing pins (0–100 %).
 * Avoids pixel drift across screen sizes / zoom levels.
 */

export function calculateNormalizedCoords(mouseEvent, targetElement) {
  if (!targetElement) return { x: 0, y: 0 }
  const rect = targetElement.getBoundingClientRect()
  const w = rect.width || 1
  const h = rect.height || 1
  const x = ((mouseEvent.clientX - rect.left) / w) * 100
  const y = ((mouseEvent.clientY - rect.top) / h) * 100
  return {
    x: clampPercent(x),
    y: clampPercent(y),
  }
}

export function denormalizeCoords(percentX, percentY, currentWidth, currentHeight) {
  return {
    pixelX: (Number(percentX) / 100) * currentWidth,
    pixelY: (Number(percentY) / 100) * currentHeight,
  }
}

export function clampPercent(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v * 1000) / 1000))
}
