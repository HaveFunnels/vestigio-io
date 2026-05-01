// ──────────────────────────────────────────────
// Conversation Export Formatters (Wave 4.4)
//
// Pure functions that transform a Conversation + Messages payload
// into JSON, Markdown, or CSV strings ready for download.
// ──────────────────────────────────────────────

export interface ExportMessage {
  role: string;
  content: string;
  model?: string | null;
  timestamp: string;
}

export interface ConversationWithMessages {
  id: string;
  title: string | null;
  createdAt: Date | string;
  messages: {
    role: string;
    content: string;
    model?: string | null;
    createdAt: Date | string;
  }[];
}

// ── Helpers ──

/** Safely extract displayable text from a message content field. */
function extractTextContent(content: string): string {
  // Assistant messages may be stored as JSON (ContentBlock[] or stringified).
  // Try to parse; if it's a JSON array, concatenate text blocks.
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((block: any) => block.type === "text" || typeof block === "string")
        .map((block: any) => (typeof block === "string" ? block : block.text || ""))
        .join("\n")
        .trim();
    }
    // If it's a plain object (e.g. tool call result), stringify readable
    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
    return String(parsed);
  } catch {
    // Not JSON — plain text
    return content;
  }
}

/** Filter out system messages (not user-facing). */
function userFacingMessages(conv: ConversationWithMessages): ExportMessage[] {
  return conv.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: extractTextContent(m.content),
      model: m.model,
      timestamp: new Date(m.createdAt).toISOString(),
    }));
}

// ── JSON ──

export function formatAsJson(conversation: ConversationWithMessages): string {
  const messages = userFacingMessages(conversation);
  const payload = {
    id: conversation.id,
    title: conversation.title || "Untitled conversation",
    created_at: new Date(conversation.createdAt).toISOString(),
    message_count: messages.length,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.model ? { model: m.model } : {}),
      timestamp: m.timestamp,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

// ── Markdown ──

export function formatAsMarkdown(conversation: ConversationWithMessages): string {
  const messages = userFacingMessages(conversation);
  const title = conversation.title || "Untitled conversation";
  const exportDate = new Date().toISOString().split("T")[0];

  const lines: string[] = [
    `# ${title}`,
    `*Exported from Vestigio.io on ${exportDate}*`,
    "",
    "---",
    "",
  ];

  for (const msg of messages) {
    const speaker = msg.role === "user" ? "**You:**" : "**Vestigio:**";
    lines.push(`${speaker} ${msg.content}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ── CSV ──

/** Escape a value for CSV: wrap in quotes, double any internal quotes. */
function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatAsCsv(conversation: ConversationWithMessages): string {
  const messages = userFacingMessages(conversation);
  const rows: string[] = ["timestamp,role,content,model"];

  for (const msg of messages) {
    rows.push(
      [
        msg.timestamp,
        msg.role,
        csvEscape(msg.content),
        msg.model || "",
      ].join(","),
    );
  }

  return rows.join("\n");
}
