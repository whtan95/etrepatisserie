"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  FileText,
  CalendarClock,
  Package,
  Boxes,
  Wrench,
  Truck,
  CheckCircle,
  DollarSign,
  BarChart3,
  ExternalLink,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  AlertTriangle,
  Users,
  Loader2,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { UserRole } from "@/lib/types"
import { getCurrentRole, setCurrentRole, getAllowedPagesForRole } from "@/lib/role-storage"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { getCurrentUser, signOut, type AppUser } from "@/lib/auth"

type SidebarLinkItem = {
  title: string
  href: string
  icon: React.ElementType
}

type SidebarGroupItem = {
  title: string
  icon: React.ElementType
  children: SidebarLinkItem[]
}

type SidebarItem = SidebarLinkItem | SidebarGroupItem

const sidebarItems: SidebarItem[] = [
  {
    title: "Dashboard",
    icon: BarChart3,
    children: [
      {
        title: "Progress Calendar",
        href: "/portal/status-tracking",
        icon: BarChart3,
      },
      {
        title: "Performance Tracking",
        href: "/portal/performance-tracking",
        icon: BarChart3,
      },
    ],
  },
  {
    title: "Quotation",
    icon: FileText,
      children: [
        {
          title: "Webpage live",
          href: "/portal/quotation/webpage-live",
          icon: ExternalLink,
        },
        {
          title: "Request for quotation",
          href: "/portal/quotation/request-for-quotation",
          icon: FileText,
        },
        {
          title: "Official quotation",
          href: "/portal/quotation/official-quotation",
          icon: FileText,
        },
      ],
  },
  {
    title: "Sales order",
    href: "/portal/sales-confirmation",
    icon: CheckCircle,
  },
  {
    title: "Planning",
    href: "/portal/planning",
    icon: Package,
  },
  {
    title: "Procurement",
    href: "/portal/procurement",
    icon: Boxes,
  },
  {
    title: "Packing",
    href: "/portal/packing",
    icon: Package,
  },
  {
    title: "Delivery",
    icon: Truck,
    children: [
      {
        title: "Delivery",
        href: "/portal/delivery",
        icon: Truck,
      },
      {
        title: "Returning",
        href: "/portal/returning",
        icon: Truck,
      },
    ],
  },
    {
      title: "Invoice",
      href: "/portal/invoice",
      icon: FileText,
    },
    {
      title: "Payment",
      href: "/portal/payment",
      icon: DollarSign,
    },
  {
    title: "Warning & Issues",
    href: "/portal/warnings",
    icon: AlertTriangle,
  },
  {
    title: "Inventory",
    href: "/portal/inventory",
    icon: Boxes,
  },
  {
    title: "User Management",
    href: "/portal/settings/users",
    icon: Users,
  },
]

