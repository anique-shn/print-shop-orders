# Lovable Implementation Spec — Print Shop Order & Catalog Module

> **Scope:** A standalone ordering system for a decorated-apparel / print shop.  
> No invoices. No revenue dashboards. Just **Catalog** + **Orders** — done properly.

---

## What We're Building

A web app where a print shop can:
1. Manage their **catalog** — garments (with per-size pricing), decoration types (screen print, embroidery, etc. with qty-based pricing matrices), and finishing services
2. Create and manage **orders** — selecting from the catalog, entering size quantities, adding embellishments and finishing, with full per-size pricing and a live cost breakdown
3. View orders in a **Kanban board** or list, track status, download a clean **Work Order PDF**

**Stack:** Next.js (App Router), Supabase (Postgres + Storage), Tailwind CSS, React Query, shadcn/ui

---

## Database Schema

### `company_settings`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | shop name |
| address, city, state, zip | text | |
| phone, email, website | text | |
| logo_url | text | Supabase Storage |
| primary_color | text | hex, default `#05253D` |
| default_tax_rate | numeric | e.g. `8.5` |
| updated_at | timestamptz | |

---

### `customers`
| column | type |
|---|---|
| id | uuid PK |
| name | text NOT NULL |
| email, phone | text |
| company | text |
| address, city, state, zip | text |
| notes | text |
| created_at | timestamptz |

---

### `garments`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| brand | text | e.g. "Gildan" |
| style_number | text | e.g. "G500" |
| name | text | e.g. "Heavy Cotton Tee" |
| category | text | e.g. "T-Shirts" |
| color | text | e.g. "Black" |
| size_upcharges | jsonb | `{ "S": 12.00, "M": 12.00, "L": 13.50, "XL": 14.00, "2XL": 15.00 }` — full sell price per size |
| base_cost | numeric | legacy, default 0 |
| markup_value | numeric | legacy, default 0 |
| active | boolean | default true |
| sort_order | int | |
| created_at | timestamptz | |

> **Note:** `size_upcharges` stores the **complete sell price** per size (not an upcharge). Key = size label, value = price.

---

### `decoration_groups`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Screen Print", "Embroidery" |
| description | text | |
| icon | text | icon name from Lucide |
| color | text | hex accent |
| col_labels | text[] | e.g. `["1 Color","2 Colors","3 Colors","4 Colors"]` |
| col_count | int | number of active columns |
| sort_order | int | |
| active | boolean | |
| created_at | timestamptz | |

### `decoration_matrix`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → decoration_groups | |
| qty_min | int | e.g. `12` |
| qty_max | int nullable | null = unlimited |
| prices | jsonb | array of prices per column: `[3.50, 4.25, 5.00, 5.75]` — index matches col_labels |
| created_at | timestamptz | |

> Example: Screen Print, qty 12–23, prices `[3.50, 4.25, 5.00, 5.75]` means 12–23 pcs: 1-color=$3.50, 2-color=$4.25, etc.

---

### `finishing_services`
| column | type |
|---|---|
| id | uuid PK |
| name | text |
| unit_price | numeric |
| group_name | text |
| active | boolean |
| sort_order | int |
| created_at | timestamptz |

---

### `orders`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| order_number | text UNIQUE | e.g. `ORD-2024-0042` |
| customer_id | uuid FK nullable | |
| customer_name | text | denormalized for fast display |
| customer_email | text | |
| customer_phone | text | |
| customer_company | text | |
| status | text | `inquiry \| new \| production \| quality \| ready \| shipped \| delivered \| cancelled` |
| due_date | date nullable | |
| notes | text | |
| image_url | text | optional reference image |
| discount_type | text | `percent \| flat` |
| discount_value | numeric | default 0 |
| tax_rate | numeric | default 0 |
| deposit_amount | numeric | default 0 |
| tracking_number | text | |
| carrier | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `order_items`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK | |
| description | text | garment name + color |
| line_type | text | `garment \| setup_fee` |
| garment_id | uuid FK nullable | ref to garments |
| size_matrix | jsonb | `{ "S": 10, "M": 20, "L": 15 }` — size → qty |
| qty | int | total pcs (sum of size_matrix) |
| unit_price | numeric | sell price per piece (all-in: garment + deco + finish) |
| color | text | |
| decoration_type | text | primary deco label |
| decoration_location | text | |
| blank_cost | numeric | internal cost (optional) |
| markup_pct | numeric | markup applied |
| price_overridden | boolean | |
| override_reason | text | |
| taxable | boolean | default true |
| notes | text | |
| created_at | timestamptz | |

