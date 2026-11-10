# Structure

```
.kiro/                 specs, hooks, steering (always committed, never ignored)
Assets/Scripts/Core    pure C# logic (testable without Unity)
Assets/Scripts/Runtime Unity glue (MonoBehaviour, ScriptableObject)
Assets/Scripts/Editor  editor-only tools (CatalogAutoBinder), unverified in Unity
Assets/Data            catalog JSON describing stitchable pieces
Assets/ThirdParty      placeholder only; paid packs are gitignored
Packages/ ProjectSettings/   Unity project config
web/                   browser demo: JS port of Core + canvas UI (deployed by GitHub Pages)
tests/                 dotnet xunit property tests over Core, plus golden parity file for web/
tools/validate_repo.py repo guardrails
docs/                  Kiro usage, demo script, Devpost draft
docs/media/            screenshots used by the README (each under 1 MB)
tools/screenshot.sh    renders the web demo to docs/media with headless Chromium
```

Rules: new logic goes in Core first with a property test; new MonoBehaviours only wrap Core. If you change Core behavior, regenerate the parity contract with `UPDATE_GOLDEN=1 dotnet test tests/Frankenstein.Core.Tests` and update `web/src/core.js`; `web/data/village_catalog.json` must stay identical to `Assets/Data/village_catalog.json`. Never add files under `Assets/Lovecraftian Village*`.
