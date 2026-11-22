# Design brief and roadmap framing

Status: **planned, Unverified**. Nothing below is built unless it names an existing file. This page records the Lead Technical Director brief (13 sections) as vision and roadmap framing, mapped onto what the repository already has. It adds no code. The delivery order is the author roadmap in `.kiro/specs/tasks.md` (round 26 done, then Mythos Simulation Engine, branching quests, world map and dimensional spaces, Victorian UI and settings).

Rules that still hold: Core is the source of truth, Runtime and Web consume it, randomness is seeded, content is data, and claims stay labelled Verified, Partially Verified or Unverified.

## 1. Project vision

- **Unique selling point:** a village that reasons about you. Trust, suspicion and corruption follow one deterministic model (round 26), so dread comes from systems, not scripts.
- **Narrative pillars:** a village with causes (families, journals, missing persons in `VillageStory`); evidence you assemble (the board); statements that cannot all be true.
- **Psychological pillars:** unreliable perception (sanity effects), withheld or false statements from suspicious villagers, a record that can disagree with itself.
- **Cosmic pillars:** forbidden knowledge with a cost, scale and indifference (the sea, the lighthouse beam, the ritual site), no explanation of the thing itself.
- **Emotional progression:** unease (night 1), pattern recognition (nights 2 to 3), distrust (3 to 5), dread of the village itself, then an ending that depends on what you believed.
- **Core loop (exists today):** explore by day, read lore and talk, survive the night vigil, collect clues, review the board, return. Replayability comes from seeds, the daily seed and seed-chosen patient zero.
- **Signature Lovecraftian moment (planned):** you notice the villager who gave you a clue is the one who has been leaning toward the sea for two nights, and the board shows the clue contradicts their own earlier statement.
- Avoid: jump scares, gore, random shocks. Fear comes from implication.

## 2. World building

Existing places come from round 23 and 24 landmarks (`VillageLandmarks`) and the five city districts.

| Brief district | Maps to today | Gap (planned) |
|---|---|---|
| Harbor | Harbour district, Wreck of the Marguerite, pier | Fishing village (task 131) |
| Church Quarter | Chapel Hill, Cemetery, Abbey Ruins | Cliff monastery (task 132) |
| Market District | Market, Old Town square | Stalls with stories, economy (later round) |
| Forest Boundary | Cursed Grove | Forest region (task 129) |
| Abandoned Manor | none | A manor landmark with a lore book chain |
| Ritual Grounds | Ritual site, Standing Stones | Rite scenes, Mythos Simulation Engine events |
| Hidden Catacombs | Catacomb entrance (gate only) | Interior (task 133) |

Per place the data to add, in `Data/*.json`: lore line, visual style note, ambient events, villager types, a secret, and one environmental story (a prop arrangement). No new system is needed; names, legends and lore books already exist.

## 3. Eldritch systems

- **Sanity:** exists as `SanityModel` with dread curves. Planned additions as presentation layers over Core stages: visual distortion, audio hallucinations, false villager lines (reuse the chat lies), altered journal wording. All must stay seed-deterministic.
- **Knowledge (planned):** a Core `KnowledgeRules` holding forbidden truths. Benefit: unlocks a clue or a hidden path. Cost: a sanity loss and a corruption level bump (`CorruptionGrowth`). Risk and reward is visible before choosing. Failure: knowledge that unlocks nothing; a cost that cannot be seen first.

## 4. Monster tiers

Today `CreatureRules` has four creatures (shore-crawler, hollow-eyed watcher, harbour deep-one, cliff flyer), which cover tier 1 and a thin tier 3. Mapping:

| Tier | Brief | Today | Planned |
|---|---|---|---|
| 1 | Human-adjacent horrors | Hollow-eyed watcher | Pale caretaker, the unlit lamplighter |
| 2 | Mutated villagers | Corrupted villagers (round 26 tell, `CorruptionStage`) | Cultist and Missing fates get a body change |
| 3 | Reality-breaking | Harbour deep-one, shore-crawler | Rooms that rearrange (dimensional spaces) |
| 4 | Cosmic manifestations | none | Sky and sea events, never a fight |

