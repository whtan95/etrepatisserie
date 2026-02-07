import type { SalesOrder } from "@/lib/types"

const SALES_KEY = "etre_sales_orders"
const ADHOC_KEY = "etre_ad_hoc_orders"

const safeParseOrders = (key: string): SalesOrder[] => {
  const stored = localStorage.getItem(key)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as SalesOrder[]) : []
  } catch {
    localStorage.removeItem(key)
    return []
  }
}

export const isAdHocOrderNumber = (orderNumber: string) =>
  orderNumber.toUpperCase().startsWith("AH-")

export const getSalesOrders = (): SalesOrder[] => {
  if (typeof window === "undefined") return []
  return safeParseOrders(SALES_KEY)
}

export const getAdHocOrders = (): SalesOrder[] => {
  if (typeof window === "undefined") return []
  return safeParseOrders(ADHOC_KEY)
}

export const getAllOrders = (): SalesOrder[] => [...getSalesOrders(), ...getAdHocOrders()]

export const saveSalesOrders = (orders: SalesOrder[]) => {
  localStorage.setItem(SALES_KEY, JSON.stringify(orders))
}

export const saveAdHocOrders = (orders: SalesOrder[]) => {
  localStorage.setItem(ADHOC_KEY, JSON.stringify(orders))
}

export const updateOrderByNumber = (
  orderNumber: string,
  updater: (order: SalesOrder) => SalesOrder,
): SalesOrder[] => {
  const isAdHoc = isAdHocOrderNumber(orderNumber)
  const orders = isAdHoc ? getAdHocOrders() : getSalesOrders()
  const updated = orders.map(order =>
    order.orderNumber === orderNumber ? updater(order) : order,
  )
  if (isAdHoc) {
    saveAdHocOrders(updated)
  } else {
    saveSalesOrders(updated)
  }
  return updated
}

export const deleteOrderByNumber = (orderNumber: string) => {
  const isAdHoc = isAdHocOrderNumber(orderNumber)
  const orders = isAdHoc ? getAdHocOrders() : getSalesOrders()
  const updated = orders.filter(order => order.orderNumber !== orderNumber)
  if (isAdHoc) {
    saveAdHocOrders(updated)
  } else {
    saveSalesOrders(updated)
  }
  return updated
}

export const getNextAdHocNumber = (): string => {
  const orders = getAdHocOrders()
  const max = orders.reduce((acc, order) => {
    const match = order.orderNumber.match(/^AH-(\d+)$/i)
    if (!match) return acc
    const num = parseInt(match[1], 10)
    return Number.isNaN(num) ? acc : Math.max(acc, num)
  }, 0)
  const next = (max + 1).toString().padStart(4, "0")
  return `AH-${next}`
}
