import { getSupabase } from "./supabase"

export type UserStatus = "pending" | "approved" | "rejected"
export type UserRole = "admin" | "manager" | "staff"

export interface AppUser {
  id: string
  email: string
  displayName: string | null
  status: UserStatus
  role: UserRole
  createdAt: string
  approvedAt: string | null
}

/**
 * Sign up a new user with email and password.
 * Creates both Supabase Auth user and our users table record.
 */
export async function signUp(
  email: string,
  password: string,
  displayName: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()

  // Check if this is the first user (will be auto-approved as admin)
  const { count } = await supabase.from("users").select("*", { count: "exact", head: true })
  const isFirstUser = count === 0

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  if (!authData.user) {
    return { success: false, error: "Failed to create user" }
  }

  // Create users table record
  const { error: insertError } = await supabase.from("users").insert({
    id: authData.user.id,
    email,
    display_name: displayName,
    status: isFirstUser ? "approved" : "pending",
    role: isFirstUser ? "admin" : "staff",
    approved_at: isFirstUser ? new Date().toISOString() : null,
  })

  if (insertError) {
    console.error("Failed to create user record:", insertError)
    return { success: false, error: insertError.message }
  }

  return { success: true }
}

/**
 * Sign in with email and password.
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ success: boolean; user?: AppUser; error?: string }> {
  const supabase = getSupabase()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data.user) {
    return { success: false, error: "Failed to sign in" }
  }

  // Get user status from our users table
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .single()

  if (userError || !userData) {
    return { success: false, error: "User record not found" }
  }

  return {
    success: true,
    user: {
      id: userData.id,
      email: userData.email,
      displayName: userData.display_name,
      status: userData.status,
      role: userData.role,
      createdAt: userData.created_at,
      approvedAt: userData.approved_at,
    },
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  await supabase.auth.signOut()
}

/**
 * Get the current logged-in user with their status.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = getSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: userData } = await supabase.from("users").select("*").eq("id", user.id).single()

  if (!userData) return null

  return {
    id: userData.id,
    email: userData.email,
    displayName: userData.display_name,
    status: userData.status,
    role: userData.role,
    createdAt: userData.created_at,
    approvedAt: userData.approved_at,
  }
}

/**
 * Get all users (admin only).
 */
export async function getAllUsers(): Promise<AppUser[]> {
  const supabase = getSupabase()

  const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false })

  if (!data) return []

  return data.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    status: u.status,
    role: u.role,
    createdAt: u.created_at,
    approvedAt: u.approved_at,
  }))
}

/**
 * Approve a user (admin only).
 */
export async function approveUser(userId: string, approvedById: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from("users")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedById,
    })
    .eq("id", userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Reject a user (admin only).
 */
export async function rejectUser(userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()

  const { error } = await supabase.from("users").update({ status: "rejected" }).eq("id", userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Update a user's role (admin only).
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()

  const { error } = await supabase.from("users").update({ role: newRole }).eq("id", userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
