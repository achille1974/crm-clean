#!/bin/bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd /Users/archimede/crm-clean

exec node scripts/run-activity-import-folder.js "$@"
