import { PRICES } from "@/lib/types"
import type { AppSettingsDb } from "@/lib/settings-model"

export type FeeCatalogItem = {
  id: string
  category: "Fees"
  name: string
  defaultPrice: number
  defaultSst: boolean
}

export function getFeeCatalog(app?: Partial<AppSettingsDb>): FeeCatalogItem[] {
  const mbiPermitFee = app?.mbiPermitFee ?? PRICES.mbiPermit
  const mbiRunnerFee = app?.mbiRunnerFee ?? PRICES.runnerFee
  const mbiParkingLotFee = app?.mbiParkingLotFee ?? PRICES.mbiParking
  const sundayOTFee = app?.sundayOTFee ?? PRICES.sundayOT

  return [
    { id: "fee-mbi-permit", category: "Fees", name: "MBI Permit Fee", defaultPrice: mbiPermitFee, defaultSst: false },
    { id: "fee-mbi-runner", category: "Fees", name: "MBI Runner Fee", defaultPrice: mbiRunnerFee, defaultSst: false },
    { id: "fee-mbi-parking", category: "Fees", name: "MBI Parking Lots", defaultPrice: mbiParkingLotFee, defaultSst: false },
    { id: "fee-sunday-ot", category: "Fees", name: "Sunday OT Fee", defaultPrice: sundayOTFee, defaultSst: false },
  ]
}

// Backwards compatibility: defaults based on PRICES.
export const FEE_CATALOG: FeeCatalogItem[] = getFeeCatalog()
