# Kiro pitch and Devpost write-up

Every statement here is backed by files in this repo or by `git log`; see [KIRO_USAGE.md](KIRO_USAGE.md) for the long version. Nothing is claimed about Kiro IDE or CLI use: the project was built with **Kiro Web**.

## Spoken script (60 to 90 seconds, about 210 words, roughly 85 seconds)
Read this verbatim at about 150 words per minute. It can be used as a voice-over for the video or as the live pitch.

> I built Frankenstein's Lovecraftian Village with Kiro Web, and I used Kiro the way it is meant to be used: spec first.
>
> The dot kiro specs folder holds requirements, design and tasks. Each requirement became a correctness property, and the property based tests run three hundred seeded cases each, so a failure gives me the seed to replay. A golden file written by the C# core keeps the JavaScript port honest, and the browser self-test page checks it live.
>
> Steering files, project and agent, carry my rules: logic lives in Core, randomness is seeded, and every claim is labeled verified or unverified. Three hooks guard the work. One runs the tests when Core changes. One refuses to add paid pack files. One validates the repository before I finish.
>
> The work ran as an orchestrator on Kiro Web. A planner wrote the feature plan, a coder implemented one feature at a time and committed it, and a reviewer checked the result. They used the GitHub CLI power, and the rounds were merged round by round as pull requests.
>
> I set up Unity and Blender MCP on my own machine, but the cloud sandbox never ran them, so the Unity side is honestly marked unverified. The village is playable in your browser today.

## Devpost write-up (short)
**How we used Kiro.** The project was built with Kiro Web. An orchestrator delegated to a planner (explored the repo, wrote `context.json` and feature files), a coder (implemented one feature, ran the tests, committed locally) and a reviewer. The agents used the GitHub CLI power for git and GitHub work. Rounds were merged as pull requests, with #15 the latest merge commit at the time of writing (see `git log`).

**Specs.** `.kiro/specs` has `requirements.md` (WHEN/THEN/SHALL), `design.md` (requirements mapped to testable properties) and `tasks.md`. Core rules (layout, catalog, sanity, dread, narration fallback, dread events, the village report) follow the spec-driven path; later Core additions such as rituals and interaction rules followed the same Core-first, property-test rule without new spec entries; Unity glue and atmosphere were vibe coded and are labeled as such.

**Steering.** `.kiro/steering/project.md` and `agent.md` plus `product.md`, `tech.md`, `structure.md` and `mcp.md` keep the architecture rules (Core first, deterministic, thin MonoBehaviours, no duplicated logic) in every session.

**Hooks.** `test-on-save.kiro.hook` (runs `dotnet test` when Core or tests change), `asset-guard.kiro.hook` (refuses third-party pack files; also enforced by `.gitignore` and `tools/validate_repo.py`), and `validate-repo.kiro.hook` (manual guardrail run).

**Testing.** xunit property tests with a hand-rolled seeded runner (300 cases per property), golden parity between C# and the JavaScript port, node tests, and Python tool tests.

**Honest limits.** Unity and Blender MCP were set up locally by the author; they were not used inside the Kiro Web sandbox, so no file here was produced through MCP (see [MCP.md](MCP.md)). The Unity runtime is Unverified; the package is only compile checked against stubs. The web demo is live at https://frankensteinlovecraftianvillage.vercel.app/ (deep link: https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1).

**Credit.** Pack textures and models by DLNK (Daelonik Artworks). The DLNK trailer footage and its music are not used in the video.

**In the video.** The 54 second "How we used Kiro" shot in [DEMO_SCRIPT.md](DEMO_SCRIPT.md) uses the same facts as this page. Unity cannot be installed in the sandbox (Personal licence activation is tied to the author's account), so the Unity footage is the author's own first run and the Unity side stays Partially Verified (compile check) and Unverified at runtime.
