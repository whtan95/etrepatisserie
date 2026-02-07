import { NextResponse } from "next/server"
import { getInventoryDb, updateInventoryDb } from "@/lib/inventory-db"
import { normalizeInventoryDb } from "@/lib/inventory"

export const runtime = "nodejs"

export async function GET() {
  try {
    const inventory = await getInventoryDb()
    return NextResponse.json({ success: true, inventory })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load inventory" },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const inventoryPayload =
      body?.inventory ??
      (Array.isArray(body?.items) ? { items: body.items } : body) ??
      {}

    // `normalizeInventoryDb` expects `{ items: [...] }`. If caller sends the items array directly,
    // wrap it so we don't accidentally reset to defaults.
    const candidate = Array.isArray(inventoryPayload) ? { items: inventoryPayload } : inventoryPayload
    const normalized = normalizeInventoryDb(candidate)
    const saved = await updateInventoryDb(normalized.items)
    return NextResponse.json({ success: true, inventory: saved })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save inventory" },
      { status: 500 }
    )
  }
}
