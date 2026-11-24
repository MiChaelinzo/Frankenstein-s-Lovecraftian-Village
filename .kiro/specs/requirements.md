
## DLNK scene mode, Blender meshes and compile check
- `?pack=1&scene=<name>` renders a validated local layout; malformed layouts are rejected; default and plain `?pack=1` are unchanged; nothing pack-derived is committed.
- Original meshes are built headless in Blender and exported as small GLB; the web viewer needs no dependencies and is reachable from About in en and fr.
- The Unity scripts compile against stubs in CI; this is documented as a stub check, not a Unity run. MCP use is never claimed.
# Requirements: Stitched Village Slice

## Introduction
A Unity 6 HDRP village that is assembled procedurally from a catalog of modular pieces, reacts to player sanity, and can narrate via a pluggable provider.

## Requirements

### R1 Village stitching
**User story:** As a level designer, I want a village generated from a catalog by id, so that I can swap art without touching code.
1. WHEN a seed, grid size, piece count and catalog are given THEN the generator SHALL return the same layout every time for the same inputs.
2. The generator SHALL keep every piece inside the grid.
3. The generator SHALL NOT place overlapping pieces.
4. The generator SHALL only use ids that exist in the catalog.
5. IF the catalog is empty or sizes are not positive THEN the generator SHALL return an empty layout.

### R2 Catalog validity
1. The catalog SHALL ignore entries with empty ids, duplicate ids, or non-positive weight or footprint.
2. Weighted picking SHALL return an entry for every roll in [0, total weight).

### R3 Sanity and dread
1. Sanity SHALL stay within 0 to 100 for any sequence of changes, including NaN.
2. Dread SHALL never increase when sanity increases.

### R4 Narration
1. Narration SHALL be provided through `INarrationProvider`.
2. IF the AI provider throws or returns blank text THEN the system SHALL fall back to offline text.

### R5 Legal and repo hygiene
1. The paid Lovecraftian Village pack SHALL NOT be committed.
2. `.kiro/` SHALL be committed and not gitignored.
3. The repo SHALL include an open source license (Apache-2.0).

### R6 Dread blending
1. The system SHALL map dread to a blend weight in [0,1] that never decreases as dread increases.
2. Non-finite dread SHALL be treated as no dread.

### R7 Judge-runnable web demo
1. The repo SHALL include a browser demo that runs without Unity or paid assets.
2. The demo's layouts, RNG output, narration and dread SHALL equal the C# Core output for the checked-in golden seeds.
3. The demo SHALL let a user share a seed and sanity level through the URL.

### R8 Dread events
1. WHEN dread rises past the Uneasy, Dire or Abyss threshold THEN the system SHALL emit exactly one rising event for that threshold.
2. A rising event SHALL NOT repeat until dread has fallen below the threshold minus the hysteresis margin.
3. Non-finite dread SHALL be treated as no dread.

### R9 Village report
1. The system SHALL produce a report of seed, sanity, dread and layout as Markdown and as JSON.
2. The same inputs SHALL produce the same report.
3. Non-finite dread SHALL be stored as a string ("NaN", "Infinity") so the JSON stays valid.

### R10 Prefab auto-binding
1. The matcher SHALL map a catalog id to the best-named prefab, or to none when nothing matches.
2. The matcher SHALL be case-insensitive and deterministic, and SHALL NOT treat single-letter tokens as matches.
2a. WHEN a catalog entry has a `prefabHint` that is among the candidates THEN the resolver SHALL return it, else it SHALL fall back to the best-named prefab.
3. The Unity editor binder SHALL only use the matcher and SHALL NOT copy pack files into the repo.

### R11 Accessibility
1. The web demo SHALL be fully operable from the keyboard.
2. WHEN reduced motion is requested (`prefers-reduced-motion` or `?reduced=1`) THEN the demo SHALL avoid flicker and sway.
3. The layout SHALL remain usable on narrow screens.

### R12 DLNK adapter policy
1. WHEN dread is Calm THEN every building SHALL have detail level 3, and detail SHALL never rise as dread rises.
2. In top-down mode the system SHALL show exactly the floors up to the active floor (clamped); other modes SHALL show all floors.
3. Door behavior SHALL be Normal when Calm, SHALL NOT be Slam below Dire or Refuse below Abyss, and SHALL be deterministic for the same seed, building, door and attempt.
4. The top-down camera SHALL NOT be allowed at Abyss; other requests SHALL be honored.
5. Runtime adapters SHALL NOT reference DLNK types (UnityEvents and interfaces only), and `docs/DLNK_INTEGRATION.md` SHALL separate confirmed from guessed facts.

