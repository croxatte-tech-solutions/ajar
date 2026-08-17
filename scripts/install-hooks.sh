#!/bin/sh
# Git hooks are not versioned by git, so a fresh clone has none. This copies
# them in. One line, run once per clone.
cd "$(dirname "$0")/.." || exit 1
cp scripts/hooks/pre-commit .git/hooks/pre-commit 2>/dev/null || {
  echo "scripts/hooks/pre-commit is missing"; exit 1; }
chmod +x .git/hooks/pre-commit
echo "pre-commit installed — the checks now run before every commit"
