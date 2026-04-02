import { CuratedNucleiCheck } from './types';

// ──────────────────────────────────────────────
// Curated Nuclei Checks — Commercial Mapping
//
// These are NOT "all Nuclei templates".
// These are hand-selected checks where a match
// has defensible commercial meaning for Vestigio.
//
// Adding a new check:
// 1. Identify the nuclei template
// 2. Map it to a CommercialDownsideFamily
// 3. Write a commercial_interpretation (business language)
// 4. Set commercial_confidence (how reliably does a match = downside?)
// 5. Set severity_weight based on business impact, not CVSS
// ──────────────────────────────────────────────

export const CURATED_CHECKS: CuratedNucleiCheck[] = [
  // ── Payment Integrity ─────────────────────────
  // Checks that detect exposure on or near payment/checkout surfaces

  {
    check_id: 'vi_payment_xss_reflected',
    name: 'Reflected XSS near payment surface',
    downside_family: 'payment_integrity',
    nuclei_template: 'dast/vulnerabilities/xss/reflected-xss.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 75,
    severity_weight: 'high',
    commercial_interpretation: 'Script injection possible on or near purchase surfaces. An attacker can insert unauthorized code into the page a buyer sees at checkout, enabling payment data interception, fake payment forms, or session hijack.',
  },
  {
    check_id: 'vi_payment_formjacking_risk',
    name: 'External script loading on payment pages',
    downside_family: 'payment_integrity',
    nuclei_template: 'http/vulnerabilities/generic/external-script-load.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 65,
    severity_weight: 'high',
    commercial_interpretation: 'External scripts loading on payment-adjacent surfaces without integrity controls. This is the formjacking pattern — unauthorized JavaScript can intercept card numbers and payment credentials in real time.',
  },
  {
    check_id: 'vi_payment_missing_csp',
    name: 'No Content-Security-Policy on commercial pages',
    downside_family: 'payment_integrity',
    nuclei_template: 'http/misconfiguration/missing-csp-header.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 60,
    severity_weight: 'medium',
    commercial_interpretation: 'No Content-Security-Policy on commercial pages. Without CSP, the browser cannot distinguish authorized scripts from injected ones — the checkout surface has no defense against unauthorized code execution.',
  },

  // ── Channel Trust ─────────────────────────────
  // Checks that detect weak public posture on commercial hosts

  {
    check_id: 'vi_channel_directory_listing',
    name: 'Directory listing enabled',
    downside_family: 'channel_trust',
    nuclei_template: 'http/misconfiguration/directory-listing.yaml',
    commercial_surface_relevant: false,
    commercial_confidence: 55,
    severity_weight: 'medium',
    commercial_interpretation: 'Server directory listing exposes internal file structure to anyone. Buyers or competitors can browse server contents, creating an impression of amateur or abandoned infrastructure that undermines purchase confidence.',
  },
  {
    check_id: 'vi_channel_open_redirect',
    name: 'Open redirect on commercial domain',
    downside_family: 'channel_trust',
    nuclei_template: 'dast/vulnerabilities/redirect/open-redirect.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 65,
    severity_weight: 'high',
    commercial_interpretation: 'An open redirect allows anyone to create links that appear to be from this domain but redirect buyers to phishing or malicious destinations. Attackers use this to harvest credentials or payment data while appearing legitimate.',
  },
  {
    check_id: 'vi_channel_cors_wildcard',
    name: 'Permissive CORS on commercial endpoints',
    downside_family: 'channel_trust',
    nuclei_template: 'http/misconfiguration/cors-misconfig.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 55,
    severity_weight: 'medium',
    commercial_interpretation: 'Overly permissive CORS policy allows any external site to make authenticated requests on behalf of the user. Customer session data, pricing, or account information can be read by unauthorized third parties.',
  },

  // ── Commerce Continuity ───────────────────────
  // Checks that detect operational exposure threatening commerce uptime

  {
    check_id: 'vi_ops_admin_panel_exposed',
    name: 'Admin panel publicly accessible',
    downside_family: 'commerce_continuity',
    nuclei_template: 'http/exposed-panels/generic-admin-panel.yaml',
    commercial_surface_relevant: false,
    commercial_confidence: 60,
    severity_weight: 'high',
    commercial_interpretation: 'Administrative panel accessible from the public internet without restriction. An attacker who gains access can modify pricing, disable checkout, alter product listings, or extract customer data — any of which causes immediate commerce disruption.',
  },
  {
    check_id: 'vi_ops_debug_exposed',
    name: 'Debug/development endpoint exposed',
    downside_family: 'commerce_continuity',
    nuclei_template: 'http/exposures/debug-endpoint.yaml',
    commercial_surface_relevant: false,
    commercial_confidence: 55,
    severity_weight: 'medium',
    commercial_interpretation: 'Debug or development endpoints are reachable on the production domain. These surfaces expose internal system state, database queries, or error details that help attackers map the system for targeted disruption.',
  },
  {
    check_id: 'vi_ops_env_file_exposed',
    name: 'Environment file publicly accessible',
    downside_family: 'commerce_continuity',
    nuclei_template: 'http/exposures/configs/env-file.yaml',
    commercial_surface_relevant: false,
    commercial_confidence: 70,
    severity_weight: 'high',
    commercial_interpretation: 'Environment configuration file (.env) accessible from the public internet. These files typically contain database credentials, API keys, payment provider secrets, and encryption keys — everything needed to compromise the entire commerce operation.',
  },

  // ── Trust Posture ─────────────────────────────
  // Checks that detect visible technical weakness undermining confidence

  {
    check_id: 'vi_trust_missing_hsts',
    name: 'No HSTS on commercial domain',
    downside_family: 'trust_posture',
    nuclei_template: 'http/misconfiguration/missing-hsts.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 50,
    severity_weight: 'low',
    commercial_interpretation: 'No HTTP Strict Transport Security header. Browsers can be tricked into connecting over unencrypted HTTP, enabling interception of payment data and session credentials on the commercial domain.',
  },
  {
    check_id: 'vi_trust_mixed_content',
    name: 'Mixed content on HTTPS pages',
    downside_family: 'trust_posture',
    nuclei_template: 'http/misconfiguration/mixed-content.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 55,
    severity_weight: 'medium',
    commercial_interpretation: 'HTTPS pages load resources over unencrypted HTTP. Browsers show security warnings, the padlock icon disappears, and cautious buyers interpret this as an unsafe purchase environment.',
  },
  {
    check_id: 'vi_trust_expired_cert',
    name: 'SSL certificate expired or invalid',
    downside_family: 'trust_posture',
    nuclei_template: 'ssl/expired-ssl.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 80,
    severity_weight: 'high',
    commercial_interpretation: 'SSL certificate is expired, invalid, or misconfigured. Browsers display a full-page warning before the site loads. No buyer will proceed past a browser security warning — 100% of traffic hitting this condition bounces.',
  },

  // ── Abuse Exposure ────────────────────────────
  // Checks that detect conditions enabling fraud, gaming, or business-logic abuse

  {
    check_id: 'vi_abuse_api_exposed',
    name: 'API endpoint exposed without authentication',
    downside_family: 'abuse_exposure',
    nuclei_template: 'http/exposures/apis/unauthenticated-api.yaml',
    commercial_surface_relevant: false,
    commercial_confidence: 55,
    severity_weight: 'medium',
    commercial_interpretation: 'API endpoints accessible without authentication. Attackers can automate pricing lookups, inventory checks, account enumeration, or coupon abuse at scale — enabling margin leakage, competitive intelligence scraping, and automated fraud.',
  },
  {
    check_id: 'vi_abuse_graphql_introspection',
    name: 'GraphQL introspection enabled',
    downside_family: 'abuse_exposure',
    nuclei_template: 'http/exposures/apis/graphql-introspection.yaml',
    commercial_surface_relevant: false,
    commercial_confidence: 50,
    severity_weight: 'medium',
    commercial_interpretation: 'GraphQL introspection exposes the complete API schema to anyone. An attacker can map all available queries, mutations, and data types — discovering pricing logic, user management, and order manipulation endpoints without guessing.',
  },

  // ── Abuse Exposure: Business-Logic / Economic Exploitation ──
  // Phase 3A hardening: deeper abuse axis

  {
    check_id: 'vi_abuse_cart_manipulation',
    name: 'Cart/pricing endpoint accessible without session validation',
    downside_family: 'abuse_exposure',
    nuclei_template: 'http/vulnerabilities/generic/idor-cart-price.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 65,
    severity_weight: 'high',
    commercial_interpretation: 'Cart or pricing endpoints respond to direct manipulation without proper session validation. Attackers can modify quantities, apply unauthorized discounts, or alter line-item pricing — enabling systematic margin theft on every transaction.',
  },
  {
    check_id: 'vi_abuse_coupon_enumeration',
    name: 'Coupon/promo endpoint enumerable',
    downside_family: 'abuse_exposure',
    nuclei_template: 'http/vulnerabilities/generic/coupon-brute.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 60,
    severity_weight: 'high',
    commercial_interpretation: 'Coupon or promotional code endpoints respond to enumeration attempts. Automated tools can discover valid codes at scale — enabling systematic discount abuse, promotion stacking, and margin erosion across the customer base.',
  },
  {
    check_id: 'vi_abuse_account_enumeration',
    name: 'Account enumeration possible via login/register',
    downside_family: 'abuse_exposure',
    nuclei_template: 'http/vulnerabilities/generic/user-enumeration.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 55,
    severity_weight: 'medium',
    commercial_interpretation: 'Login or registration endpoints reveal whether an email address has an account. Attackers use this to build verified customer lists for credential stuffing, targeted phishing, or competitor intelligence.',
  },
  {
    check_id: 'vi_abuse_refund_endpoint_exposed',
    name: 'Refund or cancellation endpoint reachable without auth',
    downside_family: 'abuse_exposure',
    nuclei_template: 'http/exposures/apis/unauthenticated-refund.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 70,
    severity_weight: 'high',
    commercial_interpretation: 'Refund, cancellation, or order-modification endpoints are reachable without proper authentication. Automated refund fraud — initiating chargebacks, cancellations, or returns without legitimate customer action — becomes trivially scriptable.',
  },
  {
    check_id: 'vi_abuse_rate_limit_missing',
    name: 'No rate limiting on commercial endpoints',
    downside_family: 'abuse_exposure',
    nuclei_template: 'http/misconfiguration/rate-limit-missing.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 50,
    severity_weight: 'medium',
    commercial_interpretation: 'Commercial endpoints accept unlimited requests without rate limiting. Automated bots can exhaust inventory, scrape pricing, test stolen cards, or brute-force account credentials — at volume that overwhelms legitimate traffic.',
  },

  // ── Payment Integrity: Skimming-Adjacent ──

  {
    check_id: 'vi_payment_sri_missing',
    name: 'External payment scripts without integrity verification',
    downside_family: 'payment_integrity',
    nuclei_template: 'http/misconfiguration/missing-sri.yaml',
    commercial_surface_relevant: true,
    commercial_confidence: 55,
    severity_weight: 'medium',
    commercial_interpretation: 'External JavaScript loaded on payment pages without Subresource Integrity (SRI) hashes. If the external CDN is compromised, the modified script executes in the buyer browser with full access to payment forms — the exact mechanism used in Magecart and web-skimming attacks.',
  },
];
