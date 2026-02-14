import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  // Let all requests through - client-side will handle authentication
  // This is because Supabase stores auth tokens in localStorage (client-side only)
  return NextResponse.next()
}

export const config = {
  matcher: ["/portal/:path*"],
}
