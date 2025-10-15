var SHEET_NAME = "link.g0v.network/pug-conversations";

/**
 * Adds a custom "Polis Tools" menu to your Google Sheet.
 */
function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  SpreadsheetApp.getUi()
    .createMenu('🗳 Polis Tools')
    .addItem('Update Polis Details (All Rows)', 'updatePolisSheet')
    .addItem('Update Polis Details (Selection)', 'updatePolisSelection')
    .addToUi();
}

/**
 * Fetch wrapper for GAS that mimics node-fetch style interface.
 */
function gasFetch(url) {
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'x' },
  });
  return {
    text: function() { return response.getContentText(); }
  };
}

/**
 * Synchronous GAS-compatible version of getPolisDetails.
 */
function getPolisDetails(input, fetchFn) {
  function parsePolisInput(input) {
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

  const { baseUrl, reportId, convoId: initialConvo, domain } = parsePolisInput(input);
  let convoId = initialConvo;

  if (reportId) {
    try {
      const reportData = JSON.parse(fetchFn(`${baseUrl}api/v3/reports?report_id=${reportId}`).text());
      convoId = reportData[0]?.conversation_id;
    } catch (err) {
      return { error: "Report lookup failed", cause: err.message };
    }
  }

  if (!convoId) return { error: "No conversation ID resolved" };

  let convData;
  try {
    convData = JSON.parse(fetchFn(`${baseUrl}api/v3/conversations?conversation_id=${convoId}`).text());
  } catch (err) {
    return { error: "Conversation unavailable", cause: err.message };
  }

  let convo = null;
  if (Array.isArray(convData) && convData.length > 0) {
    convo = convData[0].conversation || convData[0];
  } else if (convData.conversation) {
    convo = convData.conversation;
  } else {
    convo = convData;
  }

  if (!convo || Object.keys(convo).length === 0) return { error: "Invalid conversation data" };

  let mathData = {};
  try {
    mathData = JSON.parse(fetchFn(`${baseUrl}api/v3/math/pca2?conversation_id=${convoId}`).text());
  } catch {}

  let ts = null;
  if (convo.created) {
    const createdNum = typeof convo.created === 'string' ? parseInt(convo.created, 10) : convo.created;
    ts = new Date(createdNum < 1e12 ? createdNum * 1000 : createdNum);
  }

  // --- Fetch participationInit for language info ---
  let lang = convo.lang || "---";
  try {
    const initData = JSON.parse(fetchFn(`${baseUrl}api/v3/participationInit?conversation_id=${convoId}`).text());
    lang = initData.nextComment?.lang || lang;
  } catch {}

  return {
    date: ts ? Utilities.formatDate(ts, Session.getScriptTimeZone(), "yyyy-MM-dd") : "---",
    title: convo.topic || convo.title || "---",
    convoUrl: `${baseUrl}${convoId}`,
    visible: convo.vis_type === 1 ? "✅ yes" : "✖️ no",
    closed: convo.is_active === false ? "✅ yes" : "❌ no",
    reportUrl: reportId ? `${baseUrl}report/${reportId}` : (convo.report_id ? `${baseUrl}report/${convo.report_id}` : "---"),
    voters: mathData.n ?? "---",
    groups: (mathData["group-clusters"] && Array.isArray(mathData["group-clusters"])) ? mathData["group-clusters"].length : (convo.group_count ?? "---"),
    comments: mathData["n-cmts"] ?? (convo.comment_count ?? "---"),
    meta: mathData["meta-tids"]?.length ?? "---",
    lang: lang,
    owner: convo.ownername || convo.owner || "---",
    // Location intentionally left blank
  };
}

/**
 * Updates only the currently selected rows.
 */
function updatePolisSelection() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) {
    SpreadsheetApp.getUi().alert(`❌ This function only runs on the "${SHEET_NAME}" sheet.`);
    return;
  }

  const range = sheet.getActiveRange();
  const data = range.getValues();
  const startRow = range.getRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const col = {};
  headers.forEach((h, i) => (col[h.trim()] = i));
  const convoUrlCol = col['Conversation URL'];
  const reportUrlCol = col['Report URL'];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const inputUrl = row[convoUrlCol] || row[reportUrlCol];
    if (!inputUrl || inputUrl === '---') continue;

    try {
      const details = getPolisDetails(inputUrl, gasFetch);
      applyPolisDetails(sheet, startRow + i, details, col);
    } catch (err) {
      Logger.log(`Row ${startRow + i}: failed for ${inputUrl} - ${err}`);
    }
  }

  SpreadsheetApp.getUi().alert('✅ Polis details update complete for selected rows!');
}

/**
 * Updates all rows in the sheet that contain a Conversation or Report URL.
 */
function updatePolisSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) {
    SpreadsheetApp.getUi().alert(`❌ This function only runs on the "${SHEET_NAME}" sheet.`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => (col[h.trim()] = i));
  const convoUrlCol = col['Conversation URL'];
  const reportUrlCol = col['Report URL'];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const inputUrl = row[convoUrlCol] || row[reportUrlCol];
    if (!inputUrl || inputUrl === '---') continue;

    try {
      const details = getPolisDetails(inputUrl, gasFetch);
      applyPolisDetails(sheet, r + 1, details, col);
    } catch (err) {
      Logger.log(`Row ${r + 1}: failed for ${inputUrl} - ${err}`);
    }
  }

  SpreadsheetApp.getUi().alert('✅ Polis details update complete for all rows!');
}

/**
 * Populate cells with details if they are empty or contain "---".
 */
function applyPolisDetails(sheet, rowNum, details, col) {
  function setIfEmpty(header, value) {
    if (col[header] === undefined) return;
    const cell = sheet.getRange(rowNum, col[header] + 1);
    if (cell.getValue() === '' || cell.getValue() === '---') {
      cell.setValue(value);
    }
  }

  setIfEmpty('Date Created', details.date);
  setIfEmpty('Title', details.title);
  setIfEmpty('Viz?', details.visible);
  setIfEmpty('Closed?', details.closed);
  setIfEmpty('Report URL', details.reportUrl);
  setIfEmpty('# Voters', details.voters);
  setIfEmpty('# Grps', details.groups);
  setIfEmpty('# Cmnts', details.comments);
  setIfEmpty('# Meta', details.meta);
  setIfEmpty('Language', details.lang);
  setIfEmpty('Account Owner', details.owner);
  // Location intentionally left blank
}
