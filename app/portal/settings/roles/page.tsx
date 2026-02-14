"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { getCurrentUser, type AppUser } from "@/lib/auth"
import type { UserRole, RoleAccessControl } from "@/lib/types"
import {
  ALL_PAGES,
  ADMIN_ONLY_PAGES,
  getRoleDisplayName,
  fetchRoleSettingsFromSupabase,
  saveRoleSettingsToSupabase,
  DEFAULT_ACCESS_CONTROL,
} from "@/lib/role-storage"
import { RefreshCw, Save, Shield, Crown, User } from "lucide-react"

// Page display names for better UX
const PAGE_DISPLAY_NAMES: Record<string, string> = {
  "/portal/status-tracking": "Progress Calendar",
  "/portal/performance-tracking": "Performance Tracking",
  "/portal/sales-order": "Sales Order",
  "/portal/ad-hoc": "Ad-hoc Orders",
  "/portal/quotation/webpage-live": "Webpage Live",
  "/portal/quotation/request-for-quotation": "Request for Quotation",
  "/portal/quotation/official-quotation": "Official Quotation",
  "/portal/sales-confirmation": "Sales Confirmation",
  "/portal/planning": "Planning",
  "/portal/packing": "Packing",
  "/portal/procurement": "Procurement",
  "/portal/delivery": "Delivery",
  "/portal/returning": "Returning",
  "/portal/setting-up": "Setting Up",
  "/portal/dismantle": "Dismantle",
  "/portal/invoice": "Invoice",
  "/portal/payment": "Payment",
  "/portal/warnings": "Warning & Issues",
  "/portal/inventory": "Inventory",
  "/portal/settings/users": "User Management",
  "/portal/settings/roles": "Role Settings",
}

// Group pages by category for better organization
const PAGE_GROUPS = [
  {
    name: "Dashboard",
    pages: ["/portal/status-tracking", "/portal/performance-tracking"],
  },
  {
    name: "Quotation",
    pages: [
      "/portal/quotation/webpage-live",
      "/portal/quotation/request-for-quotation",
      "/portal/quotation/official-quotation",
    ],
  },
  {
    name: "Sales",
    pages: ["/portal/sales-order", "/portal/ad-hoc", "/portal/sales-confirmation"],
  },
  {
    name: "Operations",
    pages: [
      "/portal/planning",
      "/portal/packing",
      "/portal/procurement",
      "/portal/delivery",
      "/portal/returning",
      "/portal/setting-up",
      "/portal/dismantle",
    ],
  },
  {
    name: "Finance",
    pages: ["/portal/invoice", "/portal/payment"],
  },
  {
    name: "Other",
    pages: ["/portal/warnings", "/portal/inventory"],
  },
]

export default function RoleSettingsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [roleSettings, setRoleSettings] = useState<RoleAccessControl[]>(DEFAULT_ACCESS_CONTROL)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const user = await getCurrentUser()
      setCurrentUser(user)

      if (!user || user.role !== "admin") {
        router.push("/portal")
        return
      }

      const settings = await fetchRoleSettingsFromSupabase()
      if (settings) {
        setRoleSettings(settings)
      }
    } catch (err) {
      console.error("Failed to load role settings:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handlePageToggle = (role: UserRole, page: string, checked: boolean) => {
    setRoleSettings((prev) =>
      prev.map((setting) => {
        if (setting.role !== role) return setting
        const newAllowedPages = checked
          ? [...setting.allowedPages, page]
          : setting.allowedPages.filter((p) => p !== page)
        return { ...setting, allowedPages: newAllowedPages }
      })
    )
    setHasChanges(true)
  }

  const handleSelectAll = (role: UserRole, checked: boolean) => {
    setRoleSettings((prev) =>
      prev.map((setting) => {
        if (setting.role !== role) return setting
        // Admin keeps admin-only pages, others don't get them
        const newAllowedPages = checked
          ? role === "admin"
            ? [...ALL_PAGES, ...ADMIN_ONLY_PAGES]
            : [...ALL_PAGES]
          : role === "admin"
            ? [...ADMIN_ONLY_PAGES] // Admin always keeps admin-only pages
            : []
        return { ...setting, allowedPages: newAllowedPages }
      })
    )
    setHasChanges(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      for (const setting of roleSettings) {
        await saveRoleSettingsToSupabase(setting.role, setting.allowedPages)
      }
      setHasChanges(false)
    } catch (err) {
      console.error("Failed to save role settings:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case "admin":
        return <Shield className="h-4 w-4" />
      case "manager":
        return <Crown className="h-4 w-4" />
      default:
        return <User className="h-4 w-4" />
    }
  }

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case "admin":
        return "border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/30"
      case "manager":
        return "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
      default:
        return "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/30"
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">You don&apos;t have permission to view this page.</p>
      </div>
    )
  }

  // Filter to only show manager and staff (admin always has full access)
  const editableRoles: UserRole[] = ["manager", "staff"]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Role Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure which pages each role can access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !hasChanges}>
            <Save className={`mr-1.5 h-3.5 w-3.5 ${isSaving ? "animate-spin" : ""}`} />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Admin notice */}
      <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900 dark:bg-purple-950/20">
        <div className="flex items-center gap-2 text-sm text-purple-800 dark:text-purple-200">
          <Shield className="h-4 w-4" />
          <span className="font-medium">Admin</span>
          <span className="text-purple-600 dark:text-purple-400">
            always has access to all pages including User Management and Role Settings.
          </span>
        </div>
      </div>

      {/* Role settings grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {editableRoles.map((role) => {
          const roleSetting = roleSettings.find((s) => s.role === role)
          const allowedPages = roleSetting?.allowedPages || []
          const allPagesSelected = ALL_PAGES.every((p) => allowedPages.includes(p))

          return (
            <div
              key={role}
              className={`rounded-lg border p-4 ${getRoleColor(role)}`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getRoleIcon(role)}
                  <h2 className="text-base font-semibold text-foreground">
                    {getRoleDisplayName(role)}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${role}-all`}
                    checked={allPagesSelected}
                    onCheckedChange={(checked) =>
                      handleSelectAll(role, checked === true)
                    }
                  />
                  <label
                    htmlFor={`${role}-all`}
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Select all
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                {PAGE_GROUPS.map((group) => (
                  <div key={group.name}>
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {group.name}
                    </h3>
                    <div className="space-y-1.5">
                      {group.pages.map((page) => {
                        const isChecked = allowedPages.includes(page)
                        return (
                          <div key={page} className="flex items-center gap-2">
                            <Checkbox
                              id={`${role}-${page}`}
                              checked={isChecked}
                              onCheckedChange={(checked) =>
                                handlePageToggle(role, page, checked === true)
                              }
                            />
                            <label
                              htmlFor={`${role}-${page}`}
                              className="text-sm text-foreground cursor-pointer"
                            >
                              {PAGE_DISPLAY_NAMES[page] || page}
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {hasChanges && (
        <div className="fixed bottom-4 right-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 shadow-lg dark:border-yellow-900 dark:bg-yellow-950">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            You have unsaved changes.
          </p>
        </div>
      )}
    </div>
  )
}
