<p align="center">
  <img src="public/assets/Cosmic Chaos.png" alt="Cosmic Chaos banner" width="100%">
</p>
<p align="center">
  <a href="https://redwan1127.itch.io/cosmic-chaos">
    <img src="https://img.shields.io/badge/Play%20on-itch.io-fa5c5c?logo=itchdotio&logoColor=white" alt="Play Cosmic Chaos on itch.io">
  </a>
</p>

# Cosmic Chaos

A vibe-coded web game made of random bs.

A capybara scientist broke a rule of the universe. A warden orca, a vengeful shark, a celestial tarantula overlord and a steward snail have opinions about that. Humans are space-suited pets who have no idea what is going on.

Vanilla TypeScript, Canvas 2D, procedural Web Audio. No framework, no database.

## Quick start

```
npm ci
npm run assets:lock   # once, records image sizes and hashes
npm run dev           # http://127.0.0.1:5173
npm run test:ci       # every gate, in order
```

Node 24 is expected (see `.nvmrc`). Installing browsers for the e2e gates: `npx playwright install chromium` (or `firefox`, `webkit`).

## Working with coding agents

Start at `AGENTS.md`. Role prompts live in `.agents/prompts/`. The file map is `codebase.txt`.

## License

Apache License 2.0. Copyright 2026 Redwan Rahman. See `LICENSE`.
