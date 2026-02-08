"use client"

import { BarChart3 } from "lucide-react"

export default function PerformanceTrackingPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Performance Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Dashboard placeholders (data wiring will come later).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: "Monthly timetable for event", hint: "One month calendar table (placeholder)" },
          { title: "Monthly event quantity", hint: "Placeholder" },
          { title: "Monthly sales (RM)", hint: "Actual vs target column graph (placeholder)" },
          { title: "Average order value (AOV)", hint: "RMX (placeholder)" },
          { title: "Quote conversion rate", hint: "X% (placeholder)" },
          { title: "Quote conversion rate breakdown", hint: "Pie chart quotation vs sales order (placeholder)" },
          { title: "Project progress", hint: "Table with status colors (placeholder)" },
        ].map((card) => (
          <div key={card.title} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">{card.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{card.hint}</p>
              </div>
              <BarChart3 className="h-5 w-5 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-4 h-32 rounded-md border border-dashed border-border bg-muted/20" />
          </div>
        ))}
      </div>
    </div>
  )
}

