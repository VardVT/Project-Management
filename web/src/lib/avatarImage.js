/** Prepare a profile photo: resize + JPEG compress so phone photos upload reliably. */

const MAX_INPUT_BYTES = 25 * 1024 * 1024
const MAX_EDGE = 512
const JPEG_QUALITY = 0.85

export async function prepareAvatarFile(file) {
  if (!file) throw new Error('No image selected.')
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image is too large. Please choose a photo under 25 MB.')
  }

  const mime = String(file.type || '').toLowerCase()
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg']
  if (mime && !allowed.includes(mime) && !mime.startsWith('image/')) {
    throw new Error('Use a JPG, PNG, WebP, or GIF image.')
  }

  const bitmap = await loadImageBitmap(file)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process image.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await canvasToJpegBlob(canvas, JPEG_QUALITY)
    if (!blob) throw new Error('Could not process image.')

    return new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close()
  }
}

function fitWithin(w, h, maxEdge) {
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { width: w, height: h }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    img.src = url
  })
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
      return
    }
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const bin = atob(dataUrl.split(',')[1] || '')
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
      resolve(new Blob([bytes], { type: 'image/jpeg' }))
    } catch {
      resolve(null)
    }
  })
}
