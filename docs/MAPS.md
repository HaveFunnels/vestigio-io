# MAPS — Deep Audit & Revamp Plan

> **Status**: 2026-04-16 audit. Maps module has a solid XYFlow foundation and real data pipelines, but several concerns block a shippable client-facing experience. This doc captures the ground truth, the gaps, and the proposed revamp.

---

## 1. Executive summary

The maps module currently lives at [`/app/maps`](src/app/app/maps/page.tsx) and renders **four fixed map types** using `@xyflow/react` v12.10.1:

| Map | Source | Real data? |
|---|---|---|
| **User Journey** | `/api/maps/user-journey` → Prisma (`PageInventoryItem` + `SurfaceRelation`) | ✅ Live, **but skipped for `orgId === "demo"`** |
| **Revenue Leakage** | MCP `get_map` → `buildRevenueLeakageMap()` | ✅ Live (from MCP projections) |
| **Chargeback Risk** | MCP `get_map` → `buildChargebackRiskMap()` | ✅ Live |
| **Root Cause** | MCP `get_map` → `buildRootCauseMap()` | ✅ Live |

**The foundation is good** — XYFlow gives us pan/zoom/minimap for free, the engine at [`packages/maps/engine.ts`](packages/maps/engine.ts) cleanly separates data derivation from rendering, and the node/edge type system is extensible.

**What blocks shipping to clients**:

1. **No scalable entry pattern** — four map types already crowd the pill bar; a fifth will look amateurish.
2. **"Usar como Contexto" is a lie** — the button navigates to `/app/chat?context=maps` and the chat page explicitly ignores that param. No map data reaches the LLM.
3. **Zero filter UI** — unlike `/analysis`, maps are "take the whole dataset or nothing."
4. **Mobile is functionally broken** — `minHeight: 500` with no responsive fallback, no touch gesture hints, MiniMap + Controls overlap on narrow viewports.
5. **Demo account shows empty User Journey** — looks broken to every evaluator who hits the demo first.
6. **User Journey is under-featured** — the flagship map has no cohorts, no time frame, no Starting/Ending filters like a mature funnel tool (see reference images in the conversation).
7. **Legend vs nodes drift** — legend shows 4 shapes (RootCause, Finding, Action, Category) but 7 node types render (`policy`, `support`, `trust`, `measurement`, `checkout`, `journey_commercial`, `journey_support` are all folded into "Category" in the legend). The journey nodes don't even share the Category visual.
8. **No custom/saved maps** — everything is hardcoded.

---

## 2. Current architecture (ground truth)

