// groq is just a tagged template literal — no need to import next-sanity at module scope
const groq = (strings: TemplateStringsArray, ...values: any[]) =>
	String.raw(strings, ...values);
const postData = `{
  title,
  metadata,
  slug,
  tags,
  author->{
    _id,
    name,
    slug,
    image,
    bio
  },
  mainImage,
  publishedAt,
  body
}`;

export const postQuery = groq`*[_type == "post"] ${postData}`;

export const postQueryBySlug = groq`*[_type == "post" && slug.current == $slug][0] ${postData}`;

export const postQueryByTag = groq`*[_type == "post" && $slug in tags[]->slug.current] ${postData}`;

export const postQueryByAuthor = groq`*[_type == "post" && author->slug.current == $slug] ${postData}`;

export const postQueryByCategory = groq`*[_type == "post" && category->slug.current == $slug] ${postData}`;

// ── Knowledge Base queries ──

const kbData = `{
  _id,
  title,
  slug,
  category,
  "order": coalesce(order, 100),
  "locale": coalesce(locale, "en"),
  finding_key,
  root_cause_key,
  excerpt,
  body,
  publishedAt
}`;

// Locale-aware: fetch articles in the requested locale, fallback to "en"
// Uses slug as the join key — if a pt-BR version of "welcome" exists, it wins over "en"
export const kbAllByLocaleQuery = groq`*[_type == "knowledgeArticle" && (coalesce(locale, "en") == $locale || coalesce(locale, "en") == "en")] | order(category asc, order asc, title asc) ${kbData}`;

export const kbBySlugAndLocaleQuery = groq`*[_type == "knowledgeArticle" && slug.current == $slug && (coalesce(locale, "en") == $locale || coalesce(locale, "en") == "en")] | order(locale desc) [0] ${kbData}`;

// Legacy non-locale queries (kept for finding-key lookups which are locale-independent)
export const kbAllQuery = groq`*[_type == "knowledgeArticle"] | order(category asc, order asc, title asc) ${kbData}`;

export const kbBySlugQuery = groq`*[_type == "knowledgeArticle" && slug.current == $slug][0] ${kbData}`;

export const kbByCategoryQuery = groq`*[_type == "knowledgeArticle" && category == $category] | order(title asc) ${kbData}`;

export const kbByFindingKeyQuery = groq`*[_type == "knowledgeArticle" && finding_key == $findingKey && (coalesce(locale, "en") == $locale || coalesce(locale, "en") == "en")] | order(locale desc) [0] ${kbData}`;

export const kbByRootCauseKeyQuery = groq`*[_type == "knowledgeArticle" && root_cause_key == $rootCauseKey][0] ${kbData}`;
