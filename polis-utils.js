/**
 * polis-utils.js
 * Utility functions for working with Polis endpoints.
 */

/**
 * Parse a Polis URL to extract domain, report ID, or conversation ID
 * @param {string} input - A Polis conversation/report URL
 */
export function parsePolisInput(input) {
  const domainMatch = input.match(/https?:\/\/([^/]+)/);
  const domain = domainMatch ? domainMatch[1] : "pol.is";
  const baseUrl = `https://${domain}/`;

  let reportId = null;
  let convoId = null;

  if (/report\/([A-Za-z0-9]+)/.test(input)) {
    reportId = input.match(/report\/([A-Za-z0-9]+)/)[1];
  } else if (/report_id=([A-Za-z0-9]+)/.test(input)) {
    reportId = input.match(/report_id=([A-Za-z0-9]+)/)[1];
  } else {
    const tail = input.split("/").pop();
    if (tail && /^[A-Za-z0-9]+$/.test(tail)) convoId = tail;
  }

  return { domain, baseUrl, reportId, convoId };
}

/**
 * Simple fetch wrapper that returns JSON
 * @param {string} url 
 */
export async function fetchJson(url, fetchFn = fetch) {
  const res = await fetchFn(url, {
    headers: { "User-Agent": "polis-utils" },
  });
  return await res.json();
}

/**
 * Get conversation and math data from a Polis conversation
 * @param {string} input - URL, report ID, or conversation ID
 * @param {object} options - Optional { fetchFn, minimal }
 */
export async function getPolisDetails(input, options = {}) {
  const { fetchFn = fetch, minimal = false } = options;
  const { baseUrl, reportId, convoId: initialConvo } = parsePolisInput(input);
  let convoId = initialConvo;

  // Resolve conversation from report
  if (reportId) {
    try {
      const reports = await fetchJson(`${baseUrl}api/v3/reports?report_id=${reportId}`, fetchFn);
      convoId = reports[0]?.conversation_id;
    } catch (err) {
      return { error: "Report lookup failed", cause: err.message };
    }
  }

  if (!convoId) return { error: "No conversation ID resolved" };

  let convo = {};
  let mathData = {};

  if (!minimal) {
    try {
      const convResp = await fetchJson(`${baseUrl}api/v3/conversations?conversation_id=${convoId}`, fetchFn);
      convo = Array.isArray(convResp) ? (convResp[0].conversation || convResp[0]) : convResp.conversation || convResp;
    } catch {}
  }

  // Math data is usually needed for counts
  try {
    mathData = await fetchJson(`${baseUrl}api/v3/math/pca2?conversation_id=${convoId}`, fetchFn);
  } catch {}

  const ts = convo.created
    ? new Date(typeof convo.created === "string" ? parseInt(convo.created, 10) : convo.created)
    : null;

  return {
    date: ts ? ts.toISOString().split("T")[0] : "---",
    title: convo.topic || convo.title || "---",
    convoUrl: `${baseUrl}${convoId}`,
    visible: convo.vis_type === 1 ? "✅ yes" : "✖️ no",
    closed: convo.is_active === false ? "✅ yes" : "❌ no",
    reportUrl: reportId ? `${baseUrl}report/${reportId}` : (convo.report_id ? `${baseUrl}report/${convo.report_id}` : "---"),
    voters: mathData.n ?? "---",
    groups: mathData["group-clusters"]?.length ?? (convo.group_count ?? "---"),
    comments: mathData["n-cmts"] ?? (convo.comment_count ?? "---"),
    meta: mathData["meta-tids"]?.length ?? "---",
    lang: convo.lang ?? "---",
    owner: convo.ownername || convo.owner || "---",
  };
}
