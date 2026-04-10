// @ts-check
/// <reference path="./types.d.ts" />

/**
 * Escapes a cell value per RFC 4180.
 * @param {unknown} value
 * @returns {string}
 */
function escapeCell(value) {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Downloads a CSV file of analyzed claims.
 * @param {import('./types').AnalyzedClaim[]} analyzedClaims
 */
export function downloadCSV(analyzedClaims) {
  const headers = [
    "claim",
    "relevance_score",
    "verdict",
    "verdict_confidence",
    "reasoning",
    "analysis",
    "analysis_confidence",
    "evidence",
    "limitations",
  ];

  const rows = analyzedClaims.map((c) => {
    const evidence = c.evidence_used
      .map((e) => `${e.excerpt} — ${e.source_url}`)
      .join(" | ");
    return [
      c.text,
      c.relevance_score ?? "",
      c.veredict,
      c.confidence,
      c.reasoning,
      c.analysis,
      c.analysis_confidence,
      evidence,
      c.limitations,
    ].map(escapeCell).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const filename = `fact-check-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
