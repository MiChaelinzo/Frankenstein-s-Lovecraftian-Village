# Structure

```
.kiro/                 specs, hooks, steering (always committed, never ignored)
Assets/Scripts/Core    pure C# logic (testable without Unity)
Assets/Scripts/Runtime Unity glue (MonoBehaviour, ScriptableObject)
Assets/Data            catalog JSON describing stitchable pieces
Assets/ThirdParty      placeholder only; paid packs are gitignored
Packages/ ProjectSettings/   Unity project config
tests/                 dotnet xunit property tests over Core
tools/validate_repo.py repo guardrails
docs/                  Kiro usage, demo script, Devpost draft
```

Rules: new logic goes in Core first with a property test; new MonoBehaviours only wrap Core. Never add files under `Assets/Lovecraftian Village*`.
