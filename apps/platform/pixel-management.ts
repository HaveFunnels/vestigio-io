// ──────────────────────────────────────────────
// Pixel Management
//
// Generate, view, and inspect pixel snippets
// per organization/environment.
// ──────────────────────────────────────────────

export interface PixelConfig {
  org_id: string;
  env_id: string;
  domain: string;
  pixel_id: string;
  snippet: string;
  installed: boolean;
}

export function generatePixelId(orgId: string, envId: string): string {
  // Deterministic: same org+env → same pixel ID
  const hash = simpleHash(`${orgId}:${envId}`);
  return `vg_${hash}`;
}

export function generatePixelSnippet(pixelId: string): string {
  return `<!-- Vestigio Pixel -->
<script>
  (function(v,e,s,t,i,g,o){
    v['VestigioObject']=i;v[i]=v[i]||function(){
    (v[i].q=v[i].q||[]).push(arguments)};
    g=e.createElement(s);o=e.getElementsByTagName(s)[0];
    g.async=1;g.src=t;o.parentNode.insertBefore(g,o)
  })(window,document,'script',
    'https://cdn.vestigio.io/pixel.js','vg');
  vg('init', '${pixelId}');
  vg('track', 'pageview');
</script>`;
}

export function getPixelConfig(orgId: string, envId: string, domain: string): PixelConfig {
  const pixelId = generatePixelId(orgId, envId);
  return {
    org_id: orgId,
    env_id: envId,
    domain,
    pixel_id: pixelId,
    snippet: generatePixelSnippet(pixelId),
    installed: false, // Determined by evidence check in production
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
