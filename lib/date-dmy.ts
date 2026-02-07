export function formatISOToDMY(dateISO: string): string {
  const v = (dateISO || "").trim()
  if (!v) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return ""
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function isValidISODate(dateISO: string): boolean {
  const v = (dateISO || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00`)
  return !Number.isNaN(d.getTime())
}

export function normalizeDateToISO(value: string): string {
  const v = (value || "").trim()
  if (!v) return ""
  if (isValidISODate(v)) return v
  const parsed = parseDMYToISO(v)
  return parsed ?? ""
}

export function parseDMYToISO(value: string): string | null {
  const v = (value || "").trim()
  const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
  return isValidISODate(iso) ? iso : null
}

