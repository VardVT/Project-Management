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
  // Legacy pin → small box around the point
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

/**
 * Place callout box outside the highlight rect so text stays readable.
 * Returns % positions for callout top-left and leader line endpoints.
 */
export function getCalloutLayout(rect) {
  const midY = rect.y + rect.height / 2
  const calloutW = 18
  const calloutH = 7
  const gap = 1.5

  // Prefer right side; flip left if near right edge
  const preferRight = rect.x + rect.width + gap + calloutW < 98
  if (preferRight) {
    const cx = clampPercent(rect.x + rect.width + gap)
    const cy = clampPercent(Math.max(0.5, midY - calloutH / 2))
    return {
      callout: { x: cx, y: cy, width: calloutW, height: calloutH },
      line: {
        x1: rect.x + rect.width,
        y1: midY,
        x2: cx,
        y2: cy + Math.min(calloutH / 2, 3.5),
      },
    }
  }

  const cx = clampPercent(Math.max(0.5, rect.x - gap - calloutW))
  const cy = clampPercent(Math.max(0.5, midY - calloutH / 2))
  return {
    callout: { x: cx, y: cy, width: calloutW, height: calloutH },
    line: {
      x1: rect.x,
      y1: midY,
      x2: cx + calloutW,
      y2: cy + Math.min(calloutH / 2, 3.5),
    },
  }
}
