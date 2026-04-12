/**
 * Guide: How to Connect Shopify to Vestigio
 * ─────────────────────────────────────────────────────────────────
 *
 * Static guide article for the Knowledge Base. Unlike finding and
 * root-cause foundation articles, guides are hand-authored content
 * that walks the user through a specific workflow.
 *
 * This article is surfaced at slug `shopify-integration-setup` and
 * can be linked from the Data Sources settings page.
 */

import type { GuideArticle } from '../foundation-articles';

// ── Block helpers (local to keep the file self-contained) ──────

let _k = 0;
function k(): string {
  return `sg${(++_k).toString(36)}`;
}

function h2(text: string) {
  return {
    _type: 'block' as const,
    _key: k(),
    style: 'h2' as const,
    children: [{ _type: 'span' as const, _key: k(), text, marks: [] as string[] }],
  };
}

function h3(text: string) {
  return {
    _type: 'block' as const,
    _key: k(),
    style: 'h3' as const,
    children: [{ _type: 'span' as const, _key: k(), text, marks: [] as string[] }],
  };
}

function p(text: string) {
  return {
    _type: 'block' as const,
    _key: k(),
    style: 'normal' as const,
    children: [{ _type: 'span' as const, _key: k(), text, marks: [] as string[] }],
  };
}

function bold(text: string) {
  return {
    _type: 'block' as const,
    _key: k(),
    style: 'normal' as const,
    children: [{ _type: 'span' as const, _key: k(), text, marks: ['strong'] }],
  };
}

function quote(text: string) {
  return {
    _type: 'block' as const,
    _key: k(),
    style: 'blockquote' as const,
    children: [{ _type: 'span' as const, _key: k(), text, marks: [] as string[] }],
  };
}

// ── Article ────────────────────────────────────────────────────

