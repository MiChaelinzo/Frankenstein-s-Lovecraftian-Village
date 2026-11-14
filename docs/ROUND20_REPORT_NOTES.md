# Round 20 report notes

Numbers for the final report. Status labels: Verified (tests), Partially Verified (SwiftShader stills), Unverified (real GPU, Unity runtime).

- Person versus house: person 1.7 m, eye 1.6 m, door 2.0 m. house_a ridge 9.0 m (5.3 times the person), house_b ridge 9.7 m (5.7 times), two storeys of 3 m. Before: low sheds, the viewer towered over them (`docs/media/before-scale.png`). After: houses loom and a villager stands small beside them (`docs/media/after-scale.png`). The person no longer reads as a giant (Partially Verified by the still; author confirmation is task 99).
- Geometry: about 23k to 26k triangles in view (perf HUD buffer average 25823), budget 60000. Draw calls: `FRAME_BUDGET` ceiling 12, no new draw call this round (props use an atlas, birds share the villager buffer). Lights 8, halos 120, points 1400.
- Assets: 37 original GLB meshes, 328 KB in total (each under 200 KB, largest about 28 KB); `web/assets/third_party` 484,864 bytes (CC0 Poly Haven: 4 textures, 2 props, largest file 122 KB), budget 40 MB.
- Timings (SwiftShader, indicative only): real-time walk mean 97 ms per frame (10.3 fps), median 33 ms, p95 267 ms. Real GPU: Unverified.
- Tests: dotnet 172, node 441, validator OK, UnityCompileCheck 0 errors 0 warnings, browser check 99 of 99.
