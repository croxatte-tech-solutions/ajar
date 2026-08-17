#!/bin/sh
# Dry-run a batch of option rewrites: apply to a COPY, run the checks that
# care, and only then say whether it is safe to apply for real.
#
# It exists because the first attempt at the length bias went straight into
# index.html, and the batch broke a rule nobody had told the author about —
# options must stay near-equal in WORD count, so padding a distractor to fix
# the CHARACTER tell fails. Two rules that pull against each other need a
# dry run, not a careful author.
#
#   sh scripts/try_option_fixes.sh fixes.json [more.json ...]
set -e
[ $# -ge 1 ] || { echo "usage: sh scripts/try_option_fixes.sh fixes.json ..."; exit 2; }
# The candidate lives in the repo root, not /tmp: the audio checks resolve
# clip paths relative to the file they are given, and a copy anywhere else
# reports every clip missing.
cand=.candidate.html
trap 'rm -f "$cand"' EXIT
cp index.html "$cand"
python3 scripts/apply_option_fixes.py --into "$cand" "$@"

echo
echo "  exploitability WITHOUT reading or listening"
node scripts/measure_length_bias.js "$cand" | sed -n '1,8p' | sed 's/^/    /'

fail=0
echo
echo "  checks that read the banks"
for c in check_answer_keys check_conversation check_talk check_passage \
         check_daily_read check_announcement check_correct_is_correct; do
  [ -f "scripts/$c.js" ] || continue
  out=$(node "scripts/$c.js" "$cand" audio 2>&1) && st=0 || st=1
  n=$(printf '%s\n' "$out" | grep -c ': PASS' || true)
  if [ $st -eq 0 ]; then
    printf '    %-26s %s checks\n' "$c" "$n"
  else
    printf '    %-26s FAILED\n' "$c"
    printf '%s\n' "$out" | grep -E 'FAIL' | head -6 | sed 's/^/        /'
    fail=1
  fi
done

echo
if [ $fail -eq 0 ]; then
  echo "  SAFE — apply with: python3 scripts/apply_option_fixes.py $*"
else
  echo "  NOT SAFE — index.html untouched"
fi
exit $fail
