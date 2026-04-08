// ──────────────────────────────────────────────
// Dashboard widgets — barrel + side-effect registry hookups
//
// Importing this file pulls in every widget module, and each
// module's top-level `registerWidget(...)` call populates the
// shared registry. Anyone wanting the registry to be ready must
// `import "@/lib/dashboard/init"` (which in turn imports this file).
//
// **To add a new widget:**
//   1. Create the component file in this directory
//   2. Make sure it calls `registerWidget(...)` at module top level
//   3. Add an `import "./NewWidget"` line below
//
// That's the entire wiring. The dashboard page, the catalog drawer,
// the layout engine — none of them need to know about the new
// widget. The registry-driven architecture handles the rest.
// ──────────────────────────────────────────────

import "./MoneyRecoveredTicker";
import "./ExposureKpiCard";
import "./HealthTrendCard";
import "./WhatChangedCard";
import "./ActivityHeatmap";
