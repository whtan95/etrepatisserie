import type { OrderStatus, SalesOrder } from "@/lib/types"

const getAdHocOptions = (order: SalesOrder) => ({
  requiresPacking: order.adHocOptions?.requiresPacking ?? true,
  requiresSetup: order.adHocOptions?.requiresSetup ?? true,
  requiresDismantle: order.adHocOptions?.requiresDismantle ?? true,
  requiresOtherAdhoc:
    // Backwards compat for older saved orders
    (order.adHocOptions as any)?.requiresOtherAdhoc ?? (order.adHocOptions as any)?.requiresPickup ?? false,
})

export const isAdHocOrder = (order: SalesOrder) => order.orderSource === "ad-hoc"

export const getNextStatus = (order: SalesOrder, current: OrderStatus): OrderStatus => {
  if (!isAdHocOrder(order)) {
    const requiresDismantle = order.eventData?.dismantleRequired ?? true
    switch (current) {
      case "scheduling":
        return "planning"
      case "planning":
        return "procurement"
      case "procurement":
        return "packing"
      case "packing":
        return "setting-up"
      case "setting-up":
        return requiresDismantle ? "dismantling" : "invoice"
      case "dismantling":
        return "invoice"
      case "invoice":
        return "completed"
      default:
        return current
    }
  }

  const { requiresPacking, requiresSetup, requiresDismantle, requiresOtherAdhoc } = getAdHocOptions(order)

  if (current === "scheduling") {
    if (requiresPacking) return "packing"
    if (requiresSetup) return "setting-up"
    if (requiresDismantle) return "dismantling"
    if (requiresOtherAdhoc) return "other-adhoc"
    return "completed"
  }

  if (current === "packing") {
    return "procurement"
  }

  if (current === "procurement") {
    if (requiresSetup) return "setting-up"
    if (requiresDismantle) return "dismantling"
    if (requiresOtherAdhoc) return "other-adhoc"
    return "invoice"
  }

  if (current === "setting-up") {
    if (requiresDismantle) return "dismantling"
    return requiresOtherAdhoc ? "other-adhoc" : "invoice"
  }

  if (current === "dismantling") return requiresOtherAdhoc ? "other-adhoc" : "invoice"

  if (current === "other-adhoc") return "invoice"

  if (current === "invoice") return "completed"

  return current
}

export const isPhaseRequired = (order: SalesOrder, phase: "packing" | "setup" | "dismantle" | "other-adhoc") => {
  if (!isAdHocOrder(order)) {
    if (phase === "other-adhoc") return false
    if (phase === "dismantle") return order.eventData?.dismantleRequired ?? true
    return true
  }
  if (phase === "packing") return order.adHocOptions?.requiresPacking ?? true
  if (phase === "setup") return order.adHocOptions?.requiresSetup ?? true
  if (phase === "dismantle") return order.adHocOptions?.requiresDismantle ?? true
  return (order.adHocOptions as any)?.requiresOtherAdhoc ?? (order.adHocOptions as any)?.requiresPickup ?? false
}

export const getPreviousStatus = (order: SalesOrder, current: OrderStatus): OrderStatus => {
  if (!isAdHocOrder(order)) {
    const requiresDismantle = order.eventData?.dismantleRequired ?? true
    switch (current) {
      case "planning":
        return "scheduling"
      case "procurement":
        return "planning"
      case "packing":
        return "procurement"
      case "setting-up":
        return "packing"
      case "dismantling":
        return "setting-up"
      case "invoice":
        return requiresDismantle ? "dismantling" : "setting-up"
      case "completed":
        return "invoice"
      case "other-adhoc":
        return "dismantling"
      default:
        return current
    }
  }

  const { requiresPacking, requiresSetup, requiresDismantle } = getAdHocOptions(order)

  if (current === "packing") {
    return "scheduling"
  }

  if (current === "procurement") {
    return "packing"
  }

  if (current === "setting-up") {
    return "procurement"
  }

  if (current === "dismantling") {
    if (requiresSetup) return "setting-up"
    return "procurement"
  }

  if (current === "other-adhoc") {
    if (requiresDismantle) return "dismantling"
    if (requiresSetup) return "setting-up"
    return "procurement"
  }

  return current
}