Each entry needs appearance, lore, behaviour, AI rule, audio, encounter strategy and counterplay. Counterplay stays the existing set: salt, chalk sigil, flare, lantern, line of sight. Creatures stay quiet by design.

## 5. Dynamic horror director

Exists in part: `DreadEvents` (threshold omens), `DreadCurve`, `GameClock`, `HorrorAmbienceDirector` (Unity). Planned: a Core `HorrorDirector` that reads stress (sanity, recent events), confidence (time since last clue), time spent safe, and exploration (landmarks visited), and picks one event per window from authored lists. It keeps a recent-event memory so nothing repeats inside a window. Inputs: seed, session state. Outputs: an event id and a delay. Failure: repeat within window, two events at once, nondeterminism. Tests: same inputs same event, no repeat, cooldown respected. This is the Mythos Simulation Engine's front end (task 154).

## 6. Architecture

The brief proposes an `/ai` tree. The repository already has a boundary that does the same job, so no new tree is created.

| Brief folder | Lives in | Notes |
|---|---|---|
| /entities | `Core/CreatureRules.cs`, `Items.cs`, `VillageSociety.cs` | data models and rules |
| /world | `Core/VillageLayoutGenerator`, `VillageLandmarks`, `VillageStory` | seed-driven |
| /systems | `Core/SanityModel`, `DreadEvents`, `CorruptionGrowth` | pure C#, no Unity |
| /events | `Core/DreadEvents`, `SocietyAction` log | an ordered log is the event bus |
| /ui | `Runtime/*Hud`, `web/src/*-ui.js` | thin, no rules |
| /audio | `HorrorAmbienceDirector`, `web/src/music.js` | consumes Core stages |
| /save | `web/src/session.js`, `ProgressionSession` | versioned strings |
| /content | `Data/*.json` with byte copies in `web/data` | drift checked |
| /tools | `tools/` | validators, generators, browser check |

Patterns: the ordered action log is the event bus and observer in one place; state machines for quests (task 155); dependency injection by passing data into Core functions; no ECS (the object counts do not need it). Rule: if it can run without Unity it goes in Core, with a JS mirror and a golden key.

## 7. Content pipeline

Everything is data under `Data/*.json`, copied byte for byte to `web/data/`, checked by `tools/validate_repo.py`, with en and fr and drift tests. Examples (planned shapes, illustrative):

Quest:
```json
{ "id": "q_lamp_oil", "giver": "innkeeper", "needs": ["clue_oil_stain"],
  "choices": [ { "id": "tell", "requires": { "trust_min": 400 }, "leads": "end_exposed" },
               { "id": "hide", "leads": "end_complicit" } ],
  "text": { "en": "...", "fr": "..." } }
```

Statement (the shape already used in `Data/statements.json`, simplified):
```json
{ "id": "c_shore_light", "speaker": "any", "source": "chat",
  "contradicts": "j_no_light", "text": { "en": "...", "fr": "..." } }
```

Ritual event:
```json
{ "id": "rite_tide", "place": "ritual_site", "night_min": 3,
  "dread_min": 40, "effects": [ { "kind": "corruption", "delta": 1 } ] }
```

Journals, NPC stories and procedural lore fragments follow the same pattern: id, conditions, text in two languages. Failure conditions: unknown id references, a missing language, an unreachable entry. Tests: schema and reference check in `tools/`, drift tests.

## 8. Visual upgrade

Existing: `docs/ART_DIRECTION.md` (palette, fog, rain, storm, filmic post, quality tiers). Direction to keep: cold moonlit top grade with warm low lantern light, wet stone, salt-bleached timber, Victorian maritime decay as shape language (iron, brass, rope, nets), no copied designs. Planned: color script per night, lighting rules per district, fog density by dread, weather by seed, one environmental story per place. Limits: dependency-free WebGL, no PBR, no global illumination. Look claims stay Partially Verified (software GL).

## 9. Audio

