# How Kiro was used

Skeleton to complete with real screenshots and anecdotes before submitting. Sections marked TODO need the author's own experience.

## Kiro IDE, CLI, Web and Crew
- **IDE:** specs and steering authoring, hooks panel. TODO: what you built here.
- **CLI:** TODO: scripted runs, e.g. validating the repo or generating tests.
- **Web / Crew:** TODO: the delegated, parallel work (this scaffold was produced by an orchestrated agent run).

## Custom agents
TODO: describe any custom agent (e.g. a "Cultist Reviewer" that reviews for tone and legal hygiene) and where its config lives.

## Spec-driven vs vibe coding
- **Specs** ([.kiro/specs](../.kiro/specs)): used for the core rules (layout, sanity, narration) where correctness matters. Requirements map to testable properties.
- **Vibe coding:** used for Unity glue, ambience tuning and look-dev where feedback is visual.
- TODO: your honest comparison (time, bugs, surprises).

## Steering
[.kiro/steering](../.kiro/steering) holds product, tech and structure rules: keep Core engine-free, deterministic RNG, never commit paid assets, no em dashes.

## Hooks
[.kiro/hooks](../.kiro/hooks):
- `test-on-save`: runs property tests when Core or tests change.
- `asset-guard`: blocks adding paid pack files before write or shell tools.
- `validate-repo`: manual guardrail check.

## MCP
TODO: which MCP servers you connected (docs lookup, Unity MCP, browser for screenshots) and what they unlocked.

## Property-based testing
Requirements in the spec became properties (see the table in design.md): determinism, bounds, no overlap, catalog-only ids, sanity clamp, monotonic dread, narration fallback. Each runs 300 seeded cases and reports the failing seed.

## Powers
TODO: which Powers you installed or built (e.g. GitHub CLI, browser automation) and how they helped.
