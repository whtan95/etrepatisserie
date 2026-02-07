"use client"

import { Button } from "@/components/ui/button"

interface AlertDialogProps {
  open: boolean
  title?: string
  description?: string
  actionText?: string
  onClose: () => void
}

export function AlertDialog({
  open,
  title = "Notice",
  description,
  actionText = "OK",
  onClose,
}: AlertDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>{actionText}</Button>
        </div>
      </div>
    </div>
  )
}