Existing: procedural opt-in soundtrack (`music.js`), quiet creature swell. Planned: layered ambience per district, procedural whispers drawn from seeded phrase lists (already used by dread omens), distance-based anomaly sounds, a sanity-reactive mix, forbidden-language fragments as invented syllables (no real-language mocking). Architecture: Core outputs stage and parameters, the web and Unity layers synthesize. Sound has never been listened to by a person here (Unverified).

## 10. Phased roadmap

| Phase | Objectives | Deliverables | Milestones | Risks | Metrics |
|---|---|---|---|---|---|
| 1 Playable prototype | Walk, read, survive, record clues | Done: village, vigil, 3D view | Judge quick start works | Scope creep | Browser check passes |
| 2 Vertical slice | One strong loop with systems | Round 26 board and trust; round 27 simulation | Seed 1818 plays an hour | Simulation noise | Same seed same events |
| 3 Content expansion | More places and stories | Quests, endings, map, mines | Three endings reachable | Content bugs | Reference check zero errors |
| 4 Playtesting and balancing | Tune dread and trust | Settings, intensity levels, accessibility | Five outside players | Over-tuning | Completion rate, session length |
| 5 Release candidate | Stable and polished | Victorian UI, performance pass, store page | Real-GPU and Unity run | Unity never run here | Frame time targets below |

All phase 3 to 5 dates are unset. Unity runtime and a real GPU stay Unverified until someone runs them.

## 11. Performance

Targets (planned, not measured on real hardware): PC 60 fps at Medium; Steam Deck 40 to 60 fps at Medium or Low; low-end 30 fps at Low (540p ceiling). Current numbers are SwiftShader only (indicative). Approach: chunked world streaming for regions beyond the village, LOD by distance for props, cheap occlusion by district culling, pooled arrays and no per-frame allocation in hot paths, an AI budget (villager and creature updates capped per frame, far ones tick at a lower rate), and a triangle budget check already in tests.

## 12. Code generation tasks

1. Folder structure: not created, see section 6 (the existing layout is kept).
2. Architecture diagram: the table in section 6; a drawn diagram is a follow-up.
3. Entity definitions: `CreatureRules`, `Items`, `VillageSociety` exist; the manor and tier 4 entities are planned.
4. Sanity specification: `SanityModel` exists; effects layers planned (section 3).
5. Director specification: section 5.
6. JSON schema examples: section 7.
7. Initial backlog: the TOP-25 below and `.kiro/specs/tasks.md` tasks 149 to 157.
8. Debt prevention checklist: no duplicate systems, no magic numbers, golden key for every Core rule, byte-copy drift checks, labelled claims, no third party assets committed, no em dashes (validator).

## 13. Competition polish

Judges look for innovation (a village that reasons about you), immersion, narrative depth, technical depth (Core with JS parity, golden data), replayability (seeds, daily seed), streaming value (seed sharing, contradiction reveals) and honesty about what is verified. Keep the public build to original or CC0 assets, keep the demo under 3 minutes, and show the board and the corruption tell early.

## TOP-25 by impact per hour

Highest first. All planned, Unverified.

1. Wire the four unwired society actions (tasks 149 to 152): small, makes trust real.
2. Make the 2D corruption tell readable (task 153).
3. Record a 30 second board and contradiction clip for the demo.
4. Mythos Simulation Engine, night events only (task 154).
5. Horror director repeat memory over `DreadEvents`.
6. Horror-intensity setting that scales presentation only.
7. Reduced-flash and larger-text accessibility options.
8. Three endings for the Vigil with a Core state machine (task 155).
9. Seed share link with a result card.
10. Knowledge system with a visible cost.
11. False villager lines under low sanity.
12. Altered journal wording under low sanity.
13. Forest region (task 129).
14. Catacomb interior with three clue chambers (task 133).
15. Abandoned manor landmark and lore chain.
16. Sanity audio hallucinations (quiet, seeded).
17. Per-night color script.
18. World map panel (task 156).
19. Tier 2 body change for Cultist and Missing fates.
20. Victorian panel reskin (task 157).
21. Mines as a first interior type.
22. Per-district ambient event lists in data.
23. Content reference checker for quests and statements.
24. Steam Deck frame budget test on real hardware.
25. Unity runtime pass of the society hooks.
