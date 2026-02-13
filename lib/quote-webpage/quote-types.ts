export type EventLocation = "etre-cafe-kl" | "etre-cafe-ipoh" | "others" | ""
export type VenueType = "indoor" | "outdoor" | ""

export type EventType =
  | "internal-corporate"
  | "client-facing-corporate"
  | "vip-pr"
  | "private"
  | "others"
  | ""

export type DessertCategory = "savoury" | "viennoiserie" | "tart" | "gateaux"
export type DessertSize = "normal" | "mini" | ""

export type DrinksOption = "coffee" | "tea" | "fizzy" | "others"

export type PackagingOption = "customer-own" | "etre-existing" | "premium" | ""

export type CustomisationLevel = "current" | "partial" | "full" | ""

export type PreferredDesignStyle = "minimal-elegant" | "modern-bold" | "playful" | "luxury-premium" | ""
export type ColourDirection = "brand-colours-only" | "neutral-soft" | "festive" | "client-specified" | ""
export type PreferredFlavour = "chocolate" | "fruity" | "nutty" | "floral" | "client-specified" | ""

export interface EventData {
  eventName: string
  eventDate: string
  eventType: EventType
  otherEventType: string
  estimatedGuests: number

  takeOutSetupDate: string
  takeOutDismantleDate: string

  budgetPerPersonFromRm: string
  budgetPerPersonToRm: string

  eventLocation: EventLocation
  otherAreaName: string
  otherVenueType: VenueType
}

export interface BrandingData {
  includeBrandLogo: boolean
  matchBrandColours: boolean

  // For includeBrandLogo
  logoOnDessert: boolean
  logoOnPackaging: boolean
  logoOnOthers: boolean
  logoOnOthersText: string

  // For matchBrandColours
  colourOnDessert: boolean
  colourOnPackaging: boolean
  colourOnOthers: boolean
  colourOnOthersText: string
}

export interface MenuSelectionData {
  customisationLevel: CustomisationLevel
  customisationNotes: string
  referenceImage1Name: string
  referenceImage1DataUrl: string
  referenceImage2Name: string
  referenceImage2DataUrl: string

  // Only for Fully customise
  preferredDesignStyle: PreferredDesignStyle
  colourDirection: ColourDirection
  colourDirectionClientSpecifiedText: string
  preferredFlavour: PreferredFlavour
  preferredFlavourClientSpecifiedText: string

  categories: DessertCategory[]
  itemQuantities: Record<string, number>
  dessertSize: DessertSize

  drinks: DrinksOption[]
  drinksOtherText: string

  packaging: PackagingOption
}

export interface CustomerData {
  companyName: string
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

export interface QuoteRequestData {
  event: EventData
  branding: BrandingData
  menu: MenuSelectionData
  customer: CustomerData
}
