import type { UserRole, RoleAccessControl } from "./types"

const ROLE_KEY = "etre_user_role"
const ACCESS_CONTROL_KEY = "etre_role_access_control"

// Default access control configuration
export const DEFAULT_ACCESS_CONTROL: RoleAccessControl[] = [
  {
    role: "Manager",
    allowedPages: [
      "/portal/status-tracking",
      "/portal/mapping",
      "/portal/sales-order",
      "/portal/ad-hoc",
      "/portal/sales-confirmation",
      "/portal/planning",
      "/portal/packing",
      "/portal/procurement",
      "/portal/setting-up",
      "/portal/dismantle",
      "/portal/invoice",
      "/portal/completed",
      "/portal/warnings",
      "/portal/inventory",
    ],
  },
  {
    role: "Sales",
    allowedPages: [
      "/portal/status-tracking",
      "/portal/mapping",
      "/portal/sales-order",
      "/portal/ad-hoc",
      "/portal/sales-confirmation",
      "/portal/invoice",
      "/portal/completed",
      "/portal/inventory",
    ],
  },
  {
    role: "Warehouse",
    allowedPages: [
      "/portal/status-tracking",
      "/portal/mapping",
      "/portal/planning",
      "/portal/packing",
      "/portal/procurement",
      "/portal/invoice",
      "/portal/completed",
      "/portal/warnings",
    ],
  },
  {
    role: "Traffic",
    allowedPages: [
      "/portal/status-tracking",
      "/portal/mapping",
      "/portal/planning",
      "/portal/packing",
      "/portal/setting-up",
      "/portal/dismantle",
      "/portal/invoice",
      "/portal/completed",
    ],
  },
  {
    role: "Operation",
    allowedPages: [
      "/portal/status-tracking",
      "/portal/mapping",
      "/portal/planning",
      "/portal/packing",
      "/portal/procurement",
      "/portal/setting-up",
      "/portal/dismantle",
      "/portal/invoice",
      "/portal/completed",
      "/portal/warnings",
    ],
  },
  {
    role: "User",
    allowedPages: [
      "/portal/status-tracking",
      "/portal/mapping",
      "/portal/sales-order",
      "/portal/ad-hoc",
      "/portal/sales-confirmation",
      "/portal/planning",
      "/portal/packing",
      "/portal/procurement",
      "/portal/setting-up",
      "/portal/dismantle",
      "/portal/invoice",
      "/portal/completed",
      "/portal/warnings",
      "/portal/inventory",
      "/portal/settings",
    ],
  },
]

const ALL_ROLES: UserRole[] = ["Manager", "Sales", "Warehouse", "Traffic", "Operation", "User"]

const normalizeRole = (role: string): UserRole | null => {
  switch (role) {
    // Legacy roles
    case "Sales Manager":
      return "Sales"
    case "Driver":
      return "Traffic"
    case "Director":
      return "Manager"
    // Current roles
    case "Manager":
    case "Sales":
    case "Warehouse":
    case "Traffic":
    case "Operation":
    case "User":
      return role
    default:
      return null
  }
}

const normalizeAccessControl = (value: unknown): RoleAccessControl[] | null => {
  if (!Array.isArray(value)) return null

  const defaultsByRole = new Map<UserRole, RoleAccessControl>(
    DEFAULT_ACCESS_CONTROL.map((config) => [config.role, config])
  )

  const byRole = new Map<UserRole, RoleAccessControl>()
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const roleRaw = (item as any).role
    const allowedPagesRaw = (item as any).allowedPages
    if (typeof roleRaw !== "string" || !Array.isArray(allowedPagesRaw)) continue
    const normalizedRole = normalizeRole(roleRaw)
    if (!normalizedRole) continue
    byRole.set(normalizedRole, {
      role: normalizedRole,
      allowedPages: allowedPagesRaw.filter((p: unknown) => typeof p === "string"),
    })
  }

  // Ensure User role always has full access by default
  byRole.set("User", { ...defaultsByRole.get("User")! })

  return ALL_ROLES.map((role) => byRole.get(role) ?? defaultsByRole.get(role)!)
}

/**
 * Check if a string is a valid UserRole (supports legacy roles via normalizeRole)
 */
function isValidRole(role: string): boolean {
  return normalizeRole(role) !== null
}

/**
 * Get current user role from localStorage
 * Defaults to "User" if not set
 */
export function getCurrentRole(): UserRole {
  if (typeof window === "undefined") return "User"

  const roleRaw = localStorage.getItem(ROLE_KEY)
  if (!roleRaw || !isValidRole(roleRaw)) return "User"

  const normalized = normalizeRole(roleRaw) ?? "User"
  if (normalized !== roleRaw) {
    localStorage.setItem(ROLE_KEY, normalized)
  }
  return normalized
}

/**
 * Set current user role in localStorage
 */
export function setCurrentRole(role: UserRole): void {
  if (typeof window === "undefined") return

  localStorage.setItem(ROLE_KEY, role)
}

/**
 * Get role-based access control configuration from localStorage
 * Returns default configuration if not set or invalid
 */
export function getRoleAccessControl(): RoleAccessControl[] {
  if (typeof window === "undefined") return DEFAULT_ACCESS_CONTROL

  try {
    const stored = localStorage.getItem(ACCESS_CONTROL_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const normalized = normalizeAccessControl(parsed)
      if (normalized) {
        saveRoleAccessControl(normalized)
        return normalized
      }
    }
  } catch (error) {
    console.error("Error loading access control:", error)
  }

  saveRoleAccessControl(DEFAULT_ACCESS_CONTROL)
  return DEFAULT_ACCESS_CONTROL
}

/**
 * Save role-based access control configuration to localStorage
 */
export function saveRoleAccessControl(accessControl: RoleAccessControl[]): void {
  if (typeof window === "undefined") return

  localStorage.setItem(ACCESS_CONTROL_KEY, JSON.stringify(accessControl))
}

/**
 * Get allowed pages for a specific role
 */
export function getAllowedPagesForRole(role: UserRole): string[] {
  const accessControl = getRoleAccessControl()
  const roleConfig = accessControl.find((config) => config.role === role)

  return roleConfig ? roleConfig.allowedPages : []
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
