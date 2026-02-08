import { Sparkles } from "lucide-react"

export function Header() {
  return (
    <header className="border-b-4 border-accent bg-foreground shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Sparkles className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-background md:text-xl">Être Patisserie</h1>
            <p className="text-xs text-background/80">Quotation Request</p>
          </div>
        </div>
        <div className="hidden text-right md:block">
          <p className="text-sm font-medium text-background">French Pastries & Desserts</p>
        </div>
      </div>
    </header>
  )
}
