import type { DessertCategory } from "@/lib/quote-webpage/quote-types"

export interface MenuCatalogItem {
  id: string
  category: DessertCategory
  name: string
  imageUrl: string
}

export const MENU_CATALOG: Record<DessertCategory, MenuCatalogItem[]> = {
  tart: [
    { id: "tart-blueberry", category: "tart", name: "Blueberry Tart", imageUrl: "/images/menu/blueberry-tart.jpg" },
    { id: "tart-egg", category: "tart", name: "French Vanilla Egg Tart", imageUrl: "/images/menu/egg-tart.jpg" },
  ],
  gateaux: [
    { id: "gateaux-raspberry-pistachio", category: "gateaux", name: "Raspberry Pistachio", imageUrl: "/images/menu/raspberry-pistachio.jpg" },
    { id: "gateaux-peach-guava", category: "gateaux", name: "Peach & Pink Guava", imageUrl: "/images/menu/peach-guava-tart.jpg" },
  ],
  viennoiserie: [
    { id: "viennoiserie-ham-cheese", category: "viennoiserie", name: "Ham & Cheese Croissant", imageUrl: "/images/menu/ham-cheese-croissant.jpg" },
    { id: "viennoiserie-pain-chocolat", category: "viennoiserie", name: "Pain Au Chocolat", imageUrl: "/images/menu/pain-au-chocolat.jpg" },
    { id: "viennoiserie-cinnamon-roll", category: "viennoiserie", name: "Cinnamon Roll", imageUrl: "/images/menu/cinnamon-roll.jpg" },
  ],
  savoury: [
    { id: "savoury-mushroom-quiche", category: "savoury", name: "Mushroom Quiche", imageUrl: "/images/menu/mushroom-quiche.jpg" },
    { id: "savoury-smoked-duck-quiche", category: "savoury", name: "Smoked Duck Quiche", imageUrl: "/images/menu/smoked-duck-quiche.jpg" },
    { id: "savoury-sando", category: "savoury", name: "Chicken Ham & Cheese Sando", imageUrl: "/images/menu/sando.jpg" },
  ],
}
