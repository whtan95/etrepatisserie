"use client"

import React, { useMemo, useState } from "react"

import type {
  BrandingData,
  DessertCategory,
  MenuSelectionData,
  CustomisationLevel,
  DrinksOption,
  PackagingOption,
  DessertSize,
  PreferredDesignStyle,
  ColourDirection,
  PreferredFlavour,
} from "@/lib/quote-webpage/quote-types"
import { MENU_CATALOG } from "@/lib/quote-webpage/menu-catalog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, Package, Palette, UtensilsCrossed } from "lucide-react"

const MENU_ITEM_PIECES_PER_UNIT = 30

const categories: Array<{ id: DessertCategory; title: string }> = [
  { id: "savoury", title: "Savoury" },
  { id: "viennoiserie", title: "Viennoiserie" },
  { id: "tart", title: "Tart" },
  { id: "gateaux", title: "Gateaux" },
]

interface BrandingAndMenuProps {
  branding: BrandingData
  setBranding: React.Dispatch<React.SetStateAction<BrandingData>>
  menu: MenuSelectionData
  setMenu: React.Dispatch<React.SetStateAction<MenuSelectionData>>
  estimatedGuests: number
}

export function BrandingAndMenu(_props: BrandingAndMenuProps) {
  const { branding, setBranding, menu, setMenu, estimatedGuests } = _props
  const [expandedCategories, setExpandedCategories] = useState<Set<DessertCategory>>(new Set())

  const selectedCountByCategory = useMemo(() => {
    const result: Record<DessertCategory, number> = {
      savoury: 0,
      viennoiserie: 0,
      tart: 0,
      gateaux: 0,
    }

    for (const category of Object.keys(MENU_CATALOG) as DessertCategory[]) {
      const items = MENU_CATALOG[category]
      result[category] = items.reduce(
        (sum, item) => sum + (menu.itemQuantities[item.id] ?? 0) * MENU_ITEM_PIECES_PER_UNIT,
        0
      )
    }

    return result
  }, [menu.itemQuantities])

  const totalPastriesAndDesserts = categories.reduce((sum, c) => sum + (selectedCountByCategory[c.id] ?? 0), 0)

  const noBrandingRequirement = !branding.includeBrandLogo && !branding.matchBrandColours

  const setNoBrandingRequirement = (checked: boolean) => {
    if (!checked) return
    setBranding((prev) => ({
      ...prev,
      includeBrandLogo: false,
      matchBrandColours: false,
      logoOnDessert: false,
      logoOnPackaging: false,
      logoOnOthers: false,
      logoOnOthersText: "",
      colourOnDessert: false,
      colourOnPackaging: false,
      colourOnOthers: false,
      colourOnOthersText: "",
    }))
  }

  const setIncludeBrandLogo = (checked: boolean) => {
    setBranding((prev) => ({
      ...prev,
      includeBrandLogo: checked,
      ...(checked
        ? {}
        : {
            logoOnDessert: false,
            logoOnPackaging: false,
            logoOnOthers: false,
            logoOnOthersText: "",
          }),
    }))
  }

  const setMatchBrandColours = (checked: boolean) => {
    setBranding((prev) => ({
      ...prev,
      matchBrandColours: checked,
      ...(checked
        ? {}
        : {
            colourOnDessert: false,
            colourOnPackaging: false,
            colourOnOthers: false,
            colourOnOthersText: "",
          }),
    }))
  }

  const readAsDataUrl = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsDataURL(file)
    })
    return dataUrl
  }

  const handleReferenceUpload1: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      setMenu((prev) => ({ ...prev, referenceImage1Name: "", referenceImage1DataUrl: "" }))
      return
    }

    const dataUrl = await readAsDataUrl(file)
    setMenu((prev) => ({ ...prev, referenceImage1Name: file.name, referenceImage1DataUrl: dataUrl }))
  }

  const handleReferenceUpload2: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      setMenu((prev) => ({ ...prev, referenceImage2Name: "", referenceImage2DataUrl: "" }))
      return
    }

    const dataUrl = await readAsDataUrl(file)
    setMenu((prev) => ({ ...prev, referenceImage2Name: file.name, referenceImage2DataUrl: dataUrl }))
  }

  const toggleDrink = (drink: DrinksOption) => {
    setMenu((prev) => {
      const exists = prev.drinks.includes(drink)
      const nextDrinks = exists ? prev.drinks.filter((d) => d !== drink) : [...prev.drinks, drink]
      const nextOtherText = nextDrinks.includes("others") ? prev.drinksOtherText : ""
      return { ...prev, drinks: nextDrinks, drinksOtherText: nextOtherText }
    })
  }

  const setPackaging = (value: PackagingOption) => setMenu((prev) => ({ ...prev, packaging: value }))
  const setSize = (value: DessertSize) => setMenu((prev) => ({ ...prev, dessertSize: value }))

  const setCustomisationLevel = (value: CustomisationLevel) => {
    setMenu((prev) => ({
      ...prev,
      customisationLevel: value,
      customisationNotes: value === "current" ? "" : prev.customisationNotes,
      ...(value === "full"
        ? {}
        : {
            preferredDesignStyle: "",
            colourDirection: "",
            colourDirectionClientSpecifiedText: "",
            preferredFlavour: "",
            preferredFlavourClientSpecifiedText: "",
            referenceImage2Name: "",
            referenceImage2DataUrl: "",
          }),
      ...(value === "current"
        ? {
            referenceImage1Name: "",
            referenceImage1DataUrl: "",
            referenceImage2Name: "",
            referenceImage2DataUrl: "",
          }
        : {}),
    }))
  }

  const setItemQuantity = (_category: DessertCategory, itemId: string, units: number) => {
    const safeUnits = Number.isFinite(units) ? Math.max(0, Math.min(999, Math.floor(units))) : 0
    setMenu((prev) => {
      const nextQuantities = { ...(prev.itemQuantities ?? {}) }
      if (safeUnits <= 0) {
        delete nextQuantities[itemId]
      } else {
        nextQuantities[itemId] = safeUnits
      }

      const nextSelectedCategories = new Set<DessertCategory>()
      for (const cat of Object.keys(MENU_CATALOG) as DessertCategory[]) {
        const hasAny = MENU_CATALOG[cat].some((item) => (nextQuantities[item.id] ?? 0) > 0)
        if (hasAny) nextSelectedCategories.add(cat)
      }

      return { ...prev, itemQuantities: nextQuantities, categories: Array.from(nextSelectedCategories) }
    })
  }

  const setPreferredDesignStyle = (value: PreferredDesignStyle) =>
    setMenu((prev) => ({ ...prev, preferredDesignStyle: value }))

  const setColourDirection = (value: ColourDirection) =>
    setMenu((prev) => ({
      ...prev,
      colourDirection: value,
      colourDirectionClientSpecifiedText: value === "client-specified" ? prev.colourDirectionClientSpecifiedText : "",
    }))

  const setPreferredFlavour = (value: PreferredFlavour) =>
    setMenu((prev) => ({
      ...prev,
      preferredFlavour: value,
      preferredFlavourClientSpecifiedText: value === "client-specified" ? prev.preferredFlavourClientSpecifiedText : "",
    }))

  const toggleCategory = (categoryId: DessertCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Branding */}
      <div className="overflow-hidden rounded-xl border border-accent bg-card shadow-md">
        <div className="border-b border-[#5D2B22] bg-[#5D2B22] px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Palette className="h-4 w-4" />
            Branding
          </h2>
        </div>
        <div className="space-y-4 p-4">
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-foreground">Branding Requirement</h3>

            <div className="grid gap-2">
              <div className="rounded-md border border-border p-2">
                <label className="flex items-start gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={noBrandingRequirement}
                    onCheckedChange={(v) => setNoBrandingRequirement(Boolean(v))}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <span className="cursor-pointer">No branding requirement</span>
                </label>
              </div>

              <div className="space-y-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <label className="flex items-start gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={branding.includeBrandLogo}
                    onCheckedChange={(v) => setIncludeBrandLogo(Boolean(v))}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <span className="cursor-pointer">Include brand logo</span>
                </label>

                {branding.includeBrandLogo && (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-xs font-semibold text-foreground">Logo placement</p>
                    <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={branding.logoOnDessert}
                          onCheckedChange={(v) => setBranding((p) => ({ ...p, logoOnDessert: Boolean(v) }))}
                          className="h-3.5 w-3.5"
                        />
                        <span>dessert</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={branding.logoOnPackaging}
                          onCheckedChange={(v) => setBranding((p) => ({ ...p, logoOnPackaging: Boolean(v) }))}
                          className="h-3.5 w-3.5"
                        />
                        <span>customise packaging</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground md:col-span-2">
                        <Checkbox
                          checked={branding.logoOnOthers}
                          onCheckedChange={(v) => setBranding((p) => ({ ...p, logoOnOthers: Boolean(v) }))}
                          className="h-3.5 w-3.5"
                        />
                        <span>others, please specify</span>
                      </label>
                      {branding.logoOnOthers && (
                        <Input
                          value={branding.logoOnOthersText}
                          onChange={(e) => setBranding((p) => ({ ...p, logoOnOthersText: e.target.value }))}
                          placeholder="Describe other logo requirement"
                          className="h-7 border border-border bg-background text-xs transition-colors focus:border-accent md:col-span-2"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <label className="flex items-start gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={branding.matchBrandColours}
                    onCheckedChange={(v) => setMatchBrandColours(Boolean(v))}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <span className="cursor-pointer">Match brand colours</span>
                </label>

                {branding.matchBrandColours && (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-xs font-semibold text-foreground">Colour matching</p>
                    <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={branding.colourOnDessert}
                          onCheckedChange={(v) => setBranding((p) => ({ ...p, colourOnDessert: Boolean(v) }))}
                          className="h-3.5 w-3.5"
                        />
                        <span>dessert</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={branding.colourOnPackaging}
                          onCheckedChange={(v) => setBranding((p) => ({ ...p, colourOnPackaging: Boolean(v) }))}
                          className="h-3.5 w-3.5"
                        />
                        <span>customise packaging</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground md:col-span-2">
                        <Checkbox
                          checked={branding.colourOnOthers}
                          onCheckedChange={(v) => setBranding((p) => ({ ...p, colourOnOthers: Boolean(v) }))}
                          className="h-3.5 w-3.5"
                        />
                        <span>others, please specify</span>
                      </label>
                      {branding.colourOnOthers && (
                        <Input
                          value={branding.colourOnOthersText}
                          onChange={(e) => setBranding((p) => ({ ...p, colourOnOthersText: e.target.value }))}
                          placeholder="Describe other colour matching requirement"
                          className="h-7 border border-border bg-background text-xs transition-colors focus:border-accent md:col-span-2"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Food & drinks selection */}
      <div className="overflow-hidden rounded-xl border border-accent bg-card shadow-md">
        <div className="border-b border-[#5D2B22] bg-[#5D2B22] px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <UtensilsCrossed className="h-4 w-4" />
            Food and drinks selection
          </h2>
        </div>
        <div className="space-y-4 p-4">
          {/* Step 1 */}
          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Step 1: Level of customisation</p>
            <RadioGroup
              value={menu.customisationLevel}
              onValueChange={(value) => setCustomisationLevel(value as CustomisationLevel)}
              className="grid gap-1.5"
            >
              <div className="flex items-start gap-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <RadioGroupItem value="current" id="custom-current" className="mt-0.5" />
                <Label htmlFor="custom-current" className="cursor-pointer text-xs text-foreground">
                  A) Current menu (same base, same topper)
                </Label>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <RadioGroupItem value="partial" id="custom-partial" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="custom-partial" className="cursor-pointer text-xs text-foreground">
                    B) Partial customise (same base, customise topper, add branding element)
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Please list requirements / upload photo reference.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <RadioGroupItem value="full" id="custom-full" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="custom-full" className="cursor-pointer text-xs text-foreground">
                    C) Fully customise (none from menu)
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    May incur one-time design and development fees. Please list requirements / upload photo reference.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {menu.customisationLevel === "partial" && (
              <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold text-foreground">Partial customise details</p>

                <div className="space-y-1">
                  <Label htmlFor="custom-notes" className="text-xs font-semibold text-foreground">
                    Requirements / Notes
                  </Label>
                  <Textarea
                    id="custom-notes"
                    value={menu.customisationNotes}
                    onChange={(e) => setMenu((p) => ({ ...p, customisationNotes: e.target.value }))}
                    rows={3}
                    placeholder="Describe topper customisation, branding elements, etc. (optional)."
                    className="border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="reference-upload-1" className="text-xs font-semibold text-foreground">
                    Upload Photo Reference (optional)
                  </Label>
                  <Input
                    id="reference-upload-1"
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceUpload1}
                    className="border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                  {menu.referenceImage1DataUrl && (
                    <div className="mt-2 overflow-hidden rounded-md border border-border bg-secondary/30">
                      <img
                        src={menu.referenceImage1DataUrl}
                        alt={menu.referenceImage1Name || "Reference 1"}
                        className="h-32 w-full object-cover"
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">Saved automatically on this device.</p>
                </div>
              </div>
            )}

            {menu.customisationLevel === "full" && (
              <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold text-foreground">Fully customise details</p>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="design-style" className="text-xs font-semibold text-foreground">
                      Preferred Design style
                    </Label>
                    <Select
                      value={menu.preferredDesignStyle}
                      onValueChange={(v) => setPreferredDesignStyle(v as PreferredDesignStyle)}
                    >
                      <SelectTrigger
                        id="design-style"
                        className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                      >
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal-elegant" className="text-xs">
                          Minimal & Elegant
                        </SelectItem>
                        <SelectItem value="modern-bold" className="text-xs">
                          Modern & Bold
                        </SelectItem>
                        <SelectItem value="playful" className="text-xs">
                          Playful
                        </SelectItem>
                        <SelectItem value="luxury-premium" className="text-xs">
                          Luxury / Premium
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="colour-direction" className="text-xs font-semibold text-foreground">
                      Colour Direction
                    </Label>
                    <Select value={menu.colourDirection} onValueChange={(v) => setColourDirection(v as ColourDirection)}>
                      <SelectTrigger
                        id="colour-direction"
                        className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                      >
                        <SelectValue placeholder="Select direction" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brand-colours-only" className="text-xs">
                          Brand colours only
                        </SelectItem>
                        <SelectItem value="neutral-soft" className="text-xs">
                          Neutral palette (soft colours)
                        </SelectItem>
                        <SelectItem value="festive" className="text-xs">
                          Festive colours (eg, CNY, Raya)
                        </SelectItem>
                        <SelectItem value="client-specified" className="text-xs">
                          Client-specified
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {menu.colourDirection === "client-specified" && (
                      <Input
                        value={menu.colourDirectionClientSpecifiedText}
                        onChange={(e) => setMenu((p) => ({ ...p, colourDirectionClientSpecifiedText: e.target.value }))}
                        placeholder="Please specify colour direction"
                        className="h-7 border border-border bg-background text-xs transition-colors focus:border-accent"
                      />
                    )}
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="preferred-flavour" className="text-xs font-semibold text-foreground">
                      Preferred Flavour
                    </Label>
                    <Select value={menu.preferredFlavour} onValueChange={(v) => setPreferredFlavour(v as PreferredFlavour)}>
                      <SelectTrigger
                        id="preferred-flavour"
                        className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                      >
                        <SelectValue placeholder="Select flavour" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chocolate" className="text-xs">
                          Chocolate
                        </SelectItem>
                        <SelectItem value="fruity" className="text-xs">
                          Fruity
                        </SelectItem>
                        <SelectItem value="nutty" className="text-xs">
                          Nutty
                        </SelectItem>
                        <SelectItem value="floral" className="text-xs">
                          Floral
                        </SelectItem>
                        <SelectItem value="client-specified" className="text-xs">
                          Client-specified
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {menu.preferredFlavour === "client-specified" && (
                      <Input
                        value={menu.preferredFlavourClientSpecifiedText}
                        onChange={(e) => setMenu((p) => ({ ...p, preferredFlavourClientSpecifiedText: e.target.value }))}
                        placeholder="Please specify preferred flavour"
                        className="h-7 border border-border bg-background text-xs transition-colors focus:border-accent"
                      />
                    )}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="reference-upload-1" className="text-xs font-semibold text-foreground">
                      Reference photo 1 (required)
                    </Label>
                    <Input
                      id="reference-upload-1"
                      type="file"
                      accept="image/*"
                      onChange={handleReferenceUpload1}
                      className="border border-border bg-background text-xs transition-colors focus:border-accent"
                    />
                    {menu.referenceImage1DataUrl && (
                      <div className="mt-2 overflow-hidden rounded-md border border-border bg-secondary/30">
                        <img
                          src={menu.referenceImage1DataUrl}
                          alt={menu.referenceImage1Name || "Reference 1"}
                          className="h-32 w-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="reference-upload-2" className="text-xs font-semibold text-foreground">
                      Reference photo 2 (required)
                    </Label>
                    <Input
                      id="reference-upload-2"
                      type="file"
                      accept="image/*"
                      onChange={handleReferenceUpload2}
                      className="border border-border bg-background text-xs transition-colors focus:border-accent"
                    />
                    {menu.referenceImage2DataUrl && (
                      <div className="mt-2 overflow-hidden rounded-md border border-border bg-secondary/30">
                        <img
                          src={menu.referenceImage2DataUrl}
                          alt={menu.referenceImage2Name || "Reference 2"}
                          className="h-32 w-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="custom-notes" className="text-xs font-semibold text-foreground">
                    Preference description (optional)
                  </Label>
                  <Textarea
                    id="custom-notes"
                    value={menu.customisationNotes}
                    onChange={(e) => setMenu((p) => ({ ...p, customisationNotes: e.target.value }))}
                    rows={3}
                    placeholder="Describe your preferences (optional)."
                    className="border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                  <p className="text-[10px] text-muted-foreground">For fully customise, please upload 2 photos. Description is optional.</p>
                </div>
              </div>
            )}
          </div>

          {/* Step 2 */}
          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Step 2: Choose items & enter quantity (pieces)</p>
            <p className="text-[10px] text-muted-foreground">
              Enter units (1 = {MENU_ITEM_PIECES_PER_UNIT} pcs, 2 = {MENU_ITEM_PIECES_PER_UNIT * 2} pcs). Applied to all items.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((c) => {
                const isExpanded = expandedCategories.has(c.id)
                const selectedCount = selectedCountByCategory[c.id]
                const categoryItems = MENU_CATALOG[c.id]

                return (
                  <div key={c.id} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-all ${
                        isExpanded
                          ? "rounded-b-none border-accent border-b-0 bg-accent/10"
                          : "border-border bg-background hover:border-accent"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-foreground">{c.title}</p>
                        {selectedCount > 0 && (
                          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                            {selectedCount} pcs
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="space-y-1.5 rounded-b-lg border border-t-0 border-accent bg-card p-2">
                        {categoryItems.map((item) => {
                          const units = menu.itemQuantities[item.id] ?? 0
                          const pieces = units * MENU_ITEM_PIECES_PER_UNIT
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 rounded-md border border-border bg-background p-1.5"
                            >
                              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-secondary/30">
                                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                              </div>

                              <div className="flex flex-1 flex-col gap-1">
                                <p className="text-xs font-medium text-foreground leading-tight">{item.name}</p>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">Units:</span>
                                  <Input
                                    id={`qty-${item.id}`}
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="999"
                                    value={units || ""}
                                    onChange={(e) =>
                                      setItemQuantity(c.id, item.id, parseInt(e.target.value || "0", 10) || 0)
                                    }
                                    placeholder="0"
                                    className="h-6 w-14 border border-border bg-background text-center text-xs transition-colors focus:border-accent"
                                  />
                                  {units > 0 && (
                                    <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">
                                      ({pieces} pcs)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-secondary/40 px-2 py-1">
                          <p className="text-[10px] font-semibold text-muted-foreground">Total {c.title}:</p>
                          <p className="text-xs font-semibold tabular-nums text-foreground">{selectedCount} pcs</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-start gap-2 text-xs">
              <span className="text-muted-foreground">Total Pastries & Desserts:</span>
              <span className="font-semibold tabular-nums text-foreground">{totalPastriesAndDesserts} pcs</span>
            </div>

            {estimatedGuests > 0 && totalPastriesAndDesserts > 0 && (
              <div className="flex items-center justify-start gap-2 text-xs">
                <span className="text-muted-foreground">Average Pastries & Desserts / person:</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {Math.floor(totalPastriesAndDesserts / estimatedGuests)}
                </span>
                <span className="text-muted-foreground">(Guests: {estimatedGuests})</span>
              </div>
            )}
          </div>

          {/* Step 3 */}
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Step 3: Dessert size</p>
            <Select value={menu.dessertSize} onValueChange={(v) => setSize(v as DessertSize)}>
              <SelectTrigger className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent">
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal" className="text-xs">
                  Normal size
                </SelectItem>
                <SelectItem value="mini" className="text-xs">
                  Mini bites
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Step 4 */}
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Step 4: Drinks</p>
            <div className="grid gap-1.5 md:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={menu.drinks.includes("coffee")}
                  onCheckedChange={() => toggleDrink("coffee")}
                  className="h-3.5 w-3.5"
                />
                Coffee
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={menu.drinks.includes("tea")} onCheckedChange={() => toggleDrink("tea")} className="h-3.5 w-3.5" />
                Tea
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={menu.drinks.includes("fizzy")}
                  onCheckedChange={() => toggleDrink("fizzy")}
                  className="h-3.5 w-3.5"
                />
                Fizzy drinks
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={menu.drinks.includes("others")}
                  onCheckedChange={() => toggleDrink("others")}
                  className="h-3.5 w-3.5"
                />
                Others
              </label>
            </div>
            {menu.drinks.includes("others") && (
              <Input
                value={menu.drinksOtherText}
                onChange={(e) => setMenu((p) => ({ ...p, drinksOtherText: e.target.value }))}
                placeholder="Please specify drinks"
                className="h-7 border border-border bg-background text-xs transition-colors focus:border-accent"
              />
            )}
          </div>
        </div>
      </div>

      {/* Packaging */}
      <div className="overflow-hidden rounded-xl border border-accent bg-card shadow-md">
        <div className="border-b border-[#5D2B22] bg-[#5D2B22] px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Package className="h-4 w-4" />
            Packaging
          </h2>
        </div>
        <div className="space-y-4 p-4">
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Packaging Box</p>
            <RadioGroup
              value={menu.packaging}
              onValueChange={(v) => setPackaging(v as PackagingOption)}
              className="grid gap-1.5"
            >
              <div className="flex items-center space-x-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <RadioGroupItem value="customer-own" id="pack-own" />
                <Label htmlFor="pack-own" className="cursor-pointer text-xs text-foreground">
                  Use customer own box
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <RadioGroupItem value="etre-existing" id="pack-etre" />
                <Label htmlFor="pack-etre" className="cursor-pointer text-xs text-foreground">
                  Être existing box
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-md border border-border p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <RadioGroupItem value="premium" id="pack-premium" />
                <Label htmlFor="pack-premium" className="cursor-pointer text-xs text-foreground">
                  Premium box
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      </div>
    </div>
  )
}
