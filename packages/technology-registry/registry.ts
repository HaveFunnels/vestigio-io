import { TechnologyDefinition } from './types';

// ──────────────────────────────────────────────
// Technology Registry — Canonical Definitions
//
// Single source of truth for all recognized technologies.
// Adding a new technology: add an entry here + drop logo file.
//
// Logo convention:
//   public/logos/technologies/{logo_key}.svg (preferred)
//   public/logos/technologies/{logo_key}.png (fallback)
//
// To add a new technology:
// 1. Add a TechnologyDefinition to TECHNOLOGY_REGISTRY below
// 2. Drop a logo file at public/logos/technologies/{key}.svg
// 3. Done — detection + frontend rendering are automatic
// ──────────────────────────────────────────────

export const TECHNOLOGY_REGISTRY: TechnologyDefinition[] = [
  // ── Platforms ──────────────────────────────────
  {
    key: 'shopify',
    display_name: 'Shopify',
    category: 'platform',
    website: 'https://www.shopify.com',
    logo_key: 'shopify',
    detection: [
      { source: 'script_src', pattern: /cdn\.shopify\.com/i, confidence: 80 },
      { source: 'html_content', pattern: /Shopify\.theme/i, confidence: 70 },
      { source: 'script_src', pattern: /checkout\.shopify\.com/i, confidence: 85 },
    ],
  },
  {
    key: 'wordpress',
    display_name: 'WordPress',
    category: 'platform',
    website: 'https://wordpress.org',
    logo_key: 'wordpress',
    detection: [
      { source: 'html_content', pattern: /wp-content/i, confidence: 70 },
      { source: 'html_content', pattern: /wp-includes/i, confidence: 65 },
    ],
  },
  {
    key: 'woocommerce',
    display_name: 'WooCommerce',
    category: 'platform',
    website: 'https://woocommerce.com',
    logo_key: 'woocommerce',
    detection: [
      { source: 'html_content', pattern: /woocommerce/i, confidence: 75 },
      { source: 'html_content', pattern: /wc-blocks/i, confidence: 65 },
    ],
  },
  {
    key: 'magento',
    display_name: 'Magento',
    category: 'platform',
    website: 'https://business.adobe.com/products/magento/magento-commerce.html',
    logo_key: 'magento',
    detection: [
      { source: 'html_content', pattern: /mage\/cookies/i, confidence: 75 },
      { source: 'html_content', pattern: /Magento_Ui/i, confidence: 80 },
    ],
  },
  {
    key: 'wix',
    display_name: 'Wix',
    category: 'platform',
    website: 'https://www.wix.com',
    logo_key: 'wix',
    detection: [
      { source: 'script_src', pattern: /static\.wixstatic\.com/i, confidence: 80 },
      { source: 'script_src', pattern: /parastorage\.com/i, confidence: 75 },
    ],
  },
  {
    key: 'squarespace',
    display_name: 'Squarespace',
    category: 'platform',
    website: 'https://www.squarespace.com',
    logo_key: 'squarespace',
    detection: [
      { source: 'script_src', pattern: /assets\.squarespace\.com/i, confidence: 80 },
      { source: 'html_content', pattern: /sqsp/i, confidence: 60 },
    ],
  },
  {
    key: 'vtex',
    display_name: 'VTEX',
    category: 'platform',
    website: 'https://vtex.com',
    logo_key: 'vtex',
    detection: [
      { source: 'html_content', pattern: /vtex/i, confidence: 70 },
      { source: 'script_src', pattern: /vtexassets\.com/i, confidence: 80 },
    ],
  },
  {
    key: 'nuvemshop',
    display_name: 'Nuvemshop',
    category: 'platform',
    website: 'https://www.nuvemshop.com.br',
    logo_key: 'nuvemshop',
    detection: [
      { source: 'script_src', pattern: /nuvemshop\.com\.br/i, confidence: 80 },
      { source: 'html_content', pattern: /Tiendanube/i, confidence: 75 },
    ],
  },

  // ── Payment Providers ─────────────────────────
  {
    key: 'stripe',
    display_name: 'Stripe',
    category: 'payment_provider',
    website: 'https://stripe.com',
    logo_key: 'stripe',
    detection: [
      { source: 'script_src', pattern: /js\.stripe\.com/i, confidence: 90 },
      { source: 'iframe_src', pattern: /stripe\.com/i, confidence: 85 },
    ],
  },
  {
    key: 'paypal',
    display_name: 'PayPal',
    category: 'payment_provider',
    website: 'https://www.paypal.com',
    logo_key: 'paypal',
    detection: [
      { source: 'script_src', pattern: /paypal\.com\/sdk/i, confidence: 90 },
      { source: 'script_src', pattern: /paypalobjects\.com/i, confidence: 85 },
    ],
  },
  {
    key: 'mercadopago',
    display_name: 'Mercado Pago',
    category: 'payment_provider',
    website: 'https://www.mercadopago.com',
    logo_key: 'mercadopago',
    detection: [
      { source: 'script_src', pattern: /sdk\.mercadopago\.com/i, confidence: 90 },
      { source: 'script_src', pattern: /mercadolibre\.com/i, confidence: 70 },
    ],
  },
  {
    key: 'pagseguro',
    display_name: 'PagSeguro',
    category: 'payment_provider',
    website: 'https://pagseguro.uol.com.br',
    logo_key: 'pagseguro',
    detection: [
      { source: 'script_src', pattern: /pagseguro\.uol\.com\.br/i, confidence: 85 },
    ],
  },
  {
    key: 'adyen',
    display_name: 'Adyen',
    category: 'payment_provider',
    website: 'https://www.adyen.com',
    logo_key: 'adyen',
    detection: [
      { source: 'script_src', pattern: /adyen\.com/i, confidence: 85 },
    ],
  },
  {
    key: 'braintree',
    display_name: 'Braintree',
    category: 'payment_provider',
    website: 'https://www.braintreepayments.com',
    logo_key: 'braintree',
    detection: [
      { source: 'script_src', pattern: /braintreegateway\.com/i, confidence: 85 },
      { source: 'script_src', pattern: /braintree-api\.com/i, confidence: 80 },
    ],
  },
  {
    key: 'square',
    display_name: 'Square',
    category: 'payment_provider',
    website: 'https://squareup.com',
    logo_key: 'square',
    detection: [
      { source: 'script_src', pattern: /squareup\.com/i, confidence: 80 },
      { source: 'script_src', pattern: /square\.com\/web-payments-sdk/i, confidence: 85 },
    ],
  },
  {
    key: 'klarna',
    display_name: 'Klarna',
    category: 'payment_provider',
    website: 'https://www.klarna.com',
    logo_key: 'klarna',
    detection: [
      { source: 'script_src', pattern: /klarna\.com/i, confidence: 80 },
      { source: 'inline_script', pattern: /Klarna/i, confidence: 65 },
    ],
  },
  {
    key: 'afterpay',
    display_name: 'Afterpay',
    category: 'payment_provider',
    website: 'https://www.afterpay.com',
    logo_key: 'afterpay',
    detection: [
      { source: 'script_src', pattern: /afterpay\.com/i, confidence: 80 },
      { source: 'script_src', pattern: /squarecdn\.com.*afterpay/i, confidence: 75 },
    ],
  },

  // ── Analytics ──────────────────────────────────
  {
    key: 'google_analytics',
    display_name: 'Google Analytics',
    category: 'analytics',
    website: 'https://analytics.google.com',
    logo_key: 'google_analytics',
    detection: [
      { source: 'script_src', pattern: /google-analytics\.com\/analytics/i, confidence: 90 },
      { source: 'script_src', pattern: /googletagmanager\.com\/gtag/i, confidence: 85 },
      { source: 'inline_script', pattern: /gtag\s*\(\s*['"]config['"]/i, confidence: 80 },
    ],
  },
  {
    key: 'facebook_pixel',
    display_name: 'Meta Pixel',
    category: 'analytics',
    website: 'https://www.facebook.com/business/tools/meta-pixel',
    logo_key: 'facebook_pixel',
    detection: [
      { source: 'script_src', pattern: /connect\.facebook\.net/i, confidence: 85 },
      { source: 'inline_script', pattern: /fbq\s*\(\s*['"]init['"]/i, confidence: 80 },
    ],
  },
  {
    key: 'hotjar',
    display_name: 'Hotjar',
    category: 'analytics',
    website: 'https://www.hotjar.com',
    logo_key: 'hotjar',
    detection: [
      { source: 'script_src', pattern: /static\.hotjar\.com/i, confidence: 85 },
      { source: 'inline_script', pattern: /hj\s*\(\s*['"]init['"]/i, confidence: 70 },
    ],
  },
  {
    key: 'posthog',
    display_name: 'PostHog',
    category: 'analytics',
    website: 'https://posthog.com',
    logo_key: 'posthog',
    detection: [
      { source: 'script_src', pattern: /posthog\.com/i, confidence: 85 },
      { source: 'inline_script', pattern: /posthog\.init/i, confidence: 80 },
    ],
  },
  {
    key: 'mixpanel',
    display_name: 'Mixpanel',
    category: 'analytics',
    website: 'https://mixpanel.com',
    logo_key: 'mixpanel',
    detection: [
      { source: 'script_src', pattern: /cdn\.mxpnl\.com/i, confidence: 85 },
      { source: 'inline_script', pattern: /mixpanel\.init/i, confidence: 80 },
    ],
  },
  {
    key: 'amplitude',
    display_name: 'Amplitude',
    category: 'analytics',
    website: 'https://amplitude.com',
    logo_key: 'amplitude',
    detection: [
      { source: 'script_src', pattern: /cdn\.amplitude\.com/i, confidence: 85 },
      { source: 'inline_script', pattern: /amplitude\.getInstance/i, confidence: 80 },
    ],
  },
  {
    key: 'heap',
    display_name: 'Heap',
    category: 'analytics',
    website: 'https://heap.io',
    logo_key: 'heap',
    detection: [
      { source: 'script_src', pattern: /cdn\.heapanalytics\.com/i, confidence: 85 },
      { source: 'inline_script', pattern: /heap\.load/i, confidence: 75 },
    ],
  },
  {
    key: 'segment',
    display_name: 'Segment',
    category: 'analytics',
    website: 'https://segment.com',
    logo_key: 'segment',
    detection: [
      { source: 'script_src', pattern: /cdn\.segment\.com/i, confidence: 85 },
      { source: 'inline_script', pattern: /analytics\.load/i, confidence: 65 },
    ],
  },
  {
    key: 'plausible',
    display_name: 'Plausible',
    category: 'analytics',
    website: 'https://plausible.io',
    logo_key: 'plausible',
    detection: [
      { source: 'script_src', pattern: /plausible\.io/i, confidence: 85 },
    ],
  },

  // ── Tag Managers ──────────────────────────────
  {
    key: 'google_tag_manager',
    display_name: 'Google Tag Manager',
    category: 'tag_manager',
    website: 'https://tagmanager.google.com',
    logo_key: 'google_tag_manager',
    detection: [
      { source: 'script_src', pattern: /googletagmanager\.com\/gtm\.js/i, confidence: 90 },
      { source: 'inline_script', pattern: /GTM-[A-Z0-9]+/i, confidence: 80 },
    ],
  },
  {
    key: 'tealium',
    display_name: 'Tealium',
    category: 'tag_manager',
    website: 'https://tealium.com',
    logo_key: 'tealium',
    detection: [
      { source: 'script_src', pattern: /tags\.tiqcdn\.com/i, confidence: 85 },
    ],
  },

  // ── Support Widgets ───────────────────────────
  {
    key: 'intercom',
    display_name: 'Intercom',
    category: 'support_widget',
    website: 'https://www.intercom.com',
    logo_key: 'intercom',
    detection: [
      { source: 'script_src', pattern: /widget\.intercom\.io/i, confidence: 90 },
      { source: 'inline_script', pattern: /Intercom\s*\(\s*['"]boot['"]/i, confidence: 80 },
      { source: 'inline_script', pattern: /intercomSettings/i, confidence: 75 },
    ],
  },
  {
    key: 'drift',
    display_name: 'Drift',
    category: 'support_widget',
    website: 'https://www.drift.com',
    logo_key: 'drift',
    detection: [
      { source: 'script_src', pattern: /js\.driftt\.com/i, confidence: 90 },
      { source: 'inline_script', pattern: /drift\.load/i, confidence: 80 },
    ],
  },
  {
    key: 'zendesk',
    display_name: 'Zendesk',
    category: 'support_widget',
    website: 'https://www.zendesk.com',
    logo_key: 'zendesk',
    detection: [
      { source: 'script_src', pattern: /static\.zdassets\.com/i, confidence: 90 },
      { source: 'script_src', pattern: /zopim/i, confidence: 75 },
    ],
  },
  {
    key: 'freshdesk',
    display_name: 'Freshdesk',
    category: 'support_widget',
    website: 'https://freshdesk.com',
    logo_key: 'freshdesk',
    detection: [
      { source: 'script_src', pattern: /widget\.freshworks\.com/i, confidence: 85 },
      { source: 'inline_script', pattern: /FreshworksWidget/i, confidence: 80 },
    ],
  },
  {
    key: 'crisp',
    display_name: 'Crisp',
    category: 'support_widget',
    website: 'https://crisp.chat',
    logo_key: 'crisp',
    detection: [
      { source: 'script_src', pattern: /client\.crisp\.chat/i, confidence: 90 },
      { source: 'inline_script', pattern: /\$crisp/i, confidence: 75 },
    ],
  },
  {
    key: 'tidio',
    display_name: 'Tidio',
    category: 'support_widget',
    website: 'https://www.tidio.com',
    logo_key: 'tidio',
    detection: [
      { source: 'script_src', pattern: /code\.tidio\.co/i, confidence: 90 },
    ],
  },
  {
    key: 'livechat',
    display_name: 'LiveChat',
    category: 'support_widget',
    website: 'https://www.livechat.com',
    logo_key: 'livechat',
    detection: [
      { source: 'script_src', pattern: /cdn\.livechatinc\.com/i, confidence: 90 },
      { source: 'inline_script', pattern: /LiveChatWidget/i, confidence: 75 },
    ],
  },
  {
    key: 'tawkto',
    display_name: 'tawk.to',
    category: 'support_widget',
    website: 'https://www.tawk.to',
    logo_key: 'tawkto',
    detection: [
      { source: 'script_src', pattern: /embed\.tawk\.to/i, confidence: 90 },
      { source: 'inline_script', pattern: /Tawk_API/i, confidence: 80 },
    ],
  },

  // ── Consent Managers ──────────────────────────
  {
    key: 'onetrust',
    display_name: 'OneTrust',
    category: 'consent_manager',
    website: 'https://www.onetrust.com',
    logo_key: 'onetrust',
    detection: [
      { source: 'script_src', pattern: /cdn\.cookielaw\.org/i, confidence: 90 },
      { source: 'script_src', pattern: /optanon/i, confidence: 80 },
      { source: 'inline_script', pattern: /OneTrust/i, confidence: 75 },
    ],
  },
  {
    key: 'cookiebot',
    display_name: 'Cookiebot',
    category: 'consent_manager',
    website: 'https://www.cookiebot.com',
    logo_key: 'cookiebot',
    detection: [
      { source: 'script_src', pattern: /consent\.cookiebot\.com/i, confidence: 90 },
      { source: 'inline_script', pattern: /Cookiebot/i, confidence: 75 },
    ],
  },
  {
    key: 'didomi',
    display_name: 'Didomi',
    category: 'consent_manager',
    website: 'https://www.didomi.io',
    logo_key: 'didomi',
    detection: [
      { source: 'script_src', pattern: /sdk\.privacy-center\.org/i, confidence: 85 },
    ],
  },

  // ── Error Tracking ────────────────────────────
  {
    key: 'sentry',
    display_name: 'Sentry',
    category: 'error_tracking',
    website: 'https://sentry.io',
    logo_key: 'sentry',
    detection: [
      { source: 'script_src', pattern: /browser\.sentry-cdn\.com/i, confidence: 90 },
      { source: 'inline_script', pattern: /Sentry\.init/i, confidence: 80 },
    ],
  },
  {
    key: 'bugsnag',
    display_name: 'Bugsnag',
    category: 'error_tracking',
    website: 'https://www.bugsnag.com',
    logo_key: 'bugsnag',
    detection: [
      { source: 'script_src', pattern: /d2wy8f7a9ursnm\.cloudfront\.net.*bugsnag/i, confidence: 85 },
      { source: 'inline_script', pattern: /Bugsnag\.start/i, confidence: 80 },
    ],
  },
  {
    key: 'logrocket',
    display_name: 'LogRocket',
    category: 'error_tracking',
    website: 'https://logrocket.com',
    logo_key: 'logrocket',
    detection: [
      { source: 'script_src', pattern: /cdn\.logrocket\.io/i, confidence: 85 },
      { source: 'inline_script', pattern: /LogRocket\.init/i, confidence: 80 },
    ],
  },

  // ── A/B Testing ───────────────────────────────
  {
    key: 'optimizely',
    display_name: 'Optimizely',
    category: 'ab_testing',
    website: 'https://www.optimizely.com',
    logo_key: 'optimizely',
    detection: [
      { source: 'script_src', pattern: /cdn\.optimizely\.com/i, confidence: 85 },
    ],
  },
  {
    key: 'vwo',
    display_name: 'VWO',
    category: 'ab_testing',
    website: 'https://vwo.com',
    logo_key: 'vwo',
    detection: [
      { source: 'script_src', pattern: /dev\.visualwebsiteoptimizer\.com/i, confidence: 85 },
    ],
  },
];
