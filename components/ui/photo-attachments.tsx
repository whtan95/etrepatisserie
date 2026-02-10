"use client"

import React, { useMemo, useRef, useState } from "react"
import { Camera, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PhotoAttachment } from "@/lib/types"

type Draft = PhotoAttachment

function nowDate() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

export function PhotoAttachmentsEditor(props: {
  title: string
  value: Draft[]
  onChange: (next: Draft[]) => void
  onSubmit: () => void
  submitLabel?: string
  disabled?: boolean
}) {
  const { title, value, onChange, onSubmit, submitLabel = "Submit", disabled } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const [isReading, setIsReading] = useState(false)

  const missingDescriptionCount = useMemo(
    () => value.filter((p) => !(p.description || "").trim()).length,
    [value],
  )
  const missingDateCount = useMemo(() => value.filter((p) => !(p.date || "").trim()).length, [value])
  const missingTimeCount = useMemo(() => value.filter((p) => !(p.time || "").trim()).length, [value])
  const canSubmit = value.length > 0 && missingDescriptionCount === 0 && missingDateCount === 0 && missingTimeCount === 0

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setIsReading(true)
    try {
      const now = new Date().toISOString()
      const drafts: Draft[] = []
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file)
        if (!dataUrl) continue
        drafts.push({
          id: makeId(),
          fileName: file.name,
          dataUrl,
          date: nowDate(),
          time: nowTime(),
          description: "",
          uploadedAt: now,
        })
      }
      if (drafts.length) onChange([...value, ...drafts])
    } finally {
      setIsReading(false)
    }
  }

  const updateOne = (id: string, patch: Partial<Draft>) => {
    onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const removeOne = (id: string) => {
    onChange(value.filter((p) => p.id !== id))
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files
              addFiles(files)
              e.currentTarget.value = ""
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-2 bg-transparent"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isReading}
          >
            <Camera className="h-4 w-4" />
            Upload images
          </Button>
          <Button
            type="button"
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={onSubmit}
            disabled={disabled || !canSubmit}
            title={
              value.length === 0
                ? "Upload at least 1 image."
                : !canSubmit
                  ? "Fill Date, Time, and Description for all images."
                  : submitLabel
            }
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images uploaded yet.</p>
      ) : (
        <div className="space-y-3">
          {value.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <img
                  src={p.dataUrl || "/placeholder.svg"}
                  alt={p.fileName}
                  className="h-24 w-24 rounded-md border border-border object-cover"
                />

                <div className="flex-1 grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date *</Label>
                    <Input
                      type="date"
                      value={p.date}
                      onChange={(e) => updateOne(p.id, { date: e.target.value })}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Time *</Label>
                    <Input
                      type="time"
                      value={p.time}
                      onChange={(e) => updateOne(p.id, { time: e.target.value })}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs text-muted-foreground">Description *</Label>
                    <Textarea
                      value={p.description}
                      onChange={(e) => updateOne(p.id, { description: e.target.value })}
                      placeholder="What is this photo about?"
                      disabled={disabled}
                    />
                  </div>
                </div>

                <div className="flex justify-end md:justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="bg-transparent"
                    onClick={() => removeOne(p.id)}
                    disabled={disabled}
                    title="Remove image"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground truncate" title={p.fileName}>
                {p.fileName}
              </p>
            </div>
          ))}
        </div>
      )}

      {value.length > 0 && !canSubmit ? (
        <p className="text-xs text-muted-foreground">
          Required: Date, Time, Description for every image.
        </p>
      ) : null}
    </div>
  )
}

