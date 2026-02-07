"use client"

import React, { useState, useEffect, Suspense, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { OrderProgress } from "@/components/portal/order-progress"
import { SalesOrderPreview } from "@/components/portal/sales-order-preview"
import {
  Calendar,
  MapPin,
  Building2,
  Home,
  Clock,
  X,
  FileText,
  Save,
  ArrowLeft,
  Plus,
  Hash,
  User,
  Search,
  Eraser,
  Package,
  Wrench,
  Truck,
  Sparkles,
  Navigation,
  RotateCcw,
} from "lucide-react"
import {
  type EventData,
  type PricingData,
  type CustomerData,
  type OrderItem,
  type SalesOrder,
  type OrderMeta,
  type QuotationOptions,
  SST_RATE,
  TIME_SLOTS,
  MALAYSIAN_STATES,
  POSITIONS,
} from "@/lib/types"
import { getNextAdHocNumber, getAdHocOrders, getSalesOrders, saveAdHocOrders } from "@/lib/order-storage"
import type { InventoryItem } from "@/lib/inventory"
import { DEFAULT_INVENTORY_ITEMS } from "@/lib/inventory"
import { getInventoryDbFromLocalStorage, hasInventoryDbInLocalStorage, saveInventoryDbToLocalStorage } from "@/lib/inventory-storage"
import { getFeeCatalog, type FeeCatalogItem } from "@/lib/fee-catalog"
import type { AppSettingsDb } from "@/lib/settings-model"
import { DEFAULT_APP_SETTINGS_DB } from "@/lib/settings-model"
import { formatISOToDMY, normalizeDateToISO } from "@/lib/date-dmy"

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

  let building = cleanPart(input.buildingName)
  let gate = cleanPart(input.gateNo || "")
  let line1 = cleanPart(input.address1)
  let line2 = cleanPart(input.address2)

  const gateSplit = extractGateFromAddress1(gate, line1)
  gate = cleanPart(gateSplit.gateNo)
  line1 = cleanPart(gateSplit.address1)

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

function isLikelyGateNo(value: string) {
  const v = value.trim()
  if (!v) return false
  if (/^gate\b/i.test(v)) return true
  return /^[0-9]+[A-Za-z-]*$/.test(v)
}

function parseStructuredAddress(address: string) {
  const trimmed = (address || "").trim()
  if (!trimmed) {
    return { buildingName: "", gateNo: "", address1: "", address2: "", postCode: "", city: "", state: "" }
  }

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)

  // Post line is usually last (e.g. "30250 Ipoh Perak")
  const postLine = parts.length ? parts[parts.length - 1] : ""
  const beforePost = parts.slice(0, -1)

  let postCode = ""
  let city = ""
  let state = ""

  const postMatch = postLine.match(/\b(\d{5})\b/)
  if (postMatch) {
    postCode = postMatch[1]
    const afterPost = postLine.replace(postMatch[0], "").replace(/\s+/g, " ").trim()
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
  } else {
    // No postcode detected; treat as freeform city/state
    const stateMatch = MALAYSIAN_STATES
      .slice()
      .sort((a, b) => b.length - a.length)
      .find((s) => postLine.toLowerCase().endsWith(s.toLowerCase()))
    if (stateMatch) {
      state = stateMatch
      city = postLine.slice(0, postLine.length - stateMatch.length).trim()
    } else {
      city = postLine
    }
  }

  let buildingName = ""
  let gateNo = ""
  let address1 = ""
  let address2 = ""

  if (beforePost.length >= 4) {
    ;[buildingName, gateNo, address1, address2] = beforePost.slice(0, 4)
  } else if (beforePost.length === 3) {
    const [p0, p1, p2] = beforePost
    if (isLikelyGateNo(p0)) {
      gateNo = p0
      address1 = p1
      address2 = p2
    } else {
      buildingName = p0
      gateNo = p1
      address1 = p2
    }
  } else if (beforePost.length === 2) {
    ;[address1, address2] = beforePost
  } else if (beforePost.length === 1) {
    address1 = beforePost[0]
  }

  return { buildingName, gateNo, address1, address2, postCode, city, state }
}

function AdHocOrderContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const editOrderNumber = searchParams.get("edit")
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFormEditable, setIsFormEditable] = useState(true)
  const [isSaved, setIsSaved] = useState(false)
  const { alertState, showAlert, closeAlert } = useAppAlert()

  // View mode state
  const [viewMode, setViewMode] = useState<"new" | "lookup">("new")
  const [adHocOrderSearch, setAdHocOrderSearch] = useState("")
  const [lookupDateFrom, setLookupDateFrom] = useState("")
  const [lookupDateTo, setLookupDateTo] = useState("")
  const [importSoNumber, setImportSoNumber] = useState("")

  // Ad Hoc Options
  const [adHocOptions, setAdHocOptions] = useState({
    requiresPacking: true,
    requiresSetup: true,
    requiresDismantle: true,
    requiresOtherAdhoc: false,
    requiresGPSTracking: true,
    otherAdhocName: "",
  })

  // Order Meta
  const [orderMeta, setOrderMeta] = useState<OrderMeta>({
    orderNumber: "",
    orderDate: getCurrentDate(),
    orderTime: getCurrentTime(),
    madeBy: "",
    position: "Sales Admin",
    isAutoGenerated: true,
  })

  const [discountType, setDiscountType] = useState<"amount" | "percentage">("amount")
  const [discount, setDiscount] = useState(0)
  const [discountAppliesTo, setDiscountAppliesTo] = useState<"subtotal" | "total">("total")
  const [discountModalOpen, setDiscountModalOpen] = useState(false)
  const [specialRequestModalOpen, setSpecialRequestModalOpen] = useState(false)

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
    budgetPerHead: 0,
    dismantleRequired: false,
    areaType: "indoor",
    areaSelection: "",
    locationAreaType: "etre-cafe",
    locationAreaOther: "",
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
    specialRequest: "",
    photos: [],
  })
  const [customerType, setCustomerType] = useState<"individual" | "company">("individual")

  // Items list for manual entry
  const [items, setItems] = useState<OrderItem[]>([])
  const [catalog, setCatalog] = useState<InventoryItem[]>(DEFAULT_INVENTORY_ITEMS)
  const [newItemName, setNewItemName] = useState("")
  const [newItemQty, setNewItemQty] = useState(1)
  const [newItemPrice, setNewItemPrice] = useState(0)
  const [newItemSst, setNewItemSst] = useState(true)
  const [itemCategory, setItemCategory] = useState("All")
  const [itemSearch, setItemSearch] = useState("")
  const [selectedCatalogItem, setSelectedCatalogItem] = useState("")

  const [quotationOptions, setQuotationOptions] = useState<QuotationOptions>({
    brandingRequirement: {
      type: "none",
      logoOn: { dessert: false, packaging: false, other: "" },
      colourOn: { dessert: false, packaging: false, other: "" },
    },
    preferredMenuSelection: {
      step1: "current",
      notes: "",
      size: "normal",
      drinks: { coffee: false, tea: false, fizzy: false, other: "" },
      packagingBox: "etre-existing",
      dietaryNeeds: "",
      servingStyle: { individualDessertBox: false, buffetCateringStyle: false },
    },
  })

  const [appSettings, setAppSettings] = useState<AppSettingsDb>(DEFAULT_APP_SETTINGS_DB)
  const [showOrderPreview, setShowOrderPreview] = useState(false)
  const orderPreviewRef = React.useRef<HTMLDivElement>(null)

  // Load ad hoc orders for lookup
  const [adHocOrdersList, setAdHocOrdersList] = useState<SalesOrder[]>([])

  useEffect(() => {
    setAdHocOrdersList(getAdHocOrders())
  }, [isSaving])

  const calculateItemTotals = (quantity: number, unitPrice: number, sstApplied: boolean) => {
    const base = (Number(quantity) || 0) * (unitPrice || 0)
    const sst = sstApplied ? base * SST_RATE : 0
    return { sst, total: base + sst }
  }

  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.total || 0), 0)
  }, [items])

  const itemsTax = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.sst || 0), 0)
  }, [items])

  const subtotal = itemsSubtotal - itemsTax
  const transportationFee = pricingData.transportationFee || 0
  const totalBeforeDiscount = itemsSubtotal + transportationFee

  // Calculate discount based on where it applies
  let discountAmount = 0
  let grandTotal = 0

  if (discountAppliesTo === "subtotal") {
    // Discount applies to subtotal (before SST)
    const subtotalWithTransport = subtotal + transportationFee
    discountAmount = discountType === "amount"
      ? discount
      : (subtotalWithTransport * discount) / 100
    const discountedSubtotal = Math.max(0, subtotalWithTransport - discountAmount)
    grandTotal = discountedSubtotal + itemsTax
  } else {
    // Discount applies to total (after SST)
    discountAmount = discountType === "amount"
      ? discount
      : (totalBeforeDiscount * discount) / 100
    grandTotal = Math.max(0, totalBeforeDiscount - discountAmount)
  }

  useEffect(() => {
    if (hasInventoryDbInLocalStorage()) {
      const localDb = getInventoryDbFromLocalStorage()
      if (Array.isArray(localDb.items) && localDb.items.length) {
        setCatalog(localDb.items)
      }
    }

    let canceled = false
    ;(async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) return
        if (!canceled && Array.isArray(data.inventory?.items)) {
          if (!hasInventoryDbInLocalStorage()) {
            const saved = saveInventoryDbToLocalStorage(data.inventory.items)
            setCatalog(saved.items)
          }
        }
      } catch {
        // ignore and use defaults
      }
    })()
    return () => {
      canceled = true
    }
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

  const feeCatalog = useMemo(() => getFeeCatalog(appSettings), [appSettings])

  const itemCategories = useMemo(() => {
    const categories = new Set<string>()
    for (const item of catalog) categories.add(item.category)
    for (const item of feeCatalog) categories.add(item.category)
    return ["All", ...Array.from(categories)]
  }, [catalog, feeCatalog])

  const filteredCatalog = useMemo(() => {
    const search = itemSearch.trim().toLowerCase()

    const inventoryItems = catalog.filter((item) => item.category !== "Fees")
    const combined = [...inventoryItems, ...feeCatalog]

    return combined.filter((item) => {
      if (itemCategory !== "All" && item.category !== itemCategory) return false
      if (!search) return true
      return item.name.toLowerCase().startsWith(search)
    })
  }, [catalog, feeCatalog, itemCategory, itemSearch])

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, Array<InventoryItem | FeeCatalogItem>>()
    filteredCatalog.forEach((item) => {
      const list = groups.get(item.category) || []
      list.push(item)
      groups.set(item.category, list)
    })
    return Array.from(groups.entries())
  }, [filteredCatalog])

  const handleCatalogSelect = (value: string) => {
    setSelectedCatalogItem(value)
    const selected = [...catalog, ...feeCatalog].find((item) => item.id === value)
    if (!selected) return
    setNewItemName(selected.name)
    const price = "normalSizePrice" in selected ? (selected.normalSizePrice || 0) : ((selected as any).defaultPrice || 0)
    setNewItemPrice(price)
    setNewItemSst((selected as any).defaultSst ?? false)
  }

  const handleDeleteAdHocOrder = (orderNumber: string) => {
    if (!confirm(`Delete Ad Hoc Order ${orderNumber}?`)) return
    const orders = getAdHocOrders()
    const updated = orders.filter(o => o.orderNumber !== orderNumber)
    saveAdHocOrders(updated)
    setAdHocOrdersList(updated)
    showAlert("Ad Hoc order deleted successfully", { title: "Deleted" })
  }

  // Load order for editing
  useEffect(() => {
    if (editOrderNumber) {
      const orders = getAdHocOrders()
      const orderToEdit = orders.find((o) => o.orderNumber === editOrderNumber)
      if (orderToEdit) {
        setIsEditMode(true)
        setOrderMeta(orderToEdit.orderMeta || {
          orderNumber: orderToEdit.orderNumber,
          orderDate: getCurrentDate(),
          orderTime: getCurrentTime(),
          madeBy: "",
          position: "Sales Admin",
          isAutoGenerated: true,
        })
        setEventData(normalizeEventDates(orderToEdit.eventData))
        setPricingData(orderToEdit.pricingData)
        setCustomerData(orderToEdit.customerData)
        // Determine customer type based on which field has more content
        if (orderToEdit.customerData.companyName && orderToEdit.customerData.companyName.length > orderToEdit.customerData.customerName.length) {
          setCustomerType("company")
        } else {
          setCustomerType("individual")
        }
        setDiscount(orderToEdit.discount || 0)
        setDiscountType(orderToEdit.discountType || "amount")
        setDiscountAppliesTo(orderToEdit.discountAppliesTo || "total")
        setItems(orderToEdit.items || [])
        if (orderToEdit.adHocOptions) {
          setAdHocOptions({
            requiresPacking: orderToEdit.adHocOptions.requiresPacking ?? true,
            requiresSetup: orderToEdit.adHocOptions.requiresSetup ?? true,
            requiresDismantle: orderToEdit.adHocOptions.requiresDismantle ?? true,
            requiresOtherAdhoc:
              (orderToEdit.adHocOptions as any).requiresOtherAdhoc ?? (orderToEdit.adHocOptions as any).requiresPickup ?? false,
            requiresGPSTracking: orderToEdit.adHocOptions.requiresGPSTracking ?? true,
            otherAdhocName: orderToEdit.adHocOptions.otherAdhocName || "",
          })
        }
      }
    } else {
      // Generate new order number
      setOrderMeta(prev => ({ ...prev, orderNumber: getNextAdHocNumber() }))
    }
  }, [editOrderNumber])

  // Update billing address when parts change
  useEffect(() => {
    setCustomerData(prev => ({
      ...prev,
      billingAddress: buildFullAddress({
        gateNo: prev.billingAddressGate || "",
        buildingName: prev.billingBuildingName || "",
        address1: prev.billingAddress1 || prev.billingAddressJalan,
        address2: prev.billingAddress2 || prev.billingAddressTaman,
        postCode: prev.billingPostCode,
        city: prev.billingCity || "",
        state: prev.billingState,
      })
    }))
  }, [
    customerData.billingBuildingName,
    customerData.billingAddress1,
    customerData.billingAddress2,
    customerData.billingAddressGate,
    customerData.billingAddressJalan,
    customerData.billingAddressTaman,
    customerData.billingPostCode,
    customerData.billingCity,
    customerData.billingState,
  ])

  // Update delivery address when parts change
  useEffect(() => {
    setCustomerData(prev => ({
      ...prev,
      deliveryAddress: buildFullAddress({
        gateNo: prev.deliveryAddressGate || "",
        buildingName: prev.deliveryBuildingName || "",
        address1: prev.deliveryAddress1 || prev.deliveryAddressJalan,
        address2: prev.deliveryAddress2 || prev.deliveryAddressTaman,
        postCode: prev.deliveryPostCode,
        city: prev.deliveryCity || "",
        state: prev.deliveryState,
      })
    }))
  }, [
    customerData.deliveryBuildingName,
    customerData.deliveryAddress1,
    customerData.deliveryAddress2,
    customerData.deliveryAddressGate,
    customerData.deliveryAddressJalan,
    customerData.deliveryAddressTaman,
    customerData.deliveryPostCode,
    customerData.deliveryCity,
    customerData.deliveryState,
  ])

  // Calculate day of week
  const calculateDayOfWeek = (dateString: string) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    return date.toLocaleDateString("en-MY", { weekday: "long" })
  }

  const handleAddItem = () => {
    if (!newItemName.trim()) return
    const totals = calculateItemTotals(newItemQty, newItemPrice, newItemSst)
    const newItem: OrderItem = {
      name: newItemName,
      quantity: newItemQty,
      unitPrice: newItemPrice,
      sst: totals.sst,
      total: totals.total,
      sstApplied: newItemSst,
    }
    setItems(prev => [...prev, newItem])
    setNewItemName("")
    setNewItemQty(1)
    setNewItemPrice(0)
    setNewItemSst(true)
    setSelectedCatalogItem("")
  }

  const handleRemoveItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const handleImportFromSalesOrder = () => {
    const soNumber = importSoNumber.trim()
    if (!soNumber) {
      showAlert("Please enter a Sales Order number (e.g., SO2502-ABCD)")
      return
    }
    const salesOrders = getSalesOrders()
    const found = salesOrders.find((o) => o.orderNumber.toLowerCase() === soNumber.toLowerCase())
    if (!found) {
      showAlert(`Sales Order not found: ${soNumber}`)
      return
    }
    if (!confirm(`Import customer + event details from ${found.orderNumber} into this Ad Hoc order? This will overwrite current fields.`)) {
      return
    }

    const billingParsed = parseStructuredAddress(found.customerData.billingAddress || "")
    const deliveryParsed = parseStructuredAddress(found.customerData.deliveryAddress || "")

    const mergedCustomerData = {
      ...customerData,
      ...found.customerData,
      setupTimeSlot: found.customerData.setupTimeSlot || found.eventData.desiredSetupTime || "",
      dismantleTimeSlot: found.customerData.dismantleTimeSlot || found.eventData.desiredDismantleTime || "",
      billingBuildingName: found.customerData.billingBuildingName || billingParsed.buildingName || "",
      billingAddressGate: found.customerData.billingAddressGate || billingParsed.gateNo || "",
      billingAddress1: found.customerData.billingAddress1 || billingParsed.address1 || "",
      billingAddress2: found.customerData.billingAddress2 || billingParsed.address2 || "",
      billingCity: found.customerData.billingCity || billingParsed.city || "",
      billingPostCode: found.customerData.billingPostCode || billingParsed.postCode || "",
      billingState: found.customerData.billingState || billingParsed.state || found.customerData.billingState || "Perak",

      deliveryBuildingName: found.customerData.deliveryBuildingName || deliveryParsed.buildingName || "",
      deliveryAddressGate: found.customerData.deliveryAddressGate || deliveryParsed.gateNo || "",
      deliveryAddress1: found.customerData.deliveryAddress1 || deliveryParsed.address1 || "",
      deliveryAddress2: found.customerData.deliveryAddress2 || deliveryParsed.address2 || "",
      deliveryCity: found.customerData.deliveryCity || deliveryParsed.city || "",
      deliveryPostCode: found.customerData.deliveryPostCode || deliveryParsed.postCode || "",
      deliveryState: found.customerData.deliveryState || deliveryParsed.state || found.customerData.deliveryState || "Perak",
    }

    mergedCustomerData.billingAddress = buildFullAddress({
      gateNo: mergedCustomerData.billingAddressGate || "",
      buildingName: mergedCustomerData.billingBuildingName || "",
      address1: mergedCustomerData.billingAddress1 || mergedCustomerData.billingAddressJalan || "",
      address2: mergedCustomerData.billingAddress2 || mergedCustomerData.billingAddressTaman || "",
      postCode: mergedCustomerData.billingPostCode || "",
      city: mergedCustomerData.billingCity || "",
      state: mergedCustomerData.billingState || "",
    })

    mergedCustomerData.deliveryAddress = buildFullAddress({
      gateNo: mergedCustomerData.deliveryAddressGate || "",
      buildingName: mergedCustomerData.deliveryBuildingName || "",
      address1: mergedCustomerData.deliveryAddress1 || mergedCustomerData.deliveryAddressJalan || "",
      address2: mergedCustomerData.deliveryAddress2 || mergedCustomerData.deliveryAddressTaman || "",
      postCode: mergedCustomerData.deliveryPostCode || "",
      city: mergedCustomerData.deliveryCity || "",
      state: mergedCustomerData.deliveryState || "",
    })

    setCustomerData(mergedCustomerData)
      setEventData((prev) => ({
        ...prev,
        ...normalizeEventDates(found.eventData),
        desiredSetupTime: found.customerData.setupTimeSlot || found.eventData.desiredSetupTime || "",
        desiredDismantleTime: found.customerData.dismantleTimeSlot || found.eventData.desiredDismantleTime || "",
      }))

    if (found.customerData.companyName && found.customerData.companyName.length > (found.customerData.customerName || "").length) {
      setCustomerType("company")
    } else {
      setCustomerType("individual")
    }

    showAlert(`Imported from ${found.orderNumber}`, { title: "Imported", actionText: "OK" })
  }

  const handleGeneratePreview = () => {
    if (!orderMeta.madeBy) {
      showAlert("Please enter the staff name who created this order")
      return
    }
    const customerLabel = customerType === "company" ? customerData.companyName : customerData.customerName
    if (!customerLabel.trim()) {
      showAlert(customerType === "company" ? "Please enter company name" : "Please enter customer name")
      return
    }
    if (!customerData.phone?.trim()) {
      showAlert("Please enter phone number")
      return
    }
    if (!customerData.billingAddressGate?.trim() || !customerData.billingAddress1?.trim() || !customerData.billingPostCode?.trim() || !customerData.billingCity?.trim() || !customerData.billingState?.trim()) {
      showAlert("Billing address is required (Building Name & Address 2 optional; Gate No, Address 1, Post Code, City, State are mandatory)")
      return
    }
    if (!customerData.deliveryAddressGate?.trim() || !customerData.deliveryAddress1?.trim() || !customerData.deliveryPostCode?.trim() || !customerData.deliveryCity?.trim() || !customerData.deliveryState?.trim()) {
      showAlert("Delivery address is required (Building Name & Address 2 optional; Gate No, Address 1, Post Code, City, State are mandatory)")
      return
    }
    if (!eventData.eventDate) {
      showAlert("Please enter event date")
      return
    }
    if (eventData.customerPreferredSetupDate && eventData.customerPreferredSetupDate > eventData.eventDate) {
      showAlert(
        `Preferred delivery date (${eventData.customerPreferredSetupDate}) cannot be later than event date (${eventData.eventDate}).`
      )
      return
    }
    if (eventData.dismantleRequired && !eventData.customerPreferredDismantleDate) {
      showAlert("Please enter preferred dismantle date")
      return
    }
    if (eventData.dismantleRequired && eventData.customerPreferredDismantleDate < eventData.eventDate) {
      showAlert(
        `Preferred dismantle date (${eventData.customerPreferredDismantleDate}) cannot be earlier than event date (${eventData.eventDate}).`
      )
      return
    }
    if (adHocOptions.requiresOtherAdhoc && !adHocOptions.otherAdhocName.trim()) {
      showAlert("Please enter Other Adhoc Name")
      return
    }

    setShowOrderPreview(true)
    setIsFormEditable(false)
    setIsSaved(false)
    setTimeout(() => {
      orderPreviewRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const handleEditForm = () => {
    setIsFormEditable(true)
    setShowOrderPreview(false)
    setIsSaved(false)
  }

  const handleSaveOrder = () => {
    if (!orderMeta.madeBy) {
      showAlert("Please enter the staff name who created this order")
      return
    }
    const customerLabel = customerType === "company" ? customerData.companyName : customerData.customerName
    if (!customerLabel.trim()) {
      showAlert(customerType === "company" ? "Please enter company name" : "Please enter customer name")
      return
    }
    if (!customerData.phone?.trim()) {
      showAlert("Please enter phone number")
      return
    }
    if (!customerData.billingAddressGate?.trim() || !customerData.billingAddress1?.trim() || !customerData.billingPostCode?.trim() || !customerData.billingCity?.trim() || !customerData.billingState?.trim()) {
      showAlert("Billing address is required (Building Name & Address 2 optional; Gate No, Address 1, Post Code, City, State are mandatory)")
      return
    }
    if (!customerData.deliveryAddressGate?.trim() || !customerData.deliveryAddress1?.trim() || !customerData.deliveryPostCode?.trim() || !customerData.deliveryCity?.trim() || !customerData.deliveryState?.trim()) {
      showAlert("Delivery address is required (Building Name & Address 2 optional; Gate No, Address 1, Post Code, City, State are mandatory)")
      return
    }
    if (!eventData.eventDate) {
      showAlert("Please enter event date")
      return
    }
    if (eventData.customerPreferredSetupDate && eventData.customerPreferredSetupDate > eventData.eventDate) {
      showAlert(
        `Preferred setup date (${eventData.customerPreferredSetupDate}) cannot be later than event date (${eventData.eventDate}).`
      )
      return
    }
    if (eventData.customerPreferredDismantleDate && eventData.customerPreferredDismantleDate < eventData.eventDate) {
      showAlert(
        `Preferred dismantle date (${eventData.customerPreferredDismantleDate}) cannot be earlier than event date (${eventData.eventDate}).`
      )
      return
    }
    if (adHocOptions.requiresOtherAdhoc && !adHocOptions.otherAdhocName.trim()) {
      showAlert("Please enter Other Adhoc Name")
      return
    }

    setIsSaving(true)

    const order: SalesOrder = {
      id: crypto.randomUUID(),
      orderNumber: orderMeta.orderNumber,
      orderMeta,
      orderSource: "ad-hoc",
      adHocOptions,
      salesOrderDate: getCurrentDate(),
      expirationDate: "",
      status: "scheduling",
      hasIssue: false,
      eventData,
      pricingData,
      customerData,
      quotationOptions,
      items,
      subtotal,
      tax: itemsTax,
      discount: Math.max(0, discountAmount),
      discountType,
      discountAppliesTo,
      total: grandTotal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const existingOrders = getAdHocOrders()

    if (isEditMode) {
      const updatedOrders = existingOrders.map(o =>
        o.orderNumber === orderMeta.orderNumber ? { ...order, id: o.id, createdAt: o.createdAt } : o
      )
      saveAdHocOrders(updatedOrders)
    } else {
      saveAdHocOrders([...existingOrders, order])
    }

    setIsSaving(false)
    showAlert(isEditMode ? "Adhoc quotation updated!" : "Adhoc quotation saved!", { title: "Saved" })
    router.push("/portal/sales-confirmation")
  }

  const handleClear = () => {
    if (!confirm("Clear all fields?")) return
    setOrderMeta({
      orderNumber: getNextAdHocNumber(),
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
      budgetPerHead: 0,
      dismantleRequired: false,
      areaType: "indoor",
      areaSelection: "",
      locationAreaType: "etre-cafe",
      locationAreaOther: "",
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
    setCustomerData({
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
      setupTimeSlot: "NONE",
      dismantleTimeSlot: "NONE",
      specialRequest: "",
      photos: [],
    })
    setItems([])
    setDiscount(0)
    setDiscountType("amount")
    setDiscountAppliesTo("total")
    setNewItemName("")
    setNewItemQty(1)
    setNewItemPrice(0)
    setNewItemSst(true)
    setItemCategory("All")
    setItemSearch("")
    setSelectedCatalogItem("")
    setQuotationOptions({
      brandingRequirement: {
        type: "none",
        logoOn: { dessert: false, packaging: false, other: "" },
        colourOn: { dessert: false, packaging: false, other: "" },
      },
      preferredMenuSelection: {
        step1: "current",
        notes: "",
        size: "normal",
        drinks: { coffee: false, tea: false, fizzy: false, other: "" },
        packagingBox: "etre-existing",
        dietaryNeeds: "",
        servingStyle: { individualDessertBox: false, buffetCateringStyle: false },
      },
    })
    setAdHocOptions({
      requiresPacking: true,
      requiresSetup: true,
      requiresDismantle: true,
      requiresOtherAdhoc: false,
      requiresGPSTracking: true,
      otherAdhocName: "",
    })
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
            </div>

            <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount Amount</span>
                <span className="font-semibold text-foreground">RM {discountAmount.toFixed(2)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Total Before Discount</span>
                <span className="font-semibold text-foreground">RM {totalBeforeDiscount.toFixed(2)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Grand Total</span>
                <span className="font-semibold text-foreground">RM {grandTotal.toFixed(2)}</span>
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
      <OrderProgress currentStep="quotation" orderSource="ad-hoc" adHocOptions={adHocOptions} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push("/portal/sales-confirmation")} className="bg-transparent">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {viewMode === "lookup" ? "Adhoc Quotation Lookup" : isEditMode ? "Edit Adhoc Quotation" : "New Adhoc Quotation"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {viewMode === "lookup" ? "Search and manage ad hoc orders" : "Manual item entry with optional SST per item"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={viewMode === "new" ? "default" : "outline"}
            onClick={() => setViewMode("new")}
            className={viewMode === "new" ? "bg-accent text-accent-foreground" : "bg-transparent"}
          >
            New Order
          </Button>
          <Button
            variant={viewMode === "lookup" ? "default" : "outline"}
            onClick={() => setViewMode("lookup")}
            className={viewMode === "lookup" ? "bg-accent text-accent-foreground" : "bg-transparent"}
          >
            Ad Hoc Order Lookup
          </Button>
        </div>
      </div>

      {viewMode === "lookup" && (
        <>
          {/* Ad Hoc Order Lookup */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-amber-50 px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">Ad Hoc Orders</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="relative md:col-span-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by AH number or customer name..."
                    value={adHocOrderSearch}
                    onChange={(e) => setAdHocOrderSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From date</Label>
                  <Input
                    type="date"
                    value={lookupDateFrom}
                    onChange={(e) => setLookupDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To date</Label>
                  <Input
                    type="date"
                    value={lookupDateTo}
                    onChange={(e) => setLookupDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {adHocOrdersList.filter(order => {
                  const term = adHocOrderSearch.toLowerCase()
                  if (!term) return true
                  return (
                    order.orderNumber.toLowerCase().includes(term) ||
                    order.customerData.customerName?.toLowerCase().includes(term) ||
                    order.customerData.companyName?.toLowerCase().includes(term)
                  )
                }).filter(order => {
                  if (!lookupDateFrom && !lookupDateTo) return true
                  const eventDate = order.eventData.eventDate
                  if (!eventDate) return false
                  if (lookupDateFrom && new Date(eventDate) < new Date(lookupDateFrom)) return false
                  if (lookupDateTo && new Date(eventDate) > new Date(lookupDateTo)) return false
                  return true
                }).slice(0, 30).map((order) => (
                  <div key={order.orderNumber} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <div className="min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{order.orderNumber}</p>
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800">
                          Ad Hoc
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {order.customerData.customerName || order.customerData.companyName || "N/A"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Event: {order.eventData.eventName || "-"} | Order Created: {order.orderMeta?.orderDate ? new Date(order.orderMeta.orderDate).toLocaleDateString("en-MY") : "-"} | Event Date: {order.eventData.eventDate || "-"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setViewMode("new")
                          router.push(`/portal/ad-hoc?edit=${order.orderNumber}`)
                        }}
                        className="bg-transparent"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteAdHocOrder(order.orderNumber)}
                        className="bg-transparent text-destructive border-destructive/30 hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                {adHocOrdersList.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No saved ad hoc orders yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {viewMode === "new" && (
      <div className="space-y-6">
        {/* Main Form */}
        <div className="space-y-6">
          {/* Import from Sales Order */}
          {!isEditMode && (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Import from Sales Order</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Enter a Sales Order number to copy Event Details and Customer Information into this Ad Hoc order.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={importSoNumber}
                  onChange={(e) => setImportSoNumber(e.target.value)}
                  placeholder="e.g., SO2502-ABCD"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
                <Button
                  type="button"
                  onClick={handleImportFromSalesOrder}
                  disabled={!isFormEditable || !importSoNumber.trim()}
                  className="gap-2"
                >
                  Import
                </Button>
              </div>
            </div>
          )}

          {/* Order Info */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Hash className="h-5 w-5" />
              Order Information
            </h2>
            <div className="grid gap-3 md:grid-cols-12 items-end">
              <div className="space-y-1 md:col-span-3">
                <Label className="text-foreground">Order Number</Label>
                <Input value={orderMeta.orderNumber} disabled className="bg-muted" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-foreground">Order Date</Label>
                <Input type="date" value={orderMeta.orderDate} disabled className="bg-muted" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-foreground">Order Time</Label>
                <Input type="time" value={orderMeta.orderTime} disabled className="bg-muted" />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-foreground">Made By *</Label>
                <Input
                  value={orderMeta.madeBy}
                  onChange={(e) => setOrderMeta(prev => ({ ...prev, madeBy: e.target.value }))}
                  placeholder="Staff name"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>
            </div>
          </div>

          {/* Ad Hoc Options */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-amber-900">
              <FileText className="h-5 w-5" />
              Ad Hoc Order Options
            </h2>
            <p className="text-sm text-amber-700 mb-4">Select which phases are required for this order:</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-white">
                <Checkbox
                  id="requiresPacking"
                  checked={adHocOptions.requiresPacking}
                  onCheckedChange={(checked) => setAdHocOptions(prev => ({ ...prev, requiresPacking: !!checked }))}
                  disabled={!isFormEditable}
                />
                <Label htmlFor="requiresPacking" className="flex items-center gap-2 cursor-pointer text-foreground">
                  <Package className="h-4 w-4 text-blue-600" />
                  Packing
                </Label>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-white">
                <Checkbox
                  id="requiresSetup"
                  checked={adHocOptions.requiresSetup}
                  onCheckedChange={(checked) => setAdHocOptions(prev => ({ ...prev, requiresSetup: !!checked }))}
                  disabled={!isFormEditable}
                />
                <Label htmlFor="requiresSetup" className="flex items-center gap-2 cursor-pointer text-foreground">
                  <Wrench className="h-4 w-4 text-purple-600" />
                  Setup
                </Label>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-white">
                <Checkbox
                  id="requiresDismantle"
                  checked={adHocOptions.requiresDismantle}
                  onCheckedChange={(checked) => setAdHocOptions(prev => ({ ...prev, requiresDismantle: !!checked }))}
                  disabled={!isFormEditable}
                />
                <Label htmlFor="requiresDismantle" className="flex items-center gap-2 cursor-pointer text-foreground">
                  <Truck className="h-4 w-4 text-orange-600" />
                  Dismantle
                </Label>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-white">
                <Checkbox
                  id="requiresOtherAdhoc"
                  checked={adHocOptions.requiresOtherAdhoc}
                  onCheckedChange={(checked) => setAdHocOptions(prev => ({ ...prev, requiresOtherAdhoc: !!checked }))}
                  disabled={!isFormEditable}
                />
                <Label htmlFor="requiresOtherAdhoc" className="flex items-center gap-2 cursor-pointer text-foreground">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  Other Adhoc
                </Label>
              </div>
              {adHocOptions.requiresOtherAdhoc && (
                <div className="sm:col-span-2 lg:col-span-4 space-y-2">
                  <Label className="text-foreground">Other Adhoc Name</Label>
                  <Input
                    value={adHocOptions.otherAdhocName}
                    onChange={(e) => setAdHocOptions(prev => ({ ...prev, otherAdhocName: e.target.value }))}
                    placeholder="e.g., Runner / Extra Task / Special Request"
                    disabled={!isFormEditable}
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                  />
                </div>
              )}
            </div>

            {/* GPS Tracking Option */}
            <div className="mt-4 pt-4 border-t border-amber-200">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-white">
                <Checkbox
                  id="requiresGPSTracking"
                  checked={adHocOptions.requiresGPSTracking}
                  onCheckedChange={(checked) => setAdHocOptions(prev => ({ ...prev, requiresGPSTracking: !!checked }))}
                  disabled={!isFormEditable}
                />
                <Label htmlFor="requiresGPSTracking" className="flex items-center gap-2 cursor-pointer text-foreground">
                  <Navigation className="h-4 w-4 text-green-600" />
                  <span>Requires GPS Tracking</span>
                </Label>
              </div>
              <p className="text-xs text-amber-700 mt-2 ml-1">
                Enable GPS tracking to record journey routes during setup, dismantle, or other adhoc phases
              </p>
            </div>
          </div>

          {/* Event Details */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Calendar className="h-5 w-5" />
              Event Details
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {/* Event / Adhoc Name - Full Width */}
              <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Event / Adhoc Name</Label>
                <Input
                  value={eventData.eventName}
                  onChange={(e) => setEventData(prev => ({ ...prev, eventName: e.target.value }))}
                  placeholder="e.g., Wedding Reception / Adhoc Setup"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>
              {/* Event Date - Full Width */}
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label className="text-foreground">Event Date *</Label>
              <div className="space-y-1">
                <Input
                  id="event-date"
                  type="date"
                  value={normalizeDateToISO(eventData.eventDate)}
                  onChange={(e) => {
                    const next = normalizeDateToISO(e.target.value)
                    setEventData(prev => ({
                      ...prev,
                      eventDate: next,
                      dayOfWeek: calculateDayOfWeek(next),
                    }))
                  }}
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
                <p className="text-xs text-muted-foreground">
                  Display: {formatISOToDMY(eventData.eventDate) || "-"}
                </p>
                {eventData.dayOfWeek && (
                  <p className="text-xs text-muted-foreground">{eventData.dayOfWeek}</p>
                )}
              </div>
            </div>
              {/* Event Type - Full Width */}
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Event Type</Label>
                <Select value={eventData.eventType} onValueChange={(v) => setEventData(prev => ({ ...prev, eventType: v }))} disabled={!isFormEditable}>
                  <SelectTrigger disabled={!isFormEditable} className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wedding">Wedding</SelectItem>
                    <SelectItem value="corporate">Corporate Event</SelectItem>
                    <SelectItem value="birthday">Birthday Party</SelectItem>
                    <SelectItem value="funeral">Funeral</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Estimated Guests - Full Width */}
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Estimated Guests</Label>
                <Input
                  type="number"
                  value={eventData.estimatedGuests || ""}
                  onChange={(e) => setEventData(prev => ({ ...prev, estimatedGuests: parseInt(e.target.value) || 0 }))}
                  placeholder="Number of guests"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>

              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Budget / Head (RM)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={typeof eventData.budgetPerHead === "number" ? eventData.budgetPerHead : ""}
                  onChange={(e) => setEventData(prev => ({ ...prev, budgetPerHead: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  placeholder="0.00"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>
              {/* Preferred Setup Date - Full Width */}
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Preferred Delivery Date</Label>
                <Input
                  id="setup-date"
                  type="date"
                  value={normalizeDateToISO(eventData.customerPreferredSetupDate)}
                  max={eventData.eventDate || undefined}
                  onChange={(e) => {
                    const next = normalizeDateToISO(e.target.value)
                    if (eventData.eventDate && next && next > eventData.eventDate) {
                      showAlert("Preferred delivery date cannot be later than event date.")
                      return
                    }
                    setEventData(prev => ({
                      ...prev,
                      customerPreferredSetupDate: next,
                      setupDayOfWeek: calculateDayOfWeek(next),
                    }))
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
                {eventData.eventDate &&
                  eventData.customerPreferredSetupDate &&
                  eventData.customerPreferredSetupDate > eventData.eventDate && (
                    <p className="text-xs font-medium text-destructive">
                      Preferred delivery date cannot be later than event date.
                    </p>
                  )}
              </div>
              {/* Preferred Setup Time - Full Width */}
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Preferred Delivery Time</Label>
                <Select
                  value={eventData.desiredSetupTime}
                  onValueChange={(v) => {
                    setEventData(prev => ({ ...prev, desiredSetupTime: v }))
                    setCustomerData(prev => ({ ...prev, setupTimeSlot: v }))
                  }}
                  disabled={!isFormEditable}
                >
                  <SelectTrigger disabled={!isFormEditable} className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">NONE</SelectItem>
                    {TIME_SLOTS.map(slot => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
                <Label className="text-foreground">Dismantle Required?</Label>
                <RadioGroup
                  value={eventData.dismantleRequired ? "yes" : "no"}
                  onValueChange={(v) => {
                    const required = v === "yes"
                    setEventData(prev => ({
                      ...prev,
                      dismantleRequired: required,
                      customerPreferredDismantleDate: required ? prev.customerPreferredDismantleDate : "",
                      desiredDismantleTime: required ? prev.desiredDismantleTime : "",
                      dismantleDayOfWeek: required ? prev.dismantleDayOfWeek : "",
                    }))
                    if (!required) {
                      setCustomerData(prev => ({ ...prev, dismantleTimeSlot: "NONE" }))
                    }
                  }}
                  className="flex gap-4"
                  disabled={!isFormEditable}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="adhoc-dismantle-no" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-dismantle-no" className="cursor-pointer font-normal">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="adhoc-dismantle-yes" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-dismantle-yes" className="cursor-pointer font-normal">Yes</Label>
                  </div>
                </RadioGroup>
              </div>

              {eventData.dismantleRequired && (
                <>
                  {/* Preferred Dismantle Date - Full Width */}
                  <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                    <Label className="text-foreground">Preferred Dismantle Date</Label>
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
                        setEventData(prev => ({
                          ...prev,
                          customerPreferredDismantleDate: next,
                          dismantleDayOfWeek: calculateDayOfWeek(next),
                        }))
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
                    {eventData.eventDate &&
                      eventData.customerPreferredDismantleDate &&
                      eventData.customerPreferredDismantleDate < eventData.eventDate && (
                        <p className="text-xs font-medium text-destructive">
                          Preferred dismantle date cannot be earlier than event date.
                        </p>
                      )}
                  </div>
                  {/* Preferred Dismantle Time - Full Width */}
                  <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                    <Label className="text-foreground">Preferred Dismantle Time</Label>
                    <Select
                      value={eventData.desiredDismantleTime}
                      onValueChange={(v) => {
                        setEventData(prev => ({ ...prev, desiredDismantleTime: v }))
                        setCustomerData(prev => ({ ...prev, dismantleTimeSlot: v }))
                      }}
                      disabled={!isFormEditable}
                    >
                      <SelectTrigger disabled={!isFormEditable} className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                        <SelectValue placeholder="Select time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">NONE</SelectItem>
                        {TIME_SLOTS.map(slot => (
                          <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            {/* Area Type */}
            <div className="mt-4 grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label className="text-foreground">Area Type</Label>
              <RadioGroup
                value={eventData.areaType}
                onValueChange={(v) => setEventData(prev => ({ ...prev, areaType: v as "indoor" | "outdoor" }))}
                className="flex gap-4"
                disabled={!isFormEditable}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="indoor" id="indoor" disabled={!isFormEditable} />
                  <Label htmlFor="indoor" className="flex items-center gap-1 text-foreground cursor-pointer">
                    <Home className="h-4 w-4" /> Indoor
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="outdoor" id="outdoor" disabled={!isFormEditable} />
                  <Label htmlFor="outdoor" className="flex items-center gap-1 text-foreground cursor-pointer">
                    <Building2 className="h-4 w-4" /> Outdoor
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Area Selection */}
            <div className="mt-4 grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
              <Label className="text-foreground">Location</Label>
              <div className="space-y-1">
                <RadioGroup
                  value={eventData.locationAreaType || "etre-cafe"}
                  onValueChange={(value) =>
                    setEventData((prev) => ({
                      ...prev,
                      locationAreaType: value as any,
                      locationAreaOther: value === "other" ? prev.locationAreaOther : "",
                    }))
                  }
                  className="flex flex-wrap gap-3"
                  disabled={!isFormEditable}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="etre-cafe" id="adhoc-etre-cafe" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-etre-cafe" className="cursor-pointer font-normal">
                      Être Cafe
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="other" id="adhoc-location-other" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-location-other" className="cursor-pointer font-normal">
                      Others
                    </Label>
                  </div>
                </RadioGroup>
                {eventData.locationAreaType === "other" && (
                  <div className="mt-2 grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                    <Label className="text-foreground">Please specify</Label>
                    <Input
                      value={eventData.locationAreaOther || ""}
                      onChange={(e) => setEventData((prev) => ({ ...prev, locationAreaOther: e.target.value }))}
                      placeholder="Enter location / area"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <User className="h-5 w-5" />
              Customer Details
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-sm font-medium">Customer Type *</Label>
                <RadioGroup
                  value={customerType}
                  onValueChange={(value: "individual" | "company") => setCustomerType(value)}
                  className="flex gap-4 h-8 items-center rounded-md border border-border px-3"
                  disabled={!isFormEditable}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="individual" id="adhoc-individual" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-individual" className="cursor-pointer font-normal">Individual</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="company" id="adhoc-company" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-company" className="cursor-pointer font-normal">Company</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Phone *</Label>
                <Input
                  value={customerData.phone}
                  onChange={(e) => setCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g., 012-345 6789"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>

              <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">
                  {customerType === "company" ? "Company Name *" : "Customer Name *"}
                </Label>
                <Input
                  value={customerType === "company" ? customerData.companyName : customerData.customerName}
                  onChange={(e) =>
                    setCustomerData(prev =>
                      customerType === "company"
                        ? ({ ...prev, companyName: e.target.value })
                        : ({ ...prev, customerName: e.target.value })
                    )
                  }
                  placeholder={customerType === "company" ? "Company name" : "Full name"}
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>

              <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
                <Label className="text-foreground">Email</Label>
                <Input
                  type="email"
                  value={customerData.email}
                  onChange={(e) => setCustomerData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Billing Address */}
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 font-medium text-foreground">
                  <MapPin className="h-4 w-4" />
                  Billing Address
                </h3>
                <div className="grid gap-4">
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Building Name</Label>
                    <Input
                      value={customerData.billingBuildingName || ""}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, billingBuildingName: e.target.value }))}
                      placeholder="e.g., The Plaza / Condo name"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Gate No *</Label>
                    <Input
                      value={customerData.billingAddressGate || ""}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, billingAddressGate: e.target.value }))}
                      placeholder="e.g., Gate 5 / Unit 12A"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Address 1 *</Label>
                    <Input
                      value={customerData.billingAddress1 || ""}
                      onChange={(e) =>
                        setCustomerData(prev => ({
                          ...prev,
                          billingAddress1: e.target.value,
                          billingAddressJalan: e.target.value,
                        }))
                      }
                      placeholder="56, Jalan ..."
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Address 2</Label>
                    <Input
                      value={customerData.billingAddress2 || ""}
                      onChange={(e) =>
                        setCustomerData(prev => ({
                          ...prev,
                          billingAddress2: e.target.value,
                          billingAddressTaman: e.target.value,
                        }))
                      }
                      placeholder="Address 2"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                      <Label className="text-foreground">Post Code *</Label>
                      <Input
                        value={customerData.billingPostCode}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, billingPostCode: e.target.value }))}
                        placeholder="30100"
                        disabled={!isFormEditable}
                        className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                      <Label className="text-foreground">City *</Label>
                      <Input
                        value={customerData.billingCity || ""}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, billingCity: e.target.value }))}
                        placeholder="Ipoh"
                        disabled={!isFormEditable}
                        className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">State *</Label>
                    <Select value={customerData.billingState} onValueChange={(v) => setCustomerData(prev => ({ ...prev, billingState: v }))} disabled={!isFormEditable}>
                      <SelectTrigger disabled={!isFormEditable} className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MALAYSIAN_STATES.map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Delivery Address */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-medium text-foreground">
                    <MapPin className="h-4 w-4" />
                    Delivery Address
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-transparent text-xs"
                    onClick={() =>
                      setCustomerData(prev => ({
                        ...prev,
                        deliveryBuildingName: prev.billingBuildingName || "",
                        deliveryAddress1: prev.billingAddress1 || prev.billingAddressJalan,
                        deliveryAddress2: prev.billingAddress2 || prev.billingAddressTaman,
                        deliveryCity: prev.billingCity || "",
                        deliveryAddressGate: prev.billingAddressGate,
                        deliveryAddressJalan: prev.billingAddress1 || prev.billingAddressJalan,
                        deliveryAddressTaman: prev.billingAddress2 || prev.billingAddressTaman,
                        deliveryPostCode: prev.billingPostCode,
                        deliveryState: prev.billingState,
                      }))
                    }
                    disabled={!isFormEditable}
                  >
                    Same as Billing
                  </Button>
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Building Name</Label>
                    <Input
                      value={customerData.deliveryBuildingName || ""}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, deliveryBuildingName: e.target.value }))}
                      placeholder="e.g., The Plaza / Condo name"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Gate No *</Label>
                    <Input
                      value={customerData.deliveryAddressGate || ""}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, deliveryAddressGate: e.target.value }))}
                      placeholder="e.g., Gate 5 / Unit 12A"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Address 1 *</Label>
                    <Input
                      value={customerData.deliveryAddress1 || ""}
                      onChange={(e) =>
                        setCustomerData(prev => ({
                          ...prev,
                          deliveryAddress1: e.target.value,
                          deliveryAddressJalan: e.target.value,
                        }))
                      }
                      placeholder="56, Jalan ..."
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">Address 2</Label>
                    <Input
                      value={customerData.deliveryAddress2 || ""}
                      onChange={(e) =>
                        setCustomerData(prev => ({
                          ...prev,
                          deliveryAddress2: e.target.value,
                          deliveryAddressTaman: e.target.value,
                        }))
                      }
                      placeholder="Address 2"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                      <Label className="text-foreground">Post Code *</Label>
                      <Input
                        value={customerData.deliveryPostCode}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, deliveryPostCode: e.target.value }))}
                        placeholder="30100"
                        disabled={!isFormEditable}
                        className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                      <Label className="text-foreground">City *</Label>
                      <Input
                        value={customerData.deliveryCity || ""}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, deliveryCity: e.target.value }))}
                        placeholder="Ipoh"
                        disabled={!isFormEditable}
                        className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <Label className="text-foreground">State *</Label>
                    <Select value={customerData.deliveryState} onValueChange={(v) => setCustomerData(prev => ({ ...prev, deliveryState: v }))} disabled={!isFormEditable}>
                      <SelectTrigger disabled={!isFormEditable} className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MALAYSIAN_STATES.map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Special Request */}
            <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Label className="text-foreground">Special Request / Notes</Label>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {customerData.specialRequest ? customerData.specialRequest : "No notes"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={() => setSpecialRequestModalOpen(true)}
                >
                  {customerData.specialRequest ? "Edit" : "Add"}
                </Button>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Package className="h-5 w-5" />
              Items (Manual Entry)
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Add items, set quantity and price, and toggle SST per item.
            </p>

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4 mb-4">
              <h3 className="text-sm font-semibold text-foreground">Branding Requirement (Add brand element)</h3>

              <RadioGroup
                value={quotationOptions.brandingRequirement.type}
                onValueChange={(v) =>
                  setQuotationOptions((prev) => ({
                    ...prev,
                    brandingRequirement: {
                      ...prev.brandingRequirement,
                      type: v as any,
                    },
                  }))
                }
                className="grid gap-2"
                disabled={!isFormEditable}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="adhoc-brand-none" disabled={!isFormEditable} />
                  <Label htmlFor="adhoc-brand-none" className="cursor-pointer font-normal">A) No requirement</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="logo" id="adhoc-brand-logo" disabled={!isFormEditable} />
                  <Label htmlFor="adhoc-brand-logo" className="cursor-pointer font-normal">B) Brand Logo on</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="colour" id="adhoc-brand-colour" disabled={!isFormEditable} />
                  <Label htmlFor="adhoc-brand-colour" className="cursor-pointer font-normal">C) Brand matching colour on</Label>
                </div>
              </RadioGroup>

              {quotationOptions.brandingRequirement.type === "logo" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={quotationOptions.brandingRequirement.logoOn.dessert}
                      onCheckedChange={(checked) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          brandingRequirement: {
                            ...prev.brandingRequirement,
                            logoOn: { ...prev.brandingRequirement.logoOn, dessert: Boolean(checked) },
                          },
                        }))
                      }
                      disabled={!isFormEditable}
                    />
                    <span className="text-sm text-foreground">Dessert (chocolate disc / paper topper)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={quotationOptions.brandingRequirement.logoOn.packaging}
                      onCheckedChange={(checked) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          brandingRequirement: {
                            ...prev.brandingRequirement,
                            logoOn: { ...prev.brandingRequirement.logoOn, packaging: Boolean(checked) },
                          },
                        }))
                      }
                      disabled={!isFormEditable}
                    />
                    <span className="text-sm text-foreground">Packaging (box sleeve / sticker logo)</span>
                  </div>
                  <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
                    <Label className="text-sm font-medium">Others (specify)</Label>
                    <Input
                      value={quotationOptions.brandingRequirement.logoOn.other}
                      onChange={(e) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          brandingRequirement: {
                            ...prev.brandingRequirement,
                            logoOn: { ...prev.brandingRequirement.logoOn, other: e.target.value },
                          },
                        }))
                      }
                      placeholder="Other logo placement"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                </div>
              )}

              {quotationOptions.brandingRequirement.type === "colour" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={quotationOptions.brandingRequirement.colourOn.dessert}
                      onCheckedChange={(checked) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          brandingRequirement: {
                            ...prev.brandingRequirement,
                            colourOn: { ...prev.brandingRequirement.colourOn, dessert: Boolean(checked) },
                          },
                        }))
                      }
                      disabled={!isFormEditable}
                    />
                    <span className="text-sm text-foreground">Dessert</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={quotationOptions.brandingRequirement.colourOn.packaging}
                      onCheckedChange={(checked) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          brandingRequirement: {
                            ...prev.brandingRequirement,
                            colourOn: { ...prev.brandingRequirement.colourOn, packaging: Boolean(checked) },
                          },
                        }))
                      }
                      disabled={!isFormEditable}
                    />
                    <span className="text-sm text-foreground">Customise packaging</span>
                  </div>
                  <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
                    <Label className="text-sm font-medium">Others (specify)</Label>
                    <Input
                      value={quotationOptions.brandingRequirement.colourOn.other}
                      onChange={(e) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          brandingRequirement: {
                            ...prev.brandingRequirement,
                            colourOn: { ...prev.brandingRequirement.colourOn, other: e.target.value },
                          },
                        }))
                      }
                      placeholder="Other colour requirement"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4 mb-4">
              <h3 className="text-sm font-semibold text-foreground">Preferred Menu Selection</h3>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Step 1</Label>
                <RadioGroup
                  value={quotationOptions.preferredMenuSelection.step1}
                  onValueChange={(v) =>
                    setQuotationOptions((prev) => ({
                      ...prev,
                      preferredMenuSelection: { ...prev.preferredMenuSelection, step1: v as any },
                    }))
                  }
                  className="grid gap-2"
                  disabled={!isFormEditable}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="current" id="adhoc-menu-current" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-menu-current" className="cursor-pointer font-normal">A) Current menu (same base, same topper)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="partial" id="adhoc-menu-partial" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-menu-partial" className="cursor-pointer font-normal">B) Partial customise (same base, customise topper, add branding element)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full" id="adhoc-menu-full" disabled={!isFormEditable} />
                    <Label htmlFor="adhoc-menu-full" className="cursor-pointer font-normal">C) Fully customise (none from menu; may incur one-time design & development fees)</Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  Photo references can be uploaded in the Special Request & Photos section.
                </p>
                {(quotationOptions.preferredMenuSelection.step1 === "partial" || quotationOptions.preferredMenuSelection.step1 === "full") && (
                  <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
                    <Label className="text-sm font-medium">Requirements / Notes</Label>
                    <Textarea
                      value={quotationOptions.preferredMenuSelection.notes}
                      onChange={(e) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          preferredMenuSelection: { ...prev.preferredMenuSelection, notes: e.target.value },
                        }))
                      }
                      placeholder="List requirements / upload photo reference"
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Step 2: Size</Label>
                  <RadioGroup
                    value={quotationOptions.preferredMenuSelection.size}
                    onValueChange={(v) =>
                      setQuotationOptions((prev) => ({
                        ...prev,
                        preferredMenuSelection: { ...prev.preferredMenuSelection, size: v as any },
                      }))
                    }
                    className="flex gap-4"
                    disabled={!isFormEditable}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="normal" id="adhoc-size-normal" disabled={!isFormEditable} />
                      <Label htmlFor="adhoc-size-normal" className="cursor-pointer font-normal">Normal size</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mini" id="adhoc-size-mini" disabled={!isFormEditable} />
                      <Label htmlFor="adhoc-size-mini" className="cursor-pointer font-normal">Mini bites</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Packaging Box</Label>
                  <RadioGroup
                    value={quotationOptions.preferredMenuSelection.packagingBox}
                    onValueChange={(v) =>
                      setQuotationOptions((prev) => ({
                        ...prev,
                        preferredMenuSelection: { ...prev.preferredMenuSelection, packagingBox: v as any },
                      }))
                    }
                    className="grid gap-2"
                    disabled={!isFormEditable}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="customer-own" id="adhoc-box-customer" disabled={!isFormEditable} />
                      <Label htmlFor="adhoc-box-customer" className="cursor-pointer font-normal">Use customer own box</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="etre-existing" id="adhoc-box-etre" disabled={!isFormEditable} />
                      <Label htmlFor="adhoc-box-etre" className="cursor-pointer font-normal">Être existing box</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="premium" id="adhoc-box-premium" disabled={!isFormEditable} />
                      <Label htmlFor="adhoc-box-premium" className="cursor-pointer font-normal">Premium box</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Step 3: Drinks</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={quotationOptions.preferredMenuSelection.drinks.coffee}
                      onCheckedChange={(checked) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          preferredMenuSelection: {
                            ...prev.preferredMenuSelection,
                            drinks: { ...prev.preferredMenuSelection.drinks, coffee: Boolean(checked) },
                          },
                        }))
                      }
                      disabled={!isFormEditable}
                    />
                    <span className="text-sm text-foreground">Coffee</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={quotationOptions.preferredMenuSelection.drinks.tea}
                      onCheckedChange={(checked) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          preferredMenuSelection: {
                            ...prev.preferredMenuSelection,
                            drinks: { ...prev.preferredMenuSelection.drinks, tea: Boolean(checked) },
                          },
                        }))
                      }
                      disabled={!isFormEditable}
                    />
                    <span className="text-sm text-foreground">Tea</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={quotationOptions.preferredMenuSelection.drinks.fizzy}
                      onCheckedChange={(checked) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          preferredMenuSelection: {
                            ...prev.preferredMenuSelection,
                            drinks: { ...prev.preferredMenuSelection.drinks, fizzy: Boolean(checked) },
                          },
                        }))
                      }
                      disabled={!isFormEditable}
                    />
                    <span className="text-sm text-foreground">Fizzy drinks</span>
                  </div>
                  <div className="grid gap-2 md:col-span-2 md:grid-cols-[170px_1fr] md:items-center">
                    <Label className="text-sm font-medium">Others</Label>
                    <Input
                      value={quotationOptions.preferredMenuSelection.drinks.other}
                      onChange={(e) =>
                        setQuotationOptions((prev) => ({
                          ...prev,
                          preferredMenuSelection: {
                            ...prev.preferredMenuSelection,
                            drinks: { ...prev.preferredMenuSelection.drinks, other: e.target.value },
                          },
                        }))
                      }
                      placeholder="Other drinks"
                      disabled={!isFormEditable}
                      className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2 md:grid-cols-[170px_1fr] md:items-start">
                  <Label className="text-sm font-medium">Dietary needs</Label>
                  <Textarea
                    value={quotationOptions.preferredMenuSelection.dietaryNeeds}
                    onChange={(e) =>
                      setQuotationOptions((prev) => ({
                        ...prev,
                        preferredMenuSelection: { ...prev.preferredMenuSelection, dietaryNeeds: e.target.value },
                      }))
                    }
                    placeholder="Allergies / dietary requirements..."
                    className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Serving style</Label>
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={quotationOptions.preferredMenuSelection.servingStyle.individualDessertBox}
                        onCheckedChange={(checked) =>
                          setQuotationOptions((prev) => ({
                            ...prev,
                            preferredMenuSelection: {
                              ...prev.preferredMenuSelection,
                              servingStyle: {
                                ...prev.preferredMenuSelection.servingStyle,
                                individualDessertBox: Boolean(checked),
                              },
                            },
                          }))
                        }
                        disabled={!isFormEditable}
                      />
                      <span className="text-sm text-foreground">Individual dessert box</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={quotationOptions.preferredMenuSelection.servingStyle.buffetCateringStyle}
                        onCheckedChange={(checked) =>
                          setQuotationOptions((prev) => ({
                            ...prev,
                            preferredMenuSelection: {
                              ...prev.preferredMenuSelection,
                              servingStyle: {
                                ...prev.preferredMenuSelection.servingStyle,
                                buffetCateringStyle: Boolean(checked),
                              },
                            },
                          }))
                        }
                        disabled={!isFormEditable}
                      />
                      <span className="text-sm text-foreground">Buffet catering style</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Tick both if needed.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Item Picker */}
            <div className="grid gap-3 sm:grid-cols-3 mb-4">
              <div className="space-y-2">
                <Label className="text-foreground">Category</Label>
                <Select value={itemCategory} onValueChange={setItemCategory} disabled={!isFormEditable}>
                  <SelectTrigger disabled={!isFormEditable} className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
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
                <Label className="text-foreground">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Find item..."
                    className={`pl-9 border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                    disabled={!isFormEditable}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Item</Label>
                <Select value={selectedCatalogItem} onValueChange={handleCatalogSelect} disabled={!isFormEditable}>
                  <SelectTrigger disabled={!isFormEditable} className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}>
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

            {/* Add Item Form */}
            <div className="grid gap-2 mb-4 sm:grid-cols-[1.6fr_0.5fr_0.6fr_0.5fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label className="text-foreground">Item name</Label>
                <Input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Item name"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Qty</Label>
                <Input
                  type="number"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                  placeholder="Qty"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Price (RM)</Label>
                <Input
                  type="number"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                  placeholder="Price"
                  disabled={!isFormEditable}
                  className={`border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">SST</Label>
                <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3">
                  <Checkbox
                    id="newItemSst"
                    checked={newItemSst}
                    onCheckedChange={(checked) => setNewItemSst(!!checked)}
                    disabled={!isFormEditable}
                  />
                  <Label htmlFor="newItemSst" className="text-sm text-muted-foreground">Apply</Label>
                </div>
              </div>
              <Button onClick={handleAddItem} variant="outline" className="gap-1 bg-transparent" disabled={!isFormEditable}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {/* Items List */}
            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid gap-3 p-3 rounded-lg border border-border bg-muted/30 sm:grid-cols-[1.5fr_0.5fr_0.6fr_0.5fr_0.8fr_auto] sm:items-center">
                    <Input
                      value={item.name}
                      onChange={(e) => {
                        const name = e.target.value
                        setItems(prev => prev.map((row, i) => i === idx ? { ...row, name } : row))
                      }}
                      className={`h-8 border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {
                        const qty = parseInt(e.target.value) || 0
                        const sstApplied = item.sstApplied ?? item.sst > 0
                        const totals = calculateItemTotals(qty, item.unitPrice, sstApplied)
                        setItems(prev => prev.map((row, i) => i === idx ? { ...row, quantity: qty, sst: totals.sst, total: totals.total } : row))
                      }}
                      className={`h-8 border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                    <Input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const price = parseFloat(e.target.value) || 0
                        const sstApplied = item.sstApplied ?? item.sst > 0
                        const totals = calculateItemTotals(Number(item.quantity) || 0, price, sstApplied)
                        setItems(prev => prev.map((row, i) => i === idx ? { ...row, unitPrice: price, sst: totals.sst, total: totals.total } : row))
                      }}
                      className={`h-8 border-border ${!isFormEditable ? "bg-muted text-muted-foreground" : ""}`}
                      disabled={!isFormEditable}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`item-sst-${idx}`}
                        checked={item.sstApplied ?? item.sst > 0}
                        onCheckedChange={(checked) => {
                          const sstApplied = !!checked
                          const totals = calculateItemTotals(Number(item.quantity) || 0, item.unitPrice, sstApplied)
                          setItems(prev => prev.map((row, i) => i === idx ? { ...row, sstApplied, sst: totals.sst, total: totals.total } : row))
                        }}
                        disabled={!isFormEditable}
                      />
                      <Label htmlFor={`item-sst-${idx}`} className="text-xs text-muted-foreground">SST</Label>
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      RM {item.total.toFixed(2)}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(idx)} className="text-destructive hover:text-destructive justify-self-end" disabled={!isFormEditable}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                  <span>Items Total (incl. SST)</span>
                  <span className="font-semibold text-foreground">RM {itemsSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>SST Total</span>
                  <span className="font-semibold text-foreground">RM {itemsTax.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No items added yet</p>
            )}
          </div>
        </div>

        {/* Pricing & Summary (bottom, scroll) */}
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <FileText className="h-5 w-5" />
              Pricing
            </h2>

            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <p className="text-sm font-medium text-amber-900 mb-2">Pricing Summary</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal (before SST):</span>
                    <span className="font-medium">RM {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SST (8%):</span>
                    <span className="font-medium">RM {itemsTax.toFixed(2)}</span>
                  </div>
                  {transportationFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transportation Fee:</span>
                      <span className="font-medium">RM {transportationFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total before discount:</span>
                    <span className="font-medium">RM {totalBeforeDiscount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4">
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
                    className="bg-transparent"
                    onClick={() => setDiscountModalOpen(true)}
                  >
                    Edit Discount
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-foreground">Grand Total</span>
                  <span className="text-foreground">RM {grandTotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Discount applied: RM {discountAmount.toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {/* Order Summary */}
            <div className="mt-6 pt-4 border-t space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Number</span>
                <span className="font-medium text-foreground">{orderMeta.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium text-foreground">{customerData.customerName || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Date</span>
                <span className="font-medium text-foreground">{eventData.eventDate || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium text-foreground">{items.length}</span>
              </div>
            </div>

            {/* Workflow Preview */}
            <div className="mt-6 pt-4 border-t">
              <p className="text-sm font-medium text-foreground mb-3">Workflow for this order:</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-foreground">Sales Confirmation</span>
                  <span className="text-green-600 ml-auto">Required</span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className={`h-4 w-4 ${adHocOptions.requiresPacking ? "text-blue-600" : "text-muted-foreground"}`} />
                  <span className={adHocOptions.requiresPacking ? "text-foreground" : "text-muted-foreground line-through"}>Planning</span>
                  <span className={`ml-auto ${adHocOptions.requiresPacking ? "text-green-600" : "text-muted-foreground"}`}>
                    {adHocOptions.requiresPacking ? "Required" : "Skipped"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Wrench className={`h-4 w-4 ${adHocOptions.requiresSetup ? "text-purple-600" : "text-muted-foreground"}`} />
                  <span className={adHocOptions.requiresSetup ? "text-foreground" : "text-muted-foreground line-through"}>Delivery (Setup)</span>
                  <span className={`ml-auto ${adHocOptions.requiresSetup ? "text-green-600" : "text-muted-foreground"}`}>
                    {adHocOptions.requiresSetup ? "Required" : "Skipped"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck className={`h-4 w-4 ${adHocOptions.requiresDismantle ? "text-orange-600" : "text-muted-foreground"}`} />
                  <span className={adHocOptions.requiresDismantle ? "text-foreground" : "text-muted-foreground line-through"}>Delivery (Dismantle)</span>
                  <span className={`ml-auto ${adHocOptions.requiresDismantle ? "text-green-600" : "text-muted-foreground"}`}>
                    {adHocOptions.requiresDismantle ? "Required" : "Skipped"}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {isEditMode ? (
              <Button onClick={handleSaveOrder} disabled={isSaving} className="w-full mt-6 gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                <FileText className="h-4 w-4" />
                Update Order
              </Button>
            ) : !isFormEditable ? (
              <Button
                onClick={handleEditForm}
                className="w-full mt-6 gap-2 bg-blue-600 text-white hover:bg-blue-700"
              >
                <FileText className="h-4 w-4" />
                Edit Order
              </Button>
            ) : (
              <div className="mt-6 flex gap-3">
                <Button onClick={handleClear} variant="outline" className="flex-1 gap-2 bg-transparent text-destructive border-destructive hover:bg-destructive/10">
                  <RotateCcw className="h-4 w-4" />
                  Clear All
                </Button>
                <Button onClick={handleGeneratePreview} className="flex-1 gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                  <FileText className="h-4 w-4" />
                  Generate Ad Hoc Order
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Ad Hoc Order Preview */}
        {showOrderPreview && (
        <div ref={orderPreviewRef} className="space-y-4">
          <SalesOrderPreview
            salesOrder={{
              id: crypto.randomUUID(),
              orderNumber: orderMeta.orderNumber,
              orderMeta,
              orderSource: "ad-hoc",
              adHocOptions,
              salesOrderDate: getCurrentDate(),
              expirationDate: "",
              status: "scheduling",
              hasIssue: false,
              eventData,
              pricingData,
              customerData,
              items,
              subtotal,
              tax: itemsTax,
              discount: Math.max(0, discountAmount),
              discountType,
              discountAppliesTo,
              total: grandTotal,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            isEditMode={isEditMode}
            showSave={!isEditMode}
            orderSource="ad-hoc"
            isFormLocked={!isFormEditable}
            onEditOrder={handleEditForm}
            onSaveComplete={() => setIsSaved(true)}
          />
        </div>
        )}
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

export default function AdHocOrderPage() {
  return (
    <Suspense fallback={
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    }>
      <AdHocOrderContent />
    </Suspense>
  )
}
