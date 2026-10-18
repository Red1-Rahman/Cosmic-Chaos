# Role prompts

Reusable prompts. Load only the one you need. Every role already assumes `AGENTS.md` and `codebase.txt` have been read.

| Role                | File                  | Owns                                                         |
| ------------------- | --------------------- | ------------------------------------------------------------ |
| Lead                | `orchestrator.md`     | `src/app/`, `src/main.ts`, `docs/`                           |
| Assets              | `assets-ingestion.md` | `src/assets/`                                                |
| Viewport and render | `viewport-render.md`  | `src/render/`, `index.html`, `src/styles/` (except ui.css)   |
| Audio               | `audio-synth.md`      | `src/audio/`                                                 |
| Input               | `input.md`            | `src/input/`                                                 |
| Simulation          | `sim-gameplay.md`     | `src/sim/`, `src/util/`                                      |
| UI and HUD          | `ui-hud.md`           | `src/ui/`, `src/styles/ui.css`                               |
| QA and CI           | `qa-ci.md`            | `tests/` (except `tests/setup/`), `.github/workflows/ci.yml` |
| Reviewer            | `reviewer.md`         | nothing (read only)                                          |

Roles own disjoint paths so they can work in parallel. Touching another role's path means asking that role through the lead.

## Spawning a subagent

Give the subagent two things only: the role file path and a task brief.

```
Role: .agents/prompts/<role>.md
Task: <one sentence>
Inputs: <files to read, if beyond the role file>
Deliverables: <paths>
Constraints: <anything extra, or none>
Done when: <observable checks>
```

## Handoff format

Every role ends with this, and the lead collects them. Keep it under 25 lines.

```
Role / task:
Status: done | partial | blocked
Files changed:
Public API added or changed:
Decisions (also appended to docs/decisions.md):
Gates run: <command> -> <result>
Open issues or needs from other roles:
```

## Shared rules every role follows

1. Respect the guardrails in `AGENTS.md`, especially: no git, no content violations, no new dependencies, no weakening gates.
2. Stay inside your owned paths. Read anything, edit only what you own.
3. Run the narrowest gate that proves your work (`npm run test:ci -- --only unit`), then the full `npm run test:ci` before reporting done if the app builds.
4. Write tests with the code. A feature without a test is not done.
5. Log non-obvious choices in `docs/decisions.md`.
