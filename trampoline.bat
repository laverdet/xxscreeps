:<<WIN
@echo off
node --enable-source-maps^
  --experimental-specifier-resolution=node^
  --experimental-import-meta-resolve^
  --experimental-repl-await^
  --no-warnings^
  --stack-trace-limit=20^
  "%~dp0dist\config\entry" %*
exit /b
WIN

# What is this? This is a stupid polyglot because I need to pass all
# these flags to nodejs. Yeah I know about dotenv and cross-env but
# those launch nodejs in a subshell. NO THANKS.

set -e
NEXT=
NODE_ARGS=()
SCRIPT_ARGS=()
while (( "$#" )); do
  if [[ "$NEXT" ]]; then SCRIPT_ARGS+=("$1");
  elif [[ "$1" = -* ]]; then NODE_ARGS+=("$1");
  else NEXT=1; continue; fi
  shift
done

# In the sh version of the script we can pass arguments to nodejs
# before the entry.js argument if we want. The windows version is
# simpler and lacks this feature.

SCRIPT=$(readlink "$0" || echo "$0")
BASE=$(dirname "$SCRIPT")
exec node "${NODE_ARGS[@]}" \
  --enable-source-maps \
  --experimental-specifier-resolution=node \
  --experimental-import-meta-resolve \
  --experimental-repl-await \
  --no-warnings \
  --stack-trace-limit=20 \
  "$BASE"/dist/config/entry "${SCRIPT_ARGS[@]}"
