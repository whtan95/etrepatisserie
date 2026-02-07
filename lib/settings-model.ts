export type AppSettingsDb = {
  sstRate: number
  tent10x10Minutes: number
  tent20x20Minutes: number
  tent20x30Minutes: number
  inventoryTaskTimesById: InventoryTaskTimesById
  mbiPermitFee: number
  mbiParkingLotFee: number
  mbiRunnerFee: number
  sundayOTFee: number
  durationExtensionFee: number
  workStartTime: string // HH:MM
  workEndTime: string // HH:MM
  lunchStartTime: string // HH:MM
  lunchEndTime: string // HH:MM
}

export type InventoryTaskTimes = {
  setupMins: number
  dismantleMins: number
}

export type InventoryTaskTimesById = Record<string, InventoryTaskTimes>

export const DEFAULT_INVENTORY_TASK_TIMES_BY_ID: InventoryTaskTimesById = {
  // Tents (defaults requested by client)
  "tent-10x10": { setupMins: 30, dismantleMins: 20 },
  "tent-20x20": { setupMins: 35, dismantleMins: 25 },
  "tent-20x30": { setupMins: 40, dismantleMins: 30 },
  // Tables & Chairs
  "table-set": { setupMins: 8, dismantleMins: 8 },
  "long-table": { setupMins: 8, dismantleMins: 8 },
  "long-table-skirting": { setupMins: 16, dismantleMins: 12 },
  "extra-chair": { setupMins: 2, dismantleMins: 4 },
  // Equipment
  "cooler-fan": { setupMins: 10, dismantleMins: 10 },
}

export type AISettingsDb = {
  hubAddress: string
  bufferTimeMinutes: number
  minutesPerKm: number
  radiusKm: number
  waitingHours: number
}

export type SettingsDb = {
  version: 1
  app: AppSettingsDb
  ai: AISettingsDb
  updatedAt: string
}

export const DEFAULT_APP_SETTINGS_DB: AppSettingsDb = {
  sstRate: 8,
  tent10x10Minutes: 30,
  tent20x20Minutes: 35,
  tent20x30Minutes: 40,
  inventoryTaskTimesById: DEFAULT_INVENTORY_TASK_TIMES_BY_ID,
  mbiPermitFee: 20,
  mbiParkingLotFee: 10,
  mbiRunnerFee: 100,
  sundayOTFee: 300,
  durationExtensionFee: 300,
  workStartTime: "08:00",
  workEndTime: "16:30",
  lunchStartTime: "13:00",
  lunchEndTime: "14:00",
}

export const DEFAULT_AI_SETTINGS_DB: AISettingsDb = {
  hubAddress: "2A, PERSIARAN KILANG PENGKALAN 28, KAWASAN PERINDUSTRIAN PENGKALAN MAJU LAHAT, 31500 Ipoh, Perak",
  bufferTimeMinutes: 30,
  minutesPerKm: 3,
  radiusKm: 10,
  waitingHours: 1.5,
}

export const DEFAULT_SETTINGS_DB: SettingsDb = {
  version: 1,
  app: DEFAULT_APP_SETTINGS_DB,
  ai: DEFAULT_AI_SETTINGS_DB,
  updatedAt: new Date(0).toISOString(),
}

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const asString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback

const isTimeHHMM = (value: string) => /^\d{1,2}:\d{2}$/.test(value)

function normalizeInventoryTaskTimesById(
  value: unknown,
  fallback: InventoryTaskTimesById
): InventoryTaskTimesById {
  const raw = (value && typeof value === "object") ? (value as any) : {}
  const out: InventoryTaskTimesById = { ...fallback }
  for (const key of Object.keys(raw)) {
    const v = raw[key]
    if (!v || typeof v !== "object") continue
    const setupMins = asNumber((v as any).setupMins, out[key]?.setupMins ?? 0)
    const dismantleMins = asNumber((v as any).dismantleMins, out[key]?.dismantleMins ?? setupMins)
    out[key] = {
      setupMins: Math.max(0, setupMins),
      dismantleMins: Math.max(0, dismantleMins),
    }
  }
  return out
}

