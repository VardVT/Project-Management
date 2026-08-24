/**
 * Normalized spatial coordinates for drawing annotations (0–100 %).
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

/** Normalize any two corners into top-left + size (all %). */
export function normalizeRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const right = Math.max(x1, x2)
  const bottom = Math.max(y1, y2)
  return {
    x: clampPercent(left),
    y: clampPercent(top),
    width: clampPercent(right - left),
    height: clampPercent(bottom - top),
  }
}

/** Resolve display rect from annotation (supports legacy pin + new rect). */
export function getAnnotationRect(annotation) {
  const vd = annotation?.vector_data || {}
  const w = Number(vd.width_percent)
  const h = Number(vd.height_percent)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return {
      x: Number(annotation.x_percent) || 0,
      y: Number(annotation.y_percent) || 0,
      width: w,
      height: h,
    }
  }
  const cx = Number(annotation?.x_percent) || 0
  const cy = Number(annotation?.y_percent) || 0
  const size = 2.5
  return {
    x: clampPercent(cx - size / 2),
    y: clampPercent(cy - size / 2),
    width: size,
    height: size,
  }
}

export const DEFAULT_CALLOUT_W = 18
export const DEFAULT_CALLOUT_H = 7

/** Nearest point on rect border to a free point (for leader arrow). */
export function nearestPointOnRectBorder(rect, px, py) {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const clampedX = Math.min(Math.max(px, left), right)
  const clampedY = Math.min(Math.max(py, top), bottom)

  const inside =
    px > left && px < right && py > top && py < bottom

  if (!inside) {
    return { x: clampedX, y: clampedY }
  }

  const dl = px - left
  const dr = right - px
  const dt = py - top
  const db = bottom - py
  const m = Math.min(dl, dr, dt, db)
  if (m === dl) return { x: left, y: py }
  if (m === dr) return { x: right, y: py }
  if (m === dt) return { x: px, y: top }
  return { x: px, y: bottom }
}

/**
 * Callout layout: uses saved callout_x/y in vector_data when present,
 * otherwise auto-places beside the highlight rect.
 */
export function getCalloutLayout(rect, annotation) {
  const vd = annotation?.vector_data || {}
  const calloutW = Number(vd.callout_w_percent) || DEFAULT_CALLOUT_W
  const calloutH = Number(vd.callout_h_percent) || DEFAULT_CALLOUT_H
  const gap = 1.5

  let cx
  let cy
  const savedX = Number(vd.callout_x_percent)
  const savedY = Number(vd.callout_y_percent)
  if (Number.isFinite(savedX) && Number.isFinite(savedY)) {
    cx = clampPercent(savedX)
    cy = clampPercent(savedY)
  } else {
    const midY = rect.y + rect.height / 2
    const preferRight = rect.x + rect.width + gap + calloutW < 98
    if (preferRight) {
      cx = clampPercent(rect.x + rect.width + gap)
      cy = clampPercent(Math.max(0.5, midY - calloutH / 2))
    } else {
      cx = clampPercent(Math.max(0.5, rect.x - gap - calloutW))
      cy = clampPercent(Math.max(0.5, midY - calloutH / 2))
    }
  }

  const calloutCx = cx + calloutW / 2
  const calloutCy = cy + Math.min(calloutH / 2, 3.5)
  const attach = nearestPointOnRectBorder(rect, calloutCx, calloutCy)

  return {
    callout: { x: cx, y: cy, width: calloutW, height: calloutH },
    line: {
      x1: attach.x,
      y1: attach.y,
      x2: calloutCx,
      y2: calloutCy,
    },
  }
}
