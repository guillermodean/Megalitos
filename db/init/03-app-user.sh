#!/bin/bash
# Creates the read-only application user on first init of the official mariadb image.
# Env: MYSQL_APP_USER / MYSQL_APP_PASSWORD (MARIADB_APP_* accepted as aliases),
#      MARIADB_ROOT_PASSWORD (or MYSQL_ROOT_PASSWORD), MARIADB_DATABASE (default megalitos).
# Idempotent: safe to run more than once.
set -eu

APP_USER="${MYSQL_APP_USER:-${MARIADB_APP_USER:-}}"
APP_PASS="${MYSQL_APP_PASSWORD:-${MARIADB_APP_PASSWORD:-}}"
DB="${MARIADB_DATABASE:-${MYSQL_DATABASE:-megalitos}}"

if [ -z "$APP_USER" ] || [ -z "$APP_PASS" ]; then
  echo "03-app-user: MYSQL_APP_USER / MYSQL_APP_PASSWORD not set, skipping" >&2
  exit 0
fi
case "$APP_USER" in
  *[!A-Za-z0-9_.-]*) echo "03-app-user: invalid characters in MYSQL_APP_USER" >&2; exit 1 ;;
esac

# SQL-escape the password (backslash first, then single quote).
esc_pass=${APP_PASS//\\/\\\\}
esc_pass=${esc_pass//\'/\'\'}

SQL="CREATE USER IF NOT EXISTS '${APP_USER}'@'%' IDENTIFIED BY '${esc_pass}';
ALTER USER '${APP_USER}'@'%' IDENTIFIED BY '${esc_pass}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${APP_USER}'@'%';
GRANT SELECT ON \`${DB}\`.* TO '${APP_USER}'@'%';
FLUSH PRIVILEGES;"

if declare -F docker_process_sql >/dev/null 2>&1; then
  # sourced by the entrypoint: reuse its helper (handles root auth + socket)
  docker_process_sql <<<"$SQL"
else
  ROOT_PASS="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
  if [ -n "$ROOT_PASS" ]; then
    mariadb -uroot -p"$ROOT_PASS" <<<"$SQL"
  else
    mariadb -uroot <<<"$SQL"
  fi
fi
echo "03-app-user: user '${APP_USER}' has SELECT on ${DB}.*"
