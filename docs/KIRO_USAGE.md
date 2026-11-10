# How Kiro was used

This document answers the Kiroween rubric questions. Facts below come from what is in this repository (`.kiro/`, `tests/`, `tools/validate_repo.py`) and from how the scaffold was produced. Where a statement is about personal experience, it is limited to what is true: the project was built with Kiro Web.

## How the project was produced

The initial scaffold (Unity 6 project skeleton, pure C# core, property tests, `.kiro` specs, hooks and steering, docs) was produced through **Kiro Web**. An orchestrator agent delegated the work to sub-agents: a **planner** (explored the repo and wrote the task and feature plan), a **coder** (implemented the feature and committed it locally) and a **reviewer**. The agents used the **GitHub CLI power** for git and GitHub operations. The author then added the Lovecraftian Village environment, the HDRP and URP download links and the README content, and reconciled it with the scaffold.

A second round of work (dread events, village report, prefab name matcher, editor auto-binder, web demo polish, CI and docs) was produced by Kiro agents in an autonomous session on the `feat/polish-and-depth` branch, again through Kiro Web. This document makes no claims about statistics such as how many requirements became tests or how often hooks fired.

## Kiro IDE, CLI, Web and Crew: what each is for

| Surface | What it is | How it fits this project |
|---------|-----------|--------------------------|
| **IDE** | Local editor experience with specs, steering, hooks and agent chat in the workspace. | The `.kiro/` folder is the IDE's native format: `specs/` feeds the spec workflow, `steering/` is loaded as persistent context, `hooks/*.kiro.hook` appear in the hooks panel. Best for interactive work on Unity glue while looking at the editor. |
| **CLI** | Terminal agent for scripted and headless runs. | Suited to repeatable checks such as `python3 tools/validate_repo.py` and `dotnet test tests/Frankenstein.Core.Tests`, which are plain commands an agent or CI can run. |
| **Web** | Browser-based agent that works on a GitHub repo in a sandbox without a local setup. | This is what produced the scaffold: no local Unity or IDE needed, it clones the repo, works on a branch (`feat/hackathon-scaffold`), runs `dotnet test` in the sandbox and commits. It cannot open Unity, so Unity-bound work stays testable only through the engine-free core. |
| **Crew** | Multi-agent orchestration: several specialised agents coordinated on one goal. | The scaffold run followed this pattern: orchestrator, planner, coder and reviewer with separate roles and a shared task state. This repo is not itself a Kiro Crew app; see the bonus prize notes in `docs/DEVPOST_SUBMISSION.md`. |

This project was built with Kiro Web only. No use of the Kiro IDE or CLI is claimed; the IDE and CLI rows above describe how the committed files would fit those surfaces.

## Custom agents

No custom agent configuration file is committed in this repo. What exists is a role split used during the Web run (planner, coder, reviewer), each with a narrow job: the planner produced `context.json` and feature files, the coder implemented exactly one feature and verified it, and the reviewer checked the result. The steering files and hooks give any agent the same project rules.

No custom agent was defined. A natural next step is a "Cultist Reviewer" that checks tone (dread over gore) and legal hygiene of asset use.

## Agent hooks

Three hooks live in [`.kiro/hooks`](../.kiro/hooks), all enabled and committed:

- **Run Core Tests On Save** (`test-on-save.kiro.hook`): on `fileEdited` for `Assets/Scripts/Core/**/*.cs` or `tests/**/*.cs`, asks the agent to run `dotnet test tests/Frankenstein.Core.Tests` and, on a failing property, report the failing seed and decide whether the code or the property is wrong.
- **Paid Asset Guard** (`asset-guard.kiro.hook`): on `preToolUse` for write and shell tools, asks the agent to refuse adding, staging or committing files from the third-party Lovecraftian Village or Essential Terrain packs, anything under `Assets/ThirdParty` besides its README, and any `git add -f` on ignored paths.
- **Validate Repo Before Finish** (`validate-repo.kiro.hook`): user-triggered, runs `python3 tools/validate_repo.py` and `git check-ignore`.

The hooks encode the project's two risks: regressions in core logic and accidentally publishing third-party assets. The same asset rule is enforced a second way (`.gitignore` and `tools/validate_repo.py`), so the guard does not rely on an agent obeying a prompt.

No specific hook trigger is claimed here; the hooks are committed and documented above.

## Spec-driven development vs vibe coding

- **Spec-driven** ([`.kiro/specs`](../.kiro/specs): `requirements.md`, `design.md`, `tasks.md`): used for the core rules where correctness matters, namely village layout (determinism, bounds, no overlap, catalog-only ids), catalog validity, sanity and dread, and narration fallback. Requirements are written as WHEN/THEN/SHALL statements, and `design.md` maps them to testable properties, so each requirement has a test.
- **Vibe coding**: better for Unity glue (`VillageBuilder`, `HorrorAmbienceDirector`), ambience tuning and look-dev, where feedback is visual and a spec would only slow things down.

Trade-off visible in the repo: the spec-driven part has 22 automated tests and a traceable requirement for each behavior; the vibe-coded part has no tests and depends on running Unity.

In practice the spec forced edge cases (empty catalog, NaN sanity) to be decided up front, and each one became a test. The Unity glue has to be re-checked by hand in the editor.

## Steering docs

[`.kiro/steering`](../.kiro/steering) holds three files: `product.md` (goal, audience, gothic tone with no explicit violence, legal stance on the pack), `tech.md` (Unity 6, pure logic in `Assets/Scripts/Core` with no `UnityEngine` reference, deterministic `SeededRandom`, narration behind `INarrationProvider` wrapped in `SafeNarrationProvider`, how to run tests, no em dashes in docs) and `structure.md` (folder layout and the rule that new logic goes in Core first with a property test). Steering means these rules did not have to be repeated in each prompt.

## MCP

No MCP server configuration is committed to this repo, and the scaffold run did not depend on one; the agents used built-in tools and the GitHub CLI power. MCP would be a good fit for a Unity editor bridge (to drive scene building and capture screenshots) and for documentation lookup, but that is a possible extension, not something this project claims to have done.

No MCP server was connected for this project.

## Property-based testing

Tests are in [`tests/Frankenstein.Core.Tests`](../tests/Frankenstein.Core.Tests). `Property.cs` is a small hand-rolled runner (no FsCheck dependency): each property runs 300 seeded random cases and reports the failing seed so a failure is reproducible. `CoreProperties.cs` has 9 xunit tests derived from the original requirements (`DepthProperties.cs` adds tests for dread events, the report and the prefab matcher; the suite totals 22):

- same inputs always give the same layout (determinism)
- every piece stays inside the grid (bounds)
- no pieces overlap
- only catalog ids are used
- empty catalog or non-positive sizes give an empty layout
- invalid catalog entries are ignored and weighted picking always returns an entry
- sanity stays within 0 to 100 for any sequence, including NaN
- dread never increases when sanity increases
- narration falls back offline when the provider throws or returns blank text

The tests compile the Core source files directly, so they run with `dotnet test` and no Unity install. Run them with `HOME=/tmp/home` if your home directory is read-only.

## Web demo and parity testing

The judge-runnable browser demo in `web/` was specced as R7 and built from the same Core design. The key trick is the golden file: a C# xunit test (`GoldenParity`) writes `web/test/golden.json` from the real Core classes, and `node --test` asserts the JS port reproduces it exactly (RNG sequence, layouts for several seeds and grids, narration, dread). That keeps two implementations honest without a Unity install.

## Powers

The scaffold run used the **GitHub CLI power** (clone, branch, commit, and PR-related git operations through `git` and `gh`). Powers installed in the Kiro environment also include browser automation and GitLab tooling, but they were not needed for this project, so no use of them is claimed. No power was authored for this repo.

The GitHub CLI power was used for branches and the pull request. No power was installed or built by the author for this project.

## Guardrail script

[`tools/validate_repo.py`](../tools/validate_repo.py) checks that required files exist, that `.kiro` is tracked and not ignored, that at least one `.kiro.hook` exists, and that no paid pack files or binary assets are committed.
