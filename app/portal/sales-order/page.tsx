"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { SalesOrderPreview } from "@/components/portal/sales-order-preview"
import { OrderProgress } from "@/components/portal/order-progress"
import {
  Calendar,
  Users,
  MapPin,
  Building2,
  Home,
  Clock,
  Upload,
  X,
  ChevronDown,
  FileText,
  Truck,
  Search,
  Plus,
  Minus,
  Hash,
  User,
  Percent,
  Eraser,
  Pencil,
  Eye,
  Download,
  Trash2,
  RotateCcw,
  Dices,
  Sparkles,
} from "lucide-react"
import {
  type EventData,
  type PricingData,
  type CustomerData,
  type OrderItem,
  type SalesOrder,
  type OrderMeta,
          PRICES,
          SST_RATE,
  TIME_SLOTS,
  MALAYSIAN_STATES,
  POSITIONS,
} from "@/lib/types"
import { deleteOrderByNumber, getAdHocOrders, getSalesOrders } from "@/lib/order-storage"
import { CanopyIcon, RoundTableWithChairsIcon, LongTableIcon, PlasticChairIcon } from "@/components/icons"
import type { InventoryItem } from "@/lib/inventory"
import { DEFAULT_INVENTORY_ITEMS } from "@/lib/inventory"
import type { AppSettingsDb } from "@/lib/settings-model"
import { DEFAULT_APP_SETTINGS_DB } from "@/lib/settings-model"
import { formatISOToDMY, normalizeDateToISO } from "@/lib/date-dmy"

const tentColors = ["White", "Red", "Yellow"]

