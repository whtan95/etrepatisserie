import React from "react"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Custom Dessert Catering for Your Event | Être Patisserie',
  description: "Share your event details and dessert preferences. We'll reply within 24–48 hours with a personalised quotation (no booking confirmation on submission).",
}

export default function QuoteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