export const shopifyIntegrationSetup: GuideArticle = {
  _id: 'guide:shopify-integration-setup',
  title: 'How to Connect Shopify to Vestigio',
  slug: { current: 'shopify-integration-setup' },
  category: 'guide',
  excerpt:
    'Step-by-step tutorial for connecting your Shopify store to Vestigio so that revenue estimates are replaced with real data and new commerce findings are unlocked.',
  body: [
    // ── Section 1: Why connect Shopify? ────────────────────────
    h2('Why connect Shopify?'),
    p(
      'By default, Vestigio estimates monetary impact using heuristics derived from your evidence quality and traffic signals. Connecting Shopify replaces those estimates with real revenue data from your store.',
    ),
    p('Once connected you unlock several benefits:'),
    p(
      '- Every finding shows exact dollar amounts instead of heuristic ranges.',
    ),
    p(
      '- New findings become available: abandoned checkout revenue leak, product dead weight, discount abuse, and repeat purchase rate.',
    ),
    p(
      '- The Revenue Recovery Tracker activates, letting you see how much Vestigio has helped you recover over time.',
    ),
    p(
      '- The Revenue Map in your workspace shows real dollar breakdowns by category.',
    ),

    // ── Section 2: What data does Vestigio read? ───────────────
    h2('What data does Vestigio read?'),
    p(
      'Vestigio requests a focused, read-only slice of your Shopify data. Here is exactly what we access and why:',
    ),
    p(
      '- Orders (last 90 days): revenue totals, refunds, payment methods, and discount usage. This powers dollar-accurate impact on every finding.',
    ),
    p(
      '- Customers: repeat purchase rate and lifetime value metrics. Used for the Repeat Purchase Rate finding and customer cohort analysis.',
    ),
    p(
      '- Products: catalog metadata for never-sold detection and product dead weight analysis.',
    ),
    p(
      '- Abandoned checkouts: cart abandonment rate and the total value left in abandoned carts.',
    ),
    p(
      '- Inventory levels: current stock quantities for out-of-stock detection.',
    ),
    bold(
      'Important: Vestigio requests READ-ONLY access. We never modify your store, create orders, change products, or touch customer records.',
    ),

    // ── Section 3: Required Shopify scopes ─────────────────────
    h2('Required Shopify API scopes'),
    p(
      'When you create the custom app inside Shopify you will enable exactly four Admin API scopes:',
    ),
    p('- read_orders — order and transaction data (revenue, refunds, discounts).'),
    p('- read_customers — customer metrics (repeat rate, lifetime value).'),
    p('- read_products — product catalog (titles, status, variants).'),
    p('- read_inventory — stock levels (out-of-stock detection).'),
    p(
      'No write scopes are requested. If Shopify shows additional scopes as available, leave them unchecked.',
    ),

    // ── Section 4: Step-by-step setup ──────────────────────────
    h2('Step-by-step setup'),

    h3('Step 1 — Open your Shopify admin'),
    p(
      'Log in to your Shopify admin at your-store.myshopify.com/admin. Replace "your-store" with your actual store handle.',
    ),

    h3('Step 2 — Navigate to app settings'),
    p('Go to Settings (bottom-left gear icon) then click Apps and sales channels.'),

    h3('Step 3 — Enable developer apps'),
    p(
      'Click Develop apps at the top of the page. If you see "Allow custom app development", click it first and confirm. This only needs to be done once per store.',
    ),
    p('[SCREENSHOT: Shopify admin showing the "Develop apps" button at the top of the Apps and sales channels page]'),

    h3('Step 4 — Create the app'),
    p(
      'Click Create an app. In the dialog, set the app name to "Vestigio" (or any name you prefer) and click Create app.',
    ),
    p('[SCREENSHOT: The "Create an app" dialog with the name field set to "Vestigio"]'),

    h3('Step 5 — Open API scope configuration'),
    p(
      'On the app overview page, click Configure Admin API scopes. This opens the permissions screen.',
    ),

    h3('Step 6 — Enable the required scopes'),
    p(
      'Use the search box to find each scope. Check the box next to: read_orders, read_customers, read_products, and read_inventory. Leave everything else unchecked.',
    ),
    p('[SCREENSHOT: The Admin API scopes page with the four required scopes checked: read_orders, read_customers, read_products, read_inventory]'),

    h3('Step 7 — Save and install the app'),
    p(
      'Click Save at the top-right, then go back to the app overview and click Install app. Shopify will ask you to confirm — click Install.',
    ),
    p('[SCREENSHOT: The install confirmation dialog showing the scopes the app will have access to]'),

    h3('Step 8 — Copy the access token'),
    p(
      'After installation, Shopify reveals the Admin API access token. It starts with shpat_. Click "Reveal token once" and copy the full token immediately.',
    ),
    bold(
      'Warning: Shopify only shows this token once. If you navigate away before copying it, you will need to uninstall and reinstall the app to generate a new token.',
    ),
    p('[SCREENSHOT: The "Admin API access token" section with the "Reveal token once" button, or the revealed token starting with shpat_]'),

    h3('Step 9 — Open Vestigio Data Sources'),
    p(
      'In Vestigio, go to Settings then Data Sources. Find the Shopify card and click it to open the connection form.',
    ),

    h3('Step 10 — Enter your credentials'),
    p(
      'Paste your store URL (e.g. your-store.myshopify.com) and the access token you copied in Step 8. Click Connect Shopify.',
    ),

    h3('Step 11 — Verify the connection'),
    p(
      'Vestigio will test the connection by making a read-only API call. If successful, the Shopify card shows a green "Connected" badge and data syncing begins automatically.',
    ),

    // ── Section 5: Troubleshooting ─────────────────────────────
    h2('Troubleshooting'),

    h3('"Connection failed"'),
    p(
      'Verify that the store URL includes .myshopify.com (not your custom domain) and that the access token starts with shpat_. If you use a custom domain like shop.example.com, use the underlying Shopify URL instead.',
    ),

    h3('"Permission denied"'),
    p(
      'Go back to the app in Shopify and check that all four API scopes (read_orders, read_customers, read_products, read_inventory) are enabled. After changing scopes you must reinstall the app.',
    ),

    h3('"No data yet"'),
    p(
      'Shopify data syncs during each audit cycle. The first sync happens automatically after a successful connection, but it may take a few minutes to complete. If no data appears after 30 minutes, check the connection status in Settings and verify the token is still valid.',
    ),

    // ── Section 6: What happens after connecting? ──────────────
    h2('What happens after connecting?'),
    p(
      'Once Shopify is connected and the first sync completes, several things change across your workspace:',
    ),
    p(
      '- All monetary impact estimates switch from heuristic to real data. Finding cards that previously showed a range now show exact dollar amounts.',
    ),
    p(
      '- New findings may appear that require real store data — such as abandoned checkout revenue leak, product dead weight, and discount abuse patterns.',
    ),
    p(
      '- The Revenue Map in your workspace shows real dollar breakdowns by finding category.',
    ),
    p(
      '- Bragging Rights (the Recovery Tracker) begins tracking estimated revenue recovered each time you resolve a finding.',
    ),
    p(
      'Subsequent audit cycles will re-sync Shopify data automatically, so the numbers stay current without any manual action.',
    ),
  ],
  publishedAt: null,
  is_foundation: true,
};
