# Tech

See `project.md` for the Core, Runtime and Web boundaries and the pre-commit commands, and `agent.md` for working style. This file keeps the project-specific hard rules.

- Unity 6 (6000.0.x), HDRP, Input System. C# only.
- Core is the asmdef `Frankenstein.Core` with `noEngineReferences: true`; `dotnet test tests/Frankenstein.Core.Tests` compiles the Core files directly. Prefer property-based tests (seeded random cases, report failing seed).
- Determinism: use `SeededRandom`, never `UnityEngine.Random`, in Core.
- AI narration goes behind `INarrationProvider` and must be wrapped in `SafeNarrationProvider` so failures fall back offline.
- Guardrail script: `python3 tools/validate_repo.py`.
- In sandboxes with a read-only home, run dotnet with `HOME=/tmp/home`.
- Do not use em dashes anywhere in the repo (the validator fails on them).
- Never commit pack-derived data (web/local-pack, pack-scratch, dist, Assets/ThirdParty downloads). Do not use Git LFS.
- CSP must stay identical across netlify.toml, vercel.json and web/_headers (tested).

Hosting: web/ is static with relative paths only (tested by web/test/paths.test.js). Publish dir is `web`, no build command. Never deploy web/ directly if web/local-pack exists; use tools/stage_web.py. No host is confirmed live.

Progress rule: codex entries and achievements only award after a player action (web/src/progress-gate.js); deep links and restored sessions only preview and must not overwrite saved progress. The judge tour (?tour=1) is opt-in and never starts on a bare URL. Headless screenshots at 1280x720 lose about 50 px at the bottom; use 1280x770 for full page captures.

Web input and capture: cinematic mode timings come only from `cinematicFrame` in web/src/cinematic.js (pure, fixed timings, still camera under reduced motion). Gamepad and touch go through the pure mapping in web/src/input.js; keep new web files in the sw.js precache and tools/test_stage_web.py list. After changing tasks.md, web/src, web/test, Core, hooks or the precache, run `python3 tools/gen_stitch.py` (the validator fails on stale stitch data). Daily seeds are opt-in only; never derive a seed from the clock on a bare URL.
- Blender 4.2 LTS runs headless from git-ignored `pack-scratch/blender` (`tools/blender/`); `dotnet build tests/UnityCompileCheck` compiles scripts against stubs (not a Unity run); MCP is documented only (docs/MCP.md).