function generateOrderNumber() {
  const prefix = "SO"
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}${year}${month}-${random}`
}

function generateQuotationId() {
  const prefix = "Q"
  const timestamp = Date.now().toString(36).toUpperCase()
  return `${prefix}-${timestamp}`
}

function getCurrentDate() {
  return new Date().toISOString().split("T")[0]
}

function getCurrentTime() {
  return new Date().toTimeString().slice(0, 5)
}

function getDayOfWeekLabel(dateString: string): string {
  const normalized = normalizeDateToISO(dateString)
  if (!normalized) return ""
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return ""
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  return days[date.getDay()]
}

function normalizeEventDates(eventData: EventData): EventData {
  const eventDate = normalizeDateToISO(eventData.eventDate)
  const setupDate = normalizeDateToISO(eventData.customerPreferredSetupDate)
  const dismantleDate = normalizeDateToISO(eventData.customerPreferredDismantleDate)
  return {
    ...eventData,
    eventDate,
    customerPreferredSetupDate: setupDate,
    customerPreferredDismantleDate: dismantleDate,
    dayOfWeek: eventDate ? getDayOfWeekLabel(eventDate) : eventData.dayOfWeek || "",
    setupDayOfWeek: setupDate ? getDayOfWeekLabel(setupDate) : eventData.setupDayOfWeek || "",
    dismantleDayOfWeek: dismantleDate ? getDayOfWeekLabel(dismantleDate) : eventData.dismantleDayOfWeek || "",
  }
}

function buildFullAddress(input: {
  gateNo?: string
  buildingName: string
  address1: string
  address2: string
  postCode: string
  city: string
  state: string
}) {
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const cleanPart = (s: string) => s.trim().replace(/^[,\s]+|[,\s]+$/g, "").replace(/\s+/g, " ")

  const isLikelyBuildingName = (value: string) => {
    const v = value.trim()
    if (!v) return false
    // If it looks like a street/neighbourhood, don't treat it as a building name
    if (/\b(taman|kampung|kg\.?|jalan|jln\.?|lorong|persiaran|lebuh|lebuhraya)\b/i.test(v)) return false
    return /\b(mall|plaza|hotel|resort|city|centre|center|stadium|dewan|hall|convention|club|university|college|school|hospital|clinic|mosque|masjid|surau|temple|church|kompleks)\b/i.test(v)
  }

  const extractGateFromAddress1 = (gateNo: string, address1: string) => {
    const g = gateNo.trim()
    const a1 = address1.trim()
    if (g || !a1) return { gateNo: g, address1: a1 }
    const match = a1.match(/^(\d+[A-Za-z-]*)\s+(.*)$/)
    if (!match) return { gateNo: g, address1: a1 }
    const rest = match[2].trim()
    if (!/\b(jalan|jln\.?|lorong|persiaran|lebuh|lebuhraya)\b/i.test(rest)) return { gateNo: g, address1: a1 }
    return { gateNo: match[1].trim(), address1: rest }
  }

  let gate = cleanPart(input.gateNo || "")
  let building = cleanPart(input.buildingName)
  let line1 = cleanPart(input.address1)
  let line2 = cleanPart(input.address2)

  // If user typed a gate/house number at the start of Address 1 (e.g. "2 Jalan ..."),
  // and left Gate No empty, auto-split so AI scheduling uses a cleaner address.
  const gateSplit = extractGateFromAddress1(gate, line1)
  gate = cleanPart(gateSplit.gateNo)
  line1 = cleanPart(gateSplit.address1)

  // If Building Name is empty but Address 2 looks like a venue/building name, move it to Building Name.
  if (!building && isLikelyBuildingName(line2)) {
    building = line2
    line2 = ""
  }
  const postCode = cleanPart(input.postCode)
  const city = cleanPart(input.city)
  const state = cleanPart(input.state)

  const mainParts = [building, gate, line1, line2].filter(Boolean)
  const mainText = mainParts.join(" ").toLowerCase()

  const alreadyHas = (value: string) =>
    value ? new RegExp(`\\b${escapeRegExp(value)}\\b`, "i").test(mainText) : false

  const postParts = [
    postCode && !alreadyHas(postCode) ? postCode : "",
    city && !alreadyHas(city) ? city : "",
    state && !alreadyHas(state) ? state : "",
  ].filter(Boolean)

  const postLine = postParts.join(" ")
  return [...mainParts, postLine].filter(Boolean).join(", ")
}

function parseAddress(address: string) {
  const trimmed = address.trim()
  if (!trimmed) {
    return { address1: "", address2: "", postCode: "", city: "", state: "" }
  }

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)

  const address1 = parts[0] || ""
  const mid = parts.slice(1)

  let postCode = ""
  let city = ""
  let state = ""

  const last = mid.length ? mid[mid.length - 1] : ""
  const postMatch = last.match(/\b(\d{5})\b/)
  if (postMatch) {
    postCode = postMatch[1]
    const afterPost = last.replace(postMatch[0], "").replace(/\s+/g, " ").trim()
    if (afterPost) {
      const stateMatch = MALAYSIAN_STATES
        .slice()
        .sort((a, b) => b.length - a.length)
        .find((s) => afterPost.toLowerCase().endsWith(s.toLowerCase()))
      if (stateMatch) {
        state = stateMatch
        city = afterPost.slice(0, afterPost.length - stateMatch.length).trim()
      } else {
        city = afterPost
      }
    }
  } else if (last) {
    const stateMatch = MALAYSIAN_STATES
      .slice()
      .sort((a, b) => b.length - a.length)
      .find((s) => last.toLowerCase() === s.toLowerCase())
    if (stateMatch) {
      state = stateMatch
    }
  }

  const address2 = (() => {
    if (!mid.length) return ""
    if (postCode || state) return mid.slice(0, -1).join(", ")
    return mid.join(", ")
  })()

  return { address1, address2, postCode, city, state }
}

function SalesOrderContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const editOrderNumber = searchParams.get("edit")
  const previewOrderNumber = searchParams.get("preview")
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [appSettings, setAppSettings] = useState<AppSettingsDb>(DEFAULT_APP_SETTINGS_DB)
  const salesOrderRef = useRef<HTMLDivElement>(null)
  const savedSalesOrderRef = useRef<HTMLDivElement>(null)
  const [showSalesOrder, setShowSalesOrder] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isFormEditable, setIsFormEditable] = useState(true)
  const [viewMode, setViewMode] = useState<"new" | "lookup">("new")
  const [lookupType, setLookupType] = useState<"sales" | "ad-hoc">("sales")
  const [savedOrders, setSavedOrders] = useState<SalesOrder[]>([])
  const [adHocOrdersList, setAdHocOrdersList] = useState<SalesOrder[]>([])
  const [salesOrderSearch, setSalesOrderSearch] = useState("")
  const [lookupDateFrom, setLookupDateFrom] = useState("")
  const [lookupDateTo, setLookupDateTo] = useState("")
  const [lookupSearchDraft, setLookupSearchDraft] = useState("")
  const [lookupDateFromDraft, setLookupDateFromDraft] = useState("")
  const [lookupDateToDraft, setLookupDateToDraft] = useState("")
  const [lookupPage, setLookupPage] = useState(1)
  const [exportOrder, setExportOrder] = useState<SalesOrder | null>(null)

  // Order Meta - initialized empty to avoid hydration mismatch, values set in useEffect
  const [orderMeta, setOrderMeta] = useState<OrderMeta>({
    orderNumber: "",
    orderDate: "",
    orderTime: "",
    madeBy: "",
    position: "Sales Admin",
    isAutoGenerated: true,
  })

  // Discount
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState<"amount" | "percentage">("amount")
  const [discountAppliesTo, setDiscountAppliesTo] = useState<"subtotal" | "total">("total")
  const [discountModalOpen, setDiscountModalOpen] = useState(false)
  const [specialRequestModalOpen, setSpecialRequestModalOpen] = useState(false)
  const [specialPhotosExpanded, setSpecialPhotosExpanded] = useState(false)
  const [discountExpanded, setDiscountExpanded] = useState(false)

  const [eventData, setEventData] = useState<EventData>({
    eventName: "",
    eventDate: "",
    dayOfWeek: "",
    eventType: "",
    eventTypeOther: "",
    customerPreferredSetupDate: "",
    setupDayOfWeek: "",
    customerPreferredDismantleDate: "",
    dismantleDayOfWeek: "",
    estimatedGuests: 0,
    areaType: "private",
    areaSelection: "within-ipoh",
    duration: 0,
    desiredSetupTime: "",
    desiredDismantleTime: "",
  })

  const [pricingData, setPricingData] = useState<PricingData>({
    tent10x10: { quantity: 0, color: "White" },
    tent20x20: { quantity: 0, color: "White" },
    tent20x30: { quantity: 0, color: "White" },
    tableSet: 0,
    longTable: { quantity: 0, withSkirting: false },
    extraChairs: 0,
    coolerFan: 0,
    parkingLots: 0,
  })

  const [manualItems, setManualItems] = useState<OrderItem[]>([])
  const [catalog, setCatalog] = useState<InventoryItem[]>(DEFAULT_INVENTORY_ITEMS)
  const [catalogCategory, setCatalogCategory] = useState("All")
  const [catalogSearch, setCatalogSearch] = useState("")
  const [selectedCatalogItem, setSelectedCatalogItem] = useState("")
  const [newItemName, setNewItemName] = useState("")
  const [newItemDescription, setNewItemDescription] = useState("")
  const [newItemQty, setNewItemQty] = useState<number>(1)
  const [newItemPrice, setNewItemPrice] = useState<number>(0)
  const [newItemSst, setNewItemSst] = useState<boolean>(true)

  const [customerData, setCustomerData] = useState<CustomerData>({
    customerName: "",
    companyName: "",
    phone: "",
    email: "",
    billingBuildingName: "",
    billingAddressGate: "",
    billingAddressJalan: "",
    billingAddressTaman: "",
    billingAddress1: "",
    billingAddress2: "",
    billingCity: "",
    billingAddress: "",
    billingPostCode: "",
    billingState: "Perak",
    deliveryBuildingName: "",
    deliveryAddressGate: "",
    deliveryAddressJalan: "",
    deliveryAddressTaman: "",
    deliveryAddress1: "",
    deliveryAddress2: "",
    deliveryCity: "",
    deliveryAddress: "",
    deliveryPostCode: "",
    deliveryState: "Perak",
    setupTimeSlot: "NONE",
    dismantleTimeSlot: "NONE",
    setupTimeWindowMode: "flexible",
    dismantleTimeWindowMode: "flexible",
    specialRequest: "",
    photos: [],
  })
  const [customerType, setCustomerType] = useState<"individual" | "company">("individual")

  // Load order for editing
  useEffect(() => {
    if (editOrderNumber) {
      const orders = getSalesOrders()
      const orderToEdit = orders.find((o) => o.orderNumber === editOrderNumber)
      if (orderToEdit) {
        setIsEditMode(true)
        setOrderMeta(orderToEdit.orderMeta || {
          orderNumber: orderToEdit.orderNumber,
          orderDate: getCurrentDate(),
          orderTime: getCurrentTime(),
          madeBy: "",
          position: "Sales Admin",
          isAutoGenerated: false,
        })
        const presetEventTypes = ["Wedding", "Party", "Corporate", "Religious Ceremony", "Festive"]
        const isPresetType = presetEventTypes.includes(orderToEdit.eventData.eventType)
        setEventData({
          ...normalizeEventDates(orderToEdit.eventData),
          eventType: isPresetType ? orderToEdit.eventData.eventType : "Other",
          eventTypeOther: isPresetType ? "" : orderToEdit.eventData.eventType,
        })
        setPricingData(orderToEdit.pricingData)
        const billingParts = parseAddress(orderToEdit.customerData.billingAddress || "")
        const deliveryParts = parseAddress(orderToEdit.customerData.deliveryAddress || "")
        setCustomerData({
          ...orderToEdit.customerData,
          billingBuildingName: orderToEdit.customerData.billingBuildingName || "",
          billingAddress1: orderToEdit.customerData.billingAddress1 || orderToEdit.customerData.billingAddressJalan || billingParts.address1,
          billingAddress2: orderToEdit.customerData.billingAddress2 || orderToEdit.customerData.billingAddressTaman || billingParts.address2,
          billingCity: orderToEdit.customerData.billingCity || billingParts.city,
          billingPostCode: orderToEdit.customerData.billingPostCode || billingParts.postCode,
          billingState: orderToEdit.customerData.billingState || billingParts.state || "Perak",
          deliveryBuildingName: orderToEdit.customerData.deliveryBuildingName || "",
          deliveryAddress1: orderToEdit.customerData.deliveryAddress1 || orderToEdit.customerData.deliveryAddressJalan || deliveryParts.address1,
          deliveryAddress2: orderToEdit.customerData.deliveryAddress2 || orderToEdit.customerData.deliveryAddressTaman || deliveryParts.address2,
          deliveryCity: orderToEdit.customerData.deliveryCity || deliveryParts.city,
          deliveryPostCode: orderToEdit.customerData.deliveryPostCode || deliveryParts.postCode,
          deliveryState: orderToEdit.customerData.deliveryState || deliveryParts.state || "Perak",
        })
        // Determine customer type based on which field has more content
        if (orderToEdit.customerData.companyName && orderToEdit.customerData.companyName.length > orderToEdit.customerData.customerName.length) {
          setCustomerType("company")
        } else {
          setCustomerType("individual")
        }
        setDiscount(orderToEdit.discount || 0)
        setDiscountType(orderToEdit.discountType || "amount")
        setDiscountAppliesTo(orderToEdit.discountAppliesTo || "total")
        const systemNames = new Set([
          "MBI Runner Fee",
          "MBI Permit Fee",
          "MBI Parking Lots",
          "Sunday OT Fee",
          "MBI Runner Fee",
          "MBI Permit Fee",
        ])
        setManualItems(
          (orderToEdit.items || [])
            .filter((item) => !systemNames.has(item.name))
            .map((item) => ({
              ...item,
              name:
                item.name === `Arabian Tent (10" x 10" ft)` ? "Arabian Tent (10x10 ft)"
                : item.name === `Arabian Tent (20" x 20" ft)` ? "Arabian Tent (20x20 ft)"
                : item.name === `Arabian Tent (20" x 30" ft)` ? "Arabian Tent (20x30 ft)"
                : item.name === "Table Set (10 chairs + 4ft round table)" ? "Table Set"
                : item.name === "Long Table (3ft x 6ft)"
                  ? (item.description?.toLowerCase().includes("skirting")
                      ? "Long Table with Skirting (3x6 ft)"
                      : "Long Table (3x6 ft)")
                : item.name,
              sstApplied: (item.sst || 0) > 0,
            }))
        )
      }
    }
  }, [editOrderNumber])

  // Generate order number client-side only (avoids hydration mismatch)
  useEffect(() => {
    if (!editOrderNumber && !previewOrderNumber && !orderMeta.orderNumber) {
      setOrderMeta(prev => ({
        ...prev,
        orderNumber: generateOrderNumber(),
        orderDate: getCurrentDate(),
        orderTime: getCurrentTime(),
      }))
    }
  }, [editOrderNumber, previewOrderNumber, orderMeta.orderNumber])

  useEffect(() => {
    if (previewOrderNumber) {
      setViewMode("lookup")
      setLookupType("sales")
      const orders = getSalesOrders()
      const found = orders.find((o) => o.orderNumber === previewOrderNumber)
      if (found) {
        handleExportOrder(found)
      }
    }
  }, [previewOrderNumber])

  const loadSavedOrders = useCallback(() => {
    const allOrders = getSalesOrders()
    allOrders.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setSavedOrders(allOrders)
    // Also load Ad Hoc orders
    const adHocOrders = getAdHocOrders()
    adHocOrders.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setAdHocOrdersList(adHocOrders)
  }, [])

  useEffect(() => {
    loadSavedOrders()
  }, [loadSavedOrders])

  // Calculate duration
  const calculateDuration = useCallback((setup: string, dismantle: string): number => {
    if (!setup || !dismantle) return 0
    const setupDate = new Date(setup)
    const dismantleDate = new Date(dismantle)
    const diffTime = dismantleDate.getTime() - setupDate.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays > 0 ? diffDays : 0
  }, [])

  // Get day of week
  const getDayOfWeek = useCallback((dateString: string): string => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return days[date.getDay()]
  }, [])

  // Check if Sunday
  const isSunday = useCallback((dateString: string): boolean => {
    if (!dateString) return false
    const date = new Date(dateString)
    return date.getDay() === 0
  }, [])

  // Calculate fees
  const sundayOTFee = useMemo(() => {
    let fee = 0
    if (isSunday(eventData.customerPreferredSetupDate)) fee += appSettings.sundayOTFee
    if (isSunday(eventData.customerPreferredDismantleDate)) fee += appSettings.sundayOTFee
    return fee
  }, [eventData.customerPreferredSetupDate, eventData.customerPreferredDismantleDate, isSunday, appSettings.sundayOTFee])

  const duration = useMemo(() => {
    return calculateDuration(eventData.customerPreferredSetupDate, eventData.customerPreferredDismantleDate)
  }, [eventData.customerPreferredSetupDate, eventData.customerPreferredDismantleDate, calculateDuration])

  // Calculate order items and totals
  const { items, subtotal, tax, total, grandTotal, discountAmount } = useMemo(() => {
    const orderItems: OrderItem[] = []

    // Manual items (same idea as Ad Hoc items list)
    manualItems.forEach((item) => {
      const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity
      const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty as number) : 0
      const base = normalizedQty * item.unitPrice
      const sstApplied = item.sstApplied ?? (item.sst || 0) > 0
      const sst = sstApplied ? base * SST_RATE : 0
      orderItems.push({
        ...item,
        quantity: normalizedQty,
        sstApplied,
        sst,
        total: base + sst,
      })
    })

    // Public area fees
    if (eventData.areaType === "public") {
      orderItems.push({
        name: "MBI Runner Fee",
        quantity: 1,
        unitPrice: appSettings.mbiRunnerFee,
        sst: 0,
        total: appSettings.mbiRunnerFee,
      })

      if (duration > 0) {
        orderItems.push({
          name: "MBI Permit Fee",
          quantity: `${duration} day(s)`,
          unitPrice: appSettings.mbiPermitFee,
          sst: 0,
          total: duration * appSettings.mbiPermitFee,
        })
      }

      if (pricingData.parkingLots > 0) {
        orderItems.push({
          name: "MBI Parking Lots",
          quantity: pricingData.parkingLots,
          unitPrice: appSettings.mbiParkingLotFee,
          sst: 0,
          total: pricingData.parkingLots * appSettings.mbiParkingLotFee,
        })
      }
    }

    // Sunday OT Fee
    if (sundayOTFee > 0) {
      orderItems.push({
        name: "Sunday OT Fee",
        quantity: sundayOTFee === 600 ? "2 days" : "1 day",
        unitPrice: appSettings.sundayOTFee,
        sst: 0,
        total: sundayOTFee,
      })
    }

    // Transportation Fee (Outside Perak)
    if (pricingData.transportationFee && pricingData.transportationFee > 0) {
      orderItems.push({
        name: "Transportation Fee",
        description: "Delivery outside Perak",
        quantity: 1,
        unitPrice: pricingData.transportationFee,
        sst: 0,
        total: pricingData.transportationFee,
      })
    }

    const itemsSubtotal = orderItems.reduce((sum, item) => sum + item.total, 0)
    const totalTax = orderItems.reduce((sum, item) => sum + item.sst, 0)
    const subtotalBeforeTax = itemsSubtotal - totalTax
    const beforeDiscount = itemsSubtotal

    // Calculate discount based on where it applies
    let discountAmount = 0
    let finalTotal = 0

    if (discountAppliesTo === "subtotal") {
      // Discount applies to subtotal (before SST)
      // For sales orders, transportation fee is already included in orderItems if applicable
      discountAmount = discountType === "amount"
        ? discount
        : (subtotalBeforeTax * discount) / 100
      const discountedSubtotal = Math.max(0, subtotalBeforeTax - discountAmount)
      finalTotal = discountedSubtotal + totalTax
    } else {
      // Discount applies to total (after SST)
      discountAmount = discountType === "amount"
        ? discount
        : (beforeDiscount * discount) / 100
      finalTotal = Math.max(0, beforeDiscount - discountAmount)
    }

    return {
      items: orderItems,
      subtotal: itemsSubtotal - totalTax,
      tax: totalTax,
      total: beforeDiscount,
      grandTotal: finalTotal,
      discountAmount,
    }
  }, [
    manualItems,
    pricingData.parkingLots,
    pricingData.transportationFee,
    eventData.areaType,
    duration,
    sundayOTFee,
    discount,
    discountType,
    discountAppliesTo,
    appSettings.mbiRunnerFee,
    appSettings.mbiPermitFee,
    appSettings.mbiParkingLotFee,
    appSettings.sundayOTFee,
  ])

  // Handle photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          setCustomerData((prev) => ({
            ...prev,
            photos: [...prev.photos, reader.result as string],
          }))
        }
        reader.readAsDataURL(file)
      })
    }
    e.target.value = ""
  }

  const removePhoto = (index: number) => {
    setCustomerData((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }))
  }

  // Clear functions for each panel
  const clearOrderInfo = () => {
    if (confirm("Are you sure you want to clear Order Information?")) {
      setOrderMeta({
        orderNumber: generateOrderNumber(),
        orderDate: getCurrentDate(),
        orderTime: getCurrentTime(),
        madeBy: "",
        position: "Sales Admin",
        isAutoGenerated: true,
      })
    }
  }

  const clearEventDetails = () => {
    if (confirm("Are you sure you want to clear Event Details?")) {
      setEventData({
        eventName: "",
        eventDate: "",
        dayOfWeek: "",
        eventType: "",
        eventTypeOther: "",
        customerPreferredSetupDate: "",
        setupDayOfWeek: "",
        customerPreferredDismantleDate: "",
        dismantleDayOfWeek: "",
        estimatedGuests: 0,
        areaType: "private",
        areaSelection: "within-ipoh",
        duration: 0,
        desiredSetupTime: "",
        desiredDismantleTime: "",
      })
      setCustomerData((prev) => ({
        ...prev,
        setupTimeSlot: "NONE",
        dismantleTimeSlot: "NONE",
        setupTimeWindowMode: "flexible",
        dismantleTimeWindowMode: "flexible",
      }))
    }
  }

  const clearItems = () => {
    if (confirm("Are you sure you want to clear Items & Equipment?")) {
      setManualItems([])
      setCatalogCategory("All")
      setCatalogSearch("")
      const first = (catalog[0] || DEFAULT_INVENTORY_ITEMS[0]) as InventoryItem | undefined
      if (first) {
        setSelectedCatalogItem(first.id)
        setNewItemName(first.name)
        setNewItemPrice(first.defaultPrice || 0)
        setNewItemSst(first.defaultSst)
      } else {
        setSelectedCatalogItem("")
        setNewItemName("")
        setNewItemPrice(0)
        setNewItemSst(true)
      }
      setNewItemDescription("")
      setNewItemQty(1)
      setPricingData({
        tent10x10: { quantity: 0, color: "White" },
        tent20x20: { quantity: 0, color: "White" },
        tent20x30: { quantity: 0, color: "White" },
        tableSet: 0,
        longTable: { quantity: 0, withSkirting: false },
        extraChairs: 0,
        coolerFan: 0,
        parkingLots: 0,
      })
    }
  }

  const clearCustomerInfo = () => {
    if (confirm("Are you sure you want to clear Customer Information?")) {
      setCustomerData(prev => ({
        ...prev,
        customerName: "",
        companyName: "",
        phone: "",
        email: "",
        billingAddressGate: "",
        billingAddressJalan: "",
        billingAddressTaman: "",
        billingAddress: "",
        billingPostCode: "",
        billingState: "Perak",
        deliveryAddressGate: "",
        deliveryAddressJalan: "",
        deliveryAddressTaman: "",
        deliveryAddress: "",
        deliveryPostCode: "",
        deliveryState: "Perak",
      }))
    }
  }

  const clearSpecialRequest = () => {
    if (confirm("Are you sure you want to clear Special Request & Photos?")) {
      setCustomerData(prev => ({
        ...prev,
        specialRequest: "",
        photos: [],
      }))
    }
  }

  const clearDiscount = () => {
    if (confirm("Are you sure you want to clear Discount?")) {
      setDiscount(0)
      setDiscountType("amount")
      setDiscountAppliesTo("total")
    }
  }

  const clearAllFields = () => {
    if (confirm("Are you sure you want to CLEAR ALL fields? This action cannot be undone.")) {
      setOrderMeta({
        orderNumber: generateOrderNumber(),
        orderDate: getCurrentDate(),
        orderTime: getCurrentTime(),
        madeBy: "",
        position: "Sales Admin",
        isAutoGenerated: true,
      })
      setEventData({
        eventName: "",
        eventDate: "",
        dayOfWeek: "",
        eventType: "",
        eventTypeOther: "",
        customerPreferredSetupDate: "",
        setupDayOfWeek: "",
        customerPreferredDismantleDate: "",
        dismantleDayOfWeek: "",
        estimatedGuests: 0,
        areaType: "private",
        areaSelection: "within-ipoh",
        duration: 0,
        desiredSetupTime: "",
        desiredDismantleTime: "",
      })
      setPricingData({
        tent10x10: { quantity: 0, color: "White" },
        tent20x20: { quantity: 0, color: "White" },
        tent20x30: { quantity: 0, color: "White" },
        tableSet: 0,
        longTable: { quantity: 0, withSkirting: false },
        extraChairs: 0,
        coolerFan: 0,
        parkingLots: 0,
      })
      setManualItems([])
      setCatalogCategory("All")
      setCatalogSearch("")
      const first = (catalog[0] || DEFAULT_INVENTORY_ITEMS[0]) as InventoryItem | undefined
      if (first) {
        setSelectedCatalogItem(first.id)
        setNewItemName(first.name)
        setNewItemPrice(first.defaultPrice || 0)
        setNewItemSst(first.defaultSst)
      } else {
        setSelectedCatalogItem("")
        setNewItemName("")
        setNewItemPrice(0)
        setNewItemSst(true)
      }
      setNewItemDescription("")
      setNewItemQty(1)
      setCustomerData({
        customerName: "",
        companyName: "",
        phone: "",
        email: "",
        billingBuildingName: "",
        billingAddressGate: "",
        billingAddressJalan: "",
        billingAddressTaman: "",
        billingAddress1: "",
        billingAddress2: "",
        billingCity: "",
        billingAddress: "",
        billingPostCode: "",
        billingState: "Perak",
        deliveryBuildingName: "",
        deliveryAddressGate: "",
        deliveryAddressJalan: "",
        deliveryAddressTaman: "",
        deliveryAddress1: "",
        deliveryAddress2: "",
        deliveryCity: "",
        deliveryAddress: "",
        deliveryPostCode: "",
        deliveryState: "Perak",
        setupTimeSlot: "NONE",
        dismantleTimeSlot: "NONE",
        setupTimeWindowMode: "flexible",
        dismantleTimeWindowMode: "flexible",
        specialRequest: "",
        photos: [],
      })
      setDiscount(0)
      setDiscountType("amount")
      setDiscountAppliesTo("total")
      setShowSalesOrder(false)
    }
  }

  // Demo Fill function - randomly fill the form with realistic data
  const demoFillForm = () => {
    // Random data arrays
    const firstNames = ["Ahmad", "Siti", "Muhammad", "Fatimah", "Lee", "Wong", "Tan", "Kumar", "Priya", "Raj", "Sarah", "John"]
    const lastNames = ["Bin Abdullah", "Binti Hassan", "Wei Ming", "Mei Ling", "Ah Kow", "Rajan", "Devi", "Smith", "Lim", "Chen"]
    const companyNames = ["Syarikat ABC Sdn Bhd", "XYZ Enterprise", "Golden Star Trading", "Happy Events Co", "Mega Holdings", "Prime Solutions"]
    const eventTypes = ["Wedding", "Party", "Corporate", "Religious Ceremony", "Festive"]
    const eventNames = [
      "Majlis Perkahwinan", "Birthday Celebration", "Annual Dinner", "Kenduri Doa Selamat",
      "Product Launch", "Family Day", "Hari Raya Open House", "Christmas Party",
      "Engagement Ceremony", "Graduation Party"
    ]
    const demoAddresses = [
      { gate: "105", address1: "Jalan Sultan Abdul Jalil", address2: "Ipoh Parade", postCode: "30450" },
      { gate: "2", address1: "Jalan Teh Lean Swee", address2: "AEON Mall Kinta City", postCode: "31400" },
      { gate: "1", address1: "Jalan Raja Dihilir", address2: "Stadium Perak", postCode: "30350" },
      { gate: "22", address1: "Jalan Sultan Idris Shah", address2: "Concubine Lane (Lorong Panglima)", postCode: "30000" },
    ]
    const tentColors = ["White", "Red", "Yellow"]
    const timeSlots = TIME_SLOTS

    // Random helpers
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

    // Generate random dates (event in next 2-8 weeks)
    const today = new Date()
    const eventDate = new Date(today.getTime() + randInt(14, 56) * 24 * 60 * 60 * 1000)
    const setupDate = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000) // Day before
    const dismantleDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000) // Day after

    const formatDate = (d: Date) => d.toISOString().split("T")[0]
    const getDayOfWeek = (dateStr: string) => {
      const date = new Date(dateStr)
      return date.toLocaleDateString("en-US", { weekday: "long" })
    }

    // Generate customer
    const isCompany = Math.random() > 0.5
    const firstName = pick(firstNames)
    const lastName = pick(lastNames)
    const customerName = `${firstName} ${lastName}`
    const companyName = isCompany ? pick(companyNames) : ""
    const phone = `01${randInt(1, 9)}-${randInt(1000000, 9999999)}`
    const email = `${firstName.toLowerCase()}${randInt(10, 99)}@${isCompany ? "company" : "gmail"}.com`

    // Generate address (real POIs in Ipoh for demo)
    const address = pick(demoAddresses)

    // Generate tent quantities
    const tent10x10Qty = randInt(0, 3)
    const tent20x20Qty = randInt(0, 2)
    const tent20x30Qty = randInt(0, 1)
    const totalTents = tent10x10Qty + tent20x20Qty + tent20x30Qty
    const tableSetQty = Math.max(1, Math.ceil((tent10x10Qty * 2 + tent20x20Qty * 5 + tent20x30Qty * 7) / 10))

    // Set all form data
    const eventDateStr = formatDate(eventDate)
    const setupDateStr = formatDate(setupDate)
    const dismantleDateStr = formatDate(dismantleDate)

    setOrderMeta(prev => ({
      ...prev,
      madeBy: pick(["Admin", "Sarah", "Ahmad", "Lee"]),
      position: pick(["Sales Admin", "Sales"]),
    }))

    setEventData({
      eventName: pick(eventNames),
      eventDate: eventDateStr,
      dayOfWeek: getDayOfWeek(eventDateStr),
      eventType: pick(eventTypes),
      eventTypeOther: "",
      customerPreferredSetupDate: setupDateStr,
      setupDayOfWeek: getDayOfWeek(setupDateStr),
      customerPreferredDismantleDate: dismantleDateStr,
      dismantleDayOfWeek: getDayOfWeek(dismantleDateStr),
      estimatedGuests: randInt(20, 200),
      areaType: Math.random() > 0.7 ? "public" : "private",
      areaSelection: "within-ipoh",
      duration: randInt(1, 3),
      desiredSetupTime: pick(["08:00", "09:00", "10:00", "11:00", "14:00"]),
      desiredDismantleTime: pick(["08:00", "09:00", "10:00", "14:00", "15:00"]),
    })

    setPricingData({
      tent10x10: { quantity: totalTents === 0 ? 1 : tent10x10Qty, color: pick(tentColors) },
      tent20x20: { quantity: tent20x20Qty, color: pick(tentColors) },
      tent20x30: { quantity: tent20x30Qty, color: pick(tentColors) },
      tableSet: tableSetQty,
      longTable: { quantity: randInt(0, 3), withSkirting: Math.random() > 0.5 },
      extraChairs: randInt(0, 20),
      coolerFan: randInt(0, 2),
      parkingLots: Math.random() > 0.8 ? randInt(1, 5) : 0,
    })

      const buildingName = (address.address2 || "").trim()
      const gateNo = (address.gate || "").trim()
      const address1 = (address.address1 || "").trim()
      const address2 = "" // optional; demo POIs go to Building Name
      const postCode = (address.postCode || "").trim()
      const city = "Ipoh"
      const state = "Perak"

      setCustomerData({
        customerName,
        companyName,
        phone,
        email,
        billingBuildingName: buildingName,
        billingAddressGate: gateNo,
        billingAddressJalan: address1,
        billingAddressTaman: address2,
        billingAddress1: address1,
        billingAddress2: address2,
        billingCity: city,
        billingPostCode: postCode,
        billingState: state,
        billingAddress: buildFullAddress({ gateNo, buildingName, address1, address2, postCode, city, state }),
        deliveryBuildingName: buildingName,
        deliveryAddressGate: gateNo,
        deliveryAddressJalan: address1,
        deliveryAddressTaman: address2,
        deliveryAddress1: address1,
        deliveryAddress2: address2,
        deliveryCity: city,
        deliveryPostCode: postCode,
        deliveryState: state,
        deliveryAddress: buildFullAddress({ gateNo, buildingName, address1, address2, postCode, city, state }),
        setupTimeSlot: pick(timeSlots),
        dismantleTimeSlot: pick(timeSlots),
        specialRequest: Math.random() > 0.7 ? pick(["Please arrange neatly", "Need extra space for buffet", "Prefer morning setup", ""]) : "",
        photos: [],
      })

    setCustomerType(isCompany ? "company" : "individual")

    // Add manual items based on pricing data
    const items: OrderItem[] = []
    const pd = {
      tent10x10: { quantity: totalTents === 0 ? 1 : tent10x10Qty, color: pick(tentColors) },
      tent20x20: { quantity: tent20x20Qty, color: pick(tentColors) },
      tent20x30: { quantity: tent20x30Qty, color: pick(tentColors) },
      tableSet: tableSetQty,
      longTable: { quantity: randInt(0, 3), withSkirting: Math.random() > 0.5 },
      extraChairs: randInt(0, 20),
      coolerFan: randInt(0, 2),
      parkingLots: Math.random() > 0.8 ? randInt(1, 5) : 0,
    }

    if (pd.tent10x10.quantity > 0) {
      const price = PRICES.tent10x10
      const sst = price * SST_RATE
      items.push({
        name: "Arabian Tent (10x10 ft)",
        description: pd.tent10x10.color,
        quantity: pd.tent10x10.quantity,
        unitPrice: price,
        sst,
        total: (price + sst) * pd.tent10x10.quantity,
        sstApplied: true,
      })
    }
    if (pd.tent20x20.quantity > 0) {
      const price = PRICES.tent20x20
      const sst = price * SST_RATE
      items.push({
        name: "Arabian Tent (20x20 ft)",
        description: pd.tent20x20.color,
        quantity: pd.tent20x20.quantity,
        unitPrice: price,
        sst,
        total: (price + sst) * pd.tent20x20.quantity,
        sstApplied: true,
      })
    }
    if (pd.tent20x30.quantity > 0) {
      const price = PRICES.tent20x30
      const sst = price * SST_RATE
      items.push({
        name: "Arabian Tent (20x30 ft)",
        description: pd.tent20x30.color,
        quantity: pd.tent20x30.quantity,
        unitPrice: price,
        sst,
        total: (price + sst) * pd.tent20x30.quantity,
        sstApplied: true,
      })
    }
    if (pd.tableSet > 0) {
      const price = PRICES.tableSet
      const sst = price * SST_RATE
      items.push({
        name: "Table Set",
        description: "1 round table + 10 chairs",
        quantity: pd.tableSet,
        unitPrice: price,
        sst,
        total: (price + sst) * pd.tableSet,
        sstApplied: true,
      })
    }
    if (pd.longTable.quantity > 0) {
      const price = pd.longTable.withSkirting ? PRICES.longTableWithSkirting : PRICES.longTable
      const sst = price * SST_RATE
      items.push({
        name: pd.longTable.withSkirting ? "Long Table with Skirting (3x6 ft)" : "Long Table (3x6 ft)",
        quantity: pd.longTable.quantity,
        unitPrice: price,
        sst,
        total: (price + sst) * pd.longTable.quantity,
        sstApplied: true,
      })
    }
    if (pd.extraChairs > 0) {
      const price = PRICES.extraChairs
      const sst = price * SST_RATE
      items.push({
        name: "Extra Plastic Chair",
        quantity: pd.extraChairs,
        unitPrice: price,
        sst,
        total: (price + sst) * pd.extraChairs,
        sstApplied: true,
      })
    }
    if (pd.coolerFan > 0) {
      items.push({
        name: "Cooler Fan",
        quantity: pd.coolerFan,
        unitPrice: PRICES.coolerFan,
        sst: 0,
        total: PRICES.coolerFan * pd.coolerFan,
        sstApplied: false,
      })
    }

    setManualItems(items)

    // Random discount
    if (Math.random() > 0.6) {
      setDiscount(randInt(1, 10) * 10)
      setDiscountType("amount")
    } else {
      setDiscount(0)
    }
  }

  const handleDeleteSavedOrder = (orderNumber: string) => {
    const isAdHoc = orderNumber.startsWith("AH-")
    const orderType = isAdHoc ? "ad hoc order" : "sales order"
    if (!confirm(`Delete ${orderType} ${orderNumber}? This cannot be undone.`)) return

    deleteOrderByNumber(orderNumber)
    loadSavedOrders()
    if (exportOrder?.orderNumber === orderNumber) {
      setExportOrder(null)
    }
  }

  const handleExportOrder = (order: SalesOrder) => {
    setExportOrder(order)
    setTimeout(() => {
      savedSalesOrderRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  // Generate sales order preview
  const handleGenerateSalesOrder = () => {
    if (!orderMeta.madeBy?.trim()) {
      showAlert("Made By is required")
      return
    }
    if (!eventData.eventDate) {
      showAlert("Please enter event date")
      return
    }

    if (
      eventData.customerPreferredSetupDate &&
      eventData.customerPreferredSetupDate > eventData.eventDate
    ) {
      showAlert(
        `Preferred setup date (${eventData.customerPreferredSetupDate}) cannot be later than event date (${eventData.eventDate}).`
      )
      return
    }

    if (
      eventData.customerPreferredDismantleDate &&
      eventData.customerPreferredDismantleDate < eventData.eventDate
    ) {
      showAlert(
        `Preferred dismantle date (${eventData.customerPreferredDismantleDate}) cannot be earlier than event date (${eventData.eventDate}).`
      )
      return
    }

    setEventData((prev) => ({
      ...prev,
      duration,
      dayOfWeek: getDayOfWeek(prev.eventDate),
      setupDayOfWeek: getDayOfWeek(prev.customerPreferredSetupDate),
      dismantleDayOfWeek: getDayOfWeek(prev.customerPreferredDismantleDate),
    }))
    setShowSalesOrder(true)
    setIsFormEditable(false)
    setIsSaved(false)

    setTimeout(() => {
      salesOrderRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const handleEditForm = () => {
    setIsFormEditable(true)
    setShowSalesOrder(false)
    setIsSaved(false)
  }

  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) return
        if (!canceled && Array.isArray(data.inventory?.items)) {
          setCatalog(data.inventory.items)
          if (!selectedCatalogItem && data.inventory.items.length) {
            const first = data.inventory.items[0]
            setSelectedCatalogItem(first.id)
            setNewItemName(first.name)
            setNewItemPrice(first.defaultPrice || 0)
            setNewItemSst(first.defaultSst)
          }
        }
      } catch {
        // ignore and use defaults
      }
    })()
    return () => {
      canceled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem("etre_app_settings")
      if (!saved) return
      const parsed = JSON.parse(saved)
      setAppSettings({ ...DEFAULT_APP_SETTINGS_DB, ...parsed })
    } catch {
      // ignore
    }
  }, [])

  const itemCategories = useMemo(() => {
    const categories = new Set<string>()
    for (const item of catalog) {
      if (item.category === "Fees") continue
      categories.add(item.category)
    }
    return ["All", ...Array.from(categories)]
  }, [catalog])

  const filteredCatalog = useMemo(() => {
    const search = catalogSearch.trim().toLowerCase()
    const inventoryItems = catalog.filter((item) => item.category !== "Fees")
    return inventoryItems.filter((item) => {
      if (catalogCategory !== "All" && item.category !== catalogCategory) return false
      if (!search) return true
      return item.name.toLowerCase().startsWith(search)
    })
  }, [catalog, catalogCategory, catalogSearch])

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>()
    filteredCatalog.forEach((item) => {
      const list = groups.get(item.category) || []
      list.push(item)
      groups.set(item.category, list)
    })
    return Array.from(groups.entries())
  }, [filteredCatalog])

  const handleCatalogSelect = (id: string) => {
    setSelectedCatalogItem(id)
    const found = catalog.find((i) => i.id === id)
    if (!found) return
    setNewItemName(found.name)
    setNewItemPrice(found.defaultPrice || 0)
    setNewItemSst(found.defaultSst)
  }

  const handleAddManualItem = () => {
    const qty = Number.isFinite(newItemQty) ? Math.max(0, newItemQty) : 0
    const price = Number.isFinite(newItemPrice) ? Math.max(0, newItemPrice) : 0
    if (!newItemName.trim()) {
      showAlert("Please enter item name")
      return
    }
    if (qty <= 0) {
      showAlert("Please enter quantity")
      return
    }

    setManualItems((prev) => [
      ...prev,
      {
        name: newItemName.trim(),
        description: newItemDescription.trim() || undefined,
        quantity: qty,
        unitPrice: price,
        sst: 0,
        total: 0,
        sstApplied: newItemSst,
      },
    ])

    setNewItemDescription("")
  }

  const removeManualItem = (idx: number) => {
    setManualItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const derivedPricingData: PricingData = useMemo(() => {
    const getQty = (name: string) =>
      manualItems.reduce((sum, item) => {
        if (item.name !== name) return sum
        const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity
        return sum + (Number.isFinite(qty) ? (qty as number) : 0)
      }, 0)

    const longTableQty = getQty("Long Table (3x6 ft)")
    const longTableSkirtingQty = getQty("Long Table with Skirting (3x6 ft)")

    return {
      tent10x10: { quantity: getQty("Arabian Tent (10x10 ft)"), color: "White" },
      tent20x20: { quantity: getQty("Arabian Tent (20x20 ft)"), color: "White" },
      tent20x30: { quantity: getQty("Arabian Tent (20x30 ft)"), color: "White" },
      tableSet: getQty("Table Set"),
      longTable: {
        quantity: longTableQty + longTableSkirtingQty,
        withSkirting: longTableSkirtingQty > 0 && longTableQty === 0,
      },
      extraChairs: getQty("Extra Plastic Chair"),
      coolerFan: getQty("Cooler Fan"),
      parkingLots: pricingData.parkingLots,
    }
  }, [manualItems, pricingData.parkingLots])

  const LOOKUP_PAGE_SIZE = 30
  const lookupFilteredOrders = useMemo(() => {
    const source = lookupType === "sales" ? savedOrders : adHocOrdersList
    const term = salesOrderSearch.toLowerCase().trim()

    return source
      .filter((order) => {
        if (!term) return true
        return (
          order.orderNumber.toLowerCase().includes(term) ||
          order.customerData.customerName?.toLowerCase().includes(term) ||
          order.customerData.companyName?.toLowerCase().includes(term)
        )
      })
      .filter((order) => {
        if (!lookupDateFrom && !lookupDateTo) return true
        const eventDate = order.eventData.eventDate
        if (!eventDate) return false
        if (lookupDateFrom && new Date(eventDate) < new Date(lookupDateFrom)) return false
        if (lookupDateTo && new Date(eventDate) > new Date(lookupDateTo)) return false
        return true
      })
  }, [lookupType, savedOrders, adHocOrdersList, salesOrderSearch, lookupDateFrom, lookupDateTo])

  const lookupTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(lookupFilteredOrders.length / LOOKUP_PAGE_SIZE))
  }, [lookupFilteredOrders.length])

  useEffect(() => {
    setLookupPage(1)
  }, [lookupType, salesOrderSearch, lookupDateFrom, lookupDateTo])

  const applyLookupFilters = () => {
    setSalesOrderSearch(lookupSearchDraft)
    setLookupDateFrom(lookupDateFromDraft)
    setLookupDateTo(lookupDateToDraft)
    setLookupPage(1)
  }

  const clearLookupFilters = () => {
    setLookupSearchDraft("")
    setLookupDateFromDraft("")
    setLookupDateToDraft("")
    setSalesOrderSearch("")
    setLookupDateFrom("")
    setLookupDateTo("")
    setLookupPage(1)
  }

  useEffect(() => {
    if (lookupPage > lookupTotalPages) setLookupPage(lookupTotalPages)
  }, [lookupPage, lookupTotalPages])

  const lookupPagedOrders = useMemo(() => {
    const start = (lookupPage - 1) * LOOKUP_PAGE_SIZE
    return lookupFilteredOrders.slice(start, start + LOOKUP_PAGE_SIZE)
  }, [lookupFilteredOrders, lookupPage])

  // Build sales order object
  const salesOrder: SalesOrder = {
    id: crypto.randomUUID(),
    orderNumber: orderMeta.orderNumber,
    orderMeta,
    orderSource: "sales",
    salesOrderDate: new Date().toISOString().split("T")[0],
    expirationDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "draft",
    hasIssue: false,
    eventData: {
      ...eventData,
      eventType: eventData.eventType === "Other" ? (eventData.eventTypeOther || "Other") : eventData.eventType,
      duration,
      dayOfWeek: getDayOfWeek(eventData.eventDate),
      setupDayOfWeek: getDayOfWeek(eventData.customerPreferredSetupDate),
      dismantleDayOfWeek: getDayOfWeek(eventData.customerPreferredDismantleDate),
    },
    pricingData: derivedPricingData,
    customerData,
    items,
    subtotal,
    tax,
    discount: Math.max(0, discountAmount),
    discountType,
    discountAppliesTo,
    total: grandTotal,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return (
    <div className="space-y-6">
      {/* Special Request Modal */}
      {specialRequestModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSpecialRequestModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Special Request / Notes</h3>
              <button
                type="button"
                onClick={() => setSpecialRequestModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Textarea
              value={customerData.specialRequest}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, specialRequest: e.target.value }))}
              placeholder="Any special requirements or notes..."
              rows={10}
              className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
              disabled={!isFormEditable}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                onClick={() => setSpecialRequestModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {discountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDiscountModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Discount</h3>
              <button
                type="button"
                onClick={() => setDiscountModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Discount Applies To</Label>
                <Select
                  value={discountAppliesTo}
                  onValueChange={(value: "subtotal" | "total") => setDiscountAppliesTo(value)}
                  disabled={!isFormEditable}
                >
                  <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subtotal">Before SST (Subtotal)</SelectItem>
                    <SelectItem value="total">After SST (Total)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Discount Type</Label>
                <Select
                  value={discountType}
                  onValueChange={(value: "amount" | "percentage") => setDiscountType(value)}
                  disabled={!isFormEditable}
                >
                  <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Fixed Amount (RM)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Discount {discountType === "amount" ? "(RM)" : "(%)"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={discount || ""}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder={discountType === "amount" ? "0.00" : "0"}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                  disabled={!isFormEditable}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Discount Amount</Label>
                <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3">
                  <span className="text-sm font-medium">- RM {discountAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                onClick={() => setDiscountModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Progress Bar */}
      <OrderProgress currentPhase={0} />

      {/* Page Title + Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {viewMode === "lookup" ? "Order Lookup" : isEditMode ? "Edit Sales Order" : "New Sales Order"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "new" ? "default" : "outline"}
            onClick={() => setViewMode("new")}
            className={viewMode === "new" ? "bg-accent text-accent-foreground" : "bg-transparent"}
          >
            New Sales Order
          </Button>
          <Button
            variant={viewMode === "lookup" ? "default" : "outline"}
            onClick={() => setViewMode("lookup")}
            className={viewMode === "lookup" ? "bg-accent text-accent-foreground" : "bg-transparent"}
          >
            Sales Order Lookup
          </Button>
        </div>
      </div>

      {viewMode === "new" && (
        <>
      {/* Order Meta Panel */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Hash className="h-5 w-5" />
            Order Information
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={demoFillForm}
              className="gap-1 text-xs bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 hover:text-purple-800"
            >
              <Dices className="h-3 w-3" />
              Demo Fill
            </Button>
            <Button variant="ghost" size="sm" onClick={clearOrderInfo} className="gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Eraser className="h-3 w-3" />
              Clear
            </Button>
          </div>
        </div>
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-12 items-end">
            <div className="space-y-1 md:col-span-3">
              <Label className="text-sm font-medium">Order Number</Label>
              <div className="flex gap-2">
                <Input
                  value={orderMeta.orderNumber}
                  onChange={(e) =>
                    setOrderMeta((prev) => ({
                      ...prev,
                      orderNumber: e.target.value,
                      isAutoGenerated: false,
                    }))
                  }
                  placeholder="SO2601-XXXX"
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                  disabled={orderMeta.isAutoGenerated || !isFormEditable}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOrderMeta((prev) => ({
                      ...prev,
                      orderNumber: prev.isAutoGenerated ? prev.orderNumber : generateOrderNumber(),
                      isAutoGenerated: !prev.isAutoGenerated,
                    }))
                  }
                  className="shrink-0 whitespace-nowrap bg-transparent"
                  disabled={!isFormEditable}
                >
                  {orderMeta.isAutoGenerated ? "Manual" : "Auto"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {orderMeta.isAutoGenerated ? "Auto-generated" : "Manual entry"}
              </p>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label className="text-sm font-medium">Order Date</Label>
              <Input
                type="date"
                value={orderMeta.orderDate}
                onChange={(e) => setOrderMeta((prev) => ({ ...prev, orderDate: e.target.value }))}
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label className="text-sm font-medium">Order Time</Label>
              <Input
                type="time"
                value={orderMeta.orderTime}
                onChange={(e) => setOrderMeta((prev) => ({ ...prev, orderTime: e.target.value }))}
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>

            <div className="space-y-1 md:col-span-3">
              <Label className="text-sm font-medium">Made By <span className="text-destructive">*</span></Label>
              <Input
                value={orderMeta.madeBy}
                onChange={(e) => setOrderMeta((prev) => ({ ...prev, madeBy: e.target.value }))}
                placeholder="Staff name"
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>
          </div>
        </div>
      </div>

{/* Event Details Section */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-accent/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Calendar className="h-5 w-5" />
              Event Details
            </h2>
            <Button variant="ghost" size="sm" onClick={clearEventDetails} className="gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Eraser className="h-3 w-3" />
              Clear
            </Button>
          </div>
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Event Name - Full Width */}
            <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label htmlFor="event-name" className="text-sm font-medium">
                Event Name / Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-name"
                value={eventData.eventName}
                onChange={(e) => setEventData((prev) => ({ ...prev, eventName: e.target.value }))}
                placeholder="e.g. John & Mary Wedding Reception"
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>

            {/* Event Date */}
            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label htmlFor="event-date" className="text-sm font-medium">
                Event Date <span className="text-destructive">*</span>
              </Label>
              <div className="space-y-1">
                <Input
                  id="event-date"
                  type="date"
                  value={normalizeDateToISO(eventData.eventDate)}
                  onChange={(e) => {
                    const next = normalizeDateToISO(e.target.value)
                    setEventData((prev) => ({ ...prev, eventDate: next }))
                  }}
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
                <p className="text-xs text-muted-foreground">
                  Display: {formatISOToDMY(eventData.eventDate) || "-"}
                </p>
                {eventData.eventDate && (
                  <p className="text-xs text-muted-foreground">{getDayOfWeek(eventData.eventDate)}</p>
                )}
              </div>
            </div>

            {/* Event Type */}
            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label htmlFor="event-type" className="text-sm font-medium">
                Event Type <span className="text-destructive">*</span>
              </Label>
              <div className="space-y-1">
                <Select
                  value={eventData.eventType}
                  onValueChange={(value) =>
                    setEventData((prev) => ({
                      ...prev,
                      eventType: value,
                      eventTypeOther: value === "Other" ? prev.eventTypeOther : "",
                    }))
                  }
                  disabled={!isFormEditable}
                >
                  <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Wedding">Wedding</SelectItem>
                    <SelectItem value="Party">Party</SelectItem>
                    <SelectItem value="Corporate">Corporate</SelectItem>
                    <SelectItem value="Religious Ceremony">Religious Ceremony</SelectItem>
                    <SelectItem value="Festive">Festive</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {eventData.eventType === "Other" && (
                  <Input
                    id="event-type-other"
                    value={eventData.eventTypeOther || ""}
                    onChange={(e) => setEventData((prev) => ({ ...prev, eventTypeOther: e.target.value }))}
                    placeholder="Enter event type"
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                )}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label htmlFor="guests" className="text-sm font-medium">
                <Users className="mr-1 inline h-4 w-4" />
                Estimated Guests
              </Label>
              <Input
                id="guests"
                type="number"
                min="0"
                value={eventData.estimatedGuests || ""}
                onChange={(e) =>
                  setEventData((prev) => ({
                    ...prev,
                    estimatedGuests: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
                placeholder="Number of guests"
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label htmlFor="setup-date" className="text-sm font-medium">
                Preferred Setup Date <span className="text-destructive">*</span>
              </Label>
              <div className="space-y-1">
                <Input
                  id="setup-date"
                  type="date"
                  value={normalizeDateToISO(eventData.customerPreferredSetupDate)}
                  max={eventData.eventDate || undefined}
                  onChange={(e) => {
                    const next = normalizeDateToISO(e.target.value)
                    if (eventData.eventDate && next && next > eventData.eventDate) {
                      showAlert("Preferred setup date cannot be later than event date.")
                      return
                    }
                    setEventData((prev) => ({ ...prev, customerPreferredSetupDate: next }))
                  }}
                  disabled={!isFormEditable}
                  className={`border-border ${
                    eventData.eventDate &&
                    eventData.customerPreferredSetupDate &&
                    eventData.customerPreferredSetupDate > eventData.eventDate
                      ? "border-destructive"
                      : ""
                  } ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
                <p className="text-xs text-muted-foreground">
                  Display: {formatISOToDMY(eventData.customerPreferredSetupDate) || "-"}
                </p>
                {eventData.customerPreferredSetupDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">{getDayOfWeek(eventData.customerPreferredSetupDate)}</p>
                    {isSunday(eventData.customerPreferredSetupDate) && (
                      <p className="text-xs font-medium text-destructive">+RM300 Sunday OT</p>
                    )}
                  </div>
                )}
                {eventData.eventDate &&
                  eventData.customerPreferredSetupDate &&
                  eventData.customerPreferredSetupDate > eventData.eventDate && (
                    <p className="text-xs font-medium text-destructive">
                      Preferred setup date cannot be later than event date.
                    </p>
                  )}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label className="text-sm font-medium">Preferred Setup Time</Label>
              <Select
                value={customerData.setupTimeSlot}
                onValueChange={(value) => {
                  setCustomerData((prev) => ({ ...prev, setupTimeSlot: value }))
                  setEventData((prev) => ({ ...prev, desiredSetupTime: value }))
                }}
                disabled={!isFormEditable}
              >
                <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">NONE</SelectItem>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Window Mode for Setup - only show if setupTimeSlot is not NONE */}
            {customerData.setupTimeSlot && customerData.setupTimeSlot !== "NONE" && (
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-sm font-medium">Setup Time Mode</Label>
                <Select
                  value={customerData.setupTimeWindowMode || "flexible"}
                  onValueChange={(value) => {
                    setCustomerData((prev) => ({
                      ...prev,
                      setupTimeWindowMode: value as "strict" | "flexible"
                    }))
                  }}
                  disabled={!isFormEditable}
                >
                  <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible">🔄 Flexible (Can adjust time)</SelectItem>
                    <SelectItem value="strict">🔒 Strict (Must follow exact time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label htmlFor="dismantle-date" className="text-sm font-medium">
                Preferred Dismantle Date <span className="text-destructive">*</span>
              </Label>
              <div className="space-y-1">
                <Input
                  id="dismantle-date"
                  type="date"
                  value={normalizeDateToISO(eventData.customerPreferredDismantleDate)}
                  min={eventData.eventDate || undefined}
                  onChange={(e) => {
                    const next = normalizeDateToISO(e.target.value)
                    if (eventData.eventDate && next && next < eventData.eventDate) {
                      showAlert("Preferred dismantle date cannot be earlier than event date.")
                      return
                    }
                    setEventData((prev) => ({ ...prev, customerPreferredDismantleDate: next }))
                  }}
                  disabled={!isFormEditable}
                  className={`border-border ${
                    eventData.eventDate &&
                    eventData.customerPreferredDismantleDate &&
                    eventData.customerPreferredDismantleDate < eventData.eventDate
                      ? "border-destructive"
                      : ""
                  } ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
                <p className="text-xs text-muted-foreground">
                  Display: {formatISOToDMY(eventData.customerPreferredDismantleDate) || "-"}
                </p>
                {eventData.customerPreferredDismantleDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">{getDayOfWeek(eventData.customerPreferredDismantleDate)}</p>
                    {isSunday(eventData.customerPreferredDismantleDate) && (
                      <p className="text-xs font-medium text-destructive">+RM300 Sunday OT</p>
                    )}
                  </div>
                )}
                {eventData.eventDate &&
                  eventData.customerPreferredDismantleDate &&
                  eventData.customerPreferredDismantleDate < eventData.eventDate && (
                    <p className="text-xs font-medium text-destructive">
                      Preferred dismantle date cannot be earlier than event date.
                    </p>
                  )}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label className="text-sm font-medium">Preferred Dismantle Time</Label>
              <Select
                value={customerData.dismantleTimeSlot}
                onValueChange={(value) => {
                  setCustomerData((prev) => ({ ...prev, dismantleTimeSlot: value }))
                  setEventData((prev) => ({ ...prev, desiredDismantleTime: value }))
                }}
                disabled={!isFormEditable}
              >
                <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">NONE</SelectItem>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Window Mode for Dismantle - only show if dismantleTimeSlot is not NONE */}
            {customerData.dismantleTimeSlot && customerData.dismantleTimeSlot !== "NONE" && (
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-sm font-medium">Dismantle Time Mode</Label>
                <Select
                  value={customerData.dismantleTimeWindowMode || "flexible"}
                  onValueChange={(value) => {
                    setCustomerData((prev) => ({
                      ...prev,
                      dismantleTimeWindowMode: value as "strict" | "flexible"
                    }))
                  }}
                  disabled={!isFormEditable}
                >
                  <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible">🔄 Flexible (Can adjust time)</SelectItem>
                    <SelectItem value="strict">🔒 Strict (Must follow exact time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label className="text-sm font-medium">Duration</Label>
              <div className="flex h-8 items-center rounded-md border border-border bg-muted px-3">
                <span className="text-sm font-medium">{duration} day(s)</span>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label className="text-sm font-medium">
                <Building2 className="mr-1 inline h-4 w-4" />
                Area Type
              </Label>
              <div className="space-y-1">
                <RadioGroup
                  value={eventData.areaType}
                  onValueChange={(value: "private" | "public") =>
                    setEventData((prev) => ({ ...prev, areaType: value }))
                  }
                  className="flex gap-4"
                  disabled={!isFormEditable}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="private" id="private" disabled={!isFormEditable} />
                    <Label htmlFor="private" className="flex cursor-pointer items-center gap-1 font-normal">
                      <Home className="h-4 w-4" /> Private
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="public" id="public" disabled={!isFormEditable} />
                    <Label htmlFor="public" className="flex cursor-pointer items-center gap-1 font-normal">
                      <Building2 className="h-4 w-4" /> Public
                    </Label>
                  </div>
                </RadioGroup>
                {eventData.areaType === "public" && (
                  <p className="text-xs text-muted-foreground">MBI fees will apply</p>
                )}
              </div>
            </div>

            <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label className="text-sm font-medium">
                <MapPin className="mr-1 inline h-4 w-4" />
                Location Area
              </Label>
              <div className="space-y-1">
                <RadioGroup
                  value={eventData.areaSelection}
                  onValueChange={(value) => setEventData((prev) => ({ ...prev, areaSelection: value }))}
                  className="flex flex-wrap gap-3"
                  disabled={!isFormEditable}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="within-ipoh" id="within-ipoh" disabled={!isFormEditable} />
                    <Label htmlFor="within-ipoh" className="cursor-pointer font-normal">
                      Within Ipoh
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="within-perak" id="within-perak" disabled={!isFormEditable} />
                    <Label htmlFor="within-perak" className="cursor-pointer font-normal">
                      Within Perak
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="outside-perak" id="outside-perak" disabled={!isFormEditable} />
                    <Label htmlFor="outside-perak" className="cursor-pointer font-normal">
                      Outside Perak
                    </Label>
                  </div>
                </RadioGroup>
                {eventData.areaSelection === "outside-perak" && (
                  <div className="mt-2 space-y-2">
                    <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                      <Label className="text-foreground">Transportation Fee (RM)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={pricingData.transportationFee || ""}
                        onChange={(e) => setPricingData(prev => ({ ...prev, transportationFee: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                        disabled={!isFormEditable}
                        className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      />
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Truck className="h-3 w-3" /> Enter the transportation fee for delivery outside Perak
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Items Selection Section */}
      <div className="rounded-lg border border-border bg-card">
<div className="flex items-center justify-between border-b border-border bg-accent/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <CanopyIcon className="h-5 w-5" />
              Items & Equipment
            </h2>
            <Button variant="ghost" size="sm" onClick={clearItems} className="gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Eraser className="h-3 w-3" />
              Clear
            </Button>
          </div>
          <div className="p-6">
           <div className="space-y-6">
             {/* Item entry (Ad Hoc style) */}
             <div className="space-y-4">
               <h3 className="font-medium text-foreground">Add Item</h3>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Category</Label>
                  <Select value={catalogCategory} onValueChange={setCatalogCategory} disabled={!isFormEditable}>
                    <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      {itemCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Find item..."
                      className={`pl-9 border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Item</Label>
                  <Select value={selectedCatalogItem} onValueChange={handleCatalogSelect} disabled={!isFormEditable}>
                    <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupedCatalog.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No items found</div>
                      )}
                      {groupedCatalog.map(([category, categoryItems], index) => (
                        <SelectGroup key={category}>
                          <SelectLabel>{category}</SelectLabel>
                          {categoryItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                          {index < groupedCatalog.length - 1 && <SelectSeparator />}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-12 items-end">
                <div className="space-y-2 md:col-span-4">
                  <Label className="text-sm font-medium">Item Name</Label>
                  <Input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Item name..."
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-medium">Description</Label>
                  <Input
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>

                <div className="space-y-2 md:col-span-1">
                  <Label className="text-sm font-medium">Qty</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(Math.max(0, parseFloat(e.target.value) || 0))}
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>

                <div className="space-y-2 md:col-span-1">
                  <Label className="text-sm font-medium">Price (RM)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 md:col-span-1">
                  <Label className="text-sm font-medium">SST</Label>
                  <Switch checked={newItemSst} onCheckedChange={setNewItemSst} disabled={!isFormEditable} />
                </div>

                <Button type="button" className="bg-accent text-accent-foreground hover:bg-accent/90 md:col-span-1" onClick={handleAddManualItem} disabled={!isFormEditable}>
                  Add
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Price</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-foreground">SST</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Total</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {manualItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                          No items added yet.
                        </td>
                      </tr>
                    ) : (
                      manualItems.map((item, idx) => {
                        const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity
                        const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty as number) : 0
                        const base = normalizedQty * item.unitPrice
                        const sstApplied = item.sstApplied ?? (item.sst || 0) > 0
                        const sst = sstApplied ? base * SST_RATE : 0
                        const lineTotal = base + sst

                        return (
                          <tr key={`${item.name}-${idx}`} className="border-b border-border hover:bg-muted/20">
                            <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{item.description || "-"}</td>
                            <td className="px-4 py-3 text-sm text-foreground text-right">{normalizedQty}</td>
                            <td className="px-4 py-3 text-sm text-foreground text-right">RM {item.unitPrice.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-foreground text-center">{sstApplied ? "Yes" : "No"}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">RM {lineTotal.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => removeManualItem(idx)}
                                disabled={!isFormEditable}
                              >
                                Remove
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MBI Fees (Public Area) */}
            {eventData.areaType === "public" && (
              <div className="space-y-4">
                <h3 className="font-medium text-foreground">MBI Fees (Public Area)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="font-medium">MBI Runner Fee</p>
                    <p className="text-sm text-muted-foreground">RM 100 (one-time)</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="font-medium">MBI Permit Fee</p>
                    <p className="text-sm text-muted-foreground">RM 20 x {duration} day(s)</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="font-medium">Parking Lots</span>
                    </div>
                    <p className="mb-3 text-sm text-muted-foreground">RM 10 each</p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 bg-transparent"
                        onClick={() =>
                          setPricingData((prev) => ({
                            ...prev,
                            parkingLots: Math.max(0, prev.parkingLots - 1),
                          }))
                        }
                        disabled={!isFormEditable}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min="0"
                        value={pricingData.parkingLots || ""}
                        onChange={(e) =>
                          setPricingData((prev) => ({
                            ...prev,
                            parkingLots: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                        className={`h-8 w-16 text-center ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                        disabled={!isFormEditable}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 bg-transparent"
                        onClick={() =>
                          setPricingData((prev) => ({
                            ...prev,
                            parkingLots: prev.parkingLots + 1,
                          }))
                        }
                        disabled={!isFormEditable}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

{/* Customer Information Section */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-accent/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <User className="h-5 w-5" />
              Customer Information
            </h2>
            <Button variant="ghost" size="sm" onClick={clearCustomerInfo} className="gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Eraser className="h-3 w-3" />
              Clear
            </Button>
          </div>
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label className="text-sm font-medium">Customer Type <span className="text-destructive">*</span></Label>
              <RadioGroup
                value={customerType}
                onValueChange={(value: "individual" | "company") => setCustomerType(value)}
                className="flex gap-4 h-8 items-center rounded-md border border-border px-3"
                disabled={!isFormEditable}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="individual" id="individual" disabled={!isFormEditable} />
                  <Label htmlFor="individual" className="cursor-pointer font-normal">Individual</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="company" id="company" disabled={!isFormEditable} />
                  <Label htmlFor="company" className="cursor-pointer font-normal">Company</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label className="text-sm font-medium">Phone <span className="text-destructive">*</span></Label>
              <Input
                value={customerData.phone}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone number"
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>

            <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label className="text-sm font-medium">
                {customerType === "company" ? (
                  <>Company Name <span className="text-destructive">*</span></>
                ) : (
                  <>Customer Name <span className="text-destructive">*</span></>
                )}
              </Label>
              <Input
                value={customerType === "company" ? customerData.companyName : customerData.customerName}
                onChange={(e) =>
                  setCustomerData((prev) =>
                    customerType === "company"
                      ? { ...prev, companyName: e.target.value }
                      : { ...prev, customerName: e.target.value }
                  )
                }
                placeholder={customerType === "company" ? "Company name" : "Full name"}
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>

            <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
              <Label className="text-sm font-medium">Email</Label>
              <Input
                type="email"
                value={customerData.email}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email address"
                className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                disabled={!isFormEditable}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Billing Address */}
            <div>
              <h3 className="mb-4 font-medium text-foreground">Billing Address</h3>
              <div className="grid gap-4">
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Building Name</Label>
                  <Input
                    value={customerData.billingBuildingName || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const billingBuildingName = e.target.value
                        const billingAddress = buildFullAddress({
                          gateNo: prev.billingAddressGate || "",
                          buildingName: billingBuildingName,
                          address1: prev.billingAddress1 || "",
                          address2: prev.billingAddress2 || "",
                          postCode: prev.billingPostCode,
                          city: prev.billingCity || "",
                          state: prev.billingState,
                        })
                        return { ...prev, billingBuildingName, billingAddress }
                      })
                    }
                    placeholder="e.g., The Plaza / Condo name"
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Gate No <span className="text-destructive">*</span></Label>
                  <Input
                    value={customerData.billingAddressGate || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const billingAddressGate = e.target.value
                        const billingAddress = buildFullAddress({
                          gateNo: billingAddressGate,
                          buildingName: prev.billingBuildingName || "",
                          address1: prev.billingAddress1 || "",
                          address2: prev.billingAddress2 || "",
                          postCode: prev.billingPostCode,
                          city: prev.billingCity || "",
                          state: prev.billingState,
                        })
                        return { ...prev, billingAddressGate, billingAddress }
                      })
                    }
                    placeholder="e.g., Gate 5 / Unit 12A"
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Address 1 <span className="text-destructive">*</span></Label>
                  <Input
                    value={customerData.billingAddress1 || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const billingAddress1 = e.target.value
                        const billingAddress = buildFullAddress({
                          gateNo: prev.billingAddressGate || "",
                          buildingName: prev.billingBuildingName || "",
                          address1: billingAddress1,
                          address2: prev.billingAddress2 || "",
                          postCode: prev.billingPostCode,
                          city: prev.billingCity || "",
                          state: prev.billingState,
                        })
                        return {
                          ...prev,
                          billingAddress1,
                          billingAddressJalan: billingAddress1,
                          billingAddress,
                        }
                      })
                    }
                    placeholder="56, Jalan ..."
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Address 2</Label>
                  <Input
                    value={customerData.billingAddress2 || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const billingAddress2 = e.target.value
                        const billingAddress = buildFullAddress({
                          gateNo: prev.billingAddressGate || "",
                          buildingName: prev.billingBuildingName || "",
                          address1: prev.billingAddress1 || "",
                          address2: billingAddress2,
                          postCode: prev.billingPostCode,
                          city: prev.billingCity || "",
                          state: prev.billingState,
                        })
                        return {
                          ...prev,
                          billingAddress2,
                          billingAddressTaman: billingAddress2,
                          billingAddress,
                        }
                      })
                    }
                    placeholder="Taman ..."
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                    <Label className="text-sm font-medium">Post Code <span className="text-destructive">*</span></Label>
                    <Input
                      value={customerData.billingPostCode}
                      onChange={(e) =>
                        setCustomerData((prev) => {
                          const billingPostCode = e.target.value
                          const billingAddress = buildFullAddress({
                            gateNo: prev.billingAddressGate || "",
                            buildingName: prev.billingBuildingName || "",
                            address1: prev.billingAddress1 || "",
                            address2: prev.billingAddress2 || "",
                            postCode: billingPostCode,
                            city: prev.billingCity || "",
                            state: prev.billingState,
                          })
                          return { ...prev, billingPostCode, billingAddress }
                        })
                      }
                      placeholder="30100"
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                    <Label className="text-sm font-medium">City <span className="text-destructive">*</span></Label>
                    <Input
                      value={customerData.billingCity || ""}
                      onChange={(e) =>
                        setCustomerData((prev) => {
                          const billingCity = e.target.value
                          const billingAddress = buildFullAddress({
                            gateNo: prev.billingAddressGate || "",
                            buildingName: prev.billingBuildingName || "",
                            address1: prev.billingAddress1 || "",
                            address2: prev.billingAddress2 || "",
                            postCode: prev.billingPostCode,
                            city: billingCity,
                            state: prev.billingState,
                          })
                          return { ...prev, billingCity, billingAddress }
                        })
                      }
                      placeholder="Ipoh"
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">State <span className="text-destructive">*</span></Label>
                  <Select
                    value={customerData.billingState}
                    onValueChange={(value) =>
                      setCustomerData((prev) => {
                        const billingState = value
                        const billingAddress = buildFullAddress({
                          gateNo: prev.billingAddressGate || "",
                          buildingName: prev.billingBuildingName || "",
                          address1: prev.billingAddress1 || "",
                          address2: prev.billingAddress2 || "",
                          postCode: prev.billingPostCode,
                          city: prev.billingCity || "",
                          state: billingState,
                        })
                        return { ...prev, billingState, billingAddress }
                      })
                    }
                  >
                    <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`} disabled={!isFormEditable}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MALAYSIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Delivery Address */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-medium text-foreground">Delivery Address</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCustomerData((prev) => ({
                      ...prev,
                      deliveryBuildingName: prev.billingBuildingName || "",
                      deliveryAddressGate: prev.billingAddressGate || "",
                      deliveryAddress1: prev.billingAddress1 || "",
                      deliveryAddress2: prev.billingAddress2 || "",
                      deliveryCity: prev.billingCity || "",
                      deliveryAddressJalan: prev.billingAddress1 || prev.billingAddressJalan,
                      deliveryAddressTaman: prev.billingAddress2 || prev.billingAddressTaman,
                      deliveryAddress: buildFullAddress({
                        gateNo: prev.billingAddressGate || "",
                        buildingName: prev.billingBuildingName || "",
                        address1: prev.billingAddress1 || "",
                        address2: prev.billingAddress2 || "",
                        postCode: prev.billingPostCode,
                        city: prev.billingCity || "",
                        state: prev.billingState,
                      }),
                      deliveryPostCode: prev.billingPostCode,
                      deliveryState: prev.billingState,
                    }))
                  }
                  className="bg-transparent text-xs"
                  disabled={!isFormEditable}
                >
                  Same as Billing
                </Button>
              </div>
              <div className="grid gap-4">
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Building Name</Label>
                  <Input
                    value={customerData.deliveryBuildingName || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const deliveryBuildingName = e.target.value
                        const deliveryAddress = buildFullAddress({
                          gateNo: prev.deliveryAddressGate || "",
                          buildingName: deliveryBuildingName,
                          address1: prev.deliveryAddress1 || "",
                          address2: prev.deliveryAddress2 || "",
                          postCode: prev.deliveryPostCode,
                          city: prev.deliveryCity || "",
                          state: prev.deliveryState,
                        })
                        return { ...prev, deliveryBuildingName, deliveryAddress }
                      })
                    }
                    placeholder="e.g., The Plaza / Condo name"
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Gate No <span className="text-destructive">*</span></Label>
                  <Input
                    value={customerData.deliveryAddressGate || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const deliveryAddressGate = e.target.value
                        const deliveryAddress = buildFullAddress({
                          gateNo: deliveryAddressGate,
                          buildingName: prev.deliveryBuildingName || "",
                          address1: prev.deliveryAddress1 || "",
                          address2: prev.deliveryAddress2 || "",
                          postCode: prev.deliveryPostCode,
                          city: prev.deliveryCity || "",
                          state: prev.deliveryState,
                        })
                        return { ...prev, deliveryAddressGate, deliveryAddress }
                      })
                    }
                    placeholder="e.g., Gate 5 / Unit 12A"
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Address 1 <span className="text-destructive">*</span></Label>
                  <Input
                    value={customerData.deliveryAddress1 || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const deliveryAddress1 = e.target.value
                        const deliveryAddress = buildFullAddress({
                          gateNo: prev.deliveryAddressGate || "",
                          buildingName: prev.deliveryBuildingName || "",
                          address1: deliveryAddress1,
                          address2: prev.deliveryAddress2 || "",
                          postCode: prev.deliveryPostCode,
                          city: prev.deliveryCity || "",
                          state: prev.deliveryState,
                        })
                        return {
                          ...prev,
                          deliveryAddress1,
                          deliveryAddressJalan: deliveryAddress1,
                          deliveryAddress,
                        }
                      })
                    }
                    placeholder="56, Jalan ..."
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">Address 2</Label>
                  <Input
                    value={customerData.deliveryAddress2 || ""}
                    onChange={(e) =>
                      setCustomerData((prev) => {
                        const deliveryAddress2 = e.target.value
                        const deliveryAddress = buildFullAddress({
                          gateNo: prev.deliveryAddressGate || "",
                          buildingName: prev.deliveryBuildingName || "",
                          address1: prev.deliveryAddress1 || "",
                          address2: deliveryAddress2,
                          postCode: prev.deliveryPostCode,
                          city: prev.deliveryCity || "",
                          state: prev.deliveryState,
                        })
                        return {
                          ...prev,
                          deliveryAddress2,
                          deliveryAddressTaman: deliveryAddress2,
                          deliveryAddress,
                        }
                      })
                    }
                    placeholder="Taman ..."
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                    <Label className="text-sm font-medium">Post Code <span className="text-destructive">*</span></Label>
                    <Input
                      value={customerData.deliveryPostCode}
                      onChange={(e) =>
                        setCustomerData((prev) => {
                          const deliveryPostCode = e.target.value
                          const deliveryAddress = buildFullAddress({
                            gateNo: prev.deliveryAddressGate || "",
                            buildingName: prev.deliveryBuildingName || "",
                            address1: prev.deliveryAddress1 || "",
                            address2: prev.deliveryAddress2 || "",
                            postCode: deliveryPostCode,
                            city: prev.deliveryCity || "",
                            state: prev.deliveryState,
                          })
                          return { ...prev, deliveryPostCode, deliveryAddress }
                        })
                      }
                      placeholder="30100"
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                    <Label className="text-sm font-medium">City <span className="text-destructive">*</span></Label>
                    <Input
                      value={customerData.deliveryCity || ""}
                      onChange={(e) =>
                        setCustomerData((prev) => {
                          const deliveryCity = e.target.value
                          const deliveryAddress = buildFullAddress({
                            gateNo: prev.deliveryAddressGate || "",
                            buildingName: prev.deliveryBuildingName || "",
                            address1: prev.deliveryAddress1 || "",
                            address2: prev.deliveryAddress2 || "",
                            postCode: prev.deliveryPostCode,
                            city: deliveryCity,
                            state: prev.deliveryState,
                          })
                          return { ...prev, deliveryCity, deliveryAddress }
                        })
                      }
                      placeholder="Ipoh"
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[110px_1fr] md:items-center">
                  <Label className="text-sm font-medium">State <span className="text-destructive">*</span></Label>
                  <Select
                    value={customerData.deliveryState}
                    onValueChange={(value) =>
                      setCustomerData((prev) => {
                        const deliveryState = value
                        const deliveryAddress = buildFullAddress({
                          gateNo: prev.deliveryAddressGate || "",
                          buildingName: prev.deliveryBuildingName || "",
                          address1: prev.deliveryAddress1 || "",
                          address2: prev.deliveryAddress2 || "",
                          postCode: prev.deliveryPostCode,
                          city: prev.deliveryCity || "",
                          state: deliveryState,
                        })
                        return { ...prev, deliveryState, deliveryAddress }
                      })
                    }
                    disabled={!isFormEditable}
                  >
                    <SelectTrigger className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MALAYSIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Special Request & Photos + Discount */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-accent/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setSpecialPhotosExpanded((v) => !v)}
                className="flex items-center gap-2 text-left"
                title={specialPhotosExpanded ? "Collapse" : "Expand"}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${specialPhotosExpanded ? "" : "-rotate-90"}`} />
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <FileText className="h-4 w-4" />
                  Special Request & Photos
                </h2>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSpecialRequest}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                title="Clear special request & photos"
              >
                <Eraser className="h-3 w-3" />
                Clear
              </Button>
            </div>
            {specialPhotosExpanded && (
              <div className="p-4">
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <Label className="text-sm font-medium">Special Request / Notes</Label>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {customerData.specialRequest ? customerData.specialRequest : "No notes"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 bg-transparent"
                        onClick={() => setSpecialRequestModalOpen(true)}
                      >
                        {customerData.specialRequest ? "Edit" : "Add"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Photo Upload</Label>
                    <div className="flex flex-wrap gap-3">
                      {customerData.photos.map((photo, index) => (
                        <div key={index} className="relative">
                          <img
                            src={photo || "/placeholder.svg"}
                            alt={`Upload ${index + 1}`}
                            className="h-20 w-20 rounded-lg border border-border object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(index)}
                            className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white"
                            disabled={!isFormEditable}
                            title="Remove photo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {isFormEditable && (
                        <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-accent">
                          <Upload className="h-6 w-6 text-muted-foreground" />
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-accent/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setDiscountExpanded((v) => !v)}
                className="flex items-center gap-2 text-left"
                title={discountExpanded ? "Collapse" : "Expand"}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${discountExpanded ? "" : "-rotate-90"}`} />
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Percent className="h-4 w-4" />
                  Discount
                </h2>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDiscount}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                title="Clear discount"
              >
                <Eraser className="h-3 w-3" />
                Clear
              </Button>
            </div>
            {discountExpanded && (
              <div className="p-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Applies To</p>
                        <p className="font-medium text-foreground">{discountAppliesTo === "subtotal" ? "Before SST" : "After SST"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-medium text-foreground">{discountType === "amount" ? "RM" : "%"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Value</p>
                        <p className="font-medium text-foreground">{discountType === "amount" ? `RM ${discount.toFixed(2)}` : `${discount.toFixed(2)}%`}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Discount Amount</p>
                        <p className="font-medium text-foreground">RM {discountAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 bg-transparent"
                      onClick={() => setDiscountModalOpen(true)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-accent/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
        </div>
        <div className="p-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal (before SST):</span>
              <span>RM {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">SST (8%):</span>
              <span>RM {tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total before discount:</span>
              <span>RM {total.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Discount:</span>
                <span>- RM {discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
              <span>Grand Total:</span>
              <span>RM {grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            {!isFormEditable ? (
              <Button
                onClick={handleEditForm}
                className="flex-1 gap-2 bg-blue-600 text-white hover:bg-blue-700"
              >
                <FileText className="h-4 w-4" />
                Edit Order
              </Button>
            ) : (
              <>
                <Button
                  onClick={clearAllFields}
                  variant="outline"
                  className="flex-1 gap-2 bg-transparent text-destructive border-destructive hover:bg-destructive/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  Clear All
                </Button>
                <Button
                  onClick={handleGenerateSalesOrder}
                  className="flex-1 gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <FileText className="h-4 w-4" />
                  Generate Sales Order
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sales Order Preview */}
      {showSalesOrder && (
        <div ref={salesOrderRef}>
          <SalesOrderPreview
            salesOrder={salesOrder}
            isEditMode={isEditMode}
            isFormLocked={!isFormEditable}
            onEditOrder={() => setIsFormEditable(true)}
            onSaveComplete={() => setIsFormEditable(false)}
          />
        </div>
      )}
        </>
      )}

      {viewMode === "lookup" && (
      <>
      {/* Sales / Ad Hoc Order Lookup */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Order Lookup</h2>
          <div className="flex gap-2">
            <Button
              variant={lookupType === "sales" ? "default" : "outline"}
              size="sm"
              onClick={() => setLookupType("sales")}
              className={lookupType === "sales" ? "bg-slate-600 text-white hover:bg-slate-700" : "bg-transparent"}
            >
              Sales Orders
            </Button>
            <Button
              variant={lookupType === "ad-hoc" ? "default" : "outline"}
              size="sm"
              onClick={() => setLookupType("ad-hoc")}
              className={lookupType === "ad-hoc" ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-transparent"}
            >
              Ad Hoc Orders
            </Button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_auto_auto]">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={lookupType === "sales" ? "Search by SO number or customer name..." : "Search by AH number or customer name..."}
                value={lookupSearchDraft}
                onChange={(e) => setLookupSearchDraft(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From date</Label>
              <Input
                type="date"
                value={lookupDateFromDraft}
                onChange={(e) => setLookupDateFromDraft(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To date</Label>
              <Input
                type="date"
                value={lookupDateToDraft}
                onChange={(e) => setLookupDateToDraft(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={applyLookupFilters}
                className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
                title="Search"
              >
                Search
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                className="h-9 bg-transparent"
                onClick={clearLookupFilters}
                title="Clear search filters"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div>
                Showing{" "}
                {lookupFilteredOrders.length === 0
                  ? "0"
                  : (lookupPage - 1) * LOOKUP_PAGE_SIZE + 1}{" "}
                -{" "}
                {Math.min(lookupPage * LOOKUP_PAGE_SIZE, lookupFilteredOrders.length)} of{" "}
                {lookupFilteredOrders.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-transparent"
                  disabled={lookupPage <= 1}
                  onClick={() => setLookupPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span className="min-w-[110px] text-center">
                  Page {lookupPage} / {lookupTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-transparent"
                  disabled={lookupPage >= lookupTotalPages}
                  onClick={() => setLookupPage((p) => Math.min(lookupTotalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>

            {lookupPagedOrders.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[170px_120px_220px_1fr_140px_140px_auto] gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div>Order No</div>
                    <div>Type</div>
                    <div>Customer</div>
                    <div>Event</div>
                    <div>Created</div>
                    <div>Event Date</div>
                    <div className="text-right">Actions</div>
                  </div>

                  {lookupPagedOrders.map((order) => {
                    const createdRaw = order.createdAt || order.orderMeta?.orderDate || ""
                    const createdLabel = createdRaw ? new Date(createdRaw).toLocaleDateString("en-MY") : "-"
                    const customerLabel =
                      order.customerData.companyName || order.customerData.customerName || "N/A"

                    return (
                      <div
                        key={order.orderNumber}
                        className="grid grid-cols-[170px_120px_220px_1fr_140px_140px_auto] items-center gap-3 border-b border-border bg-card px-3 py-1.5 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{order.orderNumber}</p>
                        </div>

                        <div>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${lookupType === "ad-hoc" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
                          >
                            {lookupType === "ad-hoc" ? "Ad Hoc" : "Sales"}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-xs text-foreground">{customerLabel}</p>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">{order.eventData.eventName || "-"}</p>
                        </div>

                        <div className="text-xs text-muted-foreground">{createdLabel}</div>
                        <div className="text-xs text-muted-foreground">{order.eventData.eventDate || "-"}</div>

                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              if (lookupType === "ad-hoc") {
                                router.push(`/portal/ad-hoc?edit=${order.orderNumber}`)
                              } else {
                                setViewMode("new")
                                router.push(`/portal/sales-order?edit=${order.orderNumber}`)
                              }
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {lookupType === "sales" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleExportOrder(order)}
                                title="Preview"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleExportOrder(order)}
                                title="Export"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteSavedOrder(order.orderNumber)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {lookupFilteredOrders.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {lookupType === "sales" ? "No saved sales orders yet." : "No saved ad hoc orders yet."}
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {/* Export Preview */}
      {exportOrder && (
        <div ref={savedSalesOrderRef}>
          <SalesOrderPreview salesOrder={exportOrder} isEditMode showSave={false} />
        </div>
      )}

      <AlertDialog
        open={alertState.open}
        title={alertState.title}
        description={alertState.description}
        actionText={alertState.actionText}
        onClose={closeAlert}
      />
    </div>
  )
}

export default function SalesOrderPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" /></div>}>
      <SalesOrderContent />
    </Suspense>
  )
}
