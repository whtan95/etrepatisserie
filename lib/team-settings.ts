import type { TeamName } from "@/lib/mapping-types"

export type TeamId = TeamName

export interface TeamConfig {
  id: TeamId
  name: string
  color: string
  leader: string
  members: string[]
}

export const TEAM_SETTINGS_KEY = "etre_team_settings"

export const DEFAULT_TEAM_CONFIGS: TeamConfig[] = [
  { id: "Team A", name: "Team A", color: "#ef4444", leader: "", members: [] },
  { id: "Team B", name: "Team B", color: "#f59e0b", leader: "", members: [] },
  { id: "Team C", name: "Team C", color: "#3b82f6", leader: "", members: [] },
  { id: "Team D", name: "Team D", color: "#22c55e", leader: "", members: [] },
  { id: "Team E", name: "Team E", color: "#8b5cf6", leader: "", members: [] },
]

const normalizeColor = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback
  const s = value.trim()
  if (!s) return fallback
  // accept hex colors; otherwise fallback
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s
  return fallback
}

const normalizeTeamConfigs = (value: unknown): TeamConfig[] | null => {
  if (!Array.isArray(value)) return null

  const defaultsById = new Map<TeamId, TeamConfig>(
    DEFAULT_TEAM_CONFIGS.map((t) => [t.id, t])
  )

  const byId = new Map<TeamId, TeamConfig>()
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const id = (item as any).id as TeamId
    if (!defaultsById.has(id)) continue
    const def = defaultsById.get(id)!
    const name = typeof (item as any).name === "string" && (item as any).name.trim()
      ? (item as any).name.trim()
      : def.name
    const color = normalizeColor((item as any).color, def.color)
    const leader = typeof (item as any).leader === "string" ? (item as any).leader : ""
    const membersRaw = (item as any).members
    const members = Array.isArray(membersRaw)
      ? membersRaw.filter((m: unknown) => typeof m === "string").map((m: string) => m.trim()).filter(Boolean)
      : []
    byId.set(id, { id, name, color, leader: leader.trim(), members })
  }

  return DEFAULT_TEAM_CONFIGS.map((t) => byId.get(t.id) ?? t)
}

export function getTeamConfigs(): TeamConfig[] {
  if (typeof window === "undefined") return DEFAULT_TEAM_CONFIGS
  try {
    const stored = localStorage.getItem(TEAM_SETTINGS_KEY)
    if (!stored) return DEFAULT_TEAM_CONFIGS
    const parsed = JSON.parse(stored)
    const normalized = normalizeTeamConfigs(parsed)
    if (!normalized) return DEFAULT_TEAM_CONFIGS
    // persist normalized shape
    localStorage.setItem(TEAM_SETTINGS_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    return DEFAULT_TEAM_CONFIGS
  }
}

export function saveTeamConfigs(configs: TeamConfig[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(TEAM_SETTINGS_KEY, JSON.stringify(configs))
}

export function resetTeamConfigsToDefault() {
  saveTeamConfigs(DEFAULT_TEAM_CONFIGS)
}

export function getTeamConfig(team: TeamId): TeamConfig {
  return getTeamConfigs().find((t) => t.id === team) ?? DEFAULT_TEAM_CONFIGS[0]
}

export function getTeamDisplayName(team: TeamId): string {
  return getTeamConfig(team).name || team
}

export function getTeamDisplayColor(team: TeamId): string {
  return getTeamConfig(team).color || "#6b7280"
}

