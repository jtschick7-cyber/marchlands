# Claude Code Project Instructions

Read and strictly obey @AGENTS.md and all specification documents in @docs/ before writing or modifying any code.

- Never import React, DOM, or IndexedDB APIs inside `src/engine/`.
- Run `npx tsc --noEmit` and `npx vitest run` after every engine or data change.
