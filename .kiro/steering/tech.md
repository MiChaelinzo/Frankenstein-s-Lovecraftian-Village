# Tech

- Unity 6 (6000.0.x), HDRP, Input System. C# only.
- Pure game logic lives in `Assets/Scripts/Core` (asmdef `Frankenstein.Core`, `noEngineReferences: true`). It must not reference `UnityEngine`.
- MonoBehaviours and ScriptableObjects live in `Assets/Scripts/Runtime` and stay thin: they call Core and apply results.
- Tests: `dotnet test tests/Frankenstein.Core.Tests` compiles the Core files directly. Prefer property-based tests (seeded random cases, report failing seed).
- Determinism: use `SeededRandom`, never `UnityEngine.Random`, in Core.
- AI narration goes behind `INarrationProvider` and must be wrapped in `SafeNarrationProvider` so failures fall back offline.
- Guardrail script: `python3 tools/validate_repo.py`.
- In sandboxes with a read-only home, run dotnet with `HOME=/tmp/home`.
- Do not use em dashes in written docs.