### Hosting
1. The web demo SHALL use only relative paths so it works at a site root or a sub-path.
2. Staging for deploy SHALL exclude `web/local-pack` and `docs/HOSTING.md` SHALL state that no host is confirmed live until the author verifies one.

## Story sequencer
- Story beats are deterministic for a given campaign: each night yields exactly five beats in the order title, rumor, lore, omen, weather.
- Beat indices are contiguous from 0, dread never decreases across beats, and omen text comes from the tier of its night's dread target.
- Beat durations are integer reading times clamped to 2500..12000 ms; Next and Previous clamp at the ends and are inverse inside the range.
- The JS port in `web/src/story.js` matches the C# `StorySequencer` exactly (golden `stories`).

## Story mode UI, intro and soundtrack
- Story mode steps through every beat of every night and autoplays with pause; `#story=1&night=N&beat=N` opens at that beat.
- The intro is skippable by keyboard and button, disabled by `?intro=0`, and static under reduced motion.
- The soundtrack is procedural, silent until a user gesture opts in, has volume and mute, uses no audio files, and removes pulses under reduced motion.

## Judge tour, journal tabs and progress gate
- `?tour=1` starts a keyboard accessible tour; a bare URL never starts it; Esc skips; reduced motion disables auto-advance; the card stays inside the viewport.
- Codex entries and achievements are awarded only after a player action. Deep links and restored sessions only preview, and a preview never overwrites saved progress.
- The journal has Story and Progress tabs, with a badge for unseen progress.

## Round 18: Unity vigil, touch and lock
- While a vigil is live the sandbox cheats (sanity slider, night stepping, seed entry, new village, daily, load session, drain) are refused with a localized reason; the rule lives in `VigilRules.AllowsSandboxAction`, and only whisper and landmark interactions count as clues.
- Unity runs the same vigil through a thin `VigilDirector`; vigil text comes from Core `VigilStrings`.
- The 3D view offers on-screen touch controls on touch or coarse-pointer devices (`?touch=1` forces them), 44 px minimum targets.
- Each ending links to a seeded epilogue still (web only).
- Unity runtime and real touch devices stay Unverified.

## Round 17: first impression and the Vigil
- A bare URL opens a title screen with the seeded first-night rumor, a 3D entry and a 2D entry; 3D is disabled with a reason when WebGL is missing. Deep links and capture flags skip it.
- The Vigil is the game loop: per night a clue target and three lanterns, endure the night, sanity carried between five nights, six endings, an integer score and a result code. Rules live in Core and are mirrored in JS with golden parity; the web only draws them.
- Stills: `?caption=0` hides the cinematic caption and `?grain=0` removes film grain, so a share image or README screenshot is clean.
- The 3D post pass (bloom, vignette, grain, chroma) falls back to direct rendering when the governor scale is low, with `?post=0`, or when the shader fails, with a console warning.

## Round 27: Mythos Simulation MVP
- Goal: the village advances in the background from the seed and the night number: cults recruit corrupted villagers, secrets come out, seeded omens press on both, rumors travel family and neighbour links and may distort.
- Inputs: the village seed, `VillageSociety`, `VillageStory`, `Data/mythos.json` (en and fr), and per night `dreadPermille`, `ritualStage` and optional per villager `suspicion`.
- Outputs: per night a `MythosNight` (events, cult members per cult, exposed secrets, rumors with holders, truth and distortion), identical in C# (`MythosSimulation.Run`) and JS (`web/src/mythos.js`). Feeds: Event cards and rumor versus truth contradictions on the board, suspicion pressure on `OpinionsAfter`, rumor lines, and a chronicle Mythos section limited to what the player heard.
- Constraints: a pure function with no hidden state (replay of nights 1..N equals the first N of a longer run); integer arithmetic; XOR-seed streams; a villager is in at most one cult and a cult member never leaves; an exposed secret stays exposed; no output of an existing golden key changes; a null mythos feed leaves old outputs unchanged.
- Failure conditions: a malformed `mythos.json` raises a `FormatException` that names the field; a night past the simulated range clamps; an input array past its end reads the last value and an empty one reads 0.
- Test cases: `MythosSimulationTests.cs`, `web/test/mythos.test.js`, golden key `mythos` (seeds 1, 42, 1818), data drift check in `tools/validate_repo.py`, browser check `MYTHOS_ONLY=1`.
- Night tick summary (`{"night": 14, "cultGrowth": 2, "rumorsAdded": 4, "missingPersons": 1, "newOmen": "black_tide", "realityShift": 3}`) is a spec only (task 154a), not built.
- Status: Core and JS Verified (dotnet 328, node 685, golden); browser check Partially Verified (7 of 7 on SwiftShader, `MYTHOS_ONLY` only); Unity runtime Unverified.

