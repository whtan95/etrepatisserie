"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

type Point = { x: number; y: number }
type Size = { width: number; height: number }

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export interface FloatingWindowProps {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  defaultPosition?: Point
  defaultSize?: Size
  minWidth?: number
  minHeight?: number
}

export function FloatingWindow({
  open,
  title,
  children,
  onClose,
  defaultPosition,
  defaultSize,
  minWidth = 380,
  minHeight = 260,
}: FloatingWindowProps) {
  const initialPosition = useMemo<Point>(() => defaultPosition ?? { x: 24, y: 96 }, [defaultPosition])
  const initialSize = useMemo<Size>(() => defaultSize ?? { width: 820, height: 620 }, [defaultSize])

  const [position, setPosition] = useState<Point>(initialPosition)
  const [size, setSize] = useState<Size>(initialSize)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const dragStartRef = useRef<{ start: Point; origin: Point } | null>(null)
  const resizeStartRef = useRef<{ start: Point; origin: Size } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const clampToViewport = (nextPos: Point, nextSize: Size) => {
    const padding = 8
    const maxX = Math.max(padding, window.innerWidth - nextSize.width - padding)
    const maxY = Math.max(padding, window.innerHeight - nextSize.height - padding)
    return {
      x: clamp(nextPos.x, padding, maxX),
      y: clamp(nextPos.y, padding, maxY),
    }
  }

  const onDragPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest?.("button,a,input,select,textarea,[data-no-drag]")) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragStartRef.current = { start: { x: e.clientX, y: e.clientY }, origin: position }
    setIsDragging(true)
  }

  const onDragPointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.start.x
    const dy = e.clientY - dragStartRef.current.start.y
    const next = { x: dragStartRef.current.origin.x + dx, y: dragStartRef.current.origin.y + dy }
    setPosition(clampToViewport(next, size))
  }

  const onDragPointerUp = () => {
    dragStartRef.current = null
    setIsDragging(false)
  }

  const onResizePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    resizeStartRef.current = { start: { x: e.clientX, y: e.clientY }, origin: size }
    setIsResizing(true)
  }

  const onResizePointerMove = (e: React.PointerEvent) => {
    if (!resizeStartRef.current) return
    const dx = e.clientX - resizeStartRef.current.start.x
    const dy = e.clientY - resizeStartRef.current.start.y
    const nextSize = {
      width: Math.max(minWidth, resizeStartRef.current.origin.width + dx),
      height: Math.max(minHeight, resizeStartRef.current.origin.height + dy),
    }
    setSize(nextSize)
    setPosition((p) => clampToViewport(p, nextSize))
  }

  const onResizePointerUp = () => {
    resizeStartRef.current = null
    setIsResizing(false)
  }

  return (
    <div
      className="fixed z-[60] flex flex-col rounded-lg border border-border bg-card shadow-xl"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      <div
        className={[
          "flex items-center justify-between gap-2 border-b border-border px-3 py-2 select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        ].join(" ")}
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} data-no-drag aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">{children}</div>

      <div
        className={[
          "absolute bottom-1 right-1 h-4 w-4 rounded-sm border border-border bg-muted/60",
          isResizing ? "cursor-nwse-resize opacity-100" : "cursor-nwse-resize opacity-70 hover:opacity-100",
        ].join(" ")}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        aria-label="Resize"
        title="Resize"
        data-no-drag
      />
    </div>
  )
}
