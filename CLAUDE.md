# CLAUDE.md - Être Patisserie Order Management

## Project Overview

**Être Patisserie Order Management** is a Next.js-based order management system for Être Patisserie, an artisan pastry and bakery business. The application manages the full lifecycle of sales orders and ad-hoc orders through workflows including scheduling, packing, setup, dismantle, and completion.

- **Built with**: v0.app (Vercel's AI-powered UI builder)
- **Deployment**: Vercel
- **Data Storage**: Browser localStorage + JSON files (backend integration pending)

## Quick Commands

```bash
pnpm dev          # Start development server on port 3001
pnpm build        # Production build
pnpm start        # Start production server on port 3001
pnpm lint         # Run ESLint
```

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| UI | Radix UI, shadcn/ui, Tailwind CSS v4 |
| Forms | React Hook Form, Zod |
| Calendar | FullCalendar 6.1 |
| Icons | Lucide React, custom SVGs |
| Package Manager | pnpm |

## Project Structure

```
app/
├── layout.tsx              # Root layout with analytics
├── page.tsx                # Redirects to /portal/sales-order
├── globals.css             # Tailwind CSS theme variables
└── portal/
    ├── layout.tsx          # Sidebar navigation layout
    ├── status-tracking/    # Dashboard with calendar
    ├── sales-order/        # Create/edit sales orders
    ├── ad-hoc/             # Create ad-hoc orders
    ├── scheduling/         # Schedule setup & dismantle
    │   └── [orderNumber]/  # Dynamic order scheduling
    ├── packing/            # Track packing status
    ├── setting-up/         # Track setup with photos
    ├── dismantle/          # Track dismantle with photos
    ├── other-adhoc/        # Additional task tracking
    ├── completed/          # View completed orders
    ├── warnings/           # Issue tracking & resolution
    ├── mapping/            # Team route mapping & visualization
    └── settings/           # Application & AI settings

components/
├── ui/                     # Reusable Radix UI components
├── portal/                 # Order progress, quotation preview
├── icons.tsx               # Custom SVG icons
└── theme-provider.tsx      # Next-themes provider

lib/
├── types.ts                # All TypeScript types & constants
├── utils.ts                # Utility functions (cn helper)
├── order-storage.ts        # localStorage CRUD operations
├── order-flow.ts           # Order status & workflow logic
├── role-storage.ts         # User role management
├── team-settings.ts        # Team configuration
├── settings-model.ts       # Settings data models
├── settings-db.ts          # Settings database operations
├── time-window.ts          # Time slot & window utilities
├── address-utils.ts        # Address parsing & formatting
├── mapping-types.ts        # Mapping type definitions
├── mapping-utils.ts        # Mapping utility functions
├── ai-scheduler.ts         # AI scheduling logic & co-join
├── date-dmy.ts             # Date formatting (DD/MM/YYYY ↔ ISO)
├── fee-catalog.ts          # System fees catalog
├── inventory.ts            # Inventory items & normalization
└── inventory-db.ts         # Inventory JSON file operations
```

## Key Files to Know

- **[lib/types.ts](lib/types.ts)** - All TypeScript interfaces (SalesOrder, EventData, PricingData, CustomerData) and constants
- **[lib/order-storage.ts](lib/order-storage.ts)** - localStorage operations (getSalesOrders, saveSalesOrders, updateOrderByNumber, deleteOrderByNumber)
- **[lib/order-flow.ts](lib/order-flow.ts)** - Workflow status logic (getNextStatus, getPreviousStatus)
- **[lib/ai-scheduler.ts](lib/ai-scheduler.ts)** - AI scheduling logic including co-join algorithms
- **[lib/settings-db.ts](lib/settings-db.ts)** - Settings database operations for AI and app settings
- **[lib/mapping-utils.ts](lib/mapping-utils.ts)** - Utilities for team route mapping and visualization
- **[lib/inventory.ts](lib/inventory.ts)** - Inventory item types, defaults, and normalization logic
- **[lib/date-dmy.ts](lib/date-dmy.ts)** - Date utilities for DD/MM/YYYY format conversion
- **[app/portal/layout.tsx](app/portal/layout.tsx)** - Main navigation sidebar

## Order Workflow

**Sales Orders**: draft → scheduling → packing → setting-up → dismantling → completed

**Ad-hoc Orders**: draft → scheduling → [packing] → [setting-up] → [dismantling] → [other-adhoc] → completed
*(Phases in brackets are optional)*

## Data Model

Orders are stored in localStorage with two keys:
- `etre_sales_orders` - Array of SalesOrder objects
- `etre_ad_hoc_orders` - Array of SalesOrder objects (ad-hoc)

**Order Number Formats**:
- Sales: `SO2501-ABC1` (SO + YYMM + random)
- Ad-hoc: `AH-0001` (sequential)

## Coding Conventions

### Component Pattern
- All portal pages use `"use client"` directive
- Functional components with hooks
- Default exports for pages

### Naming
- **PascalCase**: Components, Types, Interfaces
- **camelCase**: Functions, variables
- **UPPERCASE**: Constants
- Boolean prefixes: `is`, `has`, `show`

### Imports Order
1. React imports
2. Next.js imports
3. UI components
4. Types
5. Utilities

### State Management
- `useState()` for local state
- `useEffect()` for data loading
- localStorage as source of truth
- No global state library

### Styling
- Tailwind CSS utility classes
- `cn()` helper for class merging
- CSS variables for theming (light/dark mode)
- Mobile-first responsive design

## AI Scheduling Features

The system includes an AI Operations Planner that optimizes team assignments:

- **Geographic Clustering**: Groups nearby jobs for the same team
- **Co-Join Logic**: Chains jobs (Site A → Site B) when eligible
- **Working Hours**: Respects configurable work hours with lunch break
- **OT Warnings**: Flags capacity overflow requiring manual overtime assignment

### Settings Storage
- **AI Settings**: `etre_ai_settings` in localStorage
- **App Settings**: `etre_app_settings` in localStorage

## Important Notes

1. **Backend Pending**: Currently uses localStorage & JSON files; backend integration planned
2. **Build Ignores TS Errors**: `typescript.ignoreBuildErrors: true` in next.config.mjs
3. **Images Unoptimized**: Next.js image optimization is disabled
4. **TurboPack Disabled**: Set in .env.local

## Common Tasks

### Adding a New Portal Page
1. Create folder in `app/portal/[page-name]/`
2. Add `page.tsx` with `"use client"` directive
3. Add navigation link in `app/portal/layout.tsx`

### Working with Orders
```typescript
import { getSalesOrders, saveSalesOrders, updateOrderByNumber } from "@/lib/order-storage"
import type { SalesOrder } from "@/lib/types"
```

### Using UI Components
```typescript
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
```

## Theme Colors

- **Primary accent**: Yellow (#f3ea11)
- **Success**: Green (#22c55e)
- **Background (light)**: Off-white tones
- **Background (dark)**: Dark grays

---

*Last updated: February 2026*
