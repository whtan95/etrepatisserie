"use client"

import { useEffect } from "react"
import type { SettingsDb } from "@/lib/settings-model"

export default function SettingsBootstrap() {
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" })
        const data = await res.json()
        if (!data?.success || !data?.settings) return
        const settings = data.settings as SettingsDb

        // Keep localStorage in sync for existing logic across the app.
        localStorage.setItem("etre_app_settings", JSON.stringify(settings.app))
        localStorage.setItem("etre_ai_settings", JSON.stringify(settings.ai))

        window.dispatchEvent(new Event("etre-settings-updated"))
      } catch {
        // ignore
      }
    }
    run()
  }, [])

  return null
}

