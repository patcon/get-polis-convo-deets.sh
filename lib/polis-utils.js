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
 * Fetch all comments for a conversation and compute a sorted language list
 * @param {string} baseUrl
 * @param {string} convoId
 * @param {Function} fetchFn
 */
async function getCommentLangs(baseUrl, convoId, fetchFn) {
  const url = `${baseUrl}api/v3/comments?conversation_id=${convoId}&moderation=true&include_voting_patterns=true`;
  const comments = await fetchJson(url, fetchFn);

  const langCounts = {};
  comments.forEach(c => {
    // Only count languages for comments that are not moderated out (mod !== -1)
    if (c.lang && c.mod !== -1) langCounts[c.lang] = (langCounts[c.lang] || 0) + 1;
  });

  // fallback if no comment langs
  if (!Object.keys(langCounts).length) langCounts["unknown"] = 1;

  return Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)
    .join(", ");
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
    } catch { }
  }

  // Math data is usually needed for counts
  try {
    mathData = await fetchJson(`${baseUrl}api/v3/math/pca2?conversation_id=${convoId}`, fetchFn);
  } catch { }

  const ts = convo.created
    ? new Date(typeof convo.created === "string" ? parseInt(convo.created, 10) : convo.created)
    : null;

  // Get comprehensive language information from comments
  let lang = convo.lang ?? "---";
  if (!minimal) {
    try {
      lang = await getCommentLangs(baseUrl, convoId, fetchFn);
    } catch (err) {
      // Fallback to conversation lang if comment fetching fails
      console.error("Language detection failed:", err.message);
      lang = convo.lang ?? "---";
    }
  }

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
    lang: lang,
    owner: convo.ownername || convo.owner || "---",
  };
}