const isGroupItem = (item: SidebarItem): item is SidebarGroupItem =>
  "children" in item

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentRole, setCurrentRoleState] = useState<UserRole>("User")
  const [filteredSidebarItems, setFilteredSidebarItems] = useState(sidebarItems)
  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [quotationOpen, setQuotationOpen] = useState(true)
  const [deliveryOpen, setDeliveryOpen] = useState(true)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [authUser, setAuthUser] = useState<AppUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const getBaseHref = (href: string) => href.split("?")[0]

  const getHrefParam = (href: string, key: string): string | null => {
    const q = href.split("?")[1]
    if (!q) return null
    const params = new URLSearchParams(q)
    return params.get(key)
  }

  const isHrefActive = (href: string) => {
    const base = getBaseHref(href)
    const matchesPath = pathname === base || pathname.startsWith(base + "/")
    if (!matchesPath) return false

    return true
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser()
        if (!user) {
          router.push("/login?status=unauthorized")
          return
        }
        if (user.status !== "approved") {
          router.push("/login?status=pending")
          return
        }
        setAuthUser(user)
      } catch (err) {
        console.error("Auth check failed:", err)
        // If auth check fails (e.g., Supabase not configured), allow access
        setAuthUser(null)
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    // Settings removed
  }, [pathname])

  // Load current role on mount
  useEffect(() => {
    const role = getCurrentRole()
    setCurrentRoleState(role)
  }, [])

  // Filter sidebar items based on current role and auth user
  useEffect(() => {
    const allowedPages = getAllowedPagesForRole(currentRole)
    const filtered = sidebarItems
      .map((item) => {
        if (!isGroupItem(item)) {
          // Hide User Management for non-admins
          if (item.href === "/portal/settings/users" && authUser?.role !== "admin") {
            return null
          }
          return allowedPages.includes(getBaseHref(item.href)) ? item : null
        }
        const children = item.children.filter((child) => allowedPages.includes(getBaseHref(child.href)))
        return children.length ? { ...item, children } : null
      })
      .filter(Boolean) as SidebarItem[]
    setFilteredSidebarItems(filtered)
  }, [currentRole, authUser])

  useEffect(() => {
    const isDashboardActive = pathname === "/portal/status-tracking" ||
      pathname.startsWith("/portal/status-tracking/") ||
      pathname === "/portal/performance-tracking" ||
      pathname.startsWith("/portal/performance-tracking/")
    const isQuotationActive = pathname === "/portal/quotation/official-quotation" ||
      pathname.startsWith("/portal/quotation/official-quotation/") ||
      pathname === "/portal/quotation/webpage-live" ||
      pathname.startsWith("/portal/quotation/webpage-live/")
    const isDeliveryActive = pathname === "/portal/delivery" ||
      pathname.startsWith("/portal/delivery/") ||
      pathname === "/portal/returning" ||
      pathname.startsWith("/portal/returning/") ||
      pathname === "/portal/setting-up" ||
      pathname.startsWith("/portal/setting-up/") ||
      pathname === "/portal/dismantle" ||
      pathname.startsWith("/portal/dismantle/")
    if (isDashboardActive) setDashboardOpen(true)
    if (isQuotationActive) setQuotationOpen(true)
    if (isDeliveryActive) setDeliveryOpen(true)
  }, [pathname])

  const handleRoleChange = (role: UserRole) => {
    setCurrentRoleState(role)
    setCurrentRole(role)
  }

  const handleLogout = () => {
    setLogoutConfirmOpen(true)
  }

  const handleConfirmLogout = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error("Sign out failed:", err)
    }
    // Clear user role (set to default "User")
    setCurrentRole("User")
    // Navigate to login page
    router.push("/login")
    setLogoutConfirmOpen(false)
  }

  const getPageTitle = () => {
    if (pathname.includes("/quotation/official-quotation")) return "Official quotation"
    if (pathname.includes("/quotation/request-for-quotation")) return "Request for quotation"
    if (pathname.includes("/quotation/webpage-live")) return "Webpage live"
    if (pathname.includes("/sales-confirmation")) return "Sales order"
    if (pathname.includes("/planning")) return "Planning"
    if (pathname.includes("/packing")) return "Packing"
    if (pathname.includes("/procurement")) return "Procurement"
    if (pathname.includes("/delivery") || pathname.includes("/setting-up")) return "Delivery"
    if (pathname.includes("/returning") || pathname.includes("/dismantle")) return "Returning"
    if (pathname.includes("/invoice")) return "Invoice"
    if (pathname.includes("/payment")) return "Payment"
    if (pathname.includes("/completed")) return "Payment"
    if (pathname.includes("/status-tracking")) return "Progress Calendar"
    if (pathname.includes("/performance-tracking")) return "Performance Tracking"
    if (pathname.includes("/warnings")) return "Warning & Issues"
    if (pathname.includes("/inventory")) return "Inventory"
    if (pathname.includes("/settings/users")) return "User Management"
    if (pathname === "/portal") return "Dashboard"
    return ""
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Log out?"
        description="Are you sure you want to log out?"
        confirmText="Log out"
        cancelText="Cancel"
        onConfirm={handleConfirmLogout}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full flex-col border-r border-border bg-card transition-all duration-300 lg:relative",
          sidebarCollapsed ? "w-16" : "w-64",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header Section */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {!sidebarCollapsed && (
            <div>
              <h1 className="text-sm font-bold text-foreground">Être Patisserie</h1>
              <p className="text-xs text-muted-foreground">Order Management</p>
            </div>
          )}
          {sidebarCollapsed && (
            <span className="mx-auto text-sm font-bold text-foreground">ÊP</span>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground lg:block"
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 transition-transform",
                sidebarCollapsed && "rotate-180"
              )}
            />
          </button>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {filteredSidebarItems.map((item) => {
              if (!isGroupItem(item)) {
                const isActive = isHrefActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      sidebarCollapsed && "justify-center px-2"
                    )}
                    title={sidebarCollapsed ? item.title : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && <span>{item.title}</span>}
                  </Link>
                )
              }

              const hasActiveChild = item.children.some((child) => isHrefActive(child.href))
              const isOpen =
                item.title === "Dashboard"
                  ? dashboardOpen
                  : item.title === "Quotation"
                    ? quotationOpen
                    : item.title === "Delivery"
                      ? deliveryOpen
                    : hasActiveChild

              return (
                <div key={item.title} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.title === "Dashboard") setDashboardOpen((v) => !v)
                      if (item.title === "Quotation") setQuotationOpen((v) => !v)
                      if (item.title === "Delivery") setDeliveryOpen((v) => !v)
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      hasActiveChild
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      sidebarCollapsed && "justify-center px-2"
                    )}
                    title={sidebarCollapsed ? item.title : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1 text-left">{item.title}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isOpen ? "rotate-180" : "rotate-0"
                          )}
                        />
                      </>
                    )}
                  </button>

                  {!sidebarCollapsed && isOpen && (
                    <div className="pl-6 space-y-1">
                      {item.children.map((child) => {
                        const childActive = isHrefActive(child.href)
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                              childActive
                                ? "bg-secondary text-foreground"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            )}
                          >
                            <child.icon className="h-4 w-4 shrink-0" />
                            <span>{child.title}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </nav>

        {/* Logout Button and Version */}
        <div className="border-t border-border p-3">
          <button
            onClick={handleLogout}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
              sidebarCollapsed && "justify-center px-2"
            )}
            title={sidebarCollapsed ? "Log Out" : undefined}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!sidebarCollapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              {getPageTitle()}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {authUser && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                {authUser.displayName || authUser.email}
                {authUser.role === "admin" && (
                  <span className="ml-1.5 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    Admin
                  </span>
                )}
              </span>
            )}
            {mounted ? (
              <Select value={currentRole} onValueChange={handleRoleChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Warehouse">Warehouse</SelectItem>
                  <SelectItem value="Traffic">Traffic</SelectItem>
                  <SelectItem value="Operation">Operation</SelectItem>
                  <SelectItem value="User">User</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="h-9 w-[140px] rounded-md border border-border bg-muted/40" />
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-3 lg:p-4">
          {mounted ? children : null}
        </main>
      </div>
    </div>
  )
}