### `order_item_decorations`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| order_item_id | uuid FK | |
| decoration_group_id | uuid FK | |
| decoration_type | text | group name |
| location | text | Front, Back, Left Chest, etc. |
| col_index | int | 0-based index into group's col_labels |
| unit_price | numeric | price/pc at time of order |
| notes | text | |
| sort_order | int | |
| created_at | timestamptz | |

### `order_item_finishing`
| column | type |
|---|---|
| id | uuid PK |
| order_item_id | uuid FK |
| finishing_service_id | uuid FK nullable |
| service_name | text |
| unit_price | numeric |
| sort_order | int |
| created_at | timestamptz |

---

## App Structure

```
/                    → redirect to /orders
/orders              → Orders page (Kanban + List view)
/catalog             → Catalog management (Garments, Decorations, Finishing)
/customers           → Customer list
/settings            → Company branding & defaults
```

---

## Stage 1 — Foundation & Catalog

### 1A — Project Setup
- Next.js 15+ App Router, TypeScript, Tailwind CSS
- Supabase client (`@supabase/supabase-js`)
- React Query (`@tanstack/react-query`) for all data fetching
- shadcn/ui components: Button, Input, Label, Select, Dialog, Textarea, Card, Tabs, Badge
- `sonner` for toast notifications
- `jspdf` + `html2canvas` for PDF generation
- `lucide-react` for icons
- Run all migrations to create the schema above

### 1B — Company Settings
- Settings page at `/settings`
- Form: shop name, address, phone, email, logo upload (Supabase Storage), primary brand color picker
- Default tax rate
- Save to `company_settings` table (single row, upsert)
- Show logo in app header

### 1C — Garment Catalog

**Garments list page** (tab inside `/catalog`):
- Table: Brand | Style # | Name | Color | Category | Size Prices | Actions
- Size Prices cell: compact display like `S $12 · M $12 · L $13.50 · XL $14`
- Add / Edit / Delete garment

**Add/Edit Garment modal:**
- Fields: Brand, Style #, Name, Category (free text), Color
- **Per-size pricing grid** — standard sizes: XS S M L XL 2XL 3XL 4XL 5XL
  - Each size has a `$` price input (the complete sell price for that size)
  - "Add custom size" — text input + Add button for non-standard sizes (6XL, Youth S, etc.)
  - Custom sizes show an `×` remove button
- Save stores `size_upcharges` JSONB: `{ "S": 12.00, "M": 13.50 }` (only sizes with price > 0)
- Toggle: Active / Inactive

### 1D — Decoration Matrix Catalog

**Decoration Groups list** (tab inside `/catalog`):
- Card per group showing: icon, name, color accent, column labels, number of pricing tiers
- Add decoration group: name, icon (pick from Lucide set), accent color, column labels (e.g. "1 Color", "2 Colors", "3 Colors")

**Matrix editor** (inline, expands on card):
- Table: Qty Min | Qty Max | [col 1 price] | [col 2 price] | … | Delete
- Inline editable cells — click to edit, save button
- Add row: enter qty_min, qty_max, prices per column
- Prices stored in `decoration_matrix.prices` JSONB array
- Add column: appends a new col_label to the group and extends the prices array

### 1E — Finishing Services Catalog

**Finishing services list** (tab inside `/catalog`):
- Table: Name | Group | Price/pc | Active | Actions
- Add/Edit modal: name, group name, unit price, active toggle

---

## Stage 2 — Customer Management

**Customers page** (`/customers`):
- List with search: Name | Company | Email | Phone | Orders count
- Add/Edit modal: name, company, email, phone, address fields, notes
- Delete with confirmation

---

## Stage 3 — Order Creation (Core Feature)

### Create Order Modal — Multi-Step

**Step 1: Customer**
- Search existing customers (typeahead) or fill in manually: name, company, email, phone
- Due date picker
- Internal notes textarea
- Order number auto-generated: `ORD-YYYY-XXXX`

**Step 2: Line Items (Garment Lines)**

This is the heart of the feature. Each garment line has:

#### Garment Selection
- "Pick from catalog" button → searchable garment picker popover
  - Shows garments grouped by category
  - Each card: brand · style# · name · color · price range (e.g. `$12–$15/pc`)
  - Or: "Enter manually" to type description directly
- Once selected: garment name + color auto-fills the line; per-size prices load from catalog

#### Size Matrix
- Grid of size columns (XS S M L XL 2XL 3XL 4XL 5XL + any catalog custom sizes)
- Each column has:
  - Size label header (blue when qty > 0)
  - **Qty input** (numeric, large tap target)
  - **Price input** with `$` prefix (pre-filled from catalog, fully editable — override per order)
- "Total" column shows sum
- Clearing a price removes the per-size override for that size

