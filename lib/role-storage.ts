import type { UserRole, RoleAccessControl } from "./types"
import { getSupabase } from "./supabase"

const ROLE_KEY = "etre_user_role"
const ACCESS_CONTROL_KEY = "etre_role_access_control"

// All available pages in the system
export const ALL_PAGES = [
  "/portal/status-tracking",
  "/portal/performance-tracking",
  "/portal/sales-order",
  "/portal/ad-hoc",
  "/portal/quotation/webpage-live",
  "/portal/quotation/request-for-quotation",
  "/portal/quotation/official-quotation",
  "/portal/sales-confirmation",
  "/portal/planning",
  "/portal/packing",
  "/portal/procurement",
  "/portal/delivery",
  "/portal/returning",
  "/portal/setting-up",
  "/portal/dismantle",
  "/portal/invoice",
  "/portal/payment",
  "/portal/warnings",
  "/portal/inventory",
]

// Admin-only pages (always restricted)
export const ADMIN_ONLY_PAGES = [
  "/portal/settings/users",
  "/portal/settings/roles",
]

// Default access control configuration - all roles can see all pages initially
export const DEFAULT_ACCESS_CONTROL: RoleAccessControl[] = [
  {
    role: "admin",
    allowedPages: [...ALL_PAGES, ...ADMIN_ONLY_PAGES],
  },
  {
    role: "manager",
    allowedPages: [...ALL_PAGES],
  },
  {
    role: "staff",
    allowedPages: [...ALL_PAGES],
  },
]

const ALL_ROLES: UserRole[] = ["admin", "manager", "staff"]

// Normalize legacy role names to new roles
const normalizeRole = (role: string): UserRole | null => {
  const lowered = role.toLowerCase()
  switch (lowered) {
    // New roles
    case "admin":
      return "admin"
    case "manager":
      return "manager"
    case "staff":
      return "staff"
    // Legacy roles mapping
    case "sales":
    case "sales manager":
    case "warehouse":
    case "traffic":
    case "driver":
    case "operation":
    case "user":
      return "staff" // All legacy roles become staff
    case "director":
      return "manager"
    default:
      return null
  }
}

/**
 * Check if a string is a valid UserRole
 */
function isValidRole(role: string): boolean {
  return normalizeRole(role) !== null
}

/**
 * Get current simulated role from localStorage (for admin preview)
 * Defaults to "staff" if not set
 */
export function getCurrentRole(): UserRole {
  if (typeof window === "undefined") return "staff"

  const roleRaw = localStorage.getItem(ROLE_KEY)
  if (!roleRaw || !isValidRole(roleRaw)) return "staff"

  const normalized = normalizeRole(roleRaw) ?? "staff"
  if (normalized !== roleRaw) {
    localStorage.setItem(ROLE_KEY, normalized)
  }
  return normalized
}

/**
 * Set current simulated role in localStorage (for admin preview)
 */
export function setCurrentRole(role: UserRole): void {
  if (typeof window === "undefined") return
  localStorage.setItem(ROLE_KEY, role)
}

/**
 * Fetch role settings from Supabase
 */
export async function fetchRoleSettingsFromSupabase(): Promise<RoleAccessControl[] | null> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from("role_settings")
      .select("role, allowed_pages")

    if (error) {
      console.error("Error fetching role settings:", error)
      return null
    }

    if (!data || data.length === 0) {
      return null
    }

    return data.map((row: { role: string; allowed_pages: string[] }) => ({
      role: row.role as UserRole,
      allowedPages: row.allowed_pages,
    }))
  } catch (error) {
    console.error("Error fetching role settings:", error)
    return null
  }
}

/**
 * Save role settings to Supabase
 */
export async function saveRoleSettingsToSupabase(
  role: UserRole,
  allowedPages: string[]
): Promise<boolean> {
  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from("role_settings")
      .update({ allowed_pages: allowedPages, updated_at: new Date().toISOString() })
      .eq("role", role)

    if (error) {
      console.error("Error saving role settings:", error)
      return false
    }

    // Also update local cache
    const cached = localStorage.getItem(ACCESS_CONTROL_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as RoleAccessControl[]
        const updated = parsed.map((config) =>
          config.role === role ? { ...config, allowedPages } : config
        )
        localStorage.setItem(ACCESS_CONTROL_KEY, JSON.stringify(updated))
      } catch {
        // Ignore cache errors
      }
    }

    return true
  } catch (error) {
    console.error("Error saving role settings:", error)
    return false
  }
}

/**
 * Get role-based access control configuration
 * First tries localStorage cache, falls back to default
 */
export function getRoleAccessControl(): RoleAccessControl[] {
  if (typeof window === "undefined") return DEFAULT_ACCESS_CONTROL

  try {
    const stored = localStorage.getItem(ACCESS_CONTROL_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as RoleAccessControl[]
      // Validate parsed data
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (error) {
    console.error("Error loading access control:", error)
  }

  return DEFAULT_ACCESS_CONTROL
}

/**
 * Save role-based access control configuration to localStorage cache
 */
export function saveRoleAccessControl(accessControl: RoleAccessControl[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(ACCESS_CONTROL_KEY, JSON.stringify(accessControl))
}

/**
 * Initialize role settings - fetch from Supabase and cache locally
 */
export async function initializeRoleSettings(): Promise<RoleAccessControl[]> {
  const fromSupabase = await fetchRoleSettingsFromSupabase()
  if (fromSupabase && fromSupabase.length > 0) {
    saveRoleAccessControl(fromSupabase)
    return fromSupabase
  }
  return DEFAULT_ACCESS_CONTROL
}

/**
 * Get allowed pages for a specific role
 */
export function getAllowedPagesForRole(role: UserRole): string[] {
  const accessControl = getRoleAccessControl()
  const roleConfig = accessControl.find((config) => config.role === role)

  if (!roleConfig) {
    // Fallback to default
    const defaultConfig = DEFAULT_ACCESS_CONTROL.find((c) => c.role === role)
    return defaultConfig ? defaultConfig.allowedPages : []
  }

  return roleConfig.allowedPages
}

/**
 * Check if a role has access to a specific page
 */
export function hasAccessToPage(role: UserRole, pagePath: string): boolean {
  const allowedPages = getAllowedPagesForRole(role)
  return allowedPages.includes(pagePath)
}

/**
 * Reset access control to default configuration
 */
export function resetAccessControlToDefault(): void {
  saveRoleAccessControl(DEFAULT_ACCESS_CONTROL)
}

/**
 * Get all available roles
 */
export function getAllRoles(): UserRole[] {
  return ALL_ROLES
}

/**
 * Get display name for a role
 */
export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin"
    case "manager":
      return "Manager"
    case "staff":
      return "Staff"
    default:
      return role
  }
}
