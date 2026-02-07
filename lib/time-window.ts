export const parseHHMMToMinutes = (value: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((value ?? "").trim())
  if (!m) return null
  const h = Number(m[1])
  const mins = Number(m[2])
  const secs = m[3] == null ? 0 : Number(m[3])
  if (!Number.isFinite(h) || !Number.isFinite(mins)) return null
  if (!Number.isFinite(secs)) return null
  if (h < 0 || h > 23 || mins < 0 || mins > 59 || secs < 0 || secs > 59) return null
  return h * 60 + mins
}

export const overlapsMinutesWindow = (startMins: number, endMins: number, winStart: number, winEnd: number) =>
  startMins < winEnd && endMins > winStart

export const getLunchWindowFromLocalStorage = () => {
  const defaults = { lunchStartTime: "13:00", lunchEndTime: "14:00" }
  if (typeof window === "undefined") return defaults
  try {
    const raw = localStorage.getItem("etre_app_settings")
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      lunchStartTime: typeof parsed.lunchStartTime === "string" ? parsed.lunchStartTime : defaults.lunchStartTime,
      lunchEndTime: typeof parsed.lunchEndTime === "string" ? parsed.lunchEndTime : defaults.lunchEndTime,
    }
  } catch {
    return defaults
  }
}

export const getWorkWindowFromLocalStorage = () => {
  const defaults = { workStartTime: "08:00", workEndTime: "16:30" }
  if (typeof window === "undefined") return defaults
  try {
    const raw = localStorage.getItem("etre_app_settings")
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      workStartTime: typeof parsed.workStartTime === "string" ? parsed.workStartTime : defaults.workStartTime,
      workEndTime: typeof parsed.workEndTime === "string" ? parsed.workEndTime : defaults.workEndTime,
    }
  } catch {
    return defaults
  }
}
