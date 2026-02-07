import fs from "node:fs/promises"
import path from "node:path"
import { DEFAULT_SETTINGS_DB, normalizeSettingsDb, type SettingsDb } from "@/lib/settings-model"

const DB_DIR = path.join(process.cwd(), "data")
const DB_PATH = path.join(DB_DIR, "settings-db.json")

async function ensureDir() {
  await fs.mkdir(DB_DIR, { recursive: true })
}

async function readJsonFile(): Promise<SettingsDb | null> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8")
    return normalizeSettingsDb(JSON.parse(raw))
  } catch {
    return null
  }
}

async function writeJsonFile(settings: SettingsDb) {
  await ensureDir()
  const tmp = DB_PATH + ".tmp"
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), "utf8")
  await fs.rename(tmp, DB_PATH)
}

export async function getSettingsDb(): Promise<SettingsDb> {
  const existing = await readJsonFile()
  if (existing) return existing

  const fresh: SettingsDb = {
    ...DEFAULT_SETTINGS_DB,
    updatedAt: new Date().toISOString(),
  }
  await writeJsonFile(fresh)
  return fresh
}

export async function updateSettingsDb(partial: Partial<SettingsDb>): Promise<SettingsDb> {
  const current = await getSettingsDb()
  const merged = normalizeSettingsDb({
    ...current,
    ...partial,
    app: { ...current.app, ...(partial as any).app },
    ai: { ...current.ai, ...(partial as any).ai },
    updatedAt: new Date().toISOString(),
  })
  await writeJsonFile(merged)
  return merged
}

