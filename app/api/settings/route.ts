import { NextResponse } from "next/server"
import { getSettingsDb, updateSettingsDb } from "@/lib/settings-db"

export const runtime = "nodejs"

export async function GET() {
  try {
    const settings = await getSettingsDb()
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const settings = await updateSettingsDb(body?.settings ?? body ?? {})
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 }
    )
  }
}

