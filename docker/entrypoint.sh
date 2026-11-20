#!/bin/bash
# Runs as root only long enough to map the app user to PUID:PGID and give it
# /app/data. nginx's master stays root to bind :80; its workers and the server do not.
set -euo pipefail
APP_USER=peek; DATA_DIR=/app/data; NGINX_RUNTIME=/tmp/nginx
PUID="${PUID:-99}"; PGID="${PGID:-100}"
log() { echo "[entrypoint] $*"; }
die() { echo "[entrypoint] ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "this image manages its own user: remove --user (or 'user:' in compose) and set PUID/PGID instead"
[[ "$PUID" =~ ^[0-9]+$ ]] || die "PUID must be a number, got '$PUID'"
[[ "$PGID" =~ ^[0-9]+$ ]] || die "PGID must be a number, got '$PGID'"

mkdir -p "$DATA_DIR"
if [ "$PUID" -eq 0 ]; then
  log "WARNING: PUID=0, so the server runs as root. Use this only where the data directory cannot change owner (rootless Docker or Podman, some network mounts)."
else
  [ "$(id -g "$APP_USER")" = "$PGID" ] || groupmod -o -g "$PGID" "$APP_USER"
  [ "$(id -u "$APP_USER")" = "$PUID" ] || usermod -o -u "$PUID" "$APP_USER"
  chown -R "$PUID:$PGID" "/home/$APP_USER"
  # Only entries with the wrong owner are touched, dotfiles such as .jwt-secret
  # included, so later starts are a quick scan. Modes (0600 on .jwt-secret) are kept.
  find "$DATA_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown -h "$PUID:$PGID" {} + \
    || log "WARNING: could not change the owner of some files in $DATA_DIR"
  setpriv --reuid="$PUID" --regid="$PGID" --init-groups --no-new-privs -- test -w "$DATA_DIR" \
    || die "$DATA_DIR is not writable by $PUID:$PGID. Set PUID/PGID to the owner that 'ls -ln' shows for your data directory, or PUID=0 to run as root."
  # CONFIG_DIR (backups, download zips, .jwt-secret) can point outside /app/data on older installs
  CFG="${CONFIG_DIR:-}"; CFG="${CFG%/}"
  if [ -n "$CFG" ] && [ "$CFG" != "$DATA_DIR" ] && [ "${CFG#"$DATA_DIR"/}" = "$CFG" ]; then
    mkdir -p "$CFG"
    find "$CFG" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown -h "$PUID:$PGID" {} + \
      || log "WARNING: could not change the owner of some files in $CFG"
    setpriv --reuid="$PUID" --regid="$PGID" --init-groups --no-new-privs -- test -w "$CFG" \
      || die "CONFIG_DIR $CFG is not writable by $PUID:$PGID. Remove CONFIG_DIR (it defaults to $DATA_DIR) or give that directory to PUID:PGID."
  fi
fi

# BASE_PATH: the subfolder a reverse proxy serves Peek under, such as /peek.
# One leading /, segments of letters, digits and . _ ~ - (never . or ..); a
# trailing / is dropped, and "" or "/" mean no prefix.
BASE_PATH="${BASE_PATH:-}"
BASE_PATH="${BASE_PATH#"${BASE_PATH%%[![:space:]]*}"}"
BASE_PATH="${BASE_PATH%"${BASE_PATH##*[![:space:]]}"}"
BASE_PATH="${BASE_PATH%/}"
if [ -n "$BASE_PATH" ]; then
  [[ "$BASE_PATH" =~ ^(/[A-Za-z0-9._~-]+)+$ ]] && [[ "$BASE_PATH/" != *"/./"* && "$BASE_PATH/" != *"/../"* ]] \
    || die "BASE_PATH must be a path such as /peek (a leading /, then letters, digits and . _ ~ - only, no . or .. segment), got '$BASE_PATH'"
fi
export BASE_PATH

rm -rf "$NGINX_RUNTIME"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$NGINX_RUNTIME" "$NGINX_RUNTIME/html" "$NGINX_RUNTIME/conf.d"
# The page shell with the prefix put in. Vite builds it with relative URLs
# ("./assets/..."); the rendered copy lives under /tmp so a read-only image
# filesystem still works. BASE_PATH holds only characters that are safe in sed.
sed -e "s|=\"\./|=\"$BASE_PATH/|g" \
    -e "s|name=\"peek-base-path\" content=\"\"|name=\"peek-base-path\" content=\"$BASE_PATH\"|" \
    /app/frontend/index.html > "$NGINX_RUNTIME/html/index.html"
if [ -n "$BASE_PATH" ]; then
  # nginx strips the prefix; the unprefixed paths keep working. The rewrite is
  # a regex, so the prefix's dots are escaped (the other allowed characters
  # are literal there)
  BASE_PATH_RE="${BASE_PATH//./\\.}"
  cat > "$NGINX_RUNTIME/conf.d/base-path.conf" <<CONF
location = $BASE_PATH { return 301 $BASE_PATH/; }
rewrite ^$BASE_PATH_RE/(.*)\$ /\$1 break;
CONF
fi
chown -R "$APP_USER:$APP_USER" "$NGINX_RUNTIME"
nginx -e stderr -g "user $APP_USER $APP_USER;"
log "nginx master runs as root to bind port 80; workers run as $(id -u "$APP_USER"):$(id -g "$APP_USER")"

export HOME="/home/$APP_USER"
[ "$PUID" -eq 0 ] && exec "$@"
exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups --no-new-privs -- "$@"
