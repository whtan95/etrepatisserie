import type { CustomerData } from "./types"

function normalizePart(value: string | null | undefined): string {
  return (value || "").trim()
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  const cleaned = parts.map(normalizePart).filter(Boolean)
  return cleaned.join(separator)
}

export function formatAddressParts(input: {
  buildingName?: string | null
  gate?: string | null
  address1?: string | null
  address2?: string | null
  postCode?: string | null
  city?: string | null
  state?: string | null
}): string {
  const building = normalizePart(input.buildingName)
  const firstLine = joinNonEmpty([input.gate, input.address1], " ")
  const postLine = joinNonEmpty([input.postCode, input.city, input.state], " ")
  return joinNonEmpty([building, firstLine, input.address2, postLine], ", ")
}

export function getCustomerDeliveryAddress(customer?: CustomerData | null): string {
  if (!customer) return ""
  const fromParts = formatAddressParts({
    buildingName: customer.deliveryBuildingName,
    gate: customer.deliveryAddressGate,
    address1: customer.deliveryAddress1 ?? customer.deliveryAddressJalan,
    address2: customer.deliveryAddress2 ?? customer.deliveryAddressTaman,
    postCode: customer.deliveryPostCode,
    city: customer.deliveryCity,
    state: customer.deliveryState,
  })
  return fromParts || normalizePart(customer.deliveryAddress)
}

export function getCustomerBillingAddress(customer?: CustomerData | null): string {
  if (!customer) return ""
  const fromParts = formatAddressParts({
    buildingName: customer.billingBuildingName,
    gate: customer.billingAddressGate,
    address1: customer.billingAddress1 ?? customer.billingAddressJalan,
    address2: customer.billingAddress2 ?? customer.billingAddressTaman,
    postCode: customer.billingPostCode,
    city: customer.billingCity,
    state: customer.billingState,
  })
  return fromParts || normalizePart(customer.billingAddress)
}

export function getBestCustomerAddress(customer?: CustomerData | null): string {
  return getCustomerDeliveryAddress(customer) || getCustomerBillingAddress(customer)
}