#### Embellishments Section
- "Add" button → inline form:
  - **Decoration type**: chip buttons from `decoration_groups` (Screen Print, Embroidery, etc.) — colored border when selected
  - **Location**: dropdown (Front, Back, Left Chest, Right Chest, Left Sleeve, Right Sleeve, Hood, Custom)
  - **Column selector**: chip buttons for each col_label (e.g. "1", "2", "3", "4" for color count)
  - **Price/pc**: auto-populated from `decoration_matrix` based on current total qty + selected col_index
    - Shows `(auto · 60 pcs)` badge in blue when populated
    - Shows `(preview — updates with qty)` in amber when qty=0 (uses first tier as estimate)
    - Shows `(no matrix data — enter manually)` when matrix is empty
    - Manual override: type a price → shows reset button to restore auto
  - Add / Cancel buttons
- Each added decoration shows as a row: location · type · col label | **$X.XX/pc** / qty×=$TOTAL | remove

#### Finishing Section
- Chip buttons from `finishing_services` catalog — tap to toggle on/off
- Active finishing shown as tags with `×` remove

#### Line Breakdown (collapsible footer on each garment card)
- Per price-group (sizes that share the same sell price):
  - Sizes: `S, M, L` · `20 pcs`
  - Garment: `$12.00/pc`
  - Deco (20 pcs tier): `$3.50/pc`
  - Finish: `$0.50/pc`
  - **$16.00/pc × 20 = $320.00**
- Grand total for the line in bold

#### Setup Fees
- Below garment lines: "+ Add Setup Fee" button
- Each fee: description text input + qty + unit price
- Examples: Screen Charges ($25/screen), Digitizing Fee ($45), Rush Fee, Art Fee

#### Right Panel — Live Price Breakdown
Always visible alongside the line items form:
- Per garment: name, pcs count, per-group cost breakdown, line total
- Setup fees
- Subtotal
- Discount (type: percent/flat + value)
- Tax rate %
- **Grand Total**
- Deposit collected

**Step 3: Review & Confirm**
- Read-only summary of all line items
- Customer info confirmation
- "Create Order" button → saves to Supabase → toast success → navigate to order detail

---

## Stage 4 — Order Management

### Orders Page (`/orders`)

**Dual view toggle** — List and Kanban:

**Kanban Board:**
- Columns: Inquiry | New | In Production | Quality Check | Ready | Shipped | Delivered | Cancelled
- Each card: order number (monospace, accent color), customer name, due date, total price, item count
- Click card → opens detail panel

**List View:**
- Table: Order # | Customer | Status badge | Items | Due Date | Total | Created | Actions
- Search bar (by order number or customer name)
- Filter by status (multi-select chips)
- Sort by: Created, Due Date, Total

### Order Detail Panel (right-side drawer)

Slides in from the right when an order is clicked. Contains:

**Header:**
- Order number + status badge
- Customer name · company
- Edit button | **PDF button** | Close button

**Status selector:**
- Dropdown to move through: inquiry → new → production → quality → ready → shipped → delivered
- On status change: "Notify customer?" banner with Email button

**Body (scrollable):**
- Customer info (name, company, email, phone)
- Dates: Created | Due Date
- Notes block
- Line items accordion (each garment card expands to show size breakdown + decoration/finishing summary)
- Totals: subtotal, discount, tax, deposit, **grand total**, balance due
- Tracking section (collapsible): carrier select + tracking number input + Save

**PDF button** → opens full-screen preview modal:
- White document on dark background
- Shows compact Work Order PDF (see Stage 5)
- "Download PDF" button

**Edit Order:**
- Re-opens the create modal pre-filled with existing data
- Full edit of all fields, line items, decorations, finishing

---

## Stage 5 — Work Order PDF