### Routing & entry
- Page: [`src/app/app/maps/page.tsx:722`](src/app/app/maps/page.tsx#L722)
- Sidebar entry: [`src/components/app/sidebar-nav-data.ts:77-81`](src/components/app/sidebar-nav-data.ts#L77) (`id: "maps"`, single top-level item, no children)
- Top-bar pill selector: [`src/app/app/maps/page.tsx:914-930`](src/app/app/maps/page.tsx#L914) — `allMaps.map((m) => <button>)` with emerald active-state styling

### Canvas
- Library: `@xyflow/react` 12.10.1 ([package.json:36](package.json#L36))
- Node types registered: [`page.tsx:287-298`](src/app/app/maps/page.tsx#L287)
  - `root_cause`, `finding`, `action`
  - `policy`, `support`, `trust`, `measurement`, `checkout` (all → `CategoryNode`)
  - `journey_commercial`, `journey_support` (User Journey–specific)
- Edge types: [`page.tsx:300-309`](src/app/app/maps/page.tsx#L300) — `causal` (red, animated), `transition` (blue), `contributes_to` (dashed gray), `addresses` (emerald)
- Layout: hierarchical column layout in [`engine.ts:383-432`](packages/maps/engine.ts#L383) (fixed columns at x=0/400/800, 80 px vertical spacing, severity-sorted)
- Canvas shell: [`page.tsx:933-966`](src/app/app/maps/page.tsx#L933) — `ReactFlow` + `Background` + `Controls` + `MiniMap` + tooltip overlay
- Legend: [`page.tsx:969-1000`](src/app/app/maps/page.tsx#L969) — static footer bar with 4 node chips + 3 edge chips

### Data pipeline

**Engine maps (Revenue / Chargeback / Root Cause)**:
```
MultiPackResult (intelligence + projections)
  → packages/maps/engine.ts builders
    → MapDefinition { id, name, type, nodes[], edges[] }
      → MCP tool `get_map` (apps/mcp/tools.ts:140)
        → src/lib/console-data.ts#loadAllMaps (:197-210)
          → McpDataProvider context
            → client page via useMcpData()
```
No React. Pure data derivation. Impact aggregation via `computeRCImpact()` at [`engine.ts:355-370`](packages/maps/engine.ts#L355).

**User Journey**:
```
PageInventoryItem + SurfaceRelation (Prisma)
  → /api/maps/user-journey/route.ts
    → client fetch on mount (page.tsx:775-782)
```
Classifies pages by `pageType` into commercial funnel stages (homepage=0 … thank_you=7), falls back to sequential stage-based edges if no runtime relations exist.

**Critical quirk**: [`route.ts:26-28`](src/app/api/maps/user-journey/route.ts#L26) — returns `{map: null}` unconditionally for `orgId === "demo"`. Demo users land on maps and see *no* User Journey, only the three engine maps.

### Types
[`packages/maps/types.ts`](packages/maps/types.ts):
- `MapNode { id, type, label, severity, impact, pack, metadata, position }`
- `MapEdge { id, source, target, type, label }`
- `MapType = 'revenue_leakage' | 'chargeback_risk' | 'root_cause'` (⚠️ **`user_journey` not in the union** — it's smuggled in as a string literal at runtime)
- No Zod schemas. MCP `get_map` validates `map_type` enum, but response shape is unchecked.

### i18n
- **en** ([dictionary/en.json:2758-2819](dictionary/en.json#L2758)) — complete
- **pt-BR** ([dictionary/pt-BR.json:2813-2869](dictionary/pt-BR.json#L2813)) — complete, incl. `useAsContext: "Usar como Contexto"`
- **de** ([dictionary/de.json:1994-2051](dictionary/de.json#L1994)) — missing `useAsContext` key. Will fall back to English.

---

## 3. Concerns raised, investigated

### 3.1 Top-menu pill bar won't scale

**Confirmed**. Pills are rendered inline in a flex row with no overflow handling. Four maps today; a fifth or sixth will wrap awkwardly or push the page beyond viewport width. Names like "Revenue Leakage Map", "Chargeback Risk Map" are long, and custom user-generated maps will make this worse.

**Location**: [`page.tsx:914-930`](src/app/app/maps/page.tsx#L914)

### 3.2 Legend vs nodes drift

**Confirmed**. The legend claims 4 node shapes:
- Root Cause (red border)
- Finding (amber border)
- Action (emerald border)
- Category (blue border)

But the implementation renders **7 node categories** using different visuals:
- `policy`, `support`, `trust`, `measurement`, `checkout` → all `CategoryNode` (blue) — ✅ legend matches
- `journey_commercial` → `JourneyCommercialNode` with **page-type-specific colors** (homepage/landing green, product blue, pricing violet, cart amber, checkout red, confirmation green) — ❌ legend does not cover this
- `journey_support` → dashed, muted — ❌ legend does not cover this

When the User Journey map is active, the legend at the bottom is **factually incorrect** — users see six different node colors but the legend only has four chips.

Additionally, the `redirect` edge type used in User Journey ([`route.ts:206`](src/app/api/maps/user-journey/route.ts#L206)) is **not registered in the edge types map** at [`page.tsx:300`](src/app/app/maps/page.tsx#L300), so those edges render with default styling, not matching either the legend or the rest of the map.

### 3.3 Mobile is unusable

**Confirmed**. Concrete issues:
- Fixed `minHeight: 500` on canvas ([`page.tsx:933`](src/app/app/maps/page.tsx#L933)) — doesn't adapt to portrait viewports
- `MiniMap` + `Controls` both anchored and will stack over each other < ~400 px
- The footer legend is a single horizontal flex row with no wrap — will overflow on narrow screens
- No pinch-zoom gesture hints. XYFlow supports touch pan/zoom by default, but users don't know that, and the desktop-style toolbar buttons are the only visible affordance.
- The top pill bar and the 520 px-max-width side drawer also overflow on mobile.

### 3.4 Connectors overlapping nodes

**Root cause**: the layout algorithm in [`engine.ts:383`](packages/maps/engine.ts#L383) is a naive 3-column hierarchy. It does no edge-routing optimization — XYFlow's default `bezier` edges take the shortest path and cut straight through intermediate nodes when the source/target are not in adjacent columns or when many findings share one root cause.

The `CategoryNode` variant is a rounded box with the label centered inside; edges don't route around the box, they terminate at whatever handle XYFlow picks, often crossing the label.

**Also**: there is no collision avoidance. Two nodes at the same y-coordinate in different columns can have their connecting edge run *on top of* a node in a third column.

### 3.5 Is the data real or decorative?

**Mostly real, with one gotcha**:
- Engine maps (Revenue / Chargeback / Root Cause) are computed from `MultiPackResult.intelligence.root_causes` + `projections.findings` + `projections.actions`. Node count, impact aggregation (`computeRCImpact`), and edges all reflect live analysis output.
- User Journey nodes come from `PageInventoryItem` (crawled pages). Edges come from `SurfaceRelation` records (anchors, form_actions, redirects, runtime navigation captured by the pixel/agent).
- **The "Mode 2 pixel-enhanced" path promised in the route.ts header comment is NOT implemented**. There are no conversion rates, no dropoff percentages, no cohort data. The only behavioral field right now is the binary existence of a `SurfaceRelation`.
- **Demo account shows `null`** — so evaluators see a broken UX.

**Verdict**: the numbers aren't fake, but the *experience* doesn't yet match what a user would expect from a funnel visualization (no percentages, no time aggregation, no cohorts).

### 3.6 "Usar como Contexto" is a no-op

**Confirmed broken**. [`page.tsx:742`](src/app/app/maps/page.tsx#L742) navigates to `/app/chat?context=maps`. The chat page at [`src/app/app/chat/page.tsx:529-530`](src/app/app/chat/page.tsx#L529) literally has:

```tsx
if (context === "maps") {
  // No items, no hydration — fall through.
}
```

Nothing about the map — not the map ID, not the visible nodes, not the node the user had open in the drawer — is passed to the LLM. The button is pure theater. On top of that, the `ShinyButton` with `variant="console"` uses a treatment that doesn't appear anywhere else in the console; it's visually orphaned.

### 3.7 No custom/user-defined maps

**Confirmed**. The union type is closed to 3 engine builders + 1 hardcoded User Journey. No persistence layer. No way to define a map from MCP/chat and have it appear in the maps page.

---

## 4. Proposed revamp

### 4.1 The "Antesala" (Map Gallery)

Replace the current pill selector with a **gallery-style landing view** at `/app/maps` that shows all available maps as cards, grouped by category. Clicking a card opens the canvas at `/app/maps/{mapId}`.

```
┌─────────────────────────────────────────────────────────────┐
│  Maps                          [+ Create custom map]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STANDARD                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ User     │  │ Revenue  │  │ Charge-  │  │ Root     │    │
│  │ Journey  │  │ Leakage  │  │ back     │  │ Cause    │    │
│  │ [preview]│  │ [preview]│  │ [preview]│  │ [preview]│    │
│  │ 14 pages │  │ 3 RCs    │  │ 5 RCs    │  │ 9 RCs    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                             │
│  CREATED BY YOU                                             │
│  ┌──────────┐  ┌──────────┐                                 │
│  │ Checkout │  │ Support  │                                 │
│  │ Drop-off │  │ Tickets  │                                 │
│  │ Funnel   │  │ Flow     │                                 │
│  │ Apr 12   │  │ Apr 14   │                                 │
│  └──────────┘  └──────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

Each card shows:
- Map title + icon
- Last-computed timestamp
- A thumbnail (miniature SVG derived from the map's node positions + node-type colors)
- A one-line description ("Shows findings grouped by revenue impact root cause" etc.)
- Number of nodes / key stat

Benefits:
- Scales to N maps without UI degradation
- Gives each map a chance to explain itself before the user commits
- Provides a natural home for "Mapas criados" (user-generated maps)
- Matches the shape of `/analysis` landing → specific run, familiar pattern in the app

Implementation notes:
- Gallery route: `/app/maps` renders the grid
- Canvas route: `/app/maps/[mapId]` renders the existing canvas (moved from the current single page)
- Keep the `McpDataProvider` boundary so map data is still preloaded at the layout level
- Thumbnails: compute server-side from the `MapDefinition`, render as inline SVG (no XYFlow needed for a 200×120 preview)

### 4.2 User Journey v2 — the flagship

Match the reference images the user shared (Mixpanel/Amplitude-style). Add a filter bar above the canvas:

```
STARTING            ENDING              USERS IN         TIME
[Any Page ▾]   to  [Any Page ▾]   for  [All Users ▾]   in  [Last 30 Days ▾]
```

- **Starting / Ending**: selector over `PageInventoryItem` entries (filtered by `pageType` and tier). Defaults to homepage → confirmation.
- **Users In**: cohorts. Requires a cohorts primitive we don't yet have — scope Wave 1 to "All users" and "Returning vs new" using the pixel session data. Full cohort builder is Wave 3.
- **Time Frame**: standard Last 7/30/90 days + custom range. Reuse the same `DateRangePicker` pattern from `/analysis`.

Reuse the no-code filter stack from [`src/app/app/analysis/page.tsx:37-96`](src/app/app/analysis/page.tsx#L37). The SeverityFilter / PackFilter / etc. components there are good templates — we'll create `StartingPageFilter`, `EndingPageFilter`, `CohortFilter`, `TimeFrameFilter` following the same pattern (controlled, URL-synced via search params, typed).

Node rendering upgrades:
- Show conversion % on each node (`{n.metadata.conversionRate}%`)
- Show drop-off % on each edge
- Use the Vestigio visual language (not the generic blue bars in the reference images, but the same *information density*)
- Hatched/striped "Other events" and "Drop-off" pseudo-nodes when a step has noise below the display threshold, exactly like the Amplitude screenshots

Data-wise, this requires the Mode 2 pixel-enhanced path to actually exist. Gate the v2 UX behind `if (map.metadata.mode === 'pixel-enhanced')`; show v1 (inferred) as a graceful fallback with a "Install tracking pixel to see conversion rates" prompt.

### 4.3 Custom maps from MCP

A user asks in chat: *"Show me a map of all findings that mention refund timing, grouped by severity."* The MCP:

1. Resolves the query via existing `search_findings` / `get_findings_by_pack` tools
2. Builds a `MapDefinition` using the existing `buildXxxMap` pattern or a new generic builder
3. Persists it via a new `CustomMap` Prisma model (`id`, `organizationId`, `name`, `description`, `definitionJson`, `createdByUserId`, `createdAt`)
4. Returns `{ mapId, url: "/app/maps/{id}" }` to the chat

In the Antesala, custom maps appear under "Criados por você". Clicking opens the same canvas. Editing = "Edit description" + "Regenerate from prompt" (stored prompt).

New MCP tools needed:
- `create_custom_map({ prompt, filters, nodeQuery, edgeQuery }) → { mapId, definition }`
- `list_custom_maps() → CustomMap[]`
- `delete_custom_map({ mapId })`

Start conservative: ship with one "generic finding graph" builder that takes a filter predicate and returns a findings-grouped-by-root-cause map. That covers ~60% of the plausible asks.

### 4.4 Fix "Usar como Contexto"

Make it actually carry context. When clicked, instead of `window.location.href = /app/chat?context=maps`, post the current map's **visible state** as a chat context item:

```
?context=map:{mapId}&focusNode={optionalSelectedNodeId}
```

Then in the chat page's `useEffect` that currently ignores `context === "maps"`, hydrate a new `ChatContextKind = "map"` that includes:
- Map title
- Node count by type
- The selected node (if any) with its label, severity, impact
- A stable URL back to the canvas view

The LLM then has something concrete to reason about: *"You are looking at the Revenue Leakage map. It contains 9 findings linked to 3 root causes…"*. This is a ~100-line change across the chat context reducer.

Also: retire the `ShinyButton variant="console"` in favor of the same primary button treatment used elsewhere in the console (keep the shiny border-gradient animation if you like it — but promote that variant to a shared component, don't leave it as a one-off).

### 4.5 Mobile fixes

- Replace fixed `minHeight: 500` with `h-[calc(100dvh-var(--header-h))]` or a responsive ratio
- Auto-collapse MiniMap on `< md` breakpoint
- Move Controls to a bottom-sheet-like overlay on touch devices
- Wrap the legend to a 2×4 grid when `< sm`
- Add a first-visit hint overlay on touch devices: "Pinch to zoom • Drag to pan"
- Cards in the Antesala become a 1-column list on mobile, not a grid

### 4.6 Legend fidelity

Make the legend **per-map** instead of global. Each `MapDefinition` declares its own legend entries in metadata:

```ts
interface MapDefinition {
  // ...
  legend: {
    nodes: Array<{ type: MapNodeType; label: string; swatchClass: string }>;
    edges: Array<{ type: MapEdgeType; label: string; strokeClass: string }>;
  };
}
```

The page reads `activeMap.legend` and renders only what's present. User Journey gets its page-type swatches; engine maps get the 4-chip legend.

Also register the missing `redirect` edge type in [`page.tsx:300`](src/app/app/maps/page.tsx#L300).

### 4.7 Layout / edge-routing improvements

Two options:
- **Cheap**: add y-sorting inside each column so edges trend left-to-right without vertical backtracks. Use a barycenter heuristic: for each node, compute the mean y of its connected neighbors in the adjacent column and re-sort.
- **Proper**: swap the custom `applyHierarchicalLayout` for `elkjs` (`@visx/hierarchy` is an alternative) and let it handle edge routing properly. ELK has a React Flow adapter.

Start with the cheap option for engine maps; go ELK for User Journey where we care more.

### 4.8 Demo account parity

Don't return `null` for `orgId === "demo"` in the journey API. Either:
- Seed the demo org with realistic `PageInventoryItem` + `SurfaceRelation` records (preferred — they're cheap and make the demo shine), or
- Generate a synthetic demo journey that labels itself as demo data in the UI

Current behavior ([`route.ts:26`](src/app/api/maps/user-journey/route.ts#L26)) is the worst of both worlds: evaluator lands on the flagship map → gets nothing → leaves.

---

## 5. Prioritized roadmap

### Wave 1 — "stop embarrassing us" (1 week)
1. **Fix "Usar como Contexto"** to actually carry map state into chat. Retire or standardize the `ShinyButton variant="console"`.
2. **Fix the legend** — per-map legend config + register the `redirect` edge type.
3. **Demo account seed** — make `orgId === "demo"` return a real synthetic journey.
4. **Mobile minimum** — responsive canvas height, wrap-able legend, pill bar → horizontal scroll on overflow.
5. **Add `user_journey` to the `MapType` union** at [`packages/maps/types.ts`](packages/maps/types.ts) — remove the string-literal smuggling.

### Wave 2 — "the Antesala" (1-2 weeks)
1. Split `/app/maps` into gallery at `/app/maps` and canvas at `/app/maps/[mapId]`.
2. Card thumbnails server-side rendered as SVG.
3. Per-map description + last-computed metadata.
4. Remove the in-canvas pill selector (replaced by the gallery).

### Wave 3 — "User Journey v2" (2-3 weeks, requires pixel data)
1. Starting / Ending / Cohort / TimeFrame filter bar (reuse `/analysis` primitives).
2. Conversion % on nodes, drop-off % on edges.
3. "Other events" and "Drop-off" pseudo-nodes.
4. Mode 2 pixel-enhanced path — actually implement it in [`route.ts`](src/app/api/maps/user-journey/route.ts).

### Wave 4 — "Custom maps" (2 weeks)
1. `CustomMap` Prisma model + migration.
2. MCP tools: `create_custom_map`, `list_custom_maps`, `delete_custom_map`.
3. Gallery: "Criados por você" section.
4. Generic filter-predicate builder for findings / root causes / surfaces.

### Wave 5 — "polish"
1. ELK layout for User Journey.
2. Edge-label rendering (we have `MapEdge.label` but don't render it).
3. Export map as PNG / shareable link.
4. Per-node "Discuss in chat" button → uses the same context mechanism from Wave 1.

---

## 6. Open questions

- **Cohorts**: how deep? The reference images show iOS vs Android cohorts — we don't have device/platform breakdowns in the current pixel payload. Need to decide whether to extend the pixel schema or ship with a narrower cohort model (new-vs-returning only).
- **Custom map persistence model**: do custom maps belong to a user or to an organization? Current hunch: organization, with a `createdByUserId` audit field.
- **Pricing / packaging**: are custom maps a premium feature? If yes, we need a gate in the gallery.
- **Map versioning**: when the underlying analysis cycle changes, do saved custom maps auto-refresh, or are they snapshots? Probably auto-refresh with a "last updated" timestamp.

---

## 7. Files touched in a typical Wave 1 PR

| File | Change |
|---|---|
| [src/app/app/maps/page.tsx](src/app/app/maps/page.tsx) | Remove pill bar, fix legend binding, mobile responsive, fix "Usar como Contexto" onClick |
| [src/app/app/chat/page.tsx](src/app/app/chat/page.tsx#L529) | Handle `context=map:{id}` with new `ChatContextKind = "map"` |
| [src/app/api/maps/user-journey/route.ts](src/app/api/maps/user-journey/route.ts#L26) | Stop returning null for demo org |
| [packages/maps/types.ts](packages/maps/types.ts) | Add `user_journey` to `MapType`, add `legend` field to `MapDefinition` |
| [packages/maps/engine.ts](packages/maps/engine.ts) | Populate `legend` per builder |
| [dictionary/de.json](dictionary/de.json#L1994) | Add missing `useAsContext` key |

---

*Last updated: 2026-04-16*
