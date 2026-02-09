"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import type { OrderStatus } from "@/lib/types"

interface OrderProgressProps {
  currentPhase?: number
  currentStatus?: OrderStatus
  currentStep?: "request-for-quotation" | "quotation" | "sales-confirmation" | "planning" | "procurement" | "packing" | "delivery" | "returning" | "invoice" | "payment"
  orderNumber?: string
  clickable?: boolean
  hasIssue?: boolean
  orderSource?: "sales" | "ad-hoc"
  quotationPath?: string
  requiresDismantle?: boolean
  adHocOptions?: {
    requiresPacking: boolean
    requiresSetup: boolean
    requiresDismantle: boolean
    requiresOtherAdhoc: boolean
    otherAdhocName?: string
  }
}

export function OrderProgress({ 
  currentPhase,
  currentStatus,
  currentStep,
  orderNumber,
  clickable = true,
  hasIssue = false,
  orderSource,
  quotationPath,
  requiresDismantle,
  adHocOptions,
}: OrderProgressProps) {
  const router = useRouter()

  const allPhases = [
    { key: "request-for-quotation", label: "Request for quotation", path: "/portal/quotation/request-for-quotation" },
    {
      key: "quotation",
      label: "Quotation",
      path: quotationPath || (orderSource === "ad-hoc" ? "/portal/ad-hoc" : "/portal/sales-order"),
    },
    { key: "sales-confirmation", label: "Sales Confirmation", path: "/portal/sales-confirmation" },
    { key: "planning", label: "Planning", path: "/portal/planning" },
    { key: "procurement", label: "Procurement", path: "/portal/procurement" },
    { key: "packing", label: "Packing", path: "/portal/packing" },
    { key: "delivery", label: "Delivery", path: "/portal/delivery" },
    { key: "returning", label: "Returning", path: "/portal/returning" },
    { key: "invoice", label: "Invoice", path: "/portal/invoice" },
    { key: "payment", label: "Payment", path: "/portal/payment" },
  ] as const

  const resolvedRequiresDismantle = requiresDismantle ?? adHocOptions?.requiresDismantle ?? true

  const phases = allPhases.filter((phase) => {
    if (phase.key === "returning") return resolvedRequiresDismantle
    return true
  })

  const statusToStep = (status: OrderStatus | undefined): OrderProgressProps["currentStep"] => {
    if (!status) return undefined
    if (status === "draft") return "quotation"
    if (status === "scheduling") return "sales-confirmation"
    if (status === "planning") return "planning"
    if (status === "procurement") return "procurement"
    if (status === "packing") return "packing"
    if (status === "setting-up") return "delivery"
    if (status === "dismantling") return "returning"
    if (status === "invoice") return "invoice"
    if (status === "payment") return "payment"
    // Legacy: kept for backwards compatibility with older saved orders.
    if (status === "completed") return "payment"
    return undefined
  }

  const resolvedStep = currentStep ?? statusToStep(currentStatus)
  const resolvedIndex =
    resolvedStep ? Math.max(0, phases.findIndex((p) => p.key === resolvedStep)) : (currentPhase ?? 0)

  const handlePhaseClick = (phase: typeof phases[number], index: number) => {
    if (!clickable) return

    // Navigate to the phase page
    if (orderNumber && index > 0) {
      router.push(`${phase.path}?order=${orderNumber}`)
    } else {
      router.push(phase.path)
    }
  }

  return (
    <div className="w-full overflow-x-auto pb-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-start min-w-max">
        {phases.map((phase, index) => {
          const isCompleted = index < resolvedIndex
          const isCurrent = index === resolvedIndex
          const isLast = index === phases.length - 1
          const isAllCompleted = resolvedIndex === phases.length - 1 && index <= resolvedIndex

          // Determine background color
          let bgColor = "bg-muted text-muted-foreground" // Not reached
          if (hasIssue && (isCompleted || isCurrent)) {
            bgColor = "bg-red-500 text-white" // Issue flagged
          } else if (isAllCompleted) {
            bgColor = "bg-green-500 text-white" // All completed - green
          } else if (isCompleted) {
            bgColor = "bg-green-500 text-white" // Completed - green
          } else if (isCurrent) {
            bgColor = "bg-yellow-400 text-yellow-900" // In progress - yellow
          }

          const disabled = !clickable

          return (
            <React.Fragment key={phase.key}>
              {/* Phase Box */}
              <div className="relative flex flex-col items-center">
                {/* Chevron Shape */}
                <button
                  type="button"
                  onClick={() => handlePhaseClick(phase, index)}
                  disabled={disabled}
                  className={cn(
                    "relative flex h-9 min-w-[100px] items-center justify-center px-3 text-xs font-medium transition-all sm:min-w-[120px] sm:h-10 sm:text-sm",
                    bgColor,
                    !disabled && "cursor-pointer hover:opacity-90",
                    disabled && "cursor-default"
                  )}
                  style={{
                    clipPath: isLast
                      ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)"
                      : index === 0
                        ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
                        : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)",
                  }}
                >
                  <span className="flex items-center gap-1">
                    {isCompleted && <Check className="h-3 w-3 sm:h-4 sm:w-4" />}
                    <span className="hidden sm:inline">{phase.label}</span>
                    <span className="sm:hidden">{phase.label.split(" ")[0]}</span>
                  </span>
                </button>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