export function normalizeSettingsDb(value: unknown): SettingsDb {
  const raw = (value && typeof value === "object") ? (value as any) : {}
  const appRaw = raw.app && typeof raw.app === "object" ? raw.app : {}
  const aiRaw = raw.ai && typeof raw.ai === "object" ? raw.ai : {}

  const app: AppSettingsDb = {
    sstRate: asNumber(appRaw.sstRate, DEFAULT_APP_SETTINGS_DB.sstRate),
    tent10x10Minutes: asNumber(appRaw.tent10x10Minutes, DEFAULT_APP_SETTINGS_DB.tent10x10Minutes),
    tent20x20Minutes: asNumber(appRaw.tent20x20Minutes, DEFAULT_APP_SETTINGS_DB.tent20x20Minutes),
    tent20x30Minutes: asNumber(appRaw.tent20x30Minutes, DEFAULT_APP_SETTINGS_DB.tent20x30Minutes),
    inventoryTaskTimesById: normalizeInventoryTaskTimesById(
      appRaw.inventoryTaskTimesById,
      DEFAULT_APP_SETTINGS_DB.inventoryTaskTimesById
    ),
    mbiPermitFee: asNumber(appRaw.mbiPermitFee, DEFAULT_APP_SETTINGS_DB.mbiPermitFee),
    mbiParkingLotFee: asNumber(appRaw.mbiParkingLotFee, DEFAULT_APP_SETTINGS_DB.mbiParkingLotFee),
    mbiRunnerFee: asNumber(appRaw.mbiRunnerFee, DEFAULT_APP_SETTINGS_DB.mbiRunnerFee),
    sundayOTFee: asNumber(appRaw.sundayOTFee, DEFAULT_APP_SETTINGS_DB.sundayOTFee),
    durationExtensionFee: asNumber(appRaw.durationExtensionFee, DEFAULT_APP_SETTINGS_DB.durationExtensionFee),
    workStartTime: (() => {
      const v = asString(appRaw.workStartTime, DEFAULT_APP_SETTINGS_DB.workStartTime)
      return isTimeHHMM(v) ? v : DEFAULT_APP_SETTINGS_DB.workStartTime
    })(),
    workEndTime: (() => {
      const v = asString(appRaw.workEndTime, DEFAULT_APP_SETTINGS_DB.workEndTime)
      return isTimeHHMM(v) ? v : DEFAULT_APP_SETTINGS_DB.workEndTime
    })(),
    lunchStartTime: (() => {
      const v = asString(appRaw.lunchStartTime, DEFAULT_APP_SETTINGS_DB.lunchStartTime)
      return isTimeHHMM(v) ? v : DEFAULT_APP_SETTINGS_DB.lunchStartTime
    })(),
    lunchEndTime: (() => {
      const v = asString(appRaw.lunchEndTime, DEFAULT_APP_SETTINGS_DB.lunchEndTime)
      return isTimeHHMM(v) ? v : DEFAULT_APP_SETTINGS_DB.lunchEndTime
    })(),
  }

  const ai: AISettingsDb = {
    hubAddress: asString(aiRaw.hubAddress, DEFAULT_AI_SETTINGS_DB.hubAddress),
    bufferTimeMinutes: asNumber(aiRaw.bufferTimeMinutes, DEFAULT_AI_SETTINGS_DB.bufferTimeMinutes),
    minutesPerKm: asNumber(aiRaw.minutesPerKm, DEFAULT_AI_SETTINGS_DB.minutesPerKm),
    radiusKm: asNumber(aiRaw.radiusKm, DEFAULT_AI_SETTINGS_DB.radiusKm),
    waitingHours: asNumber(aiRaw.waitingHours, DEFAULT_AI_SETTINGS_DB.waitingHours),
  }

  const updatedAt = asString(raw.updatedAt, new Date().toISOString())

  return {
    version: 1,
    app,
    ai,
    updatedAt,
  }
}
