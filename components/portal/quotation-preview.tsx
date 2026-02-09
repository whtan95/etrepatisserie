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
} from "lucide-react"
import type { SalesOrder } from "@/lib/types"

interface QuotationPreviewProps {
  salesOrder: SalesOrder
  isEditMode?: boolean
  showSave?: boolean
}

export function QuotationPreview({ salesOrder, isEditMode = false, showSave = true }: QuotationPreviewProps) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | "auto">("auto")

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
          <title>Quotation - ${salesOrder.orderNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1a1a1a; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #f3ea11; }
            .company-info h1 { font-size: 24px; font-weight: bold; color: #1a1a1a; }
            .company-info p { font-size: 12px; color: #666; }
            .quotation-title { text-align: right; }
            .quotation-title h2 { font-size: 28px; font-weight: bold; color: #1a1a1a; }
            .quotation-title p { font-size: 14px; color: #666; }
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
      const existingOrders = JSON.parse(localStorage.getItem("etre_sales_orders") || "[]")
      const orderToSave = {
        ...salesOrder,
        status: "scheduling" as const,
        updatedAt: new Date().toISOString(),
      }
      
      const existingIndex = existingOrders.findIndex((o: SalesOrder) => o.orderNumber === salesOrder.orderNumber)
      if (existingIndex >= 0) {
        existingOrders[existingIndex] = orderToSave
      } else {
        existingOrders.push(orderToSave)
      }
      
      localStorage.setItem("etre_sales_orders", JSON.stringify(existingOrders))
      
      setIsSaved(true)
      
      setTimeout(() => {
        router.push("/portal/sales-confirmation")
      }, 1500)
    } catch (error) {
      console.error("Failed to save order:", error)
    } finally {
      setIsSaving(false)
    }
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
      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Quotation Preview</h2>
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
            <Button
              onClick={handleSave}
              disabled={isSaving || isSaved}
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isSaved ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : isEditMode ? "Update & Confirm" : "Save & Confirm"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Quotation Document */}
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
              <h2 className="text-3xl font-bold text-foreground">QUOTATION</h2>
              <p className="mt-1 text-lg font-medium text-foreground">{salesOrder.orderNumber}</p>
            </div>
          </div>

          {/* Order Meta Info */}
          {salesOrder.orderMeta && (
            <div className="mb-6 rounded-lg bg-muted/30 p-4 text-sm">
              <div className="grid gap-2 md:grid-cols-4">
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
                <div>
                  <span className="text-muted-foreground">Position: </span>
                  <span className="font-medium">{salesOrder.orderMeta.position || "-"}</span>
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
                  <span className="text-muted-foreground">Quotation Date:</span>
                  <span className="font-medium">{formatDate(salesOrder.orderMeta?.orderDate)}</span>
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
                  <span className="text-muted-foreground">Preferred Delivery:</span>
                  <span className="font-medium">
                    {formatDate(salesOrder.eventData.customerPreferredSetupDate)} ({salesOrder.customerData.setupTimeSlot || "-"})
                  </span>
                </div>
                {((salesOrder.orderSource === "ad-hoc"
                  ? salesOrder.adHocOptions?.requiresDismantle
                  : salesOrder.eventData?.dismantleRequired) ?? true) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preferred Dismantle:</span>
                    <span className="font-medium">
                      {formatDate(salesOrder.eventData.customerPreferredDismantleDate)} ({salesOrder.customerData.dismantleTimeSlot || "-"})
                    </span>
                  </div>
                )}
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
                  {salesOrder.customerData.billingAddress || "N/A"}
                  {salesOrder.customerData.billingPostCode && `, ${salesOrder.customerData.billingPostCode}`}
                  {salesOrder.customerData.billingState && `, ${salesOrder.customerData.billingState}`}
                </p>
              </div>

              <div className="mt-3">
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Delivery Address</p>
                <p className="flex items-start gap-1 text-sm text-foreground">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    {salesOrder.customerData.deliveryAddress || "N/A"}
                    {salesOrder.customerData.deliveryPostCode && `, ${salesOrder.customerData.deliveryPostCode}`}
                    {salesOrder.customerData.deliveryState && `, ${salesOrder.customerData.deliveryState}`}
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

      {showSave && (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            onClick={() => router.push("/portal/sales-confirmation")}
            disabled={!isSaved}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Proceed to Sales order
          </Button>
        </div>
      )}
    </div>
  )
}
