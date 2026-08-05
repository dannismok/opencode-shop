# Daily SQLite backup using sqlite3's online .backup command.
# Designed to run on the Fly.io machine via a cron or fly-scheduler task.
#
# Usage:
#   ./scripts/backup-sqlite.sh                    # local ./backups/ only
#   ./scripts/backup-sqlite.sh s3://bucket/path   # backup + upload (aws cli)
#   ./scripts/backup-sqlite.sh rclone:remote/path # backup + upload (rclone)
#
# Cron example (Fly.io machine, 02:15 daily):
#   15 2 * * * /app/scripts/backup-sqlite.sh s3://opencode-shop-backups/app.db >/proc/1/fd/1 2>&1
set -euo pipefail

DB_FILE="${DB_FILE:-/data/app.db}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_NAME="app-${STAMP}.sqlite3"
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
DEST="${1:-}"

mkdir -p "$BACKUP_DIR"
TMP_BACKUP="$BACKUP_DIR/$BACKUP_NAME"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "error: sqlite3 is required (apk add sqlite on Alpine)" >&2
  exit 1
fi

if [ ! -f "$DB_FILE" ]; then
  echo "error: database file $DB_FILE not found" >&2
  exit 1
fi

# Online backup: safe while the app is writing (uses the SQLite backup API).
sqlite3 "$DB_FILE" ".backup '$TMP_BACKUP'"
echo "backup created: $TMP_BACKUP"

if [ -n "$DEST" ]; then
  case "$DEST" in
    s3://*)
      aws s3 cp "$TMP_BACKUP" "$DEST/$BACKUP_NAME"
      echo "uploaded to $DEST/$BACKUP_NAME"
      ;;
    rclone:*)
      rclone copy "$TMP_BACKUP" "$DEST"
      echo "uploaded via rclone to $DEST"
      ;;
    *)
      echo "unknown destination scheme: $DEST" >&2
      exit 1
      ;;
  esac
fi

# Prune backups older than 14 days (local only).
find "$BACKUP_DIR" -name 'app-*.sqlite3' -mtime +14 -delete 2>/dev/null || true
