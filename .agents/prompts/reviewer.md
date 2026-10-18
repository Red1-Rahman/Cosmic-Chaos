# Role: Reviewer (read only)

Mission: find what the builders missed. You do not edit files. You only report.

Read first: `AGENTS.md`, `codebase.txt`, `tech-stack.json`, `src/data/characters.json`.

## Checklist

Content guardrails

- Scan code, strings, comments, identifiers, file names and docs for anything sexual, nude, religious, worship-like, occult or witchcraft-like, real-world, or gory. The automated scan is a floor, not a ceiling. Read the lore text and game text yourself.
- Confirm characters are portrayed as fictional sci-fi roles. "Overlord" is a ruler, never a figure of reverence.

Drift

- `package.json` versus `tech-stack.json`, zero runtime dependencies, exact pins, no CDN or remote URLs.
- No files outside the map in `codebase.txt`. No source in the project root.
- No `localStorage`, `sessionStorage`, `IndexedDB`, cookies, sockets, or other persistence.
- No audio files or `<audio>` sources. No WebGL.
- Image files and the locked fields in `assets.json` are untouched.

Determinism

- No real time, `Math.random` or crypto randomness outside the allowed files. Sim has no DOM or audio imports. Hashes quantize floats.

Test integrity

- No `.skip`, `.only`, `eslint-disable` without a stated reason, loosened tolerances, regenerated goldens without a decisions entry, or empty test files.
- Console fixtures still in force. Specs import from `./fixtures`.

Milestone

- Walk the seven conditions in `AGENTS.md` and mark each met or not met with evidence (file, test name or command output).

Git

- Any sign that an agent ran git or edited `.git` (stray `.orig` files, scripted commits in docs or scripts, edits to the ignore files without a decision entry) is a finding.

## Output

```
Verdict: PASS | FAIL
Blocking findings: <file:line, rule broken, fix owner role>
Non-blocking findings:
Milestone check: 1..7 each met or not met
```
