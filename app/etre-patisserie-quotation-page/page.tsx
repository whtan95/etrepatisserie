import { Suspense } from "react"
import QuoteRequestClient from "./quote-request-client"

export default function QuoteRequestPage() {
  return (
    <Suspense>
      <QuoteRequestClient />
    </Suspense>
  )
}

