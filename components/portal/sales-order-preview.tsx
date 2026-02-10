"use client"

import React, { useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Download,
  Save,
  Printer,
  MapPin,
  Mail,
  Phone,
  CheckCircle,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Edit,
} from "lucide-react"
import type { SalesOrder } from "@/lib/types"
import type { InventoryItem } from "@/lib/inventory"
import { getInventoryDbFromLocalStorage, hasInventoryDbInLocalStorage } from "@/lib/inventory-storage"

interface SalesOrderPreviewProps {
  salesOrder: SalesOrder
  isEditMode?: boolean
  showSave?: boolean
  isFormLocked?: boolean
  onEditOrder?: () => void
  onSaveComplete?: () => void
  orderSource?: "sales" | "ad-hoc"
  embedded?: boolean
  documentType?: "quotation" | "sales-order"
}

export function SalesOrderPreview({ salesOrder, isEditMode = false, showSave = true, isFormLocked = false, onEditOrder, onSaveComplete, orderSource = "sales", embedded = false, documentType = "quotation" }: SalesOrderPreviewProps) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | "auto">("auto")

  const isSalesOrderDoc = documentType === "sales-order"
  const docTitle =
    orderSource === "ad-hoc"
      ? isSalesOrderDoc
        ? "ADHOC ORDER"
        : "ADHOC QUOTATION"
      : isSalesOrderDoc
        ? "SALES ORDER"
        : "SALES QUOTATION"
  const docTitlePreview =
    orderSource === "ad-hoc"
      ? isSalesOrderDoc
        ? "Adhoc Order Preview"
        : "Adhoc Quotation Preview"
      : isSalesOrderDoc
        ? "Sales Order Preview"
        : "Sales Quotation Preview"

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const cleanPart = (s: string) => s.trim().replace(/^[,\s]+|[,\s]+$/g, "").replace(/\s+/g, " ")

  const formatAddress = (prefix: "billing" | "delivery") => {
    const cd: any = salesOrder.customerData as any
    const buildingName = cleanPart(String(cd?.[`${prefix}BuildingName`] ?? ""))
    const gateNo = cleanPart(String(cd?.[`${prefix}AddressGate`] ?? ""))
    const address1 = cleanPart(String(cd?.[`${prefix}Address1`] ?? cd?.[`${prefix}AddressJalan`] ?? ""))
    const address2 = cleanPart(String(cd?.[`${prefix}Address2`] ?? cd?.[`${prefix}AddressTaman`] ?? ""))
    const postCode = cleanPart(String(cd?.[`${prefix}PostCode`] ?? ""))
    const city = cleanPart(String(cd?.[`${prefix}City`] ?? ""))
    const state = cleanPart(String(cd?.[`${prefix}State`] ?? ""))

    const mainParts = [buildingName, gateNo, address1, address2].filter(Boolean)
    const mainText = mainParts.join(" ").toLowerCase()

    const alreadyHas = (value: string) =>
      value ? new RegExp(`\\b${escapeRegExp(value)}\\b`, "i").test(mainText) : false

    const postParts = [
      postCode && !alreadyHas(postCode) ? postCode : "",
      city && !alreadyHas(city) ? city : "",
      state && !alreadyHas(state) ? state : "",
    ].filter(Boolean)

    const computed = [...mainParts, postParts.join(" ")].filter(Boolean).join(", ")
    return computed || cleanPart(String(cd?.[`${prefix}Address`] ?? "")) || "N/A"
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "-"
    const date = new Date(dateString)
    return date.toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${isSalesOrderDoc ? "Sales Order" : "Quotation"} - ${salesOrder.orderNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1a1a1a; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #f3ea11; }
            .company-info h1 { font-size: 24px; font-weight: bold; color: #1a1a1a; }
            .company-info p { font-size: 12px; color: #666; }
            .sales-order-title { text-align: right; }
            .sales-order-title h2 { font-size: 28px; font-weight: bold; color: #1a1a1a; }
            .sales-order-title p { font-size: 14px; color: #666; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
            .info-section h3 { font-size: 14px; font-weight: 600; color: #1a1a1a; margin-bottom: 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 5px; }
            .info-section p { font-size: 12px; color: #333; margin-bottom: 4px; }
            .info-section .label { color: #666; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #f5f5f5; padding: 10px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid #e5e5e5; }
            td { padding: 10px; font-size: 12px; border-bottom: 1px solid #e5e5e5; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totals { margin-left: auto; width: 300px; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e5e5; }
            .totals-row.total { border-top: 2px solid #1a1a1a; border-bottom: none; font-size: 16px; font-weight: bold; }
            .photos-section { margin-top: 18px; }
            .photos-title { font-size: 14px; font-weight: 600; color: #1a1a1a; margin-bottom: 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 5px; }
            .photo-grid { display: flex; flex-wrap: wrap; gap: 12px; }
            .photo-grid img { width: 360px; height: 360px; object-fit: cover; border-radius: 12px; border: 1px solid #e5e5e5; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #666; text-align: center; }
            .highlight { background: #f3ea11; padding: 2px 6px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const handleExportPDF = () => {
    handlePrint()
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      const madeBy = (salesOrder.orderMeta?.madeBy || "").trim()
      const customerName = (salesOrder.customerData?.customerName || "").trim()
      const companyName = (salesOrder.customerData?.companyName || "").trim()
      const phone = (salesOrder.customerData?.phone || "").trim()

      const getAddrPart = (prefix: "billing" | "delivery", key: "Address1" | "AddressJalan" | "PostCode" | "City" | "State") =>
        (salesOrder.customerData as any)?.[`${prefix}${key}`] as string | undefined

      const hasCompleteAddress = (prefix: "billing" | "delivery") => {
        const legacy = ((salesOrder.customerData as any)?.[`${prefix}Address`] as string | undefined || "").trim()
        if (legacy) return true
        const gateNo = ((salesOrder.customerData as any)?.[`${prefix}AddressGate`] as string | undefined || "").trim()
        const address1 = (getAddrPart(prefix, "Address1") || getAddrPart(prefix, "AddressJalan") || "").trim()
        const postCode = (getAddrPart(prefix, "PostCode") || "").trim()
        const city = (getAddrPart(prefix, "City") || "").trim()
        const state = (getAddrPart(prefix, "State") || "").trim()
        return Boolean(gateNo && address1 && postCode && city && state)
      }

      if (!madeBy) {
        window.alert("Made By is required.")
        return
      }
      if (!customerName && !companyName) {
        window.alert("Customer Name / Company Name is required.")
        return
      }
      if (!phone) {
        window.alert("Phone is required.")
        return
      }
      if (!hasCompleteAddress("billing")) {
        window.alert("Billing Address is required (Building Name optional; Gate No, Address 1, Post Code, City, State are mandatory).")
        return
      }
      if (!hasCompleteAddress("delivery")) {
        window.alert("Delivery Address is required (Building Name optional; Gate No, Address 1, Post Code, City, State are mandatory).")
        return
      }

      const eventDate = salesOrder.eventData?.eventDate || ""
      const setupDate = salesOrder.eventData?.customerPreferredSetupDate || ""
      const dismantleDate = salesOrder.eventData?.customerPreferredDismantleDate || ""

      if (eventDate && setupDate && setupDate > eventDate) {
        window.alert(
          `Preferred setup date (${setupDate}) cannot be later than event date (${eventDate}).`
        )
        return
      }

      if (eventDate && dismantleDate && dismantleDate < eventDate) {
        window.alert(
          `Preferred dismantle date (${dismantleDate}) cannot be earlier than event date (${eventDate}).`
        )
        return
      }

      const storageKey = orderSource === "ad-hoc" ? "etre_ad_hoc_orders" : "etre_sales_orders"
      const existingOrders = JSON.parse(localStorage.getItem(storageKey) || "[]")

      let enrichedItems = salesOrder.items
      try {
        const invItems: InventoryItem[] = (() => {
          if (hasInventoryDbInLocalStorage()) return getInventoryDbFromLocalStorage().items
          return []
        })()

        const fallbackItems: InventoryItem[] = []
        if (!invItems.length) {
          const res = await fetch("/api/inventory", { cache: "no-store" })
          const data = await res.json().catch(() => ({}))
          fallbackItems.push(...(Array.isArray(data?.inventory?.items) ? data.inventory.items : []))
        }

        const finalItems = invItems.length ? invItems : fallbackItems
        if (finalItems.length) {
          const byId = new Map(finalItems.map((it) => [it.id, it]))
          const byName = new Map(finalItems.map((it) => [it.name.trim().toLowerCase(), it]))
          enrichedItems = (salesOrder.items || []).map((it) => {
            const currentId = (it as any).inventoryId as string | undefined
            const match =
              (currentId ? byId.get(currentId) : undefined) ||
              byName.get((it.name || "").trim().toLowerCase())
            if (!match) return it
            return {
              ...it,
              inventoryId: match.id,
            }
          })
        }
      } catch {
        // ignore (keep existing item times)
      }

      const normalizeSlot = (value: unknown) => (typeof value === "string" ? value.trim() : "")
      // Prefer the new CustomerData slots; fall back to legacy EventData values.
      const normalizedSetupSlot =
        normalizeSlot((salesOrder.customerData as any)?.setupTimeSlot) ||
        normalizeSlot((salesOrder.eventData as any)?.desiredSetupTime)
      const normalizedDismantleSlot =
        normalizeSlot((salesOrder.customerData as any)?.dismantleTimeSlot) ||
        normalizeSlot((salesOrder.eventData as any)?.desiredDismantleTime)

      const normalizedCustomerData = {
        ...salesOrder.customerData,
        setupTimeSlot: normalizedSetupSlot,
        dismantleTimeSlot: normalizedDismantleSlot,
      }

      const normalizedEventData = {
        ...salesOrder.eventData,
        desiredSetupTime: normalizedSetupSlot,
        desiredDismantleTime: normalizedDismantleSlot,
      }

      const orderToSave = {
        ...salesOrder,
        customerData: normalizedCustomerData,
        eventData: normalizedEventData,
        items: enrichedItems,
        status: "scheduling",
        updatedAt: new Date().toISOString(),
      }

      const existingIndex = existingOrders.findIndex((o: SalesOrder) => o.orderNumber === salesOrder.orderNumber)
      if (existingIndex >= 0) {
        existingOrders[existingIndex] = orderToSave
      } else {
        existingOrders.push(orderToSave)
      }

      localStorage.setItem(storageKey, JSON.stringify(existingOrders))

      setIsSaved(true)
      if (onSaveComplete) {
        onSaveComplete()
      }
    } catch (error) {
      console.error("Failed to save order:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleProceedToSalesConfirmation = () => {
    router.push("/portal/sales-confirmation")
  }

  const discountAmount = salesOrder.discount || 0
  const totalBeforeDiscount = salesOrder.subtotal + salesOrder.tax + discountAmount
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contentRef.current) return
    const height = contentRef.current.scrollHeight
    setContentHeight(height)
  }, [salesOrder, isCollapsed])

  return (
    <div className="space-y-6">
      {/* Sales Order Document */}
      <div
        className="overflow-hidden rounded-lg border border-border bg-white shadow-lg transition-all duration-300"
        style={{ maxHeight: isCollapsed ? 0 : contentHeight }}
      >
        <div ref={contentRef}>
          <div ref={printRef} className="p-8">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between border-b-4 border-accent pb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Être Patisserie</h1>
              <p className="text-sm text-muted-foreground">Artisan Pastry & Bakery</p>
              <p className="mt-2 text-sm text-muted-foreground">Malaysia</p>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-foreground">{docTitle}</h2>
              <p className="mt-1 text-lg font-medium text-foreground">{salesOrder.orderNumber}</p>
            </div>
          </div>

          {/* Order Meta Info */}
          {salesOrder.orderMeta && (
            <div className="mb-6 rounded-lg bg-muted/30 p-4 text-sm">
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">Order Date: </span>
                  <span className="font-medium">{formatDate(salesOrder.orderMeta.orderDate)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Order Time: </span>
                  <span className="font-medium">{salesOrder.orderMeta.orderTime || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created By: </span>
                  <span className="font-medium">{salesOrder.orderMeta.madeBy || "-"}</span>
                </div>
              </div>
            </div>
          )}

          {/* Sale Information & Customer Info */}
          <div className="mb-8 grid gap-8 md:grid-cols-2">
            {/* Sale Information */}
            <div>
              <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-foreground">
                Sale Information
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isSalesOrderDoc ? "Sales Order Date:" : "Quotation Date:"}</span>
                  <span className="font-medium">{formatDate(salesOrder.salesOrderDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event Date:</span>
                  <span className="font-medium">
                    {formatDate(salesOrder.eventData.eventDate)}
                    {salesOrder.eventData.dayOfWeek && ` (${salesOrder.eventData.dayOfWeek})`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event Type:</span>
                  <span className="font-medium">{salesOrder.eventData.eventType || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{salesOrder.eventData.duration} day(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Setup:</span>
                  <span className="font-medium">
                    {formatDate(salesOrder.eventData.customerPreferredSetupDate)} ({salesOrder.customerData.setupTimeSlot || "-"})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dismantle:</span>
                  <span className="font-medium">
                    {formatDate(salesOrder.eventData.customerPreferredDismantleDate)} ({salesOrder.customerData.dismantleTimeSlot || "-"})
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <div>
              <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-foreground">
                Customer Information
              </h3>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-foreground">
                  {salesOrder.customerData.customerName ||
                    salesOrder.customerData.companyName ||
                    "N/A"}
                </p>
                {salesOrder.customerData.customerName && salesOrder.customerData.companyName && (
                  <p className="text-muted-foreground">{salesOrder.customerData.companyName}</p>
                )}
                {salesOrder.customerData.phone && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {salesOrder.customerData.phone}
                  </p>
                )}
                {salesOrder.customerData.email && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {salesOrder.customerData.email}
                  </p>
                )}
              </div>

              <div className="mt-4">
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Billing Address</p>
                <p className="text-sm text-foreground">
                  {formatAddress("billing")}
                </p>
              </div>

              <div className="mt-3">
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Delivery Address</p>
                <p className="flex items-start gap-1 text-sm text-foreground">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    {formatAddress("delivery")}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Order Details Table */}
          <div className="mb-8">
            <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-foreground">
              Order Details
            </h3>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-border bg-muted/50">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">
                    Item
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-foreground">
                    Qty
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">
                    Unit Price
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">
                    SST (8%)
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {salesOrder.items.map((item, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-foreground">{item.quantity}</td>
                    <td className="px-3 py-3 text-right text-foreground">RM {item.unitPrice.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {item.sst > 0 ? `RM ${item.sst.toFixed(2)}` : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-foreground">
                      RM {item.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="ml-auto mt-4 w-72">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">RM {salesOrder.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">SST (8%):</span>
                  <span className="font-medium">RM {salesOrder.tax.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between border-b border-border pb-2 text-destructive">
                    <span>Discount:</span>
                    <span className="font-medium">- RM {discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-lg">
                  <span className="font-bold text-foreground">Total:</span>
                  <span className="font-bold text-foreground">RM {salesOrder.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Special Request */}
          {salesOrder.customerData.specialRequest && (
            <div className="mb-8">
              <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-foreground">
                Special Request / Notes
              </h3>
              <p className="rounded-lg bg-muted/50 p-4 text-sm text-foreground">
                {salesOrder.customerData.specialRequest}
              </p>
            </div>
          )}

          {/* Customer Uploaded Photos */}
          {!!salesOrder.customerData.photos?.length && (
            <div className="photos-section mb-8">
              <h3 className="photos-title mb-3 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-foreground">
                Customer Uploaded Photos
              </h3>
              <div className="photo-grid flex flex-wrap gap-3">
                {salesOrder.customerData.photos.map((photo, idx) => (
                  <img
                    key={idx}
                    src={photo || "/placeholder.svg"}
                    alt={`Customer upload ${idx + 1}`}
                    className="h-[360px] w-[360px] rounded-xl border border-border object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border pt-6 text-center">
            <p className="text-xs text-muted-foreground">
              This quotation is valid until {formatDate(salesOrder.expirationDate)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Thank you for choosing Être Patisserie
            </p>
          </div>
          </div>
        </div>
      </div>

      {/* Action Buttons - Moved Below */}
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">{docTitlePreview}</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="gap-2 bg-transparent"
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show
                </>
              ) : (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handlePrint} className="gap-2 bg-transparent">
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={handleExportPDF} className="gap-2 bg-transparent">
              <Download className="h-4 w-4" />
              Export PDF
            </Button>
            {showSave && (
              <>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || isSaved}
                  variant="outline"
                  className="gap-2 bg-transparent"
                >
                  {isSaved ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {isSaving ? "Saving..." : "Save"}
                    </>
                  )}
                </Button>
                {isFormLocked && isSaved && onEditOrder && (
                  <Button
                    onClick={onEditOrder}
                    variant="outline"
                    className="gap-2 bg-transparent"
                  >
                    <Edit className="h-4 w-4" />
                    Edit Order
                  </Button>
                )}
                <Button
                  onClick={handleProceedToSalesConfirmation}
                  disabled={!isSaved}
                  className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <ArrowRight className="h-4 w-4" />
                  Proceed to Sales order
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
