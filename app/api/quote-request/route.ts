import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { QuoteRequestData } from "@/lib/quote-webpage/quote-types"

function generateRequestForQuotationId(now = new Date()): string {
  const yyyy = now.getFullYear().toString()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `RFQ-${yyyy}${mm}${dd}-${rand}`
}

/**
 * Convert QuoteRequestData to flat columns for Supabase
 */
function flattenRequest(request: QuoteRequestData) {
  const { event, customer, branding, menu } = request
  return {
    // Event
    event_name: event.eventName || null,
    event_date: event.eventDate || null,
    event_type: event.eventType || null,
    event_type_other: event.otherEventType || null,
    estimated_guests: event.estimatedGuests || null,
    event_location: event.eventLocation || null,
    location_area_name: event.otherAreaName || null,
    location_venue_type: event.otherVenueType || null,
    setup_date: event.takeOutSetupDate || null,
    dismantle_date: event.takeOutDismantleDate || null,
    budget_from_rm: event.budgetPerPersonFromRm || null,
    budget_to_rm: event.budgetPerPersonToRm || null,
    // Customer
    customer_company: customer.companyName || null,
    customer_name: customer.name || null,
    customer_phone: customer.phone || null,
    customer_email: customer.email || null,
    customer_address: customer.address || null,
    customer_notes: customer.notes || null,
    // Branding
    branding_include_logo: branding.includeBrandLogo || false,
    branding_match_colours: branding.matchBrandColours || false,
    branding_logo_dessert: branding.logoOnDessert || false,
    branding_logo_packaging: branding.logoOnPackaging || false,
    branding_logo_others: branding.logoOnOthers || false,
    branding_logo_others_text: branding.logoOnOthersText || null,
    branding_colour_dessert: branding.colourOnDessert || false,
    branding_colour_packaging: branding.colourOnPackaging || false,
    branding_colour_others: branding.colourOnOthers || false,
    branding_colour_others_text: branding.colourOnOthersText || null,
    // Menu
    menu_customisation_level: menu.customisationLevel || null,
    menu_customisation_notes: menu.customisationNotes || null,
    menu_design_style: menu.preferredDesignStyle || null,
    menu_colour_direction: menu.colourDirection || null,
    menu_colour_specified: menu.colourDirectionClientSpecifiedText || null,
    menu_flavour: menu.preferredFlavour || null,
    menu_flavour_specified: menu.preferredFlavourClientSpecifiedText || null,
    menu_dessert_size: menu.dessertSize || null,
    menu_packaging: menu.packaging || null,
    menu_categories: menu.categories || [],
    menu_drinks: menu.drinks || [],
    menu_drinks_other: menu.drinksOtherText || null,
    menu_item_quantities: menu.itemQuantities || {},
    menu_reference_image1_name: menu.referenceImage1Name || null,
    menu_reference_image1_url: menu.referenceImage1DataUrl || null,
    menu_reference_image2_name: menu.referenceImage2Name || null,
    menu_reference_image2_url: menu.referenceImage2DataUrl || null,
  }
}

// POST - 客户提交报价请求
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const request = body.request as QuoteRequestData

    if (!request) {
      return NextResponse.json({ error: "Missing request data" }, { status: 400 })
    }

    const now = new Date()
    const id = generateRequestForQuotationId(now)

    // Insert with both JSON (for frontend) and flat columns (for Supabase dashboard)
    const { error } = await supabase.from("quote_requests").insert({
      id,
      created_at: now.toISOString(),
      status: "new",
      request, // Keep JSON for frontend compatibility
      ...flattenRequest(request), // Spread flat columns
    })

    if (error) {
      console.error("Supabase insert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id, success: true })
  } catch (err) {
    console.error("POST /api/quote-request error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET - 获取所有报价请求（后台使用）
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("quote_requests")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Supabase select error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 转换为前端期望的格式
    const requests = (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      createdBy: "Web form",
      status: row.status,
      request: row.request,
      linkedOfficialQuotationId: row.linked_official_quotation_id,
    }))

    return NextResponse.json({ requests })
  } catch (err) {
    console.error("GET /api/quote-request error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - 删除报价请求
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    const { error } = await supabase.from("quote_requests").delete().eq("id", id)

    if (error) {
      console.error("Supabase delete error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE /api/quote-request error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH - 更新报价请求状态
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status, linkedOfficialQuotationId } = body

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (status) updates.status = status
    if (linkedOfficialQuotationId !== undefined) {
      updates.linked_official_quotation_id = linkedOfficialQuotationId
    }

    const { error } = await supabase.from("quote_requests").update(updates).eq("id", id)

    if (error) {
      console.error("Supabase update error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("PATCH /api/quote-request error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
