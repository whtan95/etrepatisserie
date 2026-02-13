"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  getCurrentUser,
  getAllUsers,
  approveUser,
  rejectUser,
  type AppUser,
} from "@/lib/auth"
import { CheckCircle, XCircle, Clock, Shield, User, RefreshCw } from "lucide-react"

export default function UserManagementPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const user = await getCurrentUser()
      setCurrentUser(user)

      if (!user || user.role !== "admin") {
        router.push("/portal")
        return
      }

      const allUsers = await getAllUsers()
      setUsers(allUsers)
    } catch (err) {
      console.error("Failed to load users:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAction = async () => {
    if (!actionUserId || !actionType || !currentUser) return

    setIsProcessing(true)
    try {
      if (actionType === "approve") {
        await approveUser(actionUserId, currentUser.id)
      } else {
        await rejectUser(actionUserId)
      }
      await loadData()
    } catch (err) {
      console.error("Failed to process action:", err)
    } finally {
      setIsProcessing(false)
      setActionUserId(null)
      setActionType(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="h-3 w-3" />
            Approved
          </span>
        )
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        )
    }
  }

  const getRoleBadge = (role: string) => {
    if (role === "admin") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          <Shield className="h-3 w-3" />
          Admin
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
        <User className="h-3 w-3" />
        Staff
      </span>
    )
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

  const pendingUsers = users.filter((u) => u.status === "pending")
  const otherUsers = users.filter((u) => u.status !== "pending")

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!actionUserId && !!actionType}
        title={actionType === "approve" ? "Approve User?" : "Reject User?"}
        description={
          actionType === "approve"
            ? "This user will be able to access the portal."
            : "This user will not be able to access the portal."
        }
        confirmText={actionType === "approve" ? "Approve" : "Reject"}
        cancelText="Cancel"
        onConfirm={handleAction}
        onCancel={() => {
          setActionUserId(null)
          setActionType(null)
        }}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Approve or reject user access to the portal.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            Pending Approval ({pendingUsers.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-yellow-100/50 dark:bg-yellow-900/30">
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Registered</th>
                    <th className="px-4 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-200 dark:divide-yellow-900">
                  {pendingUsers.map((user) => (
                    <tr key={user.id} className="text-sm">
                      <td className="px-4 py-3 text-foreground">
                        {user.displayName || "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setActionUserId(user.id)
                              setActionType("approve")
                            }}
                            disabled={isProcessing}
                          >
                            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setActionUserId(user.id)
                              setActionType("reject")
                            }}
                            disabled={isProcessing}
                          >
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* All Users */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">All Users ({users.length})</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-secondary/40">
                <tr className="text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`text-sm ${user.id === currentUser.id ? "bg-accent/30" : ""}`}
                  >
                    <td className="px-4 py-3 text-foreground">
                      {user.displayName || "-"}
                      {user.id === currentUser.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                    <td className="px-4 py-3">{getStatusBadge(user.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
