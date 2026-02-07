"use client"

import { useCallback, useState } from "react"

export interface AppAlertState {
  open: boolean
  title: string
  description: string
  actionText: string
  onClose?: () => void
}

export function useAppAlert(defaultTitle = "Notice") {
  const [alertState, setAlertState] = useState<AppAlertState>({
    open: false,
    title: defaultTitle,
    description: "",
    actionText: "OK",
    onClose: undefined,
  })

  const showAlert = useCallback(
    (
      description: string,
      options?: Partial<Pick<AppAlertState, "title" | "actionText" | "onClose">>
    ) => {
      setAlertState({
        open: true,
        title: options?.title ?? defaultTitle,
        description,
        actionText: options?.actionText ?? "OK",
        onClose: options?.onClose,
      })
    },
    [defaultTitle]
  )

  const closeAlert = useCallback(() => {
    setAlertState((prev) => {
      prev.onClose?.()
      return { ...prev, open: false, onClose: undefined }
    })
  }, [])

  return { alertState, showAlert, closeAlert }
}
