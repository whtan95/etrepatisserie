import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function middleware(request: NextRequest) {
  // Only protect /portal routes
  if (!request.nextUrl.pathname.startsWith("/portal")) {
    return NextResponse.next()
  }

  // Check for Supabase auth token in cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase not configured, allow access (for development)
    return NextResponse.next()
  }

  // Get the access token from cookies
  const accessToken = request.cookies.get("sb-access-token")?.value
  const refreshToken = request.cookies.get("sb-refresh-token")?.value

  // Also check for the newer cookie format
  const sbCookie = request.cookies
    .getAll()
    .find((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"))

  if (!accessToken && !refreshToken && !sbCookie) {
    // No auth tokens found, redirect to login
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("status", "unauthorized")
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Allow the request to continue - client-side will verify user status
  return NextResponse.next()
}

export const config = {
  matcher: ["/portal/:path*"],
}
