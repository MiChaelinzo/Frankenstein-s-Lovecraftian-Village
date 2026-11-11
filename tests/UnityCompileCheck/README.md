# Unity compile check (stub based)

`dotnet build tests/UnityCompileCheck` compiles `Packages/com.michaelinzo.frankenstein-village/Core`, `Runtime` and `Editor` against
small hand-written stubs in `Stubs/` instead of the real UnityEngine and UnityEditor assemblies.

What it proves: the scripts parse, their types and member calls are consistent with the stub
declarations, and `#if UNITY_EDITOR` code compiles.

What it does not prove: runtime behavior, serialization, asmdef wiring, or that the real Unity 6 API
has the same signatures as the stubs. The stubs are original and only cover APIs the scripts use.
No Unity DLLs are downloaded or tracked. Opening the project in Unity 6 remains unverified.
