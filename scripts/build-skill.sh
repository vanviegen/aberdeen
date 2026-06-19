#!/usr/bin/env bash
# Build the agent skill bundle in skill/ from the TypeScript sources and the tutorial.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/node_modules/.bin:$PATH"

MODULES=(aberdeen route dispatcher transitions prediction)

rm -rf skill
mkdir skill

# Generate the per-module API reference (an index file plus per-symbol detail
# files) from the JSDoc in each entry point.
for mod in "${MODULES[@]}"; do
    readme-tsdoc --create "src/$mod.ts" --file "skill/$mod.md" --split
done

# Drop the `default` export entry; it just restates `A`.
awk 'BEGIN{skip=0} /^## /{skip=($0 ~ /\[default\]\(default\.md\)/)} !skip' \
    skill/aberdeen.md > skill/aberdeen.tmp
mv skill/aberdeen.tmp skill/aberdeen.md
rm -f skill/default.md

# Split heavy/situational tutorial sections into their own linked files, so SKILL.md
# can point to them on demand instead of inlining the full text.
node scripts/split-tutorial.mjs docs/Tutorial.md skill tutorial.md \
    'Developer tools' 'html-to-aberdeen' 'Full Example: Multi-page App'

# Expand the @@include directives in the template into the final SKILL.md.
awk '/^@@include /{while((getline line < $2)>0) print line; close($2); next} 1' \
    skill-template.md > skill/SKILL.md

# Remove the now-inlined index and tutorial files (per-symbol detail files remain).
for mod in "${MODULES[@]}"; do
    rm "skill/$mod.md"
done
rm skill/tutorial.md
