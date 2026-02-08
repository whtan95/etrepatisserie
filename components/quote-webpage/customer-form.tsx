"use client"

import React from "react"

import type { CustomerData } from "@/lib/quote-webpage/quote-types"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { User, Phone, Mail, MapPin, FileText, HelpCircle, Send, CheckCircle2, FileDown, MessageCircle } from "lucide-react"

interface CustomerFormProps {
  customerData: CustomerData
  setCustomerData: React.Dispatch<React.SetStateAction<CustomerData>>
  onSubmit: () => void
  isSubmitted: boolean
}

export function CustomerForm({ customerData, setCustomerData, onSubmit, isSubmitted }: CustomerFormProps) {
  const exportPdf = () => {
    window.print()
  }

  const contactUs = () => {
    const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL
    const whatsAppNumber = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_NUMBER

    const subject = encodeURIComponent("Être Patisserie – quotation enquiry")
    const body = encodeURIComponent(
      `Hi Être Patisserie,\n\nI would like to enquire about a quotation.\n\nName: ${customerData.name || "-"}\nCompany: ${customerData.companyName || "-"}\nPhone: ${customerData.phone || "-"}\n\nThank you.`
    )

    if (typeof whatsAppNumber === "string" && whatsAppNumber.trim()) {
      const digits = whatsAppNumber.replace(/[^\d]/g, "")
      const url = `https://wa.me/${digits}?text=${body}`
      window.open(url, "_blank", "noopener,noreferrer")
      return
    }

    if (typeof contactEmail === "string" && contactEmail.trim()) {
      window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`
      return
    }

    alert("Contact details are not configured yet. Please set NEXT_PUBLIC_CONTACT_EMAIL or NEXT_PUBLIC_CONTACT_WHATSAPP_NUMBER in Vercel.")
  }

  return (
    <div className="overflow-hidden rounded-xl border border-accent bg-card shadow-md">
      <div className="border-b border-[#5D2B22] bg-[#5D2B22] px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <HelpCircle className="h-4 w-4" />
          Contact Information
        </h2>
      </div>

      <div className="p-4">
        <p className="mb-4 text-xs text-muted-foreground">
          Have questions or need more information? Fill in your details below and we will get back to you.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="company-name" className="text-xs font-semibold text-foreground">
              Company Name
            </Label>
            <Input
              id="company-name"
              type="text"
              value={customerData.companyName}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, companyName: e.target.value }))}
              placeholder="Your company name (optional)"
              className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3 w-3" />
              Name (PIC)
            </Label>
            <Input
              id="name"
              type="text"
              value={customerData.name}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="PIC full name"
              className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Phone className="h-3 w-3" />
              Phone
            </Label>
            <Input
              id="phone"
              type="tel"
              value={customerData.phone}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Your phone number"
              className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Mail className="h-3 w-3" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={customerData.email}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Your email address"
              className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <MapPin className="h-3 w-3" />
              Address
            </Label>
            <Input
              id="address"
              type="text"
              value={customerData.address}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Event location address"
              className="h-8 border border-border bg-background text-xs transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notes" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <FileText className="h-3 w-3" />
              Request Notes
            </Label>
            <Textarea
              id="notes"
              value={customerData.notes}
              onChange={(e) => setCustomerData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Any special requests or additional information..."
              rows={3}
              className="border border-border bg-background text-xs transition-colors focus:border-accent"
            />
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4 print:hidden">
          <p className="text-sm font-semibold text-foreground">Quick actions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Export a PDF to share internally, or contact us directly if you have questions before submitting.
          </p>
          <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={exportPdf}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary"
            >
              <FileDown className="h-4 w-4" />
              <span>Export as PDF</span>
            </button>

            <button
              type="button"
              onClick={contactUs}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Contact Us</span>
            </button>
          </div>
        </div>

        {/* Request a Quote Button */}
        <div className="mt-4 flex justify-center print:hidden">
          <button
            type="button"
            onClick={onSubmit}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-foreground px-6 py-3 text-sm font-bold text-background shadow-md transition-all hover:scale-105 hover:shadow-lg"
          >
            {isSubmitted ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            <span>{isSubmitted ? "Request Sent" : "Request a Quote"}</span>
          </button>
        </div>
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Submitting this form doesn't confirm a booking. We'll reply within 24–48 hours with a quote.
        </p>
      </div>
    </div>
  )
}
