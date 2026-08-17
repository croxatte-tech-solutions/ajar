#!/bin/sh
# Every check in the project, one command.
#
# There is no package.json and deliberately so — this app is one HTML file
# served as-is, with no build step to break. That is why the suite is plain
# Node scripts run by a shell script instead of a test framework: nothing here
# needs installing, and it works on a machine that has only node.
#
#   sh scripts/qa.sh            run everything
#   sh scripts/qa.sh --quiet    totals only
#
# Exit code is 0 only if every file passes, so it works as a git hook or in CI.
cd "$(dirname "$0")/.." || exit 1
QUIET=""
[ "$1" = "--quiet" ] && QUIET=1

fail=0
total=0
files=0
for f in scripts/check_*.js; do
  files=$((files + 1))
  if out=$(node "$f" index.html audio 2>&1); then
    n=$(printf '%s' "$out" | tail -1 | grep -o '[0-9]\+' | head -1)
    total=$((total + ${n:-0}))
    [ -z "$QUIET" ] && printf '  %-28s %s checks\n' "$(basename "$f" .js)" "${n:-?}"
  else
    printf '  %-28s FAILED\n' "$(basename "$f" .js)"
    printf '%s\n' "$out" | grep -E 'FAIL|ERROR' | head -8 | sed 's/^/      /'
    fail=1
  fi
done

printf '\n  %s checks across %s files — %s\n' "$total" "$files" \
  "$([ $fail -eq 0 ] && echo 'GREEN' || echo 'RED')"

# The QR pipeline needs swiftc and takes a few seconds, so it is opt-in rather
# than part of every run. It answers the one question the Node checks cannot:
# whether a real camera reads the code the app draws.
if [ -n "$AJAR_QR" ]; then
  printf '\n  QR verification (Apple Vision)\n'
  python3 scripts/qr_verify.py || fail=1
fi

# The security rules, executed rather than read. Opt-in for the same reason:
# it boots a JVM and the Firestore emulator, which takes about fifteen
# seconds. Run it before publishing rules to the console — that is the moment
# it is worth the wait, and it caught a live cross-school hole the first time.
#   AJAR_RULES=1 sh scripts/qa.sh
if [ -n "$AJAR_RULES" ]; then
  printf '\n  Security rules (Firestore emulator)\n'
  if [ ! -d scripts/rules-test/node_modules ]; then
    printf '    skipped — run: cd scripts/rules-test && npm install\n'
  else
    ( cd scripts/rules-test && npm test --silent ) 2>&1 \
      | grep -E 'FAIL|ALL [0-9]+ CHECKS PASS|FAILURES' | sed 's/^/    /' \
      || fail=1
    ( cd scripts/rules-test && npm test --silent ) >/dev/null 2>&1 || fail=1
  fi
fi

exit $fail
