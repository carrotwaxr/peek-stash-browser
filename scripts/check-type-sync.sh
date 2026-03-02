#!/usr/bin/env bash
# Check that server/types/entities.ts and shared/types/entities.ts stay in sync.
# Compares only the type definitions (from first "export" line onwards), ignoring
# header comments which intentionally differ between the two files.
#
# See: https://github.com/carrotwaxr/peek-stash-browser/issues/435

set -euo pipefail

SERVER_FILE="server/types/entities.ts"
SHARED_FILE="shared/types/entities.ts"

if [[ ! -f "$SERVER_FILE" ]]; then
  echo "ERROR: $SERVER_FILE not found"
  exit 1
fi

if [[ ! -f "$SHARED_FILE" ]]; then
  echo "ERROR: $SHARED_FILE not found"
  exit 1
fi

# Extract from first "export" line to end of file
server_types=$(sed -n '/^export/,$ p' "$SERVER_FILE")
shared_types=$(sed -n '/^export/,$ p' "$SHARED_FILE")

if [[ "$server_types" != "$shared_types" ]]; then
  echo "ERROR: Type definitions have drifted between server and shared!"
  echo ""
  echo "  $SERVER_FILE"
  echo "  $SHARED_FILE"
  echo ""
  echo "These files must stay in sync. Diff:"
  echo ""
  diff <(echo "$server_types") <(echo "$shared_types") || true
  echo ""
  echo "Update both files to match, then re-run this check."
  exit 1
fi

echo "OK: server/types/entities.ts and shared/types/entities.ts are in sync"
