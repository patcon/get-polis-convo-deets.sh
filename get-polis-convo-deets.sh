#!/usr/bin/env bash
set -euo pipefail

# Usage: sh get-polis-convo-deets.sh [conversation-id|conversation-url|report-id|report-url]
#
# Examples:
#
#   $ sh get-polis-convo-deets.sh 2demo
#   $ sh get-polis-convo-deets.sh https://pol.is/2demo
#   $ sh get-polis-convo-deets.sh https://praatmeemetdeoverheid.nl/4ntracunnr
#   $ sh get-polis-convo-deets.sh report/abcd123
#   $ sh get-polis-convo-deets.sh https://pol.is/report/abcd123
#   $ sh get-polis-convo-deets.sh "https://pol.is/api/v3/reports?report_id=abcd123"

show_help() {
  sed -n '4,13p' "$0"   # prints the comment block above (lines 4–13 here)
}

if [[ $# -lt 1 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  show_help
  exit 0
fi

INPUT="$1"

# Detect domain (default: pol.is)
DOMAIN=$(echo "$INPUT" | grep -oE '([a-z0-9.-]+\.[a-z]{2,})')
if [[ -n "$DOMAIN" ]]; then
  BASE_URL="https://${DOMAIN}/"
else
  BASE_URL="https://pol.is/"
fi

# Trim leading domain if present
ID=${INPUT#$(echo "$BASE_URL")}

# Determine if ID is report-id or conversation-id
if [[ "$ID" =~ ^report/[A-Za-z0-9]+$ ]]; then
  REPORT_ID="${ID#report/}"
elif [[ "$INPUT" =~ report_id=([A-Za-z0-9]+) ]]; then
  REPORT_ID="${BASH_REMATCH[1]}"
elif [[ "$ID" =~ ^[A-Za-z0-9]+$ && "$INPUT" =~ report ]]; then
  REPORT_ID="$ID"
else
  REPORT_ID=""
fi

if [[ -n "$REPORT_ID" ]]; then
  REPORT_DATA=$(curl --silent --user-agent "x" "${BASE_URL}api/v3/reports?report_id=${REPORT_ID}")
  CONVO_ID=$(jq -r '.[0].conversation_id' <<< "$REPORT_DATA")
else
  CONVO_ID="$ID"
fi

# --- Fetch data ---
INIT_DATA=$(curl --silent --user-agent "x" "${BASE_URL}api/v3/participationInit?conversation_id=${CONVO_ID}")
TIMESTAMP=$(jq -r '.conversation.created' <<< "$INIT_DATA")
TITLE=$(jq -r '.conversation.topic' <<< "$INIT_DATA")
OWNER=$(jq -r '.conversation.ownername' <<< "$INIT_DATA")
VIS_TYPE=$(jq -r '.conversation.vis_type' <<< "$INIT_DATA")
OPEN_STATUS=$(jq -r '.conversation.is_active' <<< "$INIT_DATA")
LANG=$(jq -r '.nextComment.lang' <<< "$INIT_DATA")

MATH_DATA=$(curl --compressed --silent --user-agent "x" "${BASE_URL}api/v3/math/pca2?conversation_id=${CONVO_ID}")
VOTER_COUNT=$(jq -r '.n' <<< "$MATH_DATA")
COMMENT_COUNT=$(jq -r '."n-cmts"' <<< "$MATH_DATA")
META_COUNT=$(jq -r '."meta-tids" | length' <<< "$MATH_DATA")
GROUP_COUNT=$(jq -r '."group-clusters" | length' <<< "$MATH_DATA")

# --- Print with emoji ---
printf "📅 Date:      %s\n" "$(date -r $(($TIMESTAMP / 1000)) "+%Y-%m-%d")"
printf "📝 Title:     %s\n" "$TITLE"
printf "🔗 URL:       %s\n" "${BASE_URL}${CONVO_ID}"
printf "👀 Visible?:  %s\n" $([ "$VIS_TYPE" == 1 ] && echo "yes" || echo "no")
printf "🔒 Closed?:   %s\n" $([ "$OPEN_STATUS" == "false" ] && echo "yes" || echo "no")
echo "------------------------------"
printf "🙋 Voters:    %s\n" "$VOTER_COUNT"
printf "👥 Groups:    %s\n" "$GROUP_COUNT"
printf "💬 Comments:  %s\n" "$COMMENT_COUNT"
printf "🧩 Meta cmts: %s\n" "$META_COUNT"
printf "🌐 Lang:      %s\n" "$LANG"
printf "👤 Owner:     %s\n" "$OWNER"

# Optional warning highlights
if [[ "$OPEN_STATUS" == "false" ]]; then
  echo "⚠️  Conversation is closed!"
fi
if [[ "$VOTER_COUNT" -eq 0 ]]; then
  echo "⚠️  No voters recorded yet."
fi
