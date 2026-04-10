// @ts-check
/// <reference path="./types.d.ts" />

/**
 * Opens a fetch-based SSE connection, parses `data:` lines as JSON, and calls
 * `onEvent` for each parsed event.
 *
 * @param {string} url
 * @param {FormData | Record<string, unknown>} body
 * @param {(event: import('./types').SSEEvent) => void} onEvent
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
export async function openStream(url, body, onEvent, signal) {
  const isFormData = body instanceof FormData;
  const response = await fetch(url, {
    method: "POST",
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    body: isFormData ? body : JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const event = /** @type {import('./types').SSEEvent} */ (JSON.parse(raw));
          onEvent(event);
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}
