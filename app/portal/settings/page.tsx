"use client"

import React, { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Settings as SettingsIcon, Save, RotateCcw, Sparkles } from "lucide-react"
import type { UserRole, RoleAccessControl } from "@/lib/types"
import { getRoleAccessControl, saveRoleAccessControl, resetAccessControlToDefault } from "@/lib/role-storage"
import type { TeamConfig } from "@/lib/team-settings"
import { DEFAULT_TEAM_CONFIGS, getTeamConfigs, resetTeamConfigsToDefault, saveTeamConfigs } from "@/lib/team-settings"
import type { AppSettingsDb, AISettingsDb } from "@/lib/settings-model"
import { DEFAULT_APP_SETTINGS_DB, DEFAULT_AI_SETTINGS_DB } from "@/lib/settings-model"
import type { InventoryItem } from "@/lib/inventory"
import { DEFAULT_INVENTORY_ITEMS } from "@/lib/inventory"
import { getInventoryDbFromLocalStorage, hasInventoryDbInLocalStorage, saveInventoryDbToLocalStorage } from "@/lib/inventory-storage"

// UI defaults (sourced from Settings DB defaults)
const DEFAULT_SST_RATE = DEFAULT_APP_SETTINGS_DB.sstRate
const DEFAULT_MBI_PERMIT_FEE = DEFAULT_APP_SETTINGS_DB.mbiPermitFee
const DEFAULT_MBI_PARKING_LOT_FEE = DEFAULT_APP_SETTINGS_DB.mbiParkingLotFee
const DEFAULT_MBI_RUNNER_FEE = DEFAULT_APP_SETTINGS_DB.mbiRunnerFee
const DEFAULT_SUNDAY_OT_FEE = DEFAULT_APP_SETTINGS_DB.sundayOTFee
const DEFAULT_WORK_START_TIME = DEFAULT_APP_SETTINGS_DB.workStartTime
const DEFAULT_WORK_END_TIME = DEFAULT_APP_SETTINGS_DB.workEndTime
const DEFAULT_LUNCH_START_TIME = DEFAULT_APP_SETTINGS_DB.lunchStartTime
const DEFAULT_LUNCH_END_TIME = DEFAULT_APP_SETTINGS_DB.lunchEndTime

const DEFAULT_HUB_ADDRESS = DEFAULT_AI_SETTINGS_DB.hubAddress
const DEFAULT_BUFFER_TIME_MINUTES = DEFAULT_AI_SETTINGS_DB.bufferTimeMinutes
const DEFAULT_MINUTES_PER_KM = DEFAULT_AI_SETTINGS_DB.minutesPerKm
const DEFAULT_RADIUS_KM = DEFAULT_AI_SETTINGS_DB.radiusKm
const DEFAULT_WAITING_HOURS = DEFAULT_AI_SETTINGS_DB.waitingHours

type AppSettings = AppSettingsDb
type AISettings = AISettingsDb

// All available pages in the portal
const ALL_PAGES = [
  { path: "/portal/status-tracking", label: "Status Tracking" },
  { path: "/portal/mapping", label: "Mapping" },
  { path: "/portal/sales-order", label: "Sales Quotation" },
  { path: "/portal/ad-hoc", label: "Adhoc Quotation" },
  { path: "/portal/sales-confirmation", label: "Sales Confirmation" },
  { path: "/portal/planning", label: "Planning" },
  { path: "/portal/procurement", label: "Procurement" },
  { path: "/portal/setting-up", label: "Delivery (Setup)" },
  { path: "/portal/dismantle", label: "Delivery (Dismantle)" },
  { path: "/portal/invoice", label: "Invoice" },
  { path: "/portal/inventory", label: "Inventory" },
  { path: "/portal/warnings", label: "Warning & Issues" },
  { path: "/portal/settings", label: "Settings" },
]

