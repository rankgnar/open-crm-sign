import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
// Bundle the worker as a Vite asset so we don't load from a CDN.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Loader2, AlertCircle } from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface Props {
  url: string
}

/**
 * Inline PDF viewer rendered as canvases stacked vertically. Avoids the
 * mobile iframe/native-viewer trap where tapping the document hands off to
 * an external viewer and the back button drops the user out of the signing
 * page entirely.
 */
export function PdfViewer({ url }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    let task: pdfjsLib.PDFDocumentLoadingTask | null = null

    void (async () => {
      try {
        task = pdfjsLib.getDocument(url)
        const pdf = await task.promise
        if (cancelled) return

        const container = containerRef.current
        if (!container) return
        container.innerHTML = ''

        const dpr = Math.min(window.devicePixelRatio || 1, 2)  // cap at 2 for memory
        const containerWidth = container.clientWidth || 360

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const baseViewport = page.getViewport({ scale: 1 })
          const cssScale = containerWidth / baseViewport.width
          const viewport = page.getViewport({ scale: cssScale * dpr })

          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.style.marginBottom = i < pdf.numPages ? '8px' : '0'
          canvas.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'
          canvas.style.borderRadius = '4px'

          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          if (cancelled) return
          container.appendChild(canvas)
        }
        setStatus('ready')
      } catch (e) {
        console.error('PdfViewer error:', e)
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      task?.destroy().catch(() => { /* ignore */ })
    }
  }, [url])

  return (
    <div className="bg-white p-2 sm:p-3 rounded-b-[14px]">
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Laddar dokument…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 px-4 py-6 text-warn">
          <AlertCircle size={14} className="mt-0.5" />
          <span className="text-xs">
            Dokumentet kunde inte visas inline. Använd länken ovan för att öppna i nytt fönster.
          </span>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  )
}
