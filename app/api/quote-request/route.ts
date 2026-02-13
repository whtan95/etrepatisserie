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

    const { error } = await supabase.from("quote_requests").insert({
      id,
      created_at: now.toISOString(),
      status: "new",
      request,
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
