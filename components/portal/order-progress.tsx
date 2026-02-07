"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import type { OrderStatus } from "@/lib/types"

interface OrderProgressProps {
  currentPhase?: number
  currentStatus?: OrderStatus
  currentStep?: "order" | "scheduling" | "packing" | "setting-up" | "dismantling" | "other-adhoc" | "completed"
  orderNumber?: string
  clickable?: boolean
  hasIssue?: boolean
  orderSource?: "sales" | "ad-hoc"
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
  adHocOptions,
}: OrderProgressProps) {
  const router = useRouter()

  const allPhases = [
    {
      key: "order",
      label: orderSource === "ad-hoc" ? "Ad Hoc Order" : "Sales Order",
      path: orderSource === "ad-hoc" ? "/portal/ad-hoc" : "/portal/sales-order",
    },
    { key: "scheduling", label: "Scheduling", path: "/portal/scheduling" },
    { key: "packing", label: "Packing", path: "/portal/packing" },
    { key: "setting-up", label: "Setting Up", path: "/portal/setting-up" },
    { key: "dismantling", label: "Dismantle", path: "/portal/dismantle" },
    { key: "other-adhoc", label: "Other Adhoc", path: "/portal/other-adhoc" },
    { key: "completed", label: "Completed", path: "/portal/completed" },
  ] as const

  const phases = allPhases.filter((phase) => {
    if (phase.key === "order" || phase.key === "scheduling" || phase.key === "completed") return true

    if (orderSource !== "ad-hoc") {
      // Sales flow has no Other Adhoc stage.
      return phase.key !== "other-adhoc"
    }

    if (phase.key === "packing") return adHocOptions?.requiresPacking ?? true
    if (phase.key === "setting-up") return adHocOptions?.requiresSetup ?? true
    if (phase.key === "dismantling") return adHocOptions?.requiresDismantle ?? true
    if (phase.key === "other-adhoc") {
      // Backwards compat for older saved orders
      return (adHocOptions as any)?.requiresOtherAdhoc ?? (adHocOptions as any)?.requiresPickup ?? false
    }

    return true
  })

  const statusToStep = (status: OrderStatus | undefined): OrderProgressProps["currentStep"] => {
    if (!status) return undefined
    if (status === "draft") return "order"
    if (status === "scheduling") return "scheduling"
    if (status === "packing") return "packing"
    if (status === "setting-up") return "setting-up"
    if (status === "dismantling") return "dismantling"
    if (status === "other-adhoc") return "other-adhoc"
    if (status === "completed") return "completed"
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
          } else if (isAllCompleted && index <= currentPhase) {
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
