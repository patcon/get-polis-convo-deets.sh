#!/usr/bin/env bash

# Uncomment this to use report-id instead of conversation-id.

#REPORT_ID=$1

#REPORT_DATA=$(curl --silent --user-agent "x" "https://pol.is/api/v3/reports?report_id=$REPORT_ID")
#CONVO_ID=$(jq -r '.[0].conversation_id' <<< "$REPORT_DATA")

# Usage: sh get-polis-convo-deets.sh [https://polis.example.com/]<conversation-id>
# 
# Example:
# 
#     $ sh get-polis-convo-deets.sh 2demo
#     $ sh get-polis-convo-deets.sh https://pol.is/2demo
#     $ sh get-polis-convo-deets.sh https://praatmeemetdeoverheid.nl/4ntracunnr

# Get domain if present
DOMAIN=$(echo $1 | grep -oE '([a-z0-9.-]+\.[a-z]{2,})')
if [[ "$DOMAIN" != "" ]]; then
  BASE_URL="https://${DOMAIN}/"
else
  BASE_URL="https://pol.is/"
fi

# Trim leading domain when included.
CONVO_ID=${1#$(echo $BASE_URL)}

INIT_DATA=$(curl --silent --user-agent "x" "${BASE_URL}api/v3/participationInit?conversation_id=$CONVO_ID")
TIMESTAMP=$(jq -r '.conversation.created' <<< "$INIT_DATA")
TITLE=$(jq -r '.conversation.topic' <<< "$INIT_DATA")
OWNER=$(jq -r '.conversation.ownername' <<< "$INIT_DATA")
VIS_TYPE=$(jq -r '.conversation.vis_type' <<< "$INIT_DATA")
OPEN_STATUS=$(jq -r '.conversation.is_active' <<< "$INIT_DATA")
LANG=$(jq -r '.nextComment.lang' <<< "$INIT_DATA")

MATH_DATA=$(curl --compressed --silent --user-agent "x" "${BASE_URL}api/v3/math/pca2?conversation_id=$CONVO_ID")
VOTER_COUNT=$(jq -r '.n' <<< "$MATH_DATA")
COMMENT_COUNT=$(jq -r '."n-cmts"' <<< "$MATH_DATA")
META_COUNT=$(jq -r '."meta-tids" | length' <<< "$MATH_DATA")
GROUP_COUNT=$(jq -r '."group-clusters" | length' <<< "$MATH_DATA")

echo "Date: " $(date -r $(($TIMESTAMP / 1000)) "+%Y-%m-%d")
echo "Title: " $TITLE
echo "URL: " "$BASE_URL/$CONVO_ID"
echo "Vis? " $([ "$VIS_TYPE" == 1 ] && echo "y" || echo "n")
echo "Closed? " $([ "$OPEN_STATUS" == "false" ] && echo "y" || echo "n")
echo "---"
echo "Voters: " $VOTER_COUNT
echo "Groups: " $GROUP_COUNT
echo "Comments: " $COMMENT_COUNT
echo "Meta Cmnts: " $META_COUNT
echo "Lang guess: " $LANG
echo "Owner: " $OWNER
