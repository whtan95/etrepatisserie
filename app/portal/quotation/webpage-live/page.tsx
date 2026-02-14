"use client"

import { useState } from "react"
import { ExternalLink, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OrderProgress } from "@/components/portal/order-progress"

export default function QuotationWebpageLivePage() {
  const [copied, setCopied] = useState(false)

  // Build the full URL for the quote page
  const getFullUrl = () => {
    if (typeof window === "undefined") return "/quote"
    return `${window.location.origin}/quote`
  }

  const handleCopy = async () => {
    const url = getFullUrl()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <div className="space-y-4">
      <OrderProgress currentStep="request-for-quotation" />

      <div className="flex flex-col gap-1">
        <h1 className="truncate text-lg font-semibold text-foreground">Webpage live</h1>
        <p className="text-sm text-muted-foreground">
          Share this link with customers to request a quotation.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">Customer Quote Page</h2>
          <p className="text-sm text-muted-foreground">
            Customers can fill out the quotation form at this URL. Their submissions will appear in the Request for Quotation page.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
          <code className="flex-1 text-sm font-mono text-foreground truncate">
            /quote
          </code>
          <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
            {copied ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy URL
              </>
            )}
          </Button>
        </div>

        <div className="flex gap-2">
          <Button asChild>
            <a href="/quote" target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open Quote Page
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