## Round 28: Knowledge + Investigation synergy (FEAT-003)
- Goal: evidence becomes a confidence score, then a belief score, and enough knowledge reveals a truth: two statements that look contradictory are about different nights.
- Inputs: the board evidence (books read, clues found, statements heard), the corruption stage per villager, the knowledge tier (0 to 5), `Data/statements.json` with optional `confidence` (0 to 100) per statement and optional `resolvesAt` (1 to 5) per contradiction, `Data/knowledge.json`.
- Outputs: the board with `Contradictions`, `Resolutions` and `Scores` (statement id, confidence, belief); the knowledge tier derived from evidence by `InvestigationRules.KnowledgeSources`.
- Rules: belief = confidence minus 30 when the speaker is corrupted, clamped to 0..100. A contradiction with `resolvesAt` is listed as a resolution when the tier is at or above it, else as a contradiction. At tier 0 the board equals the board built without knowledge.
- Example: the innkeeper's chat "the bell stayed silent" (night 2, confidence 78) against his journal "the bell tolled twelve times" (night 3, confidence 91): a contradiction at knowledge 0 to 3, explained at knowledge 4 and 5. A Lucan pair (abbey 78, home 91) is in the tests.
- Failure conditions: confidence outside 0..100, `resolvesAt` outside 1..5, or a resolvable pair whose statements share a night (or have none) raise a `FormatException` naming the contradiction or statement; unknown knowledge source ids throw naming `sources[i]`.
- Presentation: a knowledge badge with tonight's reality effects on the board, a chronicle line, journal entries per tier gained and per resolved contradiction, en and fr. Reduced motion removes the slow drift; nothing flashes or jumps.
- Test cases: `InvestigationModelTests.cs`, `web/test/investigation.test.js`, `web/test/board-ui.test.js`, golden key `knowledgeInvestigation`, existing golden keys unchanged.
- Status: Core and JS Verified (dotnet 350, node 701); board UI Partially Verified (fake DOM tests, browser check filters `MYTHOS_ONLY` and `SOCIETY_ONLY` do not assert the badge); Unity runtime Unverified.
- Later, unbuilt (see task 159, specified in Round 29 below): Evidence Confidence expansion. Task 165 (Victorian UI reskin) was built in round 33 (the horror-intensity setting is not built). Task 166 (creature upgrade path) was built in round 32. Trust Network and the Dynamic Horror Director were built in round 29.
- Security: no PayPal client id, secret, API key, webhook secret, database password or Stripe secret in source, commits, prompts, chat logs, issues or public repositories. Any monetization uses server-side environment variables behind a backend or API layer. A donation or support link is safe; secrets are not.

## Round 29: Trust Network, Horror Director and web polish
### Built: spec 160 Trust Network axes
- Goal: villagers carry Trust, Fear, Faith, Loyalty, Obsession and Corruption, so one can trust you and still refuse to talk.
- Inputs: seed, `VillageSociety`, night, optional `SocialStanding` Trust and Fear.
- Outputs: `VillageSociety.AxesAfter` (integer 0..1000 per axis), `FearWithholds`; chat is withheld when Fear is 800 or more and above Trust, trust still shows.
- Constraints: integer math, seeded, existing golden keys byte identical, default standing unchanged.
- Failure conditions: an axis outside 0..1000, or any change to the golden `society` output.
- Test cases: bounds, determinism, Trust 900 with Fear 950, golden key `axes`.
- Status: Core and JS Verified (dotnet and node tests, golden); dialog axis bars Partially Verified (fake DOM and headless screenshots); Unity runtime Unverified.

