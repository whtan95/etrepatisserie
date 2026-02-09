"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getOfficialQuotationById,
  updateOfficialQuotation,
  type OfficialQuotation,
} from "@/lib/official-quotation-storage"
import { getSalesOrders, saveSalesOrders } from "@/lib/order-storage"
import {
  ArrowLeft,
  Save,
  User,
  MapPin,
  ShoppingCart,
  FileText,
  Search,
  Plus,
  Trash2,
  Eraser,
  RotateCcw,
  Dices,
  Percent,
  X,
  MessageSquare,
  Download,
  Printer,
  Pencil,
  Image as ImageIcon,
} from "lucide-react"
import { MENU_CATALOG } from "@/lib/quote-webpage/menu-catalog"
import type { OrderItem, PricingData, SalesOrder } from "@/lib/types"
import { SST_RATE, MALAYSIAN_STATES } from "@/lib/types"
import type { InventoryItem } from "@/lib/inventory"
import { DEFAULT_INVENTORY_ITEMS } from "@/lib/inventory"
import { getInventoryDbFromLocalStorage, hasInventoryDbInLocalStorage } from "@/lib/inventory-storage"
import { OrderProgress } from "@/components/portal/order-progress"

interface QuotationCustomerData {
  customerName: string
  companyName: string
  phone: string
  email: string
  billingBuildingName: string
  billingAddressGate: string
  billingAddress1: string
  billingAddress2: string
  billingCity: string
  billingPostCode: string
  billingState: string
  deliveryBuildingName: string
  deliveryAddressGate: string
  deliveryAddress1: string
  deliveryAddress2: string
  deliveryCity: string
  deliveryPostCode: string
  deliveryState: string
  specialRequest: string
}