Compact, single-page (for most orders) PDF that can be downloaded or printed.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  [LOGO]  Shop Name                    WORK ORDER            │
│  address · phone · email              ORD-2024-0042         │
│                                       [IN PRODUCTION]       │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Customer     │ Created      │ Due Date     │ Total Pcs      │
│ John Smith   │ May 12, 2026 │ May 20, 2026 │ 65 pcs         │
├──────────────────────────────────────────────────────────────┤
│ LINE ITEMS                                                   │
│ ┌─────────────────────┬──────────────────┬────┬──────┬─────┐│
│ │ Item / Embellishments│ Sizes            │Pcs │$/pc  │Total││
│ ├─────────────────────┼──────────────────┼────┼──────┼─────┤│
│ │ Gildan G500 — Black │ S×10 M×20 L×15   │ 45 │$16.00│$720 ││
│ │ 🎨 Front · Screen   │ XL×5 2XL×5       │    │      │     ││
│ │    Print 2c          │                  │    │      │     ││
│ │ ✂ Tags               │                  │    │      │     ││
│ ├─────────────────────┼──────────────────┼────┼──────┼─────┤│
│ │ Next Level 3600 — W │ S×5 M×10 L×5     │ 20 │$22.00│$440 ││
│ │ 🎨 LC · Embroidery   │                  │    │      │     ││
│ │    10k sts           │                  │    │      │     ││
│ └─────────────────────┴──────────────────┴────┴──────┴─────┘│
│                                                              │
│ SETUP & FEES                                                 │
│  Screen Charges                   2 × $25.00        $50.00  │
│  Digitizing Fee                   1 × $45.00        $45.00  │
│                                                              │
│  [Notes here]                       Subtotal:    $1,255.00  │
│                                     Tax (8.5%):    $106.68  │
│                                     Total:       $1,361.68  │
│                                     Deposit:      -$300.00  │
│                                     Balance Due:  $1,061.68 │
├──────────────────────────────────────────────────────────────┤
│ Shop Name · email · phone              ORD-2024-0042 · date │
└──────────────────────────────────────────────────────────────┘
```

**Key design rules:**
- Dark navy (`#05253D`) header and table header row
- Size chips inline: `S×10` in blue pill badges
- Decoration summary on one line per deco: `🎨 Front · Screen Print 2c`
- Finishing on one line: `✂ Tags, Hem Tags`
- No per-decoration pricing shown (totals only)
- Notes + totals side-by-side at the bottom
- Company footer

---

## Stage 6 — Polish & Production Readiness

### UI Quality
- Skeleton loaders on all data-fetching views
- Empty states with helpful CTAs (no orders → "Create your first order")
- Responsive layout: mobile-friendly order list; catalog and create modal stack vertically on small screens
- Keyboard accessibility: Escape closes modals, Tab navigation through form fields

### Data Integrity
- Optimistic updates via React Query for status changes
- Supabase Row Level Security (if auth is added later — design schema to be RLS-ready)
- `updated_at` trigger on `orders` table
- On delete order: cascade delete `order_items`, `order_item_decorations`, `order_item_finishing`

### Search & Filters
- Orders: full-text search on order_number + customer_name
- Catalog garments: search by brand, name, style#, color, category
- Customers: search by name, company, email

### Status History (optional enhancement)
```sql
CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_at timestamptz DEFAULT now()
);
```
- Show timeline in order detail panel

---

## Key Pricing Logic

### How decoration pricing is computed

```typescript
// Look up price from decoration_matrix
function lookupDecorationPrice(matrix, groupId, qty, colIndex) {
  const row = matrix
    .filter(r => r.group_id === groupId)
    .find(r => qty >= r.qty_min && (r.qty_max == null || qty <= r.qty_max));
  return row?.prices[colIndex] ?? 0;
}

// When per-size pricing exists, group sizes by price tier
// Each group gets decoration pricing looked up using that GROUP's qty
// e.g. S/M/L all at $12 = 45 pcs → deco lookup at 45 pcs
//      XL/2XL at $14 = 10 pcs → deco lookup at 10 pcs

// Sell price per piece = garment price + decoration total + finishing total
// Line total = sum across all size groups of (group qty × group total/pc)
```

### Size matrix storage
- Garment sell prices stored in `garments.size_upcharges`: `{ "S": 12.00, "XL": 14.00 }`
- Order quantities stored in `order_items.size_matrix`: `{ "S": 10, "M": 20, "L": 15 }`
- Both use the size label as key — always consistent

---

## Supabase Migrations (in order)

1. `001_core_tables.sql` — customers, company_settings
2. `002_catalog.sql` — garments, decoration_groups, decoration_matrix, finishing_services
3. `003_orders.sql` — orders, order_items, order_item_decorations, order_item_finishing
4. `004_indexes.sql` — indexes on order_id, customer_id, group_id FKs
5. `005_updated_at_trigger.sql` — auto-update `updated_at` on orders
6. `006_status_history.sql` — order_status_history table (optional)

---

## Color & Design Tokens

```css
--primary:     #05253D   /* dark navy — headers, totals, CTAs */
--accent:      #2563EB   /* blue — active states, prices, links */
--success:     #059669   /* green — paid, delivered, deposit */
--warning:     #F59E0B   /* amber — preview states, overdue */
--danger:      #DC2626   /* red — cancelled, discounts, overdue dates */
--muted:       #64748B   /* slate — secondary text, labels */
--border:      #E2E8F0   /* light border */
--bg-alt:      #F8FAFC   /* off-white — table rows, card backgrounds */
```

---

## What's Intentionally Excluded

- ❌ Invoices (no invoice creation, sending, or tracking)
- ❌ Revenue dashboard / analytics
- ❌ Payment processing
- ❌ Email sending (status notifications are shown as banners, not sent)
- ❌ User authentication (single-user, local use)
- ❌ Multi-location / multi-user
