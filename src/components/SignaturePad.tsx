import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

interface Props {
  onChange: (dataUrl: string | null) => void
}

export function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#18181b'
  }, [])

  function pointFromEvent(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      if (!t) return null
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const p = pointFromEvent(e)
    if (!p) return
    drawingRef.current = true
    lastRef.current = p
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const p = pointFromEvent(e)
    if (!p || !lastRef.current) return
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
    if (!hasInk) {
      setHasInk(true)
      onChange(canvas.toDataURL('image/png'))
    } else {
      onChange(canvas.toDataURL('image/png'))
    }
  }

  function end() {
    drawingRef.current = false
    lastRef.current = null
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted">Signatur</label>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="flex items-center gap-1 text-[11px] text-muted hover:text-fg transition-colors disabled:opacity-30"
        >
          <Eraser size={11} />Rensa
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-44 bg-white border border-border rounded-lg cursor-crosshair touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <p className="text-[11px] text-subtle">Signera med musen eller fingret/pekpennan</p>
    </div>
  )
}