const ROLES: UserRole[] = ["Manager", "Sales", "Warehouse", "Traffic", "Operation", "User"]

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryTab = (searchParams.get("tab") || "application").toLowerCase()
  const derivedRootTab = queryTab === "instruction" ? "instruction" : "settings"
  const [rootTab, setRootTab] = useState<string>(derivedRootTab)

  useEffect(() => {
    setRootTab(derivedRootTab)
  }, [derivedRootTab])

  // Application Settings State
  const [settings, setSettings] = useState<AppSettings>({
    ...DEFAULT_APP_SETTINGS_DB,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  // AI Assistant Settings State
  const [aiSettings, setAISettings] = useState<AISettings>({
    ...DEFAULT_AI_SETTINGS_DB,
  })
  const [aiSaving, setAISaving] = useState(false)
  const [aiSaveMessage, setAISaveMessage] = useState("")
  const [showAIConfirm, setShowAIConfirm] = useState(false)

  // Team Settings State (5 fixed teams)
  const [teamConfigs, setTeamConfigs] = useState<TeamConfig[]>(DEFAULT_TEAM_CONFIGS)
  const [teamSaving, setTeamSaving] = useState(false)
  const [teamSaveMessage, setTeamSaveMessage] = useState("")

  // Role-Based Access Control State
  const [accessControl, setAccessControl] = useState<RoleAccessControl[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [accessResetOpen, setAccessResetOpen] = useState(false)
  const [accessSavedOpen, setAccessSavedOpen] = useState(false)

  // Inventory list (times are stored in Settings DB under app.inventoryTaskTimesById)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(DEFAULT_INVENTORY_ITEMS)
  const [inventorySaving, setInventorySaving] = useState(false)
  const [inventorySaveMessage, setInventorySaveMessage] = useState("")

  // Load application settings from Settings DB (fallback to localStorage)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" })
        const data = await res.json()
        if (data?.success && data?.settings?.app) {
          setSettings(data.settings.app as AppSettings)
          localStorage.setItem("etre_app_settings", JSON.stringify(data.settings.app))
          return
        }
      } catch {
        // ignore
      }

      const savedSettings = localStorage.getItem("etre_app_settings")
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings)
          setSettings({ ...DEFAULT_APP_SETTINGS_DB, ...parsed })
        } catch (error) {
          console.error("Failed to load settings:", error)
        }
      }
    }
    run()
  }, [])

  // Load inventory items (for setup/dismantle time configuration)
  useEffect(() => {
    if (hasInventoryDbInLocalStorage()) {
      const localDb = getInventoryDbFromLocalStorage()
      if (Array.isArray(localDb.items) && localDb.items.length) {
        setInventoryItems(localDb.items)
      }
    }

    let canceled = false
    ;(async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) return
        if (!canceled && Array.isArray(data.inventory?.items)) {
          if (!hasInventoryDbInLocalStorage()) {
            const saved = saveInventoryDbToLocalStorage(data.inventory.items)
            setInventoryItems(saved.items)
          }
        }
      } catch {
        // ignore and keep defaults
      }
    })()
    return () => {
      canceled = true
    }
  }, [])

  // Ensure newly added inventory items appear in the times list (defaulting to 0/0 unless preset exists)
  useEffect(() => {
    if (!inventoryItems.length) return
    setSettings((prev) => {
      const current = (prev as any).inventoryTaskTimesById as Record<string, { setupMins: number; dismantleMins: number }> | undefined
      const next = { ...(current || {}) }
      let changed = false

      for (const item of inventoryItems) {
        if (!item?.id) continue
        if (next[item.id]) continue
        const preset = DEFAULT_APP_SETTINGS_DB.inventoryTaskTimesById[item.id]
        next[item.id] = preset ? { ...preset } : { setupMins: 0, dismantleMins: 0 }
        changed = true
      }

      return changed ? ({ ...prev, inventoryTaskTimesById: next } as any) : prev
    })
  }, [inventoryItems])

  // Load access control on mount
  useEffect(() => {
    const control = getRoleAccessControl()
    setAccessControl(control)
  }, [])

  // Load AI settings from Settings DB (fallback to localStorage)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" })
        const data = await res.json()
        if (data?.success && data?.settings?.ai) {
          setAISettings(data.settings.ai as AISettings)
          localStorage.setItem("etre_ai_settings", JSON.stringify(data.settings.ai))
          return
        }
      } catch {
        // ignore
      }

      const savedAISettings = localStorage.getItem("etre_ai_settings")
      if (savedAISettings) {
        try {
          const parsed = JSON.parse(savedAISettings)
          setAISettings({ ...DEFAULT_AI_SETTINGS_DB, ...parsed })
        } catch (error) {
          console.error("Failed to load AI settings:", error)
        }
      }
    }
    run()
  }, [])

  // Load team settings from localStorage on mount
  useEffect(() => {
    setTeamConfigs(getTeamConfigs())
  }, [])

  const handleSaveTeamSettings = () => {
    setTeamSaving(true)
    setTeamSaveMessage("")
    try {
      saveTeamConfigs(teamConfigs)
      setTeamSaveMessage("Team settings saved successfully!")
      setTimeout(() => setTeamSaveMessage(""), 3000)
    } catch (error) {
      console.error("Failed to save team settings:", error)
      setTeamSaveMessage("Failed to save team settings")
    } finally {
      setTeamSaving(false)
    }
  }

  const handleResetTeamSettings = () => {
    resetTeamConfigsToDefault()
    setTeamConfigs(DEFAULT_TEAM_CONFIGS)
    setTeamSaveMessage("")
  }

  // AI Settings Handlers
  const handleSaveAISettings = () => {
    setAISaving(true)
    setAISaveMessage("")
    try {
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { ai: aiSettings } }),
      }).catch(() => {})

      localStorage.setItem("etre_ai_settings", JSON.stringify(aiSettings))
      setAISaveMessage("AI settings saved successfully!")
      setShowAIConfirm(false)
      setTimeout(() => setAISaveMessage(""), 3000)
    } catch (error) {
      console.error("Failed to save AI settings:", error)
      setAISaveMessage("Failed to save AI settings")
    } finally {
      setAISaving(false)
    }
  }

  const handleResetAISettings = () => {
    setAISettings({
      ...DEFAULT_AI_SETTINGS_DB,
    })
    setAISaveMessage("")
  }

  // Application Settings Handlers
  const handleSaveAppSettings = () => {
    setIsSaving(true)
    setSaveMessage("")

    try {
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { app: settings } }),
      }).catch(() => {})

      localStorage.setItem("etre_app_settings", JSON.stringify(settings))
      setSaveMessage("Settings saved successfully!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (error) {
      console.error("Failed to save settings:", error)
      setSaveMessage("Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetToPreset = () => {
    setSettings({
      ...DEFAULT_APP_SETTINGS_DB,
    })
    setSaveMessage("")
  }

  const updateInventoryTimes = (id: string, patch: Partial<{ setupMins: number; dismantleMins: number }>) => {
    setSettings((prev) => {
      const current = (prev as any).inventoryTaskTimesById as Record<string, { setupMins: number; dismantleMins: number }> | undefined
      const base = current?.[id] || DEFAULT_APP_SETTINGS_DB.inventoryTaskTimesById[id] || { setupMins: 0, dismantleMins: 0 }
      const nextTimes = {
        setupMins: Number.isFinite(patch.setupMins as number) ? Math.max(0, Number(patch.setupMins)) : base.setupMins,
        dismantleMins: Number.isFinite(patch.dismantleMins as number) ? Math.max(0, Number(patch.dismantleMins)) : base.dismantleMins,
      }
      return {
        ...prev,
        inventoryTaskTimesById: { ...(current || {}), [id]: nextTimes },
      } as any
    })
  }

  const handleSaveInventoryTimes = async () => {
    setInventorySaving(true)
    setInventorySaveMessage("")
    try {
      const current = (settings as any).inventoryTaskTimesById as Record<string, { setupMins: number; dismantleMins: number }> | undefined
      const cleanedTimes: Record<string, { setupMins: number; dismantleMins: number }> = {}
      for (const [id, v] of Object.entries(current || {})) {
        const setupMins = Number.isFinite(v?.setupMins) ? Math.max(0, Number(v.setupMins)) : 0
        const dismantleMins = Number.isFinite(v?.dismantleMins) ? Math.max(0, Number(v.dismantleMins)) : 0
        cleanedTimes[id] = { setupMins, dismantleMins }
      }
      // Ensure every current inventory item has an entry
      for (const item of inventoryItems) {
        if (!item?.id) continue
        if (cleanedTimes[item.id]) continue
        const preset = DEFAULT_APP_SETTINGS_DB.inventoryTaskTimesById[item.id]
        cleanedTimes[item.id] = preset ? { ...preset } : { setupMins: 0, dismantleMins: 0 }
      }

      const nextSettings = { ...settings, inventoryTaskTimesById: cleanedTimes } as any

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { app: nextSettings } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to save inventory times")

      setSettings(nextSettings)
      localStorage.setItem("etre_app_settings", JSON.stringify(nextSettings))
      setInventorySaveMessage("Inventory times saved!")
      setTimeout(() => setInventorySaveMessage(""), 3000)
    } catch {
      setInventorySaveMessage("Failed to save inventory times")
    } finally {
      setInventorySaving(false)
    }
  }

  // Role-Based Access Control Handlers
  const handleTogglePage = (role: UserRole, pagePath: string) => {
    setAccessControl((prev) => {
      const updated = prev.map((config) => {
        if (config.role === role) {
          const hasPage = config.allowedPages.includes(pagePath)
          return {
            ...config,
            allowedPages: hasPage
              ? config.allowedPages.filter((p) => p !== pagePath)
              : [...config.allowedPages, pagePath],
          }
        }
        return config
      })
      setHasChanges(true)
      return updated
    })
  }

  const hasAccess = (role: UserRole, pagePath: string): boolean => {
    const roleConfig = accessControl.find((config) => config.role === role)
    return roleConfig ? roleConfig.allowedPages.includes(pagePath) : false
  }

  const handleSaveAccessControl = () => {
    saveRoleAccessControl(accessControl)
    setHasChanges(false)
    setAccessSavedOpen(true)
  }

  const handleResetAccessControl = () => {
    setAccessResetOpen(true)
  }

  const handleConfirmResetAccessControl = () => {
    resetAccessControlToDefault()
    const control = getRoleAccessControl()
    setAccessControl(control)
    setHasChanges(false)
    setAccessResetOpen(false)
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={accessSavedOpen}
        title="Access control saved"
        description="Role-based access control settings have been updated."
        actionText="Got it"
        onClose={() => setAccessSavedOpen(false)}
      />
      <ConfirmDialog
        open={accessResetOpen}
        title="Reset access control?"
        description="This will restore the default role access settings."
        confirmText="Reset"
        cancelText="Cancel"
        onConfirm={handleConfirmResetAccessControl}
        onCancel={() => setAccessResetOpen(false)}
      />
      <ConfirmDialog
        open={showAIConfirm}
        title="Save AI Settings?"
        description="Are you sure you want to save these AI Assistant settings? This will affect how the AI Schedule feature calculates travel times and schedules."
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={handleSaveAISettings}
        onCancel={() => setShowAIConfirm(false)}
      />
      <Tabs
        value={rootTab}
        onValueChange={(v) => {
          setRootTab(v)
          const next = v === "instruction" ? "instruction" : "application"
          router.replace(`/portal/settings?tab=${next}`)
        }}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-2">
          <TabsTrigger value="settings">Application Settings</TabsTrigger>
          <TabsTrigger value="instruction">Instruction</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6 space-y-4">
          <Tabs defaultValue="application" className="w-full">
            <TabsList className="grid w-full max-w-3xl grid-cols-4">
              <TabsTrigger value="application">Application Settings</TabsTrigger>
              <TabsTrigger value="ai-assistant" className="gap-1">
                <Sparkles className="h-4 w-4" />
                AI Assistant
              </TabsTrigger>
              <TabsTrigger value="teams">Team Settings</TabsTrigger>
              <TabsTrigger value="roles">Role-Based Access</TabsTrigger>
            </TabsList>

            {/* Application Settings Tab */}
            <TabsContent value="application" className="mt-6 space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
              <SettingsIcon className="h-5 w-5" />
              Application Settings
            </h2>

            <Tabs defaultValue="pricing" className="w-full">
              <TabsList className="grid w-full max-w-2xl grid-cols-3">
                <TabsTrigger value="pricing">Systematic Pricing</TabsTrigger>
                <TabsTrigger value="setup-times">Setup Times</TabsTrigger>
                <TabsTrigger value="working-hours">Working Hours</TabsTrigger>
              </TabsList>

              <TabsContent value="pricing" className="mt-6 space-y-8">
                {/* SST Rate */}
                <div className="rounded-lg border border-border bg-muted/30 p-6">
                  <h3 className="mb-4 text-base font-semibold text-foreground">SST Rate</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Configure the Sales and Service Tax rate applied to items. This affects all calculations throughout the system.
                  </p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-2">
                      <Label className="text-foreground">SST Rate (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={settings.sstRate}
                        onChange={(e) => setSettings(prev => ({ ...prev, sstRate: parseFloat(e.target.value) || 0 }))}
                        placeholder="8"
                        className="border-border"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setSettings(prev => ({ ...prev, sstRate: DEFAULT_SST_RATE }))}
                      className="gap-2 bg-transparent"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Preset ({DEFAULT_SST_RATE}%)
                    </Button>
                  </div>
                </div>

                {/* System Fees (Not Inventory) */}
                <div className="rounded-lg border border-border bg-muted/30 p-6">
                  <h3 className="mb-4 text-base font-semibold text-foreground">System Fees (Not Inventory)</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    These fees are configured centrally and used by Sales Order and Ad Hoc. They should not appear in Inventory.
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-foreground">MBI Permit Fee (RM / day)</Label>
                      <div className="flex items-end gap-3">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={settings.mbiPermitFee}
                          onChange={(e) => setSettings(prev => ({ ...prev, mbiPermitFee: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          placeholder={String(DEFAULT_MBI_PERMIT_FEE)}
                          className="border-border"
                        />
                        <Button
                          variant="outline"
                          onClick={() => setSettings(prev => ({ ...prev, mbiPermitFee: DEFAULT_MBI_PERMIT_FEE }))}
                          className="gap-2 bg-transparent"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Preset (RM {DEFAULT_MBI_PERMIT_FEE})
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">MBI Parking Lots (RM / lot)</Label>
                      <div className="flex items-end gap-3">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={settings.mbiParkingLotFee}
                          onChange={(e) => setSettings(prev => ({ ...prev, mbiParkingLotFee: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          placeholder={String(DEFAULT_MBI_PARKING_LOT_FEE)}
                          className="border-border"
                        />
                        <Button
                          variant="outline"
                          onClick={() => setSettings(prev => ({ ...prev, mbiParkingLotFee: DEFAULT_MBI_PARKING_LOT_FEE }))}
                          className="gap-2 bg-transparent"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Preset (RM {DEFAULT_MBI_PARKING_LOT_FEE})
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">MBI Runner Fee (RM)</Label>
                      <div className="flex items-end gap-3">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={settings.mbiRunnerFee}
                          onChange={(e) => setSettings(prev => ({ ...prev, mbiRunnerFee: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          placeholder={String(DEFAULT_MBI_RUNNER_FEE)}
                          className="border-border"
                        />
                        <Button
                          variant="outline"
                          onClick={() => setSettings(prev => ({ ...prev, mbiRunnerFee: DEFAULT_MBI_RUNNER_FEE }))}
                          className="gap-2 bg-transparent"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Preset (RM {DEFAULT_MBI_RUNNER_FEE})
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">Sunday OT Fee (RM / day)</Label>
                      <div className="flex items-end gap-3">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={settings.sundayOTFee}
                          onChange={(e) => setSettings(prev => ({ ...prev, sundayOTFee: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          placeholder={String(DEFAULT_SUNDAY_OT_FEE)}
                          className="border-border"
                        />
                        <Button
                          variant="outline"
                          onClick={() => setSettings(prev => ({ ...prev, sundayOTFee: DEFAULT_SUNDAY_OT_FEE }))}
                          className="gap-2 bg-transparent"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Preset (RM {DEFAULT_SUNDAY_OT_FEE})
                        </Button>
                      </div>
                    </div>

                  </div>
                </div>
              </TabsContent>

              <TabsContent value="setup-times" className="mt-6 space-y-8">
                {/* Inventory Setup/Dismantle Times */}
                <div className="rounded-lg border border-border bg-muted/30 p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Inventory Setup & Dismantle Times</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Set per-unit minutes used by scheduling (setup vs dismantle). Applies to items from the Inventory tab.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleSaveInventoryTimes}
                        disabled={inventorySaving}
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {inventorySaving ? "Saving..." : "Save Times"}
                      </Button>
                    </div>
                  </div>

                  {inventorySaveMessage && (
                    <p className="mt-3 text-sm text-muted-foreground">{inventorySaveMessage}</p>
                  )}

                  <div className="mt-4 overflow-auto rounded-md border border-border bg-card">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="p-3">Name</th>
                          <th className="p-3 w-56">Category</th>
                          <th className="p-3 w-36">Setup (mins)</th>
                          <th className="p-3 w-36">Dismantle (mins)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryItems.map((it) => (
                          <tr key={it.id} className="border-t border-border">
                            <td className="p-3">
                              <div className="font-medium text-foreground">{it.name}</div>
                              <div className="text-xs text-muted-foreground">{it.id}</div>
                            </td>
                            <td className="p-3">{it.category}</td>
                            <td className="p-3">
                              <Input
                                type="number"
                                min="0"
                                value={(settings as any).inventoryTaskTimesById?.[it.id]?.setupMins ?? (DEFAULT_APP_SETTINGS_DB.inventoryTaskTimesById[it.id]?.setupMins ?? 0)}
                                onChange={(e) => updateInventoryTimes(it.id, { setupMins: Number(e.target.value) || 0 })}
                              />
                            </td>
                            <td className="p-3">
                              <Input
                                type="number"
                                min="0"
                                value={(settings as any).inventoryTaskTimesById?.[it.id]?.dismantleMins ?? (DEFAULT_APP_SETTINGS_DB.inventoryTaskTimesById[it.id]?.dismantleMins ?? 0)}
                                onChange={(e) => updateInventoryTimes(it.id, { dismantleMins: Number(e.target.value) || 0 })}
                              />
                            </td>
                          </tr>
                        ))}
                        {inventoryItems.length === 0 && (
                          <tr>
                            <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                              No inventory items found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="working-hours" className="mt-6 space-y-8">
                <div className="rounded-lg border border-border bg-muted/30 p-6">
                  <h3 className="mb-4 text-base font-semibold text-foreground">Working Hours</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Used by AI Schedule and validations (e.g., lunch planning and end-of-day behavior).
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Work starts (default 8:00am)</Label>
                      <Input
                        type="time"
                        value={settings.workStartTime}
                        onChange={(e) => setSettings(prev => ({ ...prev, workStartTime: e.target.value }))}
                        className="border-border"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettings(prev => ({ ...prev, workStartTime: DEFAULT_WORK_START_TIME }))}
                        className="gap-2 bg-transparent"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Preset ({DEFAULT_WORK_START_TIME})
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">Work ends (default 4:30pm)</Label>
                      <Input
                        type="time"
                        value={settings.workEndTime}
                        onChange={(e) => setSettings(prev => ({ ...prev, workEndTime: e.target.value }))}
                        className="border-border"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettings(prev => ({ ...prev, workEndTime: DEFAULT_WORK_END_TIME }))}
                        className="gap-2 bg-transparent"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Preset ({DEFAULT_WORK_END_TIME})
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">Lunch start (default 1:00pm)</Label>
                      <Input
                        type="time"
                        value={settings.lunchStartTime}
                        onChange={(e) => setSettings(prev => ({ ...prev, lunchStartTime: e.target.value }))}
                        className="border-border"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettings(prev => ({ ...prev, lunchStartTime: DEFAULT_LUNCH_START_TIME }))}
                        className="gap-2 bg-transparent"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Preset ({DEFAULT_LUNCH_START_TIME})
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">Lunch end (default 2:00pm)</Label>
                      <Input
                        type="time"
                        value={settings.lunchEndTime}
                        onChange={(e) => setSettings(prev => ({ ...prev, lunchEndTime: e.target.value }))}
                        className="border-border"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettings(prev => ({ ...prev, lunchEndTime: DEFAULT_LUNCH_END_TIME }))}
                        className="gap-2 bg-transparent"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Preset ({DEFAULT_LUNCH_END_TIME})
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={handleResetToPreset}
                className="gap-2 bg-transparent"
              >
                <RotateCcw className="h-4 w-4" />
                Reset All to Preset Values
              </Button>
              <Button
                onClick={handleSaveAppSettings}
                disabled={isSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </div>

            {/* Save Message */}
            {saveMessage && (
              <div className={`mt-4 rounded-lg p-3 text-center text-sm ${
                saveMessage.includes("success")
                  ? "bg-green-100 text-green-800 border border-green-200 dark:bg-green-950/30 dark:text-green-200 dark:border-green-900"
                  : "bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900"
              }`}>
                {saveMessage}
              </div>
            )}
          </div>
        </TabsContent>

        {/* AI Assistant Settings Tab */}
        <TabsContent value="ai-assistant" className="mt-6 space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Assistant Settings
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Configure settings used by the AI Schedule feature for automatic scheduling calculations.
            </p>

            <div className="space-y-8">
              {/* Hub Location */}
              <div className="rounded-lg border border-border bg-muted/30 p-6">
                <h3 className="mb-4 text-base font-semibold text-foreground">Hub Location</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  The departure point for all setup and dismantle operations. This address is used as the starting location for travel time calculations.
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-foreground">Hub Address</Label>
                    <textarea
                      value={aiSettings.hubAddress}
                      onChange={(e) => setAISettings(prev => ({ ...prev, hubAddress: e.target.value }))}
                      placeholder="Enter hub address..."
                      className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                      rows={3}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setAISettings(prev => ({ ...prev, hubAddress: DEFAULT_HUB_ADDRESS }))}
                    className="gap-2 bg-transparent"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset to Default
                  </Button>
                </div>
              </div>

              {/* Buffer Time */}
              <div className="rounded-lg border border-border bg-muted/30 p-6">
                <h3 className="mb-4 text-base font-semibold text-foreground">Buffer Time</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Extra time added to schedules for unexpected delays, traffic, or setup complexities.
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label className="text-foreground">Buffer Time (minutes)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="120"
                      value={aiSettings.bufferTimeMinutes}
                      onChange={(e) => setAISettings(prev => ({ ...prev, bufferTimeMinutes: parseInt(e.target.value) || 0 }))}
                      placeholder="30"
                      className="border-border"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setAISettings(prev => ({ ...prev, bufferTimeMinutes: DEFAULT_BUFFER_TIME_MINUTES }))}
                    className="gap-2 bg-transparent"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Default ({DEFAULT_BUFFER_TIME_MINUTES} mins)
                  </Button>
                </div>
              </div>

              {/* Duration per KM */}
              <div className="rounded-lg border border-border bg-muted/30 p-6">
                <h3 className="mb-4 text-base font-semibold text-foreground">Travel Duration per KM</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Average time to travel 1 kilometer. Used to estimate travel time based on distance. Adjust based on typical road conditions in your area.
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label className="text-foreground">Minutes per KM</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.5"
                      value={aiSettings.minutesPerKm}
                      onChange={(e) => setAISettings(prev => ({ ...prev, minutesPerKm: parseFloat(e.target.value) || 1 }))}
                      placeholder="3"
                      className="border-border"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setAISettings(prev => ({ ...prev, minutesPerKm: DEFAULT_MINUTES_PER_KM }))}
                    className="gap-2 bg-transparent"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Default ({DEFAULT_MINUTES_PER_KM} mins/km)
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Example: At {aiSettings.minutesPerKm} mins/km, a 15km journey takes {(aiSettings.minutesPerKm * 15).toFixed(0)} minutes.
                </p>
              </div>

              {/* Radius & Waiting Threshold */}
              <div className="rounded-lg border border-border bg-muted/30 p-6">
                <h3 className="mb-4 text-base font-semibold text-foreground">Team Reuse Rules</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Used by AI Schedule to decide whether a team should continue from the current site to the next nearby task.
                </p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-foreground">Radius (km)</Label>
                    <div className="flex items-end gap-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={aiSettings.radiusKm}
                        onChange={(e) =>
                          setAISettings((prev) => ({
                            ...prev,
                            radiusKm: Math.max(0, parseFloat(e.target.value) || 0),
                          }))
                        }
                        placeholder="5"
                        className="border-border"
                      />
                      <Button
                        variant="outline"
                        onClick={() => setAISettings((prev) => ({ ...prev, radiusKm: DEFAULT_RADIUS_KM }))}
                        className="gap-2 bg-transparent"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Default ({DEFAULT_RADIUS_KM} km)
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">Waiting Threshold (hours)</Label>
                    <div className="flex items-end gap-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.25"
                        value={aiSettings.waitingHours}
                        onChange={(e) =>
                          setAISettings((prev) => ({
                            ...prev,
                            waitingHours: Math.max(0, parseFloat(e.target.value) || 0),
                          }))
                        }
                        placeholder="1.5"
                        className="border-border"
                      />
                      <Button
                        variant="outline"
                        onClick={() => setAISettings((prev) => ({ ...prev, waitingHours: DEFAULT_WAITING_HOURS }))}
                        className="gap-2 bg-transparent"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Default ({DEFAULT_WAITING_HOURS}h)
                      </Button>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Default: within {DEFAULT_RADIUS_KM}km and within {DEFAULT_WAITING_HOURS} hour(s).
                </p>
              </div>

              {false && (
              <div className="rounded-lg border border-border bg-muted/30 p-6">
                <h3 className="mb-4 text-base font-semibold text-foreground">AI Scheduler Rules (Readme)</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Summary of how AI Schedule optimizes co-join and handles OT. Full manual: <span className="font-mono text-xs">app/portal/settings/AI-ASSISTANT-README.md</span>
                </p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground mb-2">Optimize Priority</div>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      <li>No overtime (avoid OT when possible)</li>
                      <li>Co-Join (reuse same team) within radius &amp; time flexibility</li>
                      <li>Customer time window (with Â± waiting threshold)</li>
                      <li>Workload balance (least busy team)</li>
                    </ul>
                  </div>

                  <div className="rounded-md border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground mb-2">Key Constraints</div>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      <li>Co-Join only if sites are within <span className="font-mono text-xs">Radius (km)</span></li>
                      <li>Co-Join only if timing stays within <span className="font-mono text-xs">Waiting Threshold (hours)</span></li>
                      <li>Both orders must be within their own time flexibility window (slot Â± threshold)</li>
                      <li>If OT occurs, AI prompts: allow OT or deploy another team</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-border bg-background p-4">
                  <div className="text-sm font-semibold text-foreground mb-2">Example (Dismantle Slot 15:00â€“16:30)</div>
                  <p className="text-sm text-muted-foreground">
                    With a waiting threshold of <span className="font-mono text-xs">1.5h</span>, the acceptable window becomes
                    <span className="font-mono text-xs"> 14:00â€“18:30</span>. If tail co-join causes OT (e.g. job B starts after job A ends),
                    AI will try head co-join (schedule B earlier and proceed to A) to avoid OT. If OT is still required, you will be prompted to
                    choose between allowing OT or deploying another team.
                  </p>
                </div>
              </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={handleResetAISettings}
                className="gap-2 bg-transparent"
              >
                <RotateCcw className="h-4 w-4" />
                Reset All to Default
              </Button>
              <Button
                onClick={() => setShowAIConfirm(true)}
                disabled={aiSaving}
                className="gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600"
              >
                <Save className="h-4 w-4" />
                {aiSaving ? "Saving..." : "Save AI Settings"}
              </Button>
            </div>

            {/* Save Message */}
            {aiSaveMessage && (
              <div className={`mt-4 rounded-lg p-3 text-center text-sm ${
                aiSaveMessage.includes("success")
                  ? "bg-green-100 text-green-800 border border-green-200 dark:bg-green-950/30 dark:text-green-200 dark:border-green-900"
                  : "bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900"
              }`}>
                {aiSaveMessage}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Team Settings Tab */}
        <TabsContent value="teams" className="mt-6 space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
              <SettingsIcon className="h-5 w-5" />
              Team Settings
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Configure the 5 teams: name, color, team leader, and team members.
            </p>

            <div className="space-y-4">
              {teamConfigs.map((team, idx) => (
                <div key={team.id} className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3.5 w-3.5 rounded-full border border-border"
                        style={{ backgroundColor: team.color }}
                      />
                      <div className="text-sm font-semibold text-foreground">{team.id}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-foreground">Display Name</Label>
                      <Input
                        value={team.name}
                        onChange={(e) => {
                          const value = e.target.value
                          setTeamConfigs((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], name: value }
                            return next
                          })
                        }}
                        placeholder="Team A"
                        className="border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">Color</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="color"
                          value={team.color}
                          onChange={(e) => {
                            const value = e.target.value
                            setTeamConfigs((prev) => {
                              const next = [...prev]
                              next[idx] = { ...next[idx], color: value }
                              return next
                            })
                          }}
                          className="h-9 w-14 p-1"
                        />
                        <Input
                          value={team.color}
                          onChange={(e) => {
                            const value = e.target.value
                            setTeamConfigs((prev) => {
                              const next = [...prev]
                              next[idx] = { ...next[idx], color: value }
                              return next
                            })
                          }}
                          placeholder="#ef4444"
                          className="border-border"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Use hex colors like #ef4444.</p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-foreground">Team Leader</Label>
                      <Input
                        value={team.leader}
                        onChange={(e) => {
                          const value = e.target.value
                          setTeamConfigs((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], leader: value }
                            return next
                          })
                        }}
                        placeholder="Leader name"
                        className="border-border"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-foreground">Team Members</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-transparent"
                          onClick={() => {
                            setTeamConfigs((prev) => {
                              const next = [...prev]
                              const members = [...(next[idx].members || [])]
                              members.push("")
                              next[idx] = { ...next[idx], members }
                              return next
                            })
                          }}
                        >
                          Add Member
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {(team.members || []).length === 0 ? (
                          <div className="text-xs text-muted-foreground">No members added.</div>
                        ) : (
                          team.members.map((m, mIdx) => (
                            <div key={mIdx} className="flex items-center gap-2">
                              <Input
                                value={m}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setTeamConfigs((prev) => {
                                    const next = [...prev]
                                    const members = [...(next[idx].members || [])]
                                    members[mIdx] = value
                                    next[idx] = { ...next[idx], members }
                                    return next
                                  })
                                }}
                                placeholder={`Member ${mIdx + 1}`}
                                className="border-border"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-transparent"
                                onClick={() => {
                                  setTeamConfigs((prev) => {
                                    const next = [...prev]
                                    const members = [...(next[idx].members || [])]
                                    members.splice(mIdx, 1)
                                    next[idx] = { ...next[idx], members }
                                    return next
                                  })
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button variant="outline" onClick={handleResetTeamSettings} className="gap-2 bg-transparent">
                <RotateCcw className="h-4 w-4" />
                Reset to Default
              </Button>
              <Button onClick={handleSaveTeamSettings} disabled={teamSaving} className="gap-2">
                <Save className="h-4 w-4" />
                {teamSaving ? "Saving..." : "Save Team Settings"}
              </Button>
            </div>

            {teamSaveMessage && (
              <div className={`mt-4 rounded-lg p-3 text-center text-sm ${
                teamSaveMessage.includes("success")
                  ? "bg-green-100 text-green-800 border border-green-200 dark:bg-green-950/30 dark:text-green-200 dark:border-green-900"
                  : "bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900"
              }`}>
                {teamSaveMessage}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Role-Based Access Control Tab */}
        <TabsContent value="roles" className="mt-6 space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Role-Based Access Control
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure which pages each role can access
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetAccessControl}
                >
                  Reset to Default
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveAccessControl}
                  disabled={!hasChanges}
                >
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Access Control Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-left text-sm font-semibold text-foreground">
                      Role
                    </th>
                    {ALL_PAGES.map((page) => (
                      <th
                        key={page.path}
                        className="p-3 text-center text-xs font-medium text-foreground min-w-[100px]"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{page.label.split(" ")[0]}</span>
                          {page.label.split(" ").length > 1 && (
                            <span>{page.label.split(" ").slice(1).join(" ")}</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROLES.map((role, roleIndex) => (
                    <tr
                      key={role}
                      className={roleIndex !== ROLES.length - 1 ? "border-b border-border" : ""}
                    >
                      <td className="p-3 text-sm font-medium text-foreground">
                        {role}
                      </td>
                      {ALL_PAGES.map((page) => (
                        <td key={page.path} className="p-3 text-center">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={hasAccess(role, page.path)}
                              onCheckedChange={() => handleTogglePage(role, page.path)}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasChanges && (
              <div className="mt-4 rounded-md bg-yellow-50 dark:bg-yellow-950/30 p-4 border border-yellow-200 dark:border-yellow-900">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  You have unsaved changes. Click "Save Changes" to apply them.
                </p>
              </div>
            )}
          </div>
        </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="instruction" className="mt-6 space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
              <SettingsIcon className="h-5 w-5" />
              Instruction
            </h2>

            <Tabs defaultValue="sales-order-instruction" className="w-full">
              <TabsList className="grid w-full max-w-3xl grid-cols-3">
                <TabsTrigger value="sales-order-instruction">Sales Order Instruction</TabsTrigger>
                <TabsTrigger value="ai-assistant-instruction" className="gap-1">
                  <Sparkles className="h-4 w-4" />
                  AI Assistant Instruction
                </TabsTrigger>
                <TabsTrigger value="ai-optimizer-instruction" className="gap-1">
                  <Sparkles className="h-4 w-4" />
                  AI Optimizer Instruction
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sales-order-instruction" className="mt-6 space-y-4">
                <div className="rounded-lg border border-border bg-muted/30 p-6 space-y-4">
                  <div>
                    <h3 className="mb-2 text-base font-semibold text-foreground">Preferred Setup/Dismantle Date Rules</h3>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                      <li>
                        Preferred setup date <span className="font-semibold text-foreground">cannot be later</span> than the event date. It can be the{" "}
                        <span className="font-semibold text-foreground">same day</span>. If the preferred setup date is later than the event date (e.g. event
                        date = <span className="font-mono text-xs">10 Feb</span>, preferred setup = <span className="font-mono text-xs">11 Feb</span>), the
                        system will show an alert and prevent saving.
                      </li>
                      <li>
                        Preferred dismantle date <span className="font-semibold text-foreground">cannot be earlier</span> than the event date. It can be the{" "}
                        <span className="font-semibold text-foreground">same day</span>. If the preferred dismantle date is earlier than the event date (e.g.
                        event date = <span className="font-mono text-xs">10 Feb</span>, preferred dismantle = <span className="font-mono text-xs">9 Feb</span>
                        ), the system will show an alert and prevent saving.
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-2 text-base font-semibold text-foreground">Preferred Time Rules</h3>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                      <li>
                        Preferred time slots are used by AI Scheduler as the customer’s requested window (e.g.{" "}
                        <span className="font-mono text-xs">3:00pm - 4:30pm</span>).
                      </li>
                      <li>
                        If customer has <span className="font-mono text-xs">NONE</span> for preferred setup/dismantle time, the job has no strict customer
                        time window. AI will treat it as more flexible (see AI Assistant Instruction tab).
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-2 text-base font-semibold text-foreground">Departure Time Rule</h3>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                      <li>
                        If the setup departure time and the Sales Order time occur on the <span className="font-semibold text-foreground">same day</span>,
                        the setup departure <span className="font-semibold text-foreground">must not be earlier</span> than the Sales Order time. For example,
                        departure = <span className="font-mono text-xs">05/02/2026 08:00</span> and Sales Order time ={" "}
                        <span className="font-mono text-xs">05/02/2026 10:00</span> is not allowed—the system will show an alert and prevent saving.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-md border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground mb-2">Examples</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <p className="text-sm text-muted-foreground">
                        Event date: <span className="font-mono text-xs">05/02/2026</span>
                        <br />
                        Setup date: <span className="font-mono text-xs">05/02/2026</span> (OK),{" "}
                        <span className="font-mono text-xs">06/02/2026</span> (NOT allowed)
                        <br />
                        Dismantle date: <span className="font-mono text-xs">05/02/2026</span> (OK),{" "}
                        <span className="font-mono text-xs">04/02/2026</span> (NOT allowed)
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Time slot example: <span className="font-mono text-xs">3:00pm - 4:30pm</span>
                        <br />
                        Fully flexible example: preferred time = <span className="font-mono text-xs">NONE</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Sales Order time = <span className="font-mono text-xs">05/02/2026 10:00</span>
                        <br />
                        Same-day departure example: departure = <span className="font-mono text-xs">05/02/2026 08:00</span> (NOT allowed)
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ai-assistant-instruction" className="mt-6 space-y-4">
                <div className="rounded-lg border border-border bg-muted/30 p-6">
                  <h3 className="mb-2 text-base font-semibold text-foreground">AI Scheduler Logic (Single Source)</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    This section summarizes what the AI Scheduler is allowed to do and how it decides. It must stay consistent with{" "}
                    <span className="font-mono text-xs">AI-ASSISTANT.md</span> and the implementation in{" "}
                    <span className="font-mono text-xs">lib/ai-scheduler.ts</span>.
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">Core Priorities</div>
                      <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                        <li>Avoid overtime (OT) when possible</li>
                        <li>Co-Join (reuse the same team) when it reduces travel and is feasible</li>
                        <li>Respect customer time window (slot ± waiting threshold)</li>
                        <li>Workload balance (pick least busy available team)</li>
                      </ol>
                      <div className="text-xs text-muted-foreground">
                        Note: If preferred setup + dismantle time are both <span className="font-mono">NONE</span>, priority becomes:{" "}
                        <span className="font-semibold text-foreground">avoid OT by deploying any free team first</span> → co-join second → workload balance.
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">Working Hours Policy</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>
                          Work start: <span className="font-mono text-xs">workStartTime</span> (default 08:00) — cannot depart earlier than this.
                        </li>
                        <li>
                          Work end: <span className="font-mono text-xs">workEndTime</span> (default 16:30) — finishing after this is OT.
                        </li>
                        <li>
                          Lunch: <span className="font-mono text-xs">13:00–14:00</span> — if a task overlaps lunch, suggest lunch before/after task (do not force inside).
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">Co-Join (Head / Tail)</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>
                          Tail co-join: chain this order <span className="font-semibold text-foreground">after</span> a nearby earlier task (A → B).
                        </li>
                        <li>
                          Head co-join: schedule this order <span className="font-semibold text-foreground">before</span> a nearby later task if feasible.
                        </li>
                        <li>
                          Eligibility: within <span className="font-mono text-xs">radiusKm</span> and waiting ≤{" "}
                          <span className="font-mono text-xs">waitingHours</span>, and both orders stay within their own acceptable window (slot ± waitingHours).
                        </li>
                      </ul>
                      <div className="text-xs text-muted-foreground">
                        Implementation: <span className="font-mono">findTailCoJoinCandidate()</span> / <span className="font-mono">findHeadCoJoinCandidate()</span>
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">No Clash (Engagement Window)</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>
                          A team is engaged from <span className="font-semibold text-foreground">departure time → task end time</span> (includes travel + work).
                        </li>
                        <li>If returning to hub, engagement continues until hub arrival time.</li>
                        <li>UI must block saving if scheduling overlaps another order for the same team/lorry.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 rounded-md border border-border bg-background p-4 space-y-2">
                    <div className="text-sm font-semibold text-foreground">Sales Order Time Rule (Same-day Setup)</div>
                    <p className="text-sm text-muted-foreground">
                      If a Sales Order is created at time <span className="font-mono text-xs">T</span> and the setup is on the same calendar day, AI must not
                      schedule setup <span className="font-semibold text-foreground">departure</span> or{" "}
                      <span className="font-semibold text-foreground">arrival/confirmed time</span> earlier than <span className="font-mono text-xs">T</span>. The UI must block saving if violated.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      If the order is created on the same day as setup, the AI cannot schedule a departure or arrival time earlier than the order
                      creation time, even if the preferred slot is earlier.
                    </p>
                  </div>

                  <div className="mt-4 rounded-md border border-border bg-background p-4 space-y-2">
                    <div className="text-sm font-semibold text-foreground">OT Handling (Prompt)</div>
                    <p className="text-sm text-muted-foreground">
                      If AI scheduling would cause a team to finish after <span className="font-mono text-xs">workEndTime</span> (OT), the UI compares the
                      current plan (may include co-join) against a no co-join plan. You will see which option avoids OT and which still results in OT, then
                      choose: <span className="font-semibold text-foreground">Allow OT</span> or{" "}
                      <span className="font-semibold text-foreground">Deploy another team</span>.
                    </p>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>
                        <span className="font-medium text-foreground">Case A:</span> Co-join = no OT, No co-join = no OT → no OT prompt. Co-join Yes/No
                        may still appear.
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Case B:</span> Co-join = OT, No co-join = no OT → prompt shows “Deploy another team”
                        as the recommended option (OT can be avoided).
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Case C:</span> Co-join = OT, No co-join = OT → prompt shows both outcomes and notes OT
                        is unavoidable. Choose the lesser impact.
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ai-optimizer-instruction" className="mt-6 space-y-4">
                <div className="rounded-lg border border-border bg-muted/30 p-6">
                  <h3 className="mb-2 text-base font-semibold text-foreground">Daily Route Optimizer Logic</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    The Daily Route Optimizer reorders jobs for a single team on a specific date to minimize travel distance and time while respecting constraints.
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">What Can Be Optimized</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>
                          <span className="font-semibold text-foreground">Flexible orders only</span> - Orders with{" "}
                          <span className="font-mono text-xs">setupTimeWindowMode: "flexible"</span> or{" "}
                          <span className="font-mono text-xs">dismantleTimeWindowMode: "flexible"</span>
                        </li>
                        <li>Change the <span className="font-semibold text-foreground">sequence/order</span> of jobs</li>
                        <li>Change the <span className="font-semibold text-foreground">time</span> of jobs</li>
                        <li>Both changes allowed to minimize total travel distance</li>
                      </ul>
                    </div>

                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">What CANNOT Be Changed</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>
                          <span className="font-semibold text-foreground">Rigid orders</span> - Orders with{" "}
                          <span className="font-mono text-xs">setupTimeWindowMode: "strict"</span> have fixed time (cannot move)
                        </li>
                        <li>
                          <span className="font-semibold text-foreground">Co-join chains</span> - Co-joined orders are bound together and move as one unit
                        </li>
                        <li>If any order in a co-join chain is rigid, the entire chain becomes fixed</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">Optimization Algorithm</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>Uses <span className="font-semibold text-foreground">Greedy Nearest Neighbor</span> approach</li>
                        <li>Starts from hub or custom starting point</li>
                        <li>Finds nearest unvisited flexible stop</li>
                        <li>Respects rigid time constraints</li>
                        <li>Treats co-join chains as single meta-stops</li>
                        <li>Returns to hub at the end</li>
                      </ul>
                      <div className="text-xs text-muted-foreground">
                        Implementation: <span className="font-mono">optimizeDailyRoute()</span> in{" "}
                        <span className="font-mono">lib/daily-route-optimizer.ts</span>
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background p-4 space-y-2">
                      <div className="text-sm font-semibold text-foreground">Time Window Mode (Setup/Dismantle)</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>
                          <span className="font-semibold text-foreground">Flexible (🔄)</span> - AI can adjust time and order for optimization (default)
                        </li>
                        <li>
                          <span className="font-semibold text-foreground">Strict (🔒)</span> - Time cannot be changed, must follow customer's exact preferred time
                        </li>
                        <li>Set separately for setup and dismantle in Sales Order form</li>
                        <li>Stored in order data: <span className="font-mono text-xs">setupTimeWindowMode</span> / <span className="font-mono text-xs">dismantleTimeWindowMode</span></li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 rounded-md border border-border bg-background p-4 space-y-2">
                    <div className="text-sm font-semibold text-foreground">Example Scenario</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-foreground">❌ Before Optimization:</div>
                        <div className="text-xs text-muted-foreground">
                          Team A on 10/02/2025:
                          <br />
                          <span className="font-mono">10:00</span> Hub → First Garden → Hub
                          <br />
                          <span className="font-mono">14:00</span> Hub → Botani → Hub
                          <br />
                          <span className="font-mono">15:30</span> Hub → Pengkalan → Hub
                          <br />
                          <br />
                          <span className="text-destructive">Problem: Multiple returns to hub waste time and fuel</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-foreground">✅ After Optimization:</div>
                        <div className="text-xs text-muted-foreground">
                          Team A on 10/02/2025:
                          <br />
                          <span className="font-mono">09:00</span> Hub → First Garden →
                          <br />
                          <span className="font-mono">10:30</span> → Botani →
                          <br />
                          <span className="font-mono">12:00</span> → Pengkalan → Hub
                          <br />
                          <br />
                          <span className="text-green-600 dark:text-green-400">Optimized: Single trip, saves distance and time</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-md border border-border bg-background p-4 space-y-2">
                    <div className="text-sm font-semibold text-foreground">Where to Use</div>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      <li>
                        <span className="font-semibold text-foreground">Scheduling Page:</span> Below the calendar, click "🚀 Optimize Daily Routes" button
                      </li>
                      <li>
                        <span className="font-semibold text-foreground">Mapping Page:</span> When viewing a date, click "🚀 Optimize Routes" button
                      </li>
                      <li>Select date, team, and starting point (hub or custom address)</li>
                      <li>Review comparison: original vs optimized route with savings</li>
                      <li>Apply optimization to update all affected orders</li>
                    </ul>
                  </div>

                  <div className="mt-4 rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950 p-4">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">⚠️ Important Notes</div>
                    <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-200 space-y-1 mt-2">
                      <li>Always review the comparison before applying optimization</li>
                      <li>Check that rigid orders remain at their fixed times</li>
                      <li>Verify co-join chains stay together as expected</li>
                      <li>Ensure optimized times fit within working hours (08:00-16:30)</li>
                      <li>Consider lunch break (13:00-14:00) when reviewing optimized schedule</li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
