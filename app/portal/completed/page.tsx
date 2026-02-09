"use client"

import { redirect } from "next/navigation"

export default function CompletedRedirectPage() {
  redirect("/portal/payment")
}