### Built: spec 161 Dynamic Horror Director
- Goal: pace dread from state with quiet stretches, never a jump scare.
- Inputs: sanity, knowledge, stress, safe-zone ticks, clue progress, cult exposure, creature encounters, night. The web feeds real knowledge, clue progress and safe-zone ticks (near a lit lantern).
- Outputs: a beat (Quiet, Unease, Pressure, Omen, Relief), intensity 0..1000 moving at most 40 per step, a narrative cause id for every non-quiet beat; presentation ramps for fog, lamplight and ambience.
- Constraints: deterministic and integer; an Omen forces 10 quiet steps; reduced motion keeps presentation still; Core never reads the presentation.
- Failure conditions: a spike in volume or brightness, a beat with no cause.
- Test cases: ordering and bounds, golden key `director`, `nearLitLamp` helper tests.
- Status: Core and JS Verified; fog, lamp and ambient ramps Partially Verified (no browser run); Unity runtime Unverified.

### Built: web visual polish (presentation only)
- A CSS layer for board, chronicle, journal and dialogs (framing, vignette, grain, parchment dialogs, hover and focus). Off or reduced under high contrast, cinema, forced colors and reduced motion. Partially Verified (headless screenshots only); Unity Unverified.

### Spec only, not built (Unverified)
Each item below has no code yet. Specs 162 and 163 were built in round 30 and spec 164 in round 31 (next sections).

**164 Four places (built in round 31; Verified by dotnet and node tests, Unity runtime and real-GPU rendering Unverified).** Goal: Abandoned Manor, Forest Boundary, Catacomb Interior and Forgotten Mine, built in that order, each with an entrance and a way back. Inputs: seed, landmark layout. Outputs: placements and entrance and exit points. Constraints: inside bounds, no landmark overlap, triangle budget. Failure conditions: out of bounds, no way back, overlap. Test cases: enter and leave round trip, bounds, overlap, budget.

**165 Victorian UI reskin (built in round 33, without the intensity setting).** Goal: a period look for panels with a horror-intensity setting. Inputs: the setting, reduced motion, contrast mode. Outputs: styles only. Constraints: the setting scales presentation and never Core output. Failure conditions: low contrast, a lost keyboard path, a different output for the same seed. Test cases: contrast ratio, keyboard walk, same seed same output.

**166 Creature upgrade path.** Goal: four stages (human-adjacent, corrupted villagers, reality-breakers, cosmic manifestations seen only briefly, never a chase). Inputs: seed, night, knowledge tier, director beat. Outputs: stage per encounter and an exposure time. Constraints: bounded exposure, a narrative cause, reduced motion respected. Failure conditions: a manifestation that stays on screen, a creature with no cause. Test cases: stage order, determinism, bounded exposure, reduced motion.

## Round 30: Branching investigations and missing person outcomes
### Built: spec 162 Branching investigations
- Goal: Theory, Evidence, Conclusion; the player may conclude wrongly.
- Inputs: board statements (up to three per theory), the knowledge tier, a choice log of integers (kind*10000+value), `Data/theories.json`.
- Outputs: a verdict per theory (True, Partially True, False), knowledge points, a trust cost for a wrong villager theory, an additive epilogue line (clear, misled, uncertain; none when unexplored).
- Constraints: three template kinds (missing person outcome, villager rot level, first omen); state is a replay of the log; illegal entries are counted and skipped; a concluded theory can be reopened; a wrong conclusion never blocks the Vigil.
- Failure conditions: a dead end, an option as truth with no reachable Partial or False answer (rejected at parse), a change to an existing golden key.
- Test cases: every conclusion reachable, replay equals the log, golden key `theories`, session round trip.
- Status: Core and JS Verified (dotnet 383, node 728); builder UI Verified in headless Chromium `THEORY_ONLY` 9 of 9 (SwiftShader); trust penalty scaling Partially Verified; Unity runtime Unverified.

### Built: spec 163 Missing person outcomes
- Goal: each missing person resolves to exactly one of Dead, Escaped, Recruited, Transformed, Hidden or Displaced.
- Inputs: seed, the finished Mythos run, the player's leads (`Data/outcomes.json`).
- Outputs: one outcome per person; the victim card and chronicle show a taken line from one lead and the epitaph from four.
- Constraints: seeded, one outcome each, authored constraints exclude outcomes contradicted by the story chat and lore pages, Hidden is never excluded.
- Failure conditions: two outcomes for one person, an outcome revealed without leads.
- Test cases: one outcome each, determinism, constraints, golden key `outcomes`.
- Status: Core and JS Verified; chronicle and card UI Verified in `NARRATIVE_ONLY` 2 of 2 and `THEORY_ONLY`; Unity runtime Unverified.
