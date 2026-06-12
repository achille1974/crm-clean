#!/bin/sh
cd /Users/archimede/crm-clean || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec node scripts/monitor-crm-mac-health.js "$@"
