#!/usr/bin/env node
import { getPolisDetails } from "./polis-utils.js";

const input = process.argv[2];
const debug = process.argv.includes("--debug");

if (!input || input === "-h" || input === "--help") {
  console.log(`
Usage: node get-polis-convo-deets.js [conversation-id|url|report-id|report-url] [--debug]
`);
  process.exit(0);
}

// Define a robust fetch wrapper
async function fetchWithHeaders(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; polis-scraper/1.0)",
      "Accept": "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text.slice(0, 200)}`);
  }

  return res;
}

(async () => {
  try {
    const d = await getPolisDetails(input, fetchWithHeaders);
    if (d.error) {
      console.error("❌ Error:", d.error, d.cause ? `- ${d.cause}` : "");
      if (debug && d.cause) console.error("Debug cause:", d.cause);
      process.exit(2);
    }

    console.log(`📅 Date:      ${d.date}`);
    console.log(`📝 Title:     ${d.title}`);
    console.log(`🔗 URL:       ${d.convoUrl}`);
    console.log(`👀 Visible?:  ${d.visible}`);
    console.log(`🔒 Closed?:   ${d.closed}`);
    console.log(`------------------------------`);
    console.log(`🙋 Voters:    ${d.voters}`);
    console.log(`👥 Groups:    ${d.groups}`);
    console.log(`💬 Comments:  ${d.comments}`);
    console.log(`🧩 Meta cmts: ${d.meta}`);
    console.log(`🌐 Lang:      ${d.lang}`);
    console.log(`👤 Owner:     ${d.owner}`);
  } catch (e) {
    console.error("❌ Error:", e.message || e);
    if (debug) console.error(e);
    process.exit(1);
  }
})();
