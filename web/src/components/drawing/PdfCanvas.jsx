import { useEffect, useRef, useState, useCallback } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

/**
 * Renders one PDF page to canvas at devicePixelRatio * zoom for crisp vectors.
 */
export function PdfCanvas({
  url,
  pageNumber = 1,
  zoom = 1,
  onDocumentLoad,
  onPageSize,
  className = '',
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const pdfRef = useRef(null)
  const renderTaskRef = useRef(null)
  const onDocumentLoadRef = useRef(onDocumentLoad)
  const onPageSizeRef = useRef(onPageSize)
  onDocumentLoadRef.current = onDocumentLoad
  onPageSizeRef.current = onPageSize
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    pdfRef.current = null
    setLoading(true)
    setError('')

    if (!url) {
      setLoading(false)
      return undefined
    }

    const loadingTask = getDocument({ url, withCredentials: false })
    loadingTask.promise
      .then((pdf) => {
        if (cancelled) {
          pdf.destroy()
          return
        }
        pdfRef.current = pdf
        onDocumentLoadRef.current?.(pdf.numPages)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load PDF')
        setLoading(false)
      })

    return () => {
      cancelled = true
      loadingTask.destroy?.()
      pdfRef.current?.destroy?.()
      pdfRef.current = null
    }
  }, [url])

  const renderPage = useCallback(async () => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas) return

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }

      const page = await pdf.getPage(pageNumber)
      const dpr = window.devicePixelRatio || 1
      const scale = Math.max(0.25, Number(zoom) || 1) * dpr
      const viewport = page.getViewport({ scale })

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`

      const ctx = canvas.getContext('2d', { alpha: false })
      const task = page.render({ canvasContext: ctx, canvas, viewport })
      renderTaskRef.current = task
      await task.promise
      renderTaskRef.current = null

      onPageSizeRef.current?.({
        width: viewport.width / dpr,
        height: viewport.height / dpr,
      })
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return
      setError(err?.message || 'Failed to render page')
    }
  }, [pageNumber, zoom])

  useEffect(() => {
    if (loading || !pdfRef.current) return undefined
    const t = window.setTimeout(() => {
      renderPage()
    }, 150)
    return () => window.clearTimeout(t)
  }, [loading, pageNumber, zoom, renderPage])

  return (
    <div ref={containerRef} className={`dwg-pdf-wrap ${className}`.trim()}>
      {loading && <div className="dwg-pdf-status">Loading drawing…</div>}
      {error && <div className="dwg-pdf-status error">{error}</div>}
      <canvas ref={canvasRef} className="dwg-pdf-canvas" />
    </div>
  )
}
