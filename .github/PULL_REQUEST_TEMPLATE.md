<!-- Thanks for contributing! Keep this short — bullets are fine. -->

## What & why

<!-- One or two sentences: what does this change, and what problem does it solve? Link any related issue (#123). -->

## Checklist

- [ ] The full gate passes from `flowyd/`: `pnpm lint && pnpm check:filemap && pnpm typecheck && pnpm test && pnpm build`
- [ ] Tests added or updated for the change
- [ ] Every new exported symbol has a TSDoc block
- [ ] Docs updated if public behaviour changed (`flowyd/README.md`, the `docs/` site, or `CLAUDE.md` §5 version history)
- [ ] No new `any`, no unguarded `as` casts, no silent `catch` (see [`CLAUDE.md`](../CLAUDE.md))

## Notes for reviewers

<!-- Anything non-obvious: trade-offs considered, areas you'd like a closer look at, follow-ups deferred. -->
