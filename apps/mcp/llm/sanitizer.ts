// ──────────────────────────────────────────────
// Input Sanitizer — Pre-LLM defense layer (v2)
//
// Runs synchronously before any model call.
// Zero external dependencies. Pure string processing.
//
// v2 fixes: XSS patterns are REMOVED (not just detected).
// Unicode normalization added to prevent homoglyph bypass.
// ──────────────────────────────────────────────

import type { SanitizeResult } from './types';

const MAX_INPUT_LENGTH = 2000;

const HTML_ENTITIES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#x27;',
};

// Patterns that are REMOVED from input (not just detected)
const XSS_REMOVAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /<script\b[^>]*>[\s\S]*?<\/script>/gi, label: 'script_tag' },
  { pattern: /<script\b[^>]*>/gi, label: 'script_open' },
  { pattern: /<\/script>/gi, label: 'script_close' },
  { pattern: /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, label: 'iframe' },
  { pattern: /<iframe\b[^>]*>/gi, label: 'iframe_open' },
  { pattern: /<object\b[^>]*>/gi, label: 'object_tag' },
  { pattern: /<embed\b[^>]*>/gi, label: 'embed_tag' },
  { pattern: /<svg\b[^>]*>/gi, label: 'svg_tag' },
  { pattern: /javascript\s*:/gi, label: 'javascript_proto' },
  { pattern: /vbscript\s*:/gi, label: 'vbscript_proto' },
  { pattern: /data\s*:\s*text\/html/gi, label: 'data_html' },
  { pattern: /on\w{2,20}\s*=\s*["'][^"']*["']/gi, label: 'event_handler_quoted' },
  { pattern: /on\w{2,20}\s*=[^\s>]*/gi, label: 'event_handler_unquoted' },
  { pattern: /expression\s*\([^)]*\)/gi, label: 'css_expression' },
  { pattern: /document\s*\.\s*(?:cookie|location|write|domain)/gi, label: 'document_access' },
  { pattern: /window\s*\.\s*(?:location|open|eval)/gi, label: 'window_access' },
  { pattern: /eval\s*\(/gi, label: 'eval_call' },
];

export function sanitizeInput(raw: string): SanitizeResult {
  const violations: string[] = [];

  if (!raw || typeof raw !== 'string') {
    return { sanitized: '', violations: ['empty_input'], truncated: false };
  }

  let text = raw;

  // 0. Unicode NFKC normalization — prevents homoglyph bypass
  //    e.g., ﬁ → fi, ⅰgnore → ignore, ℯval → eval, ＜script＞ → <script>
  try {
    text = text.normalize('NFKC');
  } catch {
    // Normalization failure on exotic input — continue with raw
  }

  // 1. Strip null bytes
  if (text.includes('\0')) {
    text = text.replace(/\0/g, '');
    violations.push('null_bytes_stripped');
  }

  // 2. Strip ASCII control characters (keep \n and \t)
  const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  if (controlCharRegex.test(text)) {
    text = text.replace(controlCharRegex, '');
    violations.push('control_chars_stripped');
  }

  // 3. REMOVE XSS patterns (not just detect)
  for (const { pattern, label } of XSS_REMOVAL_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(`xss_removed:${label}`);
      text = text.replace(pattern, '');
    }
  }

  // 4. HTML entity encode remaining dangerous characters
  text = text.replace(/[<>&"']/g, (ch) => HTML_ENTITIES[ch] || ch);

  // 5. Truncate
  const truncated = text.length > MAX_INPUT_LENGTH;
  if (truncated) {
    text = text.slice(0, MAX_INPUT_LENGTH);
    violations.push('truncated');
  }

  // 6. Trim whitespace
  text = text.trim();

  return { sanitized: text, violations, truncated };
}
