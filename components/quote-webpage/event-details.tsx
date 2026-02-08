"use client"

import React from "react"

import type { EventData, EventLocation, VenueType } from "@/lib/quote-webpage/quote-types"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { MapPin, Calendar, Users, Building2, Info } from "lucide-react"

interface EventDetailsProps {
  eventData: EventData
  setEventData: React.Dispatch<React.SetStateAction<EventData>>
}

export function EventDetails({ eventData, setEventData }: EventDetailsProps) {
  return (
    <TooltipProvider>
      <div className="overflow-hidden rounded-xl border border-accent bg-card shadow-md">
        <div className="border-b border-[#5D2B22] bg-[#5D2B22] px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Calendar className="h-4 w-4" />
            Event Details
          </h2>
        </div>

        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="event-name" className="text-xs font-semibold text-foreground">
                Event Name
              </Label>
              <Input
                id="event-name"
                type="text"
                value={eventData.eventName}
                onChange={(e) => setEventData((prev) => ({ ...prev, eventName: e.target.value }))}
                placeholder="e.g., Company Anniversary / Birthday Party"
                className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event-date" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Calendar className="h-3 w-3" />
                Event Date
              </Label>
              <Input
                id="event-date"
                type="date"
                value={eventData.eventDate}
                onChange={(e) => setEventData((prev) => ({ ...prev, eventDate: e.target.value }))}
                className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event-type" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                Event Type
                <Tooltip>
                  <TooltipTrigger type="button">
                    <Info className="h-3 w-3 text-white/80" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">If unsure, choose &quot;Others&quot; and explain in notes.</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={eventData.eventType}
                onValueChange={(value) => setEventData((prev) => ({ ...prev, eventType: value }))}
              >
                <SelectTrigger className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent">
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Private Event" className="text-xs">Private Event</SelectItem>
                  <SelectItem value="Wedding" className="text-xs">Wedding</SelectItem>
                  <SelectItem value="Corporate" className="text-xs">Corporate</SelectItem>
                  <SelectItem value="Festive" className="text-xs">Festive</SelectItem>
                  <SelectItem value="Take Out" className="text-xs">Take Out</SelectItem>
                  <SelectItem value="Others" className="text-xs">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {eventData.eventType === "Take Out" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="takeout-setup" className="text-xs font-semibold text-foreground">
                    Take Out: Preferred setup date
                  </Label>
                  <Input
                    id="takeout-setup"
                    type="date"
                    value={eventData.takeOutSetupDate}
                    onChange={(e) => setEventData((prev) => ({ ...prev, takeOutSetupDate: e.target.value }))}
                    className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="takeout-dismantle" className="text-xs font-semibold text-foreground">
                    Take Out: Preferred dismantle date
                  </Label>
                  <Input
                    id="takeout-dismantle"
                    type="date"
                    value={eventData.takeOutDismantleDate}
                    onChange={(e) => setEventData((prev) => ({ ...prev, takeOutDismantleDate: e.target.value }))}
                    className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2 rounded-lg border border-border bg-secondary/20 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={eventData.returningRequired}
                  onCheckedChange={(v) =>
                    setEventData((prev) => ({ ...prev, returningRequired: Boolean(v) }))
                  }
                />
                <span className="text-xs text-foreground">
                  Returning required (tick if we need to come back to collect / dismantle after delivery)
                </span>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guests" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Users className="h-3 w-3" />
                Estimated Guests Attending
              </Label>
              <Input
                id="guests"
                type="number"
                min="0"
                max="9999"
                value={eventData.estimatedGuests || ""}
                onChange={(e) =>
                  setEventData((prev) => ({
                    ...prev,
                    estimatedGuests: Math.min(9999, Math.max(0, parseInt(e.target.value) || 0)),
                  }))
                }
                placeholder="Enter number of guests"
                className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Budget Per Person (RM)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="budget-from" className="text-[10px] text-muted-foreground">
                    From
                  </Label>
                  <Input
                    id="budget-from"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={eventData.budgetPerPersonFromRm}
                    onChange={(e) => setEventData((prev) => ({ ...prev, budgetPerPersonFromRm: e.target.value }))}
                    placeholder="30"
                    className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="budget-to" className="text-[10px] text-muted-foreground">
                    To
                  </Label>
                  <Input
                    id="budget-to"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={eventData.budgetPerPersonToRm}
                    onChange={(e) => setEventData((prev) => ({ ...prev, budgetPerPersonToRm: e.target.value }))}
                    placeholder="60"
                    className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Building2 className="h-3 w-3" />
                Event Location
              </Label>
              <Select
                value={eventData.eventLocation}
                onValueChange={(value) => setEventData((prev) => ({ ...prev, eventLocation: value as EventLocation }))}
              >
                <SelectTrigger className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="etre-cafe-kl" className="text-xs">Être Cafe KL</SelectItem>
                  <SelectItem value="etre-cafe-ipoh" className="text-xs">Être Cafe Ipoh</SelectItem>
                  <SelectItem value="others" className="text-xs">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {eventData.eventLocation === "others" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="other-area" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <MapPin className="h-3 w-3" />
                    Others Location / Venue Name
                  </Label>
                  <Input
                    id="other-area"
                    type="text"
                    value={eventData.otherAreaName}
                    onChange={(e) => setEventData((prev) => ({ ...prev, otherAreaName: e.target.value }))}
                    placeholder="e.g., Hotel ballroom / Office / Home"
                    className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Venue Type
                  </Label>
                  <Select
                    value={eventData.otherVenueType}
                    onValueChange={(value) => setEventData((prev) => ({ ...prev, otherVenueType: value as VenueType }))}
                  >
                    <SelectTrigger className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent">
                      <SelectValue placeholder="Select venue type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indoor" className="text-xs">Indoor</SelectItem>
                      <SelectItem value="outdoor" className="text-xs">Outdoor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
