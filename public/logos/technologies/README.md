# Technology Logos

Place SVG (preferred) or PNG logo files here for detected technologies.

## Naming convention

File name must match the `logo_key` from the technology registry:

```
{logo_key}.svg   (preferred)
{logo_key}.png   (fallback)
```

## Examples

```
shopify.svg
stripe.svg
intercom.svg
google_analytics.svg
mercadopago.svg
```

## Adding a new technology

1. Add a `TechnologyDefinition` entry in `packages/technology-registry/registry.ts`
2. Drop the logo file here matching the `logo_key`
3. Done — detection and frontend rendering are automatic

## Frontend resolution

The frontend resolves logos at: `/logos/technologies/{logo_key}.svg`
If the file is missing, the UI renders a text-only fallback.
