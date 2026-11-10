# Contributing

Thanks for helping stitch the village together. You do not need Unity for most work.

## Setup
- Node 20+ (CI uses 22), Python 3, and the .NET 8 SDK.
- No package install step. The web demo has no dependencies.
- If your home directory is read-only, prefix dotnet commands with `HOME=/tmp/home`.

## Checks (run all three before opening a PR)
```bash
python3 tools/validate_repo.py
node --test "web/test/*.test.js"
dotnet test tests/Frankenstein.Core.Tests
```
CI runs the same commands (`.github/workflows/ci.yml`).

## Rules
- **Core first.** New logic goes in `Assets/Scripts/Core` (no `UnityEngine` references) with a property test in `tests/Frankenstein.Core.Tests`. MonoBehaviours in `Assets/Scripts/Runtime` only wrap Core.
- **Determinism.** Use `SeededRandom`, never `System.Random` or time, in Core.
- **Golden parity.** If you change Core behavior, regenerate the contract and update the JS port to match:
  ```bash
  UPDATE_GOLDEN=1 dotnet test tests/Frankenstein.Core.Tests
  node --test "web/test/*.test.js"
  ```
  CI fails if `web/test/golden.json` would change. `web/data/village_catalog.json` must stay byte-identical to `Assets/Data/village_catalog.json`.
- **No paid assets, no Git LFS.** Never commit the Lovecraftian Village pack (DLNK Artworks) or anything under `Assets/ThirdParty` except its README. The pack comes only from the OneDrive links in the README. `tools/validate_repo.py` enforces this.
- **No em dashes** (U+2014) in any written content; the validator checks text files.
- **Be honest in docs.** Mark anything not run in the Unity editor as unverified. Do not invent usage numbers.
- **Tone.** Dread over gore.

## Screenshots
`tools/screenshot.sh` renders the web demo with a headless Chromium to `docs/media/`. Keep each image under 1 MB.

## Commits
Small, logical commits with a type prefix: `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`.