export default function OfficialQuotationDetailPage() {
  const params = useParams<{ quotationId: string }>()
  const router = useRouter()
  const quotationId = typeof params?.quotationId === "string" ? decodeURIComponent(params.quotationId) : ""
  const printRef = useRef<HTMLDivElement>(null)

  const [item, setItem] = useState<OfficialQuotation | null>(null)
  const [requestDraft, setRequestDraft] = useState<OfficialQuotation["request"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [madeBy, setMadeBy] = useState("")
  const [internalNotes, setInternalNotes] = useState("")
  const [quotationDate, setQuotationDate] = useState("")
  const [quotationTime, setQuotationTime] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [showRequestScript, setShowRequestScript] = useState(false)

  const isLocked = (item?.status === "generated" || item?.status === "archived") && !isEditing

  const toISODate = (input: string) => {
    if (!input) return ""
    const d = new Date(input)
    if (Number.isNaN(d.getTime())) return input
    return d.toISOString().slice(0, 10)
  }

  const dayOfWeek = (isoDate: string) => {
    if (!isoDate) return ""
    const d = new Date(isoDate)
    if (Number.isNaN(d.getTime())) return ""
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return days[d.getDay()]
  }

  const generateOrderNumber = () => {
    const prefix = "Q"
    const date = new Date()
    const year = date.getFullYear().toString().slice(-2)
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `${prefix}${year}${month}-${random}`
  }

  // Customer Data
  const [customerData, setCustomerData] = useState<QuotationCustomerData>({
    customerName: "",
    companyName: "",
    phone: "",
    email: "",
    billingBuildingName: "",
    billingAddressGate: "",
    billingAddress1: "",
    billingAddress2: "",
    billingCity: "",
    billingPostCode: "",
    billingState: "Perak",
    deliveryBuildingName: "",
    deliveryAddressGate: "",
    deliveryAddress1: "",
    deliveryAddress2: "",
    deliveryCity: "",
    deliveryPostCode: "",
    deliveryState: "Perak",
    specialRequest: "",
  })

  // Items
  const [items, setItems] = useState<OrderItem[]>([])
  const [catalog, setCatalog] = useState<InventoryItem[]>(DEFAULT_INVENTORY_ITEMS)
  const [catalogCategory, setCatalogCategory] = useState("All")
  const [catalogSearch, setCatalogSearch] = useState("")
  const [selectedCatalogItem, setSelectedCatalogItem] = useState("")
  const [newItemName, setNewItemName] = useState("")
  const [newItemDescription, setNewItemDescription] = useState("")
  const [newItemQty, setNewItemQty] = useState<number>(1)
  const [newItemPrice, setNewItemPrice] = useState<number>(0)
  const [newItemSst, setNewItemSst] = useState<boolean>(false)

  // Discount
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState<"amount" | "percentage">("amount")
  const [discountAppliesTo, setDiscountAppliesTo] = useState<"subtotal" | "total">("total")
  const [discountModalOpen, setDiscountModalOpen] = useState(false)
  const [specialRequestModalOpen, setSpecialRequestModalOpen] = useState(false)
  const [quotationPreviewOpen, setQuotationPreviewOpen] = useState(false)

  // Build menu item name lookup
  const menuItemNameById = useMemo(() => {
    const entries: Array<[string, string]> = []
    for (const list of Object.values(MENU_CATALOG)) {
      for (const it of list) entries.push([it.id, it.name])
    }
    return new Map(entries)
  }, [])

  // Calculate selected menu items from original quotation
  const originalMenuItems = useMemo(() => {
    if (!item) return []
    const menu = (requestDraft ?? item.request).menu
    const pairs = Object.entries(menu.itemQuantities || {})
      .map(([id, qty]) => ({ id, qty }))
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0)
      .sort((a, b) => b.qty - a.qty)
    return pairs.map((x) => ({
      id: x.id,
      qty: x.qty,
      name: menuItemNameById.get(x.id) || x.id,
    }))
  }, [item, menuItemNameById, requestDraft])

  // Load catalog
  useEffect(() => {
    if (hasInventoryDbInLocalStorage()) {
      const db = getInventoryDbFromLocalStorage()
      if (db && db.items.length > 0) {
        setCatalog(db.items)
      }
    }
  }, [])

  // Load quotation data
  useEffect(() => {
    if (!quotationId) {
      setLoading(false)
      return
    }
    const found = getOfficialQuotationById(quotationId)
    if (found) {
      setItem(found)
      setRequestDraft(found.request)
      setShowRequestScript(found.source !== "manual")
      const saved = found.generatedData
      setMadeBy(saved?.madeBy ?? found.createdBy ?? "")
      setInternalNotes(saved?.internalNotes ?? "")
      setDiscount(saved?.discount ?? 0)
      setDiscountType(saved?.discountType ?? "amount")
      setDiscountAppliesTo(saved?.discountAppliesTo ?? "total")
      setIsEditing(false)

      // Parse date and time
      const created = new Date(found.createdAt)
      if (!Number.isNaN(created.getTime())) {
        setQuotationDate(saved?.quotationDate ?? created.toISOString().slice(0, 10))
        setQuotationTime(saved?.quotationTime ?? created.toTimeString().slice(0, 5))
      }

      // Prefill customer data from quotation
      const req = found.request
      setCustomerData(
        saved?.customerData ?? {
          customerName: req.customer.name || "",
          companyName: req.customer.companyName || "",
          phone: req.customer.phone || "",
          email: req.customer.email || "",
          billingBuildingName: "",
          billingAddressGate: "",
          billingAddress1: req.customer.address || "",
          billingAddress2: "",
          billingCity: "",
          billingPostCode: "",
          billingState: "Perak",
          deliveryBuildingName: "",
          deliveryAddressGate: "",
          deliveryAddress1: req.customer.address || "",
          deliveryAddress2: "",
          deliveryCity: "",
          deliveryPostCode: "",
          deliveryState: "Perak",
          specialRequest: req.customer.notes || "",
        },
      )

      // Pre-populate items from menu selection if available
      if (saved?.items?.length) {
        setItems(saved.items)
      } else if (req.menu.itemQuantities && Object.keys(req.menu.itemQuantities).length > 0) {
        const preItems: OrderItem[] = []
        for (const [id, qty] of Object.entries(req.menu.itemQuantities)) {
          if (qty > 0) {
            const menuName = menuItemNameById.get(id) || id
            // Try to find in inventory catalog for price
            const inventoryItem = DEFAULT_INVENTORY_ITEMS.find(
              (inv) => inv.name.toLowerCase() === menuName.toLowerCase()
            )
            preItems.push({
              inventoryId: inventoryItem?.id,
              name: menuName,
              quantity: qty,
              unitPrice: inventoryItem?.normalSizePrice || 0,
              sstApplied: inventoryItem?.defaultSst || false,
              sst: 0,
              total: 0,
            })
          }
        }
        setItems(preItems)
      }
    }
    setLoading(false)
  }, [quotationId, menuItemNameById])

  // Catalog filtering
  const itemCategories = useMemo(() => {
    const cats = new Set<string>()
    catalog.forEach((item) => cats.add(item.category))
    return ["All", ...Array.from(cats).sort()]
  }, [catalog])

  const filteredCatalog = useMemo(() => {
    let filtered = catalog
    if (catalogCategory !== "All") {
      filtered = filtered.filter((item) => item.category === catalogCategory)
    }
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [catalog, catalogCategory, catalogSearch])

  const groupedCatalog = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {}
    filteredCatalog.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    })
    return groups
  }, [filteredCatalog])

  // Handlers
  const handleCatalogItemSelect = (itemId: string) => {
    setSelectedCatalogItem(itemId)
    const found = catalog.find((i) => i.id === itemId)
    if (found) {
      setNewItemName(found.name)
      setNewItemPrice(found.normalSizePrice)
      setNewItemSst(found.defaultSst)
      setNewItemDescription("")
    }
  }

  const handleAddItem = () => {
    if (!newItemName.trim()) return
    if (newItemQty <= 0) return

    const newItem: OrderItem = {
      inventoryId: selectedCatalogItem || undefined,
      name: newItemName.trim(),
      description: newItemDescription.trim() || undefined,
      quantity: newItemQty,
      unitPrice: newItemPrice,
      sstApplied: newItemSst,
      sst: 0,
      total: 0,
    }
    setItems((prev) => [...prev, newItem])

    // Reset form
    setSelectedCatalogItem("")
    setNewItemName("")
    setNewItemDescription("")
    setNewItemQty(1)
    setNewItemPrice(0)
    setNewItemSst(false)
    setCatalogSearch("")
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Clear functions
  const clearDeliveryAddress = () => {
    if (confirm("Clear delivery address?")) {
      setCustomerData((prev) => ({
        ...prev,
        deliveryBuildingName: "",
        deliveryAddressGate: "",
        deliveryAddress1: "",
        deliveryAddress2: "",
        deliveryCity: "",
        deliveryPostCode: "",
        deliveryState: "Perak",
      }))
    }
  }

  const clearBillingAddress = () => {
    if (confirm("Clear billing address?")) {
      setCustomerData((prev) => ({
        ...prev,
        billingBuildingName: "",
        billingAddressGate: "",
        billingAddress1: "",
        billingAddress2: "",
        billingCity: "",
        billingPostCode: "",
        billingState: "Perak",
      }))
    }
  }

  const setDeliverySameAsWebpage = () => {
    if (!item) return
    setCustomerData((prev) => ({
      ...prev,
      deliveryBuildingName: prev.deliveryBuildingName || "",
      deliveryAddressGate: "",
      deliveryAddress1: item.request.customer.address || "",
      deliveryAddress2: "",
      deliveryCity: "",
      deliveryPostCode: "",
      deliveryState: prev.deliveryState || "Perak",
    }))
  }

  const setBillingSameAsDelivery = () => {
    setCustomerData((prev) => ({
      ...prev,
      billingBuildingName: prev.deliveryBuildingName,
      billingAddressGate: prev.deliveryAddressGate,
      billingAddress1: prev.deliveryAddress1,
      billingAddress2: prev.deliveryAddress2,
      billingCity: prev.deliveryCity,
      billingPostCode: prev.deliveryPostCode,
      billingState: prev.deliveryState || "Perak",
    }))
  }

  const clearItems = () => {
    if (confirm("Clear all items?")) {
      setItems([])
    }
  }

  const clearDiscount = () => {
    setDiscount(0)
    setDiscountType("amount")
    setDiscountAppliesTo("total")
  }

  const clearAll = () => {
    if (confirm("Clear all fields?")) {
      setItems([])
      clearDiscount()
      setCustomerData((prev) => ({
        ...prev,
        billingBuildingName: "",
        billingAddressGate: "",
        billingAddress1: "",
        billingAddress2: "",
        billingCity: "",
        billingPostCode: "",
        billingState: "Perak",
        deliveryBuildingName: "",
        deliveryAddressGate: "",
        deliveryAddress1: "",
        deliveryAddress2: "",
        deliveryCity: "",
        deliveryPostCode: "",
        deliveryState: "Perak",
        specialRequest: "",
      }))
    }
  }

  const demoFillManual = () => {
    if (!item) return
    if (item.source !== "manual") return
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const iso = in7.toISOString().slice(0, 10)

    setCustomerData((prev) => ({
      ...prev,
      companyName: "Demo Company",
      customerName: "Demo Customer",
      phone: "012-3456789",
      email: "demo@example.com",
      deliveryBuildingName: "Demo Venue",
      deliveryAddressGate: "",
      deliveryAddress1: "Jalan Demo 1",
      deliveryAddress2: "",
      deliveryCity: "Ipoh",
      deliveryPostCode: "30000",
      deliveryState: "Perak",
      billingBuildingName: "Demo Company HQ",
      billingAddressGate: "",
      billingAddress1: "Jalan Demo 2",
      billingAddress2: "",
      billingCity: "Ipoh",
      billingPostCode: "30000",
      billingState: "Perak",
      specialRequest: "Demo notes: customer prefers early setup.",
    }))

    setRequestDraft((prev) => {
      const base = prev ?? item.request
      return {
        ...base,
        event: {
          ...base.event,
          eventName: "Demo Event",
          eventDate: iso,
          eventType: "Corporate",
          estimatedGuests: 80,
          eventLocation: "others",
          otherAreaName: "Customer venue (demo)",
        },
        customer: {
          ...base.customer,
          address: "Jalan Demo 1, 30000 Ipoh, Perak",
        },
      }
    })

    const sample = (catalog || DEFAULT_INVENTORY_ITEMS).filter((it) => it.category === "Viennoiserie" || it.category === "Petit Gateaux").slice(0, 2)
    if (sample.length) {
      setItems(
        sample.map((it) => ({
          inventoryId: it.id,
          name: it.name,
          description: "",
          quantity: 30,
          unitPrice: it.normalSizePrice || 0,
          sstApplied: it.defaultSst || false,
          sst: 0,
          total: 0,
        })),
      )
    }
  }

  // Calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity
      const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
      return sum + normalizedQty * item.unitPrice
    }, 0)
  }, [items])

  const sstTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity
      const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
      const base = normalizedQty * item.unitPrice
      return sum + (item.sstApplied ? base * SST_RATE : 0)
    }, 0)
  }, [items])

  const totalBeforeDiscount = subtotal + sstTotal

  const discountAmount = useMemo(() => {
    if (discountType === "amount") {
      return Math.min(discount, totalBeforeDiscount)
    }
    return (totalBeforeDiscount * discount) / 100
  }, [discount, discountType, totalBeforeDiscount])

  const grandTotal = Math.max(0, totalBeforeDiscount - discountAmount)

  const saveToStorage = (opts?: { silent?: boolean }) => {
    if (!item) return
    const madeByClean = madeBy.trim() || item.createdBy || "Web form"
    const baseRequest = requestDraft ?? item.request
    const nextRequest: OfficialQuotation["request"] = {
      ...baseRequest,
      customer: {
        ...baseRequest.customer,
        companyName: customerData.companyName || "",
        name: customerData.customerName || "",
        phone: customerData.phone || "",
        email: customerData.email || "",
        notes: customerData.specialRequest || baseRequest.customer.notes || "",
      },
    }
    const generatedData: OfficialQuotation["generatedData"] = {
      quotationDate: quotationDate || toISODate(item.createdAt),
      quotationTime: quotationTime || new Date(item.createdAt).toTimeString().slice(0, 5),
      madeBy: madeByClean,
      internalNotes: internalNotes || "",
      customerData,
      items,
      discount,
      discountType,
      discountAppliesTo,
    }

    updateOfficialQuotation(item.id, (prev) => ({
      ...prev,
      createdBy: madeByClean,
      status: "generated",
      request: nextRequest,
      generatedData,
    }))

    const refreshed = getOfficialQuotationById(item.id)
    if (refreshed) {
      setItem(refreshed)
      setRequestDraft(refreshed.request)
    }
    setIsEditing(false)
    if (!opts?.silent) alert("Quotation saved!")
  }

  // Proceed to Sales order
  const handleProceed = () => {
    if (!item) return
    saveToStorage({ silent: true })

    const refreshed = getOfficialQuotationById(item.id) || item
    const linked = refreshed.linkedOrderNumber
    const existingOrders = getSalesOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    if (linked && existingOrders.some((o) => o.orderNumber === linked)) {
      router.push(`/portal/sales-confirmation?order=${encodeURIComponent(linked)}`)
      return
    }

    const req = refreshed.request
    const setupDate = toISODate(req.event.takeOutSetupDate || req.event.eventDate)
    const returningDate = toISODate(req.event.takeOutDismantleDate || req.event.eventDate)
    const returningRequired = !!req.event.returningRequired

    const budgetFrom = parseFloat(req.event.budgetPerPersonFromRm || "0")
    const budgetTo = parseFloat(req.event.budgetPerPersonToRm || "0")
    const budgetPerHead =
      Number.isFinite(budgetFrom) && Number.isFinite(budgetTo) && (budgetFrom || budgetTo)
        ? Math.round(((budgetFrom + budgetTo) / 2) * 100) / 100
        : Number.isFinite(budgetFrom)
          ? budgetFrom
          : Number.isFinite(budgetTo)
            ? budgetTo
            : undefined

    const areaType =
      req.event.otherVenueType === "outdoor"
        ? "outdoor"
        : req.event.otherVenueType === "indoor"
          ? "indoor"
          : "indoor"

    const pricingData: PricingData = {
      tent10x10: { quantity: 0, color: "White" },
      tent20x20: { quantity: 0, color: "White" },
      tent20x30: { quantity: 0, color: "White" },
      tableSet: 0,
      longTable: { quantity: 0, withSkirting: false },
      extraChairs: 0,
      coolerFan: 0,
      parkingLots: 0,
      transportationFee: 0,
    }

    const normalizedItems = (refreshed.generatedData?.items ?? items).map((it) => {
      const qty = typeof it.quantity === "string" ? parseFloat(it.quantity) : it.quantity
      const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
      const base = normalizedQty * (Number.isFinite(it.unitPrice) ? it.unitPrice : 0)
      const sst = it.sstApplied ? base * SST_RATE : 0
      return {
        ...it,
        quantity: normalizedQty,
        sst,
        total: base + sst,
      }
    })

    const computedSubtotal = normalizedItems.reduce(
      (sum, it) => sum + (it.total - (it.sstApplied ? it.sst : 0)),
      0,
    )
    const computedTax = normalizedItems.reduce((sum, it) => sum + (it.sstApplied ? it.sst : 0), 0)
    const totalBeforeDiscount = computedSubtotal + computedTax
    const discountValue = refreshed.generatedData?.discount ?? discount
    const discountTypeValue = refreshed.generatedData?.discountType ?? discountType
    const discountAmount =
      discountTypeValue === "percentage"
        ? (totalBeforeDiscount * discountValue) / 100
        : Math.min(discountValue, totalBeforeDiscount)
    const computedGrandTotal = Math.max(0, totalBeforeDiscount - Math.max(0, discountAmount))

    const orderNumber = generateOrderNumber()
    const now = new Date()
    const orderDate = refreshed.generatedData?.quotationDate || now.toISOString().slice(0, 10)
    const orderTime = refreshed.generatedData?.quotationTime || now.toTimeString().slice(0, 5)

    const newOrder: SalesOrder = {
      id: crypto.randomUUID(),
      orderNumber,
      orderMeta: {
        orderNumber,
        orderDate,
        orderTime,
        madeBy: (refreshed.generatedData?.madeBy || madeBy || "").trim(),
        position: "Sales",
        isAutoGenerated: true,
      },
      orderSource: "sales",
      salesOrderDate: orderDate,
      expirationDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: "scheduling",
      hasIssue: false,
      eventData: {
        eventName: req.event.eventName || "Event",
        eventDate: toISODate(req.event.eventDate),
        dayOfWeek: dayOfWeek(toISODate(req.event.eventDate)),
        eventType: req.event.eventType || "",
        customerPreferredSetupDate: setupDate,
        setupDayOfWeek: dayOfWeek(setupDate),
        customerPreferredDismantleDate: returningRequired ? returningDate : "",
        dismantleDayOfWeek: returningRequired ? dayOfWeek(returningDate) : "",
        estimatedGuests: Number.isFinite(req.event.estimatedGuests) ? req.event.estimatedGuests : 0,
        budgetPerHead,
        dismantleRequired: returningRequired,
        areaType,
        areaSelection:
          req.event.eventLocation === "etre-cafe-ipoh" || req.event.eventLocation === "etre-cafe-kl"
            ? "Être Café"
            : req.event.otherAreaName || "",
        locationAreaType:
          req.event.eventLocation === "etre-cafe-ipoh" || req.event.eventLocation === "etre-cafe-kl"
            ? "etre-cafe"
            : "other",
        locationAreaOther: req.event.eventLocation === "others" ? (req.event.otherAreaName || "") : undefined,
        duration:
          returningRequired && setupDate && returningDate
            ? Math.max(
                1,
                Math.ceil(
                  (new Date(returningDate).getTime() - new Date(setupDate).getTime()) / (1000 * 60 * 60 * 24),
                ) + 1,
              )
            : 1,
        desiredSetupTime: "",
        desiredDismantleTime: "",
      },
      pricingData,
      customerData: {
        customerName: (refreshed.generatedData?.customerData.customerName || req.customer.name || "").trim(),
        companyName: (refreshed.generatedData?.customerData.companyName || req.customer.companyName || "").trim(),
        phone: (refreshed.generatedData?.customerData.phone || req.customer.phone || "").trim(),
        email: (refreshed.generatedData?.customerData.email || req.customer.email || "").trim(),
        billingAddressGate: refreshed.generatedData?.customerData.billingAddressGate || refreshed.generatedData?.customerData.deliveryAddressGate || "",
        billingAddressJalan: "",
        billingAddressTaman: "",
        billingAddress1: refreshed.generatedData?.customerData.billingAddress1 || refreshed.generatedData?.customerData.deliveryAddress1 || "",
        billingAddress2: refreshed.generatedData?.customerData.billingAddress2 || refreshed.generatedData?.customerData.deliveryAddress2 || "",
        billingCity: refreshed.generatedData?.customerData.billingCity || refreshed.generatedData?.customerData.deliveryCity || "",
        billingAddress: refreshed.generatedData?.customerData.billingAddress1 || refreshed.generatedData?.customerData.deliveryAddress1 || req.customer.address || "",
        billingPostCode: refreshed.generatedData?.customerData.billingPostCode || refreshed.generatedData?.customerData.deliveryPostCode || "",
        billingState: refreshed.generatedData?.customerData.billingState || refreshed.generatedData?.customerData.deliveryState || "Perak",
        billingBuildingName: refreshed.generatedData?.customerData.billingBuildingName || undefined,
        deliveryBuildingName: refreshed.generatedData?.customerData.deliveryBuildingName || undefined,
        deliveryAddressGate: refreshed.generatedData?.customerData.deliveryAddressGate || "",
        deliveryAddressJalan: "",
        deliveryAddressTaman: "",
        deliveryAddress1: refreshed.generatedData?.customerData.deliveryAddress1 || "",
        deliveryAddress2: refreshed.generatedData?.customerData.deliveryAddress2 || "",
        deliveryCity: refreshed.generatedData?.customerData.deliveryCity || "",
        deliveryAddress: refreshed.generatedData?.customerData.deliveryAddress1 || req.customer.address || "",
        deliveryPostCode: refreshed.generatedData?.customerData.deliveryPostCode || "",
        deliveryState: refreshed.generatedData?.customerData.deliveryState || "Perak",
        setupTimeSlot: "",
        dismantleTimeSlot: "",
        specialRequest: refreshed.generatedData?.customerData.specialRequest || req.customer.notes || "",
        photos: [],
      },
      items: normalizedItems,
      subtotal: computedSubtotal,
      tax: computedTax,
      discount: Math.max(0, discountAmount),
      discountType: discountTypeValue,
      discountAppliesTo: refreshed.generatedData?.discountAppliesTo ?? discountAppliesTo,
      total: computedGrandTotal,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    saveSalesOrders([newOrder, ...existingOrders.filter((o) => o.orderNumber !== newOrder.orderNumber)])
    updateOfficialQuotation(refreshed.id, (prev) => ({ ...prev, linkedOrderNumber: newOrder.orderNumber }))
    router.push(`/portal/sales-confirmation?order=${encodeURIComponent(newOrder.orderNumber)}`)
  }

  // Print / Export PDF
  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!quotationId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Missing quotation ID.
      </div>
    )
  }

  if (!item) {
    return (
      <div className="space-y-3">
        <Button variant="secondary" asChild>
          <Link href="/portal/quotation/official-quotation">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Quotation not found in this browser's storage.
        </div>
      </div>
    )
  }

  const req = requestDraft ?? item.request
  const scriptReq = item.request
  const { event, customer, branding, menu } = req
  const {
    event: scriptEvent,
    customer: scriptCustomer,
    branding: scriptBranding,
    menu: scriptMenu,
  } = scriptReq
  const yesNo = (v: boolean) => (v ? "Yes" : "No")
  const categories = (scriptMenu.categories || []).join(", ") || "-"
  const drinks = (scriptMenu.drinks || []).join(", ") || "-"
  const itemLines = Object.entries(scriptMenu.itemQuantities || {})
    .filter(([, qty]) => typeof qty === "number" && qty > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  
    return (
      <div className="space-y-4">
        <OrderProgress
          currentStep="quotation"
          quotationPath="/portal/quotation/official-quotation"
          startFromStep={item?.source === "manual" ? "quotation" : undefined}
        />
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="secondary" asChild>
            <Link href="/portal/quotation/official-quotation">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-lg font-semibold text-foreground">{item.id}</h1>
        </div>
        <div />
      </div>

        <fieldset disabled={isLocked} className={isLocked ? "opacity-95" : ""}>
        {item.source === "webpage" && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-4 print:hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Request script (from Webpage live)</h2>
                <p className="text-xs text-muted-foreground">
                  Optional reference (read-only). Your editable fields are below.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-transparent"
                onClick={() => setShowRequestScript((v) => !v)}
              >
                {showRequestScript ? "Hide" : "Show"}
              </Button>
            </div>

            {showRequestScript && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="text-xs font-semibold text-foreground">Event</div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div><span className="text-foreground font-medium">Event name:</span> {scriptEvent.eventName || "-"}</div>
                    <div><span className="text-foreground font-medium">Event date:</span> {scriptEvent.eventDate || "-"}</div>
                    <div><span className="text-foreground font-medium">Event type:</span> {scriptEvent.eventType || "-"}</div>
                    <div><span className="text-foreground font-medium">Estimated guests:</span> {scriptEvent.estimatedGuests || "-"}</div>
                    <div><span className="text-foreground font-medium">Location:</span> {scriptEvent.eventLocation || "-"}</div>
                    {scriptEvent.otherAreaName && <div><span className="text-foreground font-medium">Other area:</span> {scriptEvent.otherAreaName}</div>}
                    {scriptEvent.otherVenueType && <div><span className="text-foreground font-medium">Venue type:</span> {scriptEvent.otherVenueType}</div>}
                    <div><span className="text-foreground font-medium">Returning required:</span> {yesNo(!!scriptEvent.returningRequired)}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="text-xs font-semibold text-foreground">Customer</div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div><span className="text-foreground font-medium">Company:</span> {scriptCustomer.companyName || "-"}</div>
                    <div><span className="text-foreground font-medium">Name:</span> {scriptCustomer.name || "-"}</div>
                    <div><span className="text-foreground font-medium">Phone:</span> {scriptCustomer.phone || "-"}</div>
                    <div><span className="text-foreground font-medium">Email:</span> {scriptCustomer.email || "-"}</div>
                    <div><span className="text-foreground font-medium">Address:</span> {scriptCustomer.address || "-"}</div>
                    <div><span className="text-foreground font-medium">Notes:</span> {scriptCustomer.notes || "-"}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="text-xs font-semibold text-foreground">Branding</div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div><span className="text-foreground font-medium">Include brand logo:</span> {yesNo(!!scriptBranding.includeBrandLogo)}</div>
                    <div><span className="text-foreground font-medium">Match brand colours:</span> {yesNo(!!scriptBranding.matchBrandColours)}</div>
                    <div><span className="text-foreground font-medium">Logo on dessert:</span> {yesNo(!!scriptBranding.logoOnDessert)}</div>
                    <div><span className="text-foreground font-medium">Logo on packaging:</span> {yesNo(!!scriptBranding.logoOnPackaging)}</div>
                    <div><span className="text-foreground font-medium">Logo on others:</span> {yesNo(!!scriptBranding.logoOnOthers)}{scriptBranding.logoOnOthersText ? ` (${scriptBranding.logoOnOthersText})` : ""}</div>
                    <div><span className="text-foreground font-medium">Colour on dessert:</span> {yesNo(!!scriptBranding.colourOnDessert)}</div>
                    <div><span className="text-foreground font-medium">Colour on packaging:</span> {yesNo(!!scriptBranding.colourOnPackaging)}</div>
                    <div><span className="text-foreground font-medium">Colour on others:</span> {yesNo(!!scriptBranding.colourOnOthers)}{scriptBranding.colourOnOthersText ? ` (${scriptBranding.colourOnOthersText})` : ""}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="text-xs font-semibold text-foreground">Menu</div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div><span className="text-foreground font-medium">Customisation level:</span> {scriptMenu.customisationLevel || "-"}</div>
                    <div><span className="text-foreground font-medium">Customisation notes:</span> {scriptMenu.customisationNotes || "-"}</div>
                    <div><span className="text-foreground font-medium">Dessert size:</span> {scriptMenu.dessertSize || "-"}</div>
                    <div><span className="text-foreground font-medium">Packaging:</span> {scriptMenu.packaging || "-"}</div>
                    <div><span className="text-foreground font-medium">Categories:</span> {categories}</div>
                    <div><span className="text-foreground font-medium">Drinks:</span> {drinks}{scriptMenu.drinksOtherText ? ` (${scriptMenu.drinksOtherText})` : ""}</div>
                  </div>

              {itemLines.length ? (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-foreground mb-2">Requested items</div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    {itemLines.map(([id, qty]) => (
                      <div key={id} className="flex items-center justify-between gap-3">
                        <span className="font-mono">{id}</span>
                        <span className="text-foreground font-medium">{qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No item quantities selected.</div>
              )}

              {scriptMenu.referenceImageDataUrl ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <ImageIcon className="h-4 w-4" />
                    Reference image
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={scriptMenu.referenceImageName || "Reference image"}
                    src={scriptMenu.referenceImageDataUrl}
                    className="max-h-[260px] w-auto rounded-md border border-border bg-background"
                  />
                </div>
              ) : null}
            </div>
              </div>
            )}
          </div>
        )}
      {/* Customer & Event (Editable) */}
      <div className="grid gap-4 lg:grid-cols-2 print:hidden">
        <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden">
          <div className="border-b border-accent/30 bg-accent/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <User className="h-5 w-5" />
              Customer Information
            </h2>
          </div>
          <div className="p-6 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Company name</Label>
              <Input
                value={customerData.companyName}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, companyName: e.target.value }))}
                placeholder="Company"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contact name</Label>
              <Input
                value={customerData.customerName}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, customerName: e.target.value }))}
                placeholder="Name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                value={customerData.phone}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                value={customerData.email}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Address (general)</Label>
              <Input
                value={customer.address || ""}
                onChange={(e) =>
                  setRequestDraft((prev) => {
                    const base = prev ?? item.request
                    return { ...base, customer: { ...base.customer, address: e.target.value } }
                  })
                }
                placeholder="Address"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden">
          <div className="border-b border-accent/30 bg-accent/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <FileText className="h-5 w-5" />
              Event Details
            </h2>
          </div>
          <div className="p-6 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Event name</Label>
              <Input
                value={event.eventName || ""}
                onChange={(e) =>
                  setRequestDraft((prev) => {
                    const base = prev ?? item.request
                    return { ...base, event: { ...base.event, eventName: e.target.value } }
                  })
                }
                placeholder="Event name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Event date</Label>
              <Input
                type="date"
                value={toISODate(event.eventDate || "")}
                onChange={(e) =>
                  setRequestDraft((prev) => {
                    const base = prev ?? item.request
                    return { ...base, event: { ...base.event, eventDate: e.target.value } }
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Event type</Label>
              <Input
                value={event.eventType || ""}
                onChange={(e) =>
                  setRequestDraft((prev) => {
                    const base = prev ?? item.request
                    return { ...base, event: { ...base.event, eventType: e.target.value } }
                  })
                }
                placeholder="Type"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estimated guests</Label>
              <Input
                type="number"
                min={0}
                value={Number.isFinite(event.estimatedGuests) ? String(event.estimatedGuests) : "0"}
                onChange={(e) =>
                  setRequestDraft((prev) => {
                    const base = prev ?? item.request
                    const guests = Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0)
                    return { ...base, event: { ...base.event, estimatedGuests: guests } }
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Select
                value={event.eventLocation || "__none__"}
                onValueChange={(v) =>
                  setRequestDraft((prev) => {
                    const base = prev ?? item.request
                    const next = (v === "__none__" ? "" : v) as typeof base.event.eventLocation
                    return {
                      ...base,
                      event: {
                        ...base.event,
                        eventLocation: next,
                        otherAreaName: next === "others" ? base.event.otherAreaName : "",
                      },
                    }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-</SelectItem>
                  <SelectItem value="etre-cafe-ipoh">Être Café (Ipoh)</SelectItem>
                  <SelectItem value="etre-cafe-kl">Être Café (KL)</SelectItem>
                  <SelectItem value="others">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {event.eventLocation === "others" && (
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Other area / venue</Label>
                <Input
                  value={event.otherAreaName || ""}
                  onChange={(e) =>
                    setRequestDraft((prev) => {
                      const base = prev ?? item.request
                      return { ...base, event: { ...base.event, otherAreaName: e.target.value } }
                    })
                  }
                  placeholder="Enter area / venue"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 md:col-span-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Returning required</div>
                <div className="text-xs text-muted-foreground truncate">Does the setup require dismantle / return.</div>
              </div>
              <Switch
                checked={Boolean(event.returningRequired)}
                onCheckedChange={(v) =>
                  setRequestDraft((prev) => {
                    const base = prev ?? item.request
                    return { ...base, event: { ...base.event, returningRequired: v } }
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Address (Editable) */}
      <div className="grid gap-4 lg:grid-cols-2 print:hidden">
        {/* Delivery Address */}
        <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/30 bg-accent/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <MapPin className="h-5 w-5" />
              Delivery Address
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={isLocked}
                onClick={setDeliverySameAsWebpage}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Same as webpage quotation
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isLocked}
                onClick={clearDeliveryAddress}
                className="gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Eraser className="h-3 w-3" />
                Clear
              </Button>
            </div>
          </div>
          <div className="p-6 space-y-3">
            <Input
              disabled={isLocked}
              value={customerData.deliveryBuildingName}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, deliveryBuildingName: e.target.value }))}
              placeholder="Building Name"
            />
            <div className="grid grid-cols-4 gap-2">
              <Input
                disabled={isLocked}
                value={customerData.deliveryAddressGate}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, deliveryAddressGate: e.target.value }))}
                placeholder="Gate No"
              />
              <Input
                disabled={isLocked}
                value={customerData.deliveryAddress1}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, deliveryAddress1: e.target.value }))}
                placeholder="Address 1"
                className="col-span-3"
              />
            </div>
            <Input
              disabled={isLocked}
              value={customerData.deliveryAddress2}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, deliveryAddress2: e.target.value }))}
              placeholder="Address 2"
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                disabled={isLocked}
                value={customerData.deliveryPostCode}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, deliveryPostCode: e.target.value }))}
                placeholder="Post Code"
              />
              <Input
                disabled={isLocked}
                value={customerData.deliveryCity}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, deliveryCity: e.target.value }))}
                placeholder="City"
              />
              <Select
                disabled={isLocked}
                value={customerData.deliveryState}
                onValueChange={(v) => setCustomerData((prev) => ({ ...prev, deliveryState: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  {MALAYSIAN_STATES.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Billing Address */}
        <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/30 bg-accent/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <MapPin className="h-5 w-5" />
              Billing Address
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={isLocked}
                onClick={setBillingSameAsDelivery}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Same as delivery address
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isLocked}
                onClick={clearBillingAddress}
                className="gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Eraser className="h-3 w-3" />
                Clear
              </Button>
            </div>
          </div>
          <div className="p-6 space-y-3">
            <Input
              disabled={isLocked}
              value={customerData.billingBuildingName}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, billingBuildingName: e.target.value }))}
              placeholder="Building Name"
            />
            <div className="grid grid-cols-4 gap-2">
              <Input
                disabled={isLocked}
                value={customerData.billingAddressGate}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, billingAddressGate: e.target.value }))}
                placeholder="Gate No"
              />
              <Input
                disabled={isLocked}
                value={customerData.billingAddress1}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, billingAddress1: e.target.value }))}
                placeholder="Address 1"
                className="col-span-3"
              />
            </div>
            <Input
              disabled={isLocked}
              value={customerData.billingAddress2}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, billingAddress2: e.target.value }))}
              placeholder="Address 2"
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                disabled={isLocked}
                value={customerData.billingPostCode}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, billingPostCode: e.target.value }))}
                placeholder="Post Code"
              />
              <Input
                disabled={isLocked}
                value={customerData.billingCity}
                onChange={(e) => setCustomerData((prev) => ({ ...prev, billingCity: e.target.value }))}
                placeholder="City"
              />
              <Select
                disabled={isLocked}
                value={customerData.billingState}
                onValueChange={(v) => setCustomerData((prev) => ({ ...prev, billingState: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  {MALAYSIAN_STATES.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Add Items (Editable) */}
      <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden print:hidden">
        <div className="flex items-center justify-between border-b border-accent/30 bg-accent/10 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShoppingCart className="h-5 w-5" />
            Items
          </h2>
          <Button variant="ghost" size="sm" onClick={clearItems} className="gap-1 text-xs text-muted-foreground hover:text-destructive">
            <Eraser className="h-3 w-3" />
            Clear
          </Button>
        </div>
        <div className="p-6 space-y-4">
          {/* Add Item Form */}
          <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
            <h3 className="text-sm font-medium">Add Item</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={catalogCategory} onValueChange={setCatalogCategory}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  {itemCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search items..."
                  className="pl-9"
                />
              </div>
              <Select value={selectedCatalogItem} onValueChange={handleCatalogItemSelect}>
                <SelectTrigger><SelectValue placeholder="Select from catalog" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedCatalog).map(([category, categoryItems]) => (
                    <SelectGroup key={category}>
                      <SelectLabel>{category}</SelectLabel>
                      {categoryItems.map((catItem) => (
                        <SelectItem key={catItem.id} value={catItem.id}>
                          {catItem.name} - RM{catItem.normalSizePrice.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-12 items-end">
              <div className="md:col-span-4 space-y-1">
                <Label className="text-xs">Item Name</Label>
                <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Item name" />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={newItemDescription} onChange={(e) => setNewItemDescription(e.target.value)} placeholder="Optional" />
              </div>
              <div className="md:col-span-1 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min="1" value={newItemQty} onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)} />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">Price (RM)</Label>
                <Input type="number" min="0" step="0.01" value={newItemPrice} onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="md:col-span-1 flex items-center gap-2">
                <Switch checked={newItemSst} onCheckedChange={setNewItemSst} />
                <Label className="text-xs">SST</Label>
              </div>
              <div className="md:col-span-2">
                <Button onClick={handleAddItem} className="w-full gap-1"><Plus className="h-4 w-4" />Add</Button>
              </div>
            </div>
          </div>

          {/* Items Table */}
          {items.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No items added yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-secondary/30">
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">SST</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-center font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((orderItem, index) => {
                    const qty = typeof orderItem.quantity === "string" ? parseFloat(orderItem.quantity) : orderItem.quantity
                    const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
                    const base = normalizedQty * orderItem.unitPrice
                    const sst = orderItem.sstApplied ? base * SST_RATE : 0
                    const lineTotal = base + sst
                    return (
                      <tr key={index} className="text-sm">
                        <td className="px-3 py-2">{orderItem.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{orderItem.description || "-"}</td>
                        <td className="px-3 py-2 text-right">{normalizedQty}</td>
                        <td className="px-3 py-2 text-right">RM{orderItem.unitPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">RM{sst.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium">RM{lineTotal.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeItem(index)} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Special Request & Discount (Editable) */}
      <div className="grid gap-4 lg:grid-cols-2 print:hidden">
        <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-accent/30 bg-accent/10 px-6 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare className="h-4 w-4" />
              Special Request
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setSpecialRequestModalOpen(true)} className="gap-1 text-xs">Edit</Button>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{customerData.specialRequest || "No special request."}</p>
          </div>
        </div>

        <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-accent/30 bg-accent/10 px-6 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Percent className="h-4 w-4" />
              Discount
            </h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={clearDiscount} className="gap-1 text-xs text-muted-foreground hover:text-destructive">
                <Eraser className="h-3 w-3" />Clear
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDiscountModalOpen(true)} className="gap-1 text-xs">Edit</Button>
            </div>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              {discount > 0 ? `${discountType === "percentage" ? `${discount}%` : `RM${discount.toFixed(2)}`} off ${discountAppliesTo}` : "No discount applied."}
            </p>
          </div>
        </div>
      </div>

      {/* Quotation Summary */}
      <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden">
        <div className="border-b border-accent/30 bg-accent/10 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FileText className="h-5 w-5" />
            Quotation Summary
          </h2>
        </div>
        <div className="p-6">
          {/* Print-friendly items table */}
          <div className="hidden print:block mb-6">
            <table className="w-full border-collapse border border-border">
              <thead className="bg-secondary/30">
                <tr className="text-xs">
                  <th className="px-3 py-2 text-left font-medium border border-border">Item</th>
                  <th className="px-3 py-2 text-right font-medium border border-border">Qty</th>
                  <th className="px-3 py-2 text-right font-medium border border-border">Price</th>
                  <th className="px-3 py-2 text-right font-medium border border-border">SST</th>
                  <th className="px-3 py-2 text-right font-medium border border-border">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((orderItem, index) => {
                  const qty = typeof orderItem.quantity === "string" ? parseFloat(orderItem.quantity) : orderItem.quantity
                  const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
                  const base = normalizedQty * orderItem.unitPrice
                  const sst = orderItem.sstApplied ? base * SST_RATE : 0
                  const lineTotal = base + sst
                  return (
                    <tr key={index} className="text-sm">
                      <td className="px-3 py-2 border border-border">{orderItem.name}</td>
                      <td className="px-3 py-2 text-right border border-border">{normalizedQty}</td>
                      <td className="px-3 py-2 text-right border border-border">RM{orderItem.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right border border-border">RM{sst.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right border border-border">RM{lineTotal.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="max-w-md ml-auto space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (before SST):</span>
              <span>RM{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SST (8%):</span>
              <span>RM{sstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total before discount:</span>
              <span>RM{totalBeforeDiscount.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount:</span>
                <span>- RM{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
              <span>Grand Total:</span>
              <span>RM{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quotation Order Information (Editable) */}
      <div className="rounded-lg border-2 border-accent/50 bg-card overflow-hidden print:hidden">
        <div className="border-b border-accent/30 bg-accent/10 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FileText className="h-5 w-5" />
            Quotation Order Information
          </h2>
        </div>
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Quotation Number</Label>
              <Input value={item.id} readOnly className="font-mono text-xs bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quotation Date</Label>
              <Input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quotation Time</Label>
              <Input type="time" value={quotationTime} onChange={(e) => setQuotationTime(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Made By</Label>
              <Input value={madeBy} onChange={(e) => setMadeBy(e.target.value)} placeholder="Your name" className="text-xs" />
            </div>
          </div>
        </div>
      </div>

      </fieldset>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-end print:hidden">
        {item.source === "manual" && !isLocked && (
          <Button variant="outline" onClick={demoFillManual} className="gap-2">
            <Dices className="h-4 w-4" />
            Demo Fill
          </Button>
        )}
        <Button variant="outline" onClick={() => setQuotationPreviewOpen(true)} className="gap-2">
          <FileText className="h-4 w-4" />
          Generate Quotation
        </Button>
        <Button variant="outline" onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Print / PDF
        </Button>
        <Button variant="outline" onClick={clearAll} className="gap-2" disabled={isLocked}>
          <RotateCcw className="h-4 w-4" />
          Clear All
        </Button>
        {isLocked ? (
          <Button variant="secondary" onClick={() => setIsEditing(true)} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => saveToStorage()} className="gap-2">
            <Save className="h-4 w-4" />
            Save
          </Button>
        )}
        <Button onClick={handleProceed} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
          <FileText className="h-4 w-4" />
          Proceed to Sales order
        </Button>
      </div>

      {/* Special Request Modal */}
      {specialRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Special Request / Notes</h3>
              <button onClick={() => setSpecialRequestModalOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <Textarea
              value={customerData.specialRequest}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, specialRequest: e.target.value }))}
              placeholder="Any special requirements or notes..."
              rows={10}
              disabled={isLocked}
            />
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setSpecialRequestModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {discountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Discount</h3>
              <button onClick={() => setDiscountModalOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Discount Applies To</Label>
                <Select value={discountAppliesTo} onValueChange={(v: "subtotal" | "total") => setDiscountAppliesTo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subtotal">Subtotal (before SST)</SelectItem>
                    <SelectItem value="total">Total (after SST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Discount Type</Label>
                <Select value={discountType} onValueChange={(v: "amount" | "percentage") => setDiscountType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Fixed Amount (RM)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Discount Value</Label>
                <Input
                  type="number"
                  min="0"
                  step={discountType === "percentage" ? "1" : "0.01"}
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount Amount:</span>
                <span className="font-medium">RM{discountAmount.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setDiscountModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Quotation Preview Modal */}
      {quotationPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-lg border border-border bg-white p-0 my-8 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
              <h3 className="text-lg font-semibold">Quotation Preview</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <button onClick={() => setQuotationPreviewOpen(false)}><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="p-8 bg-white text-black">
              {/* Header */}
              <div className="mb-8 flex items-start justify-between border-b-4 border-yellow-400 pb-6">
                <div>
                  <h1 className="text-2xl font-bold">Être Patisserie</h1>
                  <p className="text-sm text-gray-500">Artisan Pastry & Bakery</p>
                  <p className="mt-2 text-sm text-gray-500">Malaysia</p>
                </div>
                <div className="text-right">
                  <h2 className="text-3xl font-bold">QUOTATION</h2>
                  <p className="mt-1 text-lg font-medium">{item?.id}</p>
                  <p className="text-sm text-gray-500">{quotationDate}</p>
                </div>
              </div>

              {/* Customer & Event Info */}
              <div className="mb-6 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider border-b pb-1">Customer Information</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Company:</span> {customerData.companyName || customer.companyName || "-"}</p>
                    <p><span className="text-gray-500">Contact:</span> {customerData.customerName || customer.name || "-"}</p>
                    <p><span className="text-gray-500">Phone:</span> {customerData.phone || customer.phone || "-"}</p>
                    <p><span className="text-gray-500">Email:</span> {customerData.email || customer.email || "-"}</p>
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider border-b pb-1">Event Details</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Event:</span> {event.eventName || "-"}</p>
                    <p><span className="text-gray-500">Date:</span> {event.eventDate || "-"}</p>
                    <p><span className="text-gray-500">Type:</span> {event.eventType || "-"}</p>
                    <p><span className="text-gray-500">Guests:</span> {event.estimatedGuests || 0}</p>
                  </div>
                </div>
              </div>

              {/* Addresses */}
              <div className="mb-6 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider border-b pb-1">Delivery Address</h3>
                  <p className="text-sm">
                    {[customerData.deliveryBuildingName, customerData.deliveryAddressGate, customerData.deliveryAddress1, customerData.deliveryAddress2, customerData.deliveryCity, customerData.deliveryPostCode, customerData.deliveryState].filter(Boolean).join(", ") || "-"}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider border-b pb-1">Billing Address</h3>
                  <p className="text-sm">
                    {[customerData.billingBuildingName, customerData.billingAddressGate, customerData.billingAddress1, customerData.billingAddress2, customerData.billingCity, customerData.billingPostCode, customerData.billingState].filter(Boolean).join(", ") || "-"}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider border-b pb-1">Order Details</h3>
                <table className="w-full border-collapse">
                  <thead className="bg-gray-100">
                    <tr className="text-xs">
                      <th className="px-3 py-2 text-left font-semibold border">Item</th>
                      <th className="px-3 py-2 text-center font-semibold border">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold border">Unit Price</th>
                      <th className="px-3 py-2 text-right font-semibold border">SST (8%)</th>
                      <th className="px-3 py-2 text-right font-semibold border">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((orderItem, index) => {
                      const qty = typeof orderItem.quantity === "string" ? parseFloat(orderItem.quantity) : orderItem.quantity
                      const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
                      const base = normalizedQty * orderItem.unitPrice
                      const sst = orderItem.sstApplied ? base * SST_RATE : 0
                      const lineTotal = base + sst
                      return (
                        <tr key={index} className="text-sm">
                          <td className="px-3 py-2 border">{orderItem.name}{orderItem.description && <span className="text-gray-500 text-xs ml-1">({orderItem.description})</span>}</td>
                          <td className="px-3 py-2 text-center border">{normalizedQty}</td>
                          <td className="px-3 py-2 text-right border">RM {orderItem.unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right border">{sst > 0 ? `RM ${sst.toFixed(2)}` : "-"}</td>
                          <td className="px-3 py-2 text-right font-medium border">RM {lineTotal.toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="ml-auto w-72 space-y-2 text-sm">
                <div className="flex justify-between border-b pb-1">
                  <span className="text-gray-500">Subtotal:</span>
                  <span>RM {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-gray-500">SST (8%):</span>
                  <span>RM {sstTotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between border-b pb-1 text-green-600">
                    <span>Discount:</span>
                    <span>- RM {discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-lg font-bold">
                  <span>Total:</span>
                  <span>RM {grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Special Request */}
              {customerData.specialRequest && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider border-b pb-1">Special Request / Notes</h3>
                  <p className="text-sm bg-gray-50 p-3 rounded">{customerData.specialRequest}</p>
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 border-t pt-4 text-center text-xs text-gray-500">
                <p>This quotation is valid for 14 days from the date of issue.</p>
                <p className="mt-1">Thank you for choosing Être Patisserie</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .space-y-4, .space-y-4 * {
            visibility: visible;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  )
}
