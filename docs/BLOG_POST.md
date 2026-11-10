# Stitching a cosmic-horror village together with Kiro

*This post was written as part of the Kiroween 2026 hackathon (#KiroweenHackathon26), Frankenstein category.*

Frankenstein's monster was never one thing. It was parts that did not belong together, animated by a spark. For Kiroween 2026 I wanted to build a game environment the same way: a Lovecraftian village stitched from unlike technologies, with Kiro as the lightning.

## The parts

- **A modular art kit.** The Lovecraftian Village 1.3 environment pack by DLNK Artworks, in HDRP and URP editions for Unity 6.
- **A procedural stitcher.** `VillageLayoutGenerator` assembles pieces by id from a catalog, deterministically per seed, with no overlaps and everything inside the grid.
- **A sanity engine.** `SanityModel` clamps sanity to 0 to 100 and turns it into dread. Lower sanity never means less dread.
- **Optional AI narration.** Behind an `INarrationProvider` interface, wrapped so any failure or blank reply falls back to offline text.
- **Kiro.** Specs, steering, hooks and agents that built and guard the whole thing.

## Keep the engine out of the logic

The most useful decision was architectural. All rules live in `Assets/Scripts/Core`, which never references `UnityEngine`. The Unity side (`VillageBuilder`, `HorrorAmbienceDirector`) is thin glue. That means the rules can be tested with a plain `dotnet test` and no Unity install, which also made them testable inside a cloud agent sandbox.

## Specs became properties

I wrote requirements in the WHEN/THEN/SHALL style in `.kiro/specs/requirements.md`, then mapped each to a property in `design.md`. Examples:

- Same seed, same layout.
- No two pieces overlap.
- Sanity stays in range for any input, including NaN.
- If the AI provider throws, narration still appears.

Each property runs 300 seeded random cases and prints the failing seed, so any failure can be replayed. I used a tiny hand-rolled runner instead of a library to keep the project dependency-free.

## Steering and hooks as guardrails

Steering files (`product.md`, `tech.md`, `structure.md`) hold the rules I do not want to repeat: keep Core engine-free, use a seeded RNG, wrap narration, keep the tone gothic rather than gory. Three hooks back them up: run tests when core code changes, refuse to add third-party pack files, and a manual repo validation.

The asset rule matters because the environment pack is not mine to redistribute. It is linked from the README rather than committed, `.gitignore` excludes it, and `tools/validate_repo.py` fails if pack files sneak in. Relying on a prompt alone would be fragile, so the rule is enforced twice.

## How the scaffold was built

I used Kiro Web with an orchestrator that delegated to planner, coder and reviewer sub-agents, using the GitHub CLI power for git work. The planner explored the repo and wrote a feature plan, the coder implemented one feature and verified it with the tests, and the reviewer checked the result.

The spec forced me to decide edge cases early, like what an empty catalog should produce, and each decision became a test.

## Beyond the scaffold

A later autonomous Kiro session on a feature branch added dread threshold events with hysteresis, a Markdown and JSON village report, and a prefab name matcher behind an editor auto-binder. Each followed the same rule: Core first, with a property test. The browser demo got an omen toast system, a Whispers journal, report download, keyboard control and reduced motion support. A golden file written by the C# tests keeps the JavaScript port honest. The Unity-side scripts (including the auto-binder) have not been run in the editor, and I say so in the README.

## Vibe coding vs specs

I used specs for rules that must be correct, and looser vibe coding for the Unity glue and atmosphere where I judge the result by eye. Specs gave me tests and traceability; vibe coding gave me speed on things I could only evaluate by looking at them.

## Try it

Clone the repo, import the HDRP or URP package that matches your pipeline (links are in the README), and run:

```bash
dotnet test tests/Frankenstein.Core.Tests
python3 tools/validate_repo.py
```

Repo: https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village

Created by Michael G. Inso. Environment assets courtesy of DLNK Artworks.
