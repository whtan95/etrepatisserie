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
} from "@/lib/quote-webpage/quote-types"
import { MENU_CATALOG } from "@/lib/quote-webpage/menu-catalog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, Palette, UtensilsCrossed } from "lucide-react"

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
}

export function BrandingAndMenu({ branding, setBranding, menu, setMenu }: BrandingAndMenuProps) {
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
      result[category] = items.reduce((sum, item) => sum + (menu.itemQuantities[item.id] ?? 0), 0)
    }

    return result
  }, [menu.itemQuantities])

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

  const handleReferenceUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      setMenu((prev) => ({ ...prev, referenceImageName: "", referenceImageDataUrl: "" }))
      return
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsDataURL(file)
    })

    setMenu((prev) => ({ ...prev, referenceImageName: file.name, referenceImageDataUrl: dataUrl }))
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
    }))
  }

  const setItemQuantity = (category: DessertCategory, itemId: string, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.min(9999, quantity)) : 0
    setMenu((prev) => {
      const nextQuantities = { ...(prev.itemQuantities ?? {}) }
      if (safeQuantity <= 0) {
        delete nextQuantities[itemId]
      } else {
        nextQuantities[itemId] = safeQuantity
      }

      const nextSelectedCategories = new Set<DessertCategory>()
      for (const cat of Object.keys(MENU_CATALOG) as DessertCategory[]) {
        const hasAny = MENU_CATALOG[cat].some((item) => (nextQuantities[item.id] ?? 0) > 0)
        if (hasAny) nextSelectedCategories.add(cat)
      }

      return {
        ...prev,
        itemQuantities: nextQuantities,
        categories: Array.from(nextSelectedCategories),
      }
    })
  }

  const toggleCategory = (categoryId: DessertCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-accent bg-card shadow-md">
      <div className="border-b border-[#5D2B22] bg-[#5D2B22] px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <UtensilsCrossed className="h-4 w-4" />
          Branding & Menu Selection
        </h2>
      </div>

      <div className="space-y-4 p-4">
        {/* Branding Requirements */}
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

        {/* Preferred menu selection */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Palette className="h-3 w-3" />
            Preferred Menu Selection
          </h3>

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

            <div className="grid gap-2 md:grid-cols-2">
              {menu.customisationLevel !== "current" && (
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="custom-notes" className="text-xs font-semibold text-foreground">
                    Requirements / Notes
                  </Label>
                  <Textarea
                    id="custom-notes"
                    value={menu.customisationNotes}
                    onChange={(e) => setMenu((p) => ({ ...p, customisationNotes: e.target.value }))}
                    rows={3}
                    placeholder="List your requirement(s) or describe your reference."
                    className="border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                </div>
              )}

              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="reference-upload" className="text-xs font-semibold text-foreground">
                  Upload Photo Reference (optional)
                </Label>
                <Input
                  id="reference-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleReferenceUpload}
                  className="border border-border bg-background text-xs transition-colors focus:border-accent"
                />
                {menu.referenceImageDataUrl && (
                  <div className="mt-2 overflow-hidden rounded-md border border-border bg-secondary/30">
                    <img
                      src={menu.referenceImageDataUrl}
                      alt={menu.referenceImageName || "Reference"}
                      className="h-32 w-full object-cover"
                    />
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">Saved automatically on this device.</p>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">
              Step 2: Choose items & enter quantity (pieces)
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((c) => {
                const isExpanded = expandedCategories.has(c.id)
                const selectedCount = selectedCountByCategory[c.id]
                const categoryItems = MENU_CATALOG[c.id]

                return (
                  <div key={c.id} className="flex flex-col">
                    {/* Category Header Button */}
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
                            {selectedCount}
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        className={`h-3 w-3 text-muted-foreground transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* Dropdown Content */}
                    {isExpanded && (
                      <div className="rounded-b-lg border border-t-0 border-accent bg-card p-2 space-y-1.5">
                        {categoryItems.map((item) => {
                          const value = menu.itemQuantities[item.id] ?? 0
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 rounded-md border border-border bg-background p-1.5"
                            >
                              {/* Item Image - Medium */}
                              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-secondary/30">
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>

                              {/* Item Name & Quantity */}
                              <div className="flex flex-1 flex-col gap-1">
                                <p className="text-xs font-medium text-foreground leading-tight">{item.name}</p>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">Qty:</span>
                                  <Input
                                    id={`qty-${item.id}`}
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="9999"
                                    value={value || ""}
                                    onChange={(e) =>
                                      setItemQuantity(c.id, item.id, parseInt(e.target.value || "0", 10) || 0)
                                    }
                                    placeholder="0"
                                    className="h-6 w-14 border border-border bg-background text-center text-xs transition-colors focus:border-accent"
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step 3 */}
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Step 3: Dessert size</p>
            <Select value={menu.dessertSize} onValueChange={(v) => setSize(v as DessertSize)}>
              <SelectTrigger className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent">
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal" className="text-xs">Normal size</SelectItem>
                <SelectItem value="mini" className="text-xs">Mini bites</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Step 4 */}
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Step 4: Drinks</p>
            <div className="grid gap-1.5 md:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={menu.drinks.includes("coffee")} onCheckedChange={() => toggleDrink("coffee")} className="h-3.5 w-3.5" />
                Coffee
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={menu.drinks.includes("tea")} onCheckedChange={() => toggleDrink("tea")} className="h-3.5 w-3.5" />
                Tea
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={menu.drinks.includes("fizzy")} onCheckedChange={() => toggleDrink("fizzy")} className="h-3.5 w-3.5" />
                Fizzy drinks
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={menu.drinks.includes("others")} onCheckedChange={() => toggleDrink("others")} className="h-3.5 w-3.5" />
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

          {/* Step 5 */}
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Step 5: Packaging Box</p>
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
