import { ClipboardList, MessageSquareText, FileText } from "lucide-react"

export function HowItWorks() {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-xl">
      <div className="border-b border-[#5D2B22] bg-[#5D2B22] px-6 py-4">
        <h2 className="text-xl font-bold text-white">How It Works</h2>
      </div>

      <div className="p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
              <ClipboardList className="h-5 w-5 text-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">1. Submit your request</p>
            <p className="mt-1 text-sm text-muted-foreground">Share your event details and dessert preferences.</p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
              <MessageSquareText className="h-5 w-5 text-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">2. We review & confirm details</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Our team contacts you to fine-tune quantities and designs.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
              <FileText className="h-5 w-5 text-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">3. Receive your quotation</p>
            <p className="mt-1 text-sm text-muted-foreground">Clear pricing, no obligation.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
