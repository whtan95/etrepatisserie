"use client"

import * as React from "react"
import * as Popover from "@radix-ui/react-popover"
import { DayPicker } from "react-day-picker"
import { enGB } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatISOToDMY, normalizeDateToISO, parseDMYToISO } from "@/lib/date-dmy"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function isoToLocalDate(iso: string): Date | null {
  const normalized = normalizeDateToISO(iso || "")
  if (!normalized) return null
  const d = new Date(`${normalized}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function localDateToISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export type DatePickerDMYOnChange = (nextISO: string) => void | boolean

export function DatePickerDMY(props: {
  id?: string
  valueISO: string
  onChangeISO: DatePickerDMYOnChange
  disabled?: boolean
  placeholder?: string
  minISO?: string
  maxISO?: string
  className?: string
  inputClassName?: string
}) {
  const { id, valueISO, onChangeISO, disabled, placeholder = "dd/mm/yyyy", minISO, maxISO, className, inputClassName } = props

  const [open, setOpen] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)
  const [text, setText] = React.useState(() => formatISOToDMY(normalizeDateToISO(valueISO)))

  React.useEffect(() => {
    if (isEditing) return
    setText(formatISOToDMY(normalizeDateToISO(valueISO)))
  }, [valueISO, isEditing])

  const normalizedMinISO = React.useMemo(() => normalizeDateToISO(minISO || ""), [minISO])
  const normalizedMaxISO = React.useMemo(() => normalizeDateToISO(maxISO || ""), [maxISO])
  const minDate = React.useMemo(() => isoToLocalDate(normalizedMinISO), [normalizedMinISO])
  const maxDate = React.useMemo(() => isoToLocalDate(normalizedMaxISO), [normalizedMaxISO])

  const selected = React.useMemo(() => isoToLocalDate(valueISO), [valueISO])

  const applyISO = React.useCallback(
    (nextISO: string, opts?: { close?: boolean }) => {
      const accepted = onChangeISO(nextISO)
      if (accepted === false) {
        setText(formatISOToDMY(normalizeDateToISO(valueISO)))
        return
      }
      setText(formatISOToDMY(normalizeDateToISO(nextISO)))
      if (opts?.close) setOpen(false)
    },
    [onChangeISO, valueISO]
  )

  return (
    <div className={cn("relative", className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <div>
            <Input
              id={id}
              value={text}
              disabled={disabled}
              placeholder={placeholder}
              inputMode="numeric"
              onFocus={() => setIsEditing(true)}
              onBlur={() => {
                setIsEditing(false)
                const trimmed = text.trim()
                if (!trimmed) {
                  applyISO("")
                  return
                }
                const parsed = parseDMYToISO(trimmed)
                if (!parsed) {
                  setText(formatISOToDMY(normalizeDateToISO(valueISO)))
                  return
                }
                applyISO(parsed)
              }}
              onChange={(e) => {
                const value = e.target.value
                setText(value)
                if (!value.trim()) {
                  applyISO("")
                  return
                }
                const parsed = parseDMYToISO(value)
                if (!parsed) return

                if (normalizedMinISO && parsed < normalizedMinISO) {
                  setText(formatISOToDMY(normalizeDateToISO(valueISO)))
                  return
                }
                if (normalizedMaxISO && parsed > normalizedMaxISO) {
                  setText(formatISOToDMY(normalizeDateToISO(valueISO)))
                  return
                }
                applyISO(parsed)
              }}
              className={cn("pr-10", disabled ? "cursor-not-allowed" : "", inputClassName)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault()
                if (!disabled) setOpen(true)
              }}
              aria-label="Open calendar"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </div>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            className="z-50 rounded-md border border-border bg-card p-3 shadow-md"
          >
            <DayPicker
              mode="single"
              locale={enGB}
              className="p-1"
              classNames={{
                months: "flex flex-col",
                month: "space-y-2",
                caption: "flex items-center justify-between px-1",
                caption_label: "text-sm font-medium",
                nav: "flex items-center gap-1",
                nav_button:
                  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent",
                table: "w-full border-collapse",
                head_row: "flex",
                head_cell: "w-9 text-center text-xs font-medium text-muted-foreground",
                row: "mt-1 flex w-full",
                cell: "relative h-9 w-9 p-0 text-center text-sm",
                day: "h-9 w-9 rounded-md hover:bg-accent",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "text-muted-foreground/50",
                day_disabled: "text-muted-foreground/40",
              }}
              selected={selected ?? undefined}
              onSelect={(day) => {
                if (!day) return
                const iso = localDateToISO(day)
                if (normalizedMinISO && iso < normalizedMinISO) return
                if (normalizedMaxISO && iso > normalizedMaxISO) return
                applyISO(iso, { close: true })
              }}
              disabled={[
                ...(minDate ? [{ before: minDate }] : []),
                ...(maxDate ? [{ after: maxDate }] : []),
              ]}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
