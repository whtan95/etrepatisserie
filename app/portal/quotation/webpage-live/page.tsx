
"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

const DEFAULT_LIVE_PAGE_PATH = "/etre-patisserie-quotation-page"

export default function QuotationWebpageLivePage() {
  const baseSrc = process.env.NEXT_PUBLIC_QUOTATION_WEBPAGE_LIVE_URL || DEFAULT_LIVE_PAGE_PATH
  const [src, setSrc] = useState(baseSrc)

  const getDemoSrc = () => {
    if (baseSrc.startsWith("http")) {
      const u = new URL(baseSrc)
      u.searchParams.set("demo", "1")
      u.searchParams.set("demoAt", Date.now().toString())
      return u.toString()
    }
    return `${baseSrc}?demo=1&demoAt=${Date.now()}`
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">Webpage live</h3>
          <p className="truncate text-sm text-muted-foreground">
            Previewing: <span className="font-mono text-xs">{src}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setSrc(getDemoSrc())}>
            Demo fill
          </Button>
          <Button variant="secondary" onClick={() => setSrc(baseSrc)}>
            Reset
          </Button>

          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-border bg-background">
        <iframe
          title="Être Patisserie quotation webpage"
          src={src}
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
