# Demo video script (target 2:50, hard limit under 3:00)

One video for the Devpost demo and for the author's own live demo. Format: **side by side**. The live web game is on the left, the author exploring the DLNK HDRP/URP assets in Unity 6 on his own machine is on the right. Where one side carries a shot alone, it fills the frame. The OBS layout and encoder settings are in [RECORDING.md](RECORDING.md); the Unity exploration path is in [PACK_EXPLORATION.md](PACK_EXPLORATION.md); matching Unity MCP prompts are in [MCP.md](MCP.md).

## Rules (non-negotiable)
- **No DLNK trailer footage.** The trailer at https://www.youtube.com/watch?v=Jbj-us1DTv0 is DLNK's (Daelonik Artworks) own promo. Record your own footage.
- **No copyrighted music.** The soundtrack in the web demo is original, generated live with WebAudio, and off until you tick Music. Otherwise record with no music at all.
- **Own footage only**, and **credit DLNK** (Daelonik Artworks, DLNK Works) in the description and on the closing card.
- Pack screenshots stay out of the repo. A recording of your own Unity session is yours to publish; follow the pack licence for what you show.

## Honest status shown in the video
Unity cannot be installed or run in the Kiro Web sandbox that built this repo: Unity Personal licence activation is tied to the author's Unity account, so the sandbox never opened the editor. All Unity code is **Partially Verified** (compile checked against original stubs in `tests/UnityCompileCheck`) and **Unverified** at runtime until the author runs it. The Unity side of this video is the author's first real run. If a Unity step misbehaves on camera, say so and cut to the web side; do not edit the claim.

## Windows and placement
| Id | Window | Placement in the frame |
|----|--------|------------------------|
| W | Browser on https://frankensteinlovecraftianvillage.vercel.app/ (1920x1080 real browser, not headless) | Left half in split shots |
| U | Unity 6 editor (HDRP project, URP project for the A/B shot), Game view maximised for walk and fly shots | Right half in split shots |
| S | Browser tab on `selftest.html` | Full frame |
| K | GitHub repo `.kiro/`, terminal with `dotnet test` ready, GitHub pull request list | Full frame |

## Matching seeds
Use **seed 1818** everywhere. Web: `#seed=1818`. Unity: `VillageBuilder.seed` = 1818 (also `pieceCount` 80 to match the web, default is 40) and `VillageFlythroughCamera.seed` = 1818 (default). `Tools > Frankenstein > Copy Matching Web Demo URL` reads the seed from the scene and copies `https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1&view=3d` (plus `&cinematic=1` when the scene has the showcase camera). Verified by dotnet tests and golden parity: the link text. Unverified: the menu itself in Unity.

## Timed shot list (total 2:50)
| Time | Side | Web side (W) | Unity side (U) | On-screen text | Voice-over (read aloud) |
|------|------|--------------|----------------|----------------|-------------------------|
| 0:00-0:08 | W full | `https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1` (bare URL, intro plays) | none | "Frankenstein's Lovecraftian Village" and the live URL | "A village that watches you back. Playable right now in any browser, and built to run in Unity 6." |
| 0:08-0:18 | W full | `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&tour=1`, two or three stops, Esc | none | "Guided tour: ?tour=1" | "Every village is a seed. The same seed gives the same village on every machine." |
| 0:18-0:34 | split | `https://frankensteinlovecraftianvillage.vercel.app/?intro=0#seed=1818&story=1&night=1`, Play, then `#seed=1818&story=1&night=3&beat=3` | Project window with the imported pack under `Assets/_DLNK`, open `Tools > Frankenstein > DLNK Pack Explorer` | "Story mode (S)" / "DLNK pack, imported by me" | "Story mode walks every night and sanity falls with it. On the right, the DLNK Myst Village pack in Unity 6, credit to DLNK Works." |
| 0:34-0:50 | split | `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&view=3d#seed=1818&sanity=60&night=2`, walk with WASD and mouse, E at a door | `Tools > Frankenstein > Open DLNK Demo Scene And Add Showcase Camera` (opens Coast Scene), then back in an empty scene `Tools > Frankenstein > Create Playable Village Scene`, press Play, walk with FirstPersonExplorer (WASD, mouse, E, V) | "First-person: ?view=3d" / "FirstPersonExplorer" | "Same rules, two runtimes. In the browser it is plain WebGL. In Unity the explorer is a thin MonoBehaviour over the same Core." |
| 0:50-1:00 | split | `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&meshes=1#seed=1818` then `https://frankensteinlovecraftianvillage.vercel.app/meshes.html` | `Tools > Frankenstein > Auto-bind Catalog Prefabs`, read the `[Frankenstein]` console lines | "Original Blender meshes" / "Auto-bind" | "The web side uses original low-poly meshes I modelled. In Unity the auto-binder matches catalog ids to prefabs in the pack I own. The editions only carry lamps, so the rest stay on block fallbacks." |
| 1:00-1:14 | split | `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&view=3d&cinematic=1#seed=1818&night=3` (fly-through) | Showcase camera: Play with `VillageFlythroughCamera` (seed 1818) in the Coast Scene Game view; Unity Recorder at fixed 30 fps | "Fly-through: ?view=3d&cinematic=1" / "VillageFlythroughCamera" | "Both cameras follow the same Core base path: one stop per story beat, same path for the same seed. The web adds omen framing at Dire and Abyss and turns to the sea; Unity does not, and its beat lengths are whatever I set in the component." |
| 1:14-1:24 | split | paste the copied link into W | `Tools > Frankenstein > Copy Matching Web Demo URL`, paste into the browser address bar | "Copy Matching Web Demo URL" | "One menu item copies the web link that matches the open Unity scene." |
| 1:24-1:32 | S full | `https://frankensteinlovecraftianvillage.vercel.app/selftest.html`, wait for green | none | "Self-test: JS port equals C# output" | "This page replays a golden file written by the C# core and checks the JavaScript port against it." |
| 1:32-2:26 | K full | `.kiro/specs`, `.kiro/steering`, `.kiro/hooks`, `dotnet test`, pull request list | none | "Built with Kiro Web" / "specs, steering, hooks" / "Merged round by round" | See "How we used Kiro" below |
| 2:26-2:40 | split | `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&view=3d#seed=1818&night=3` | The same DLNK scene in the HDRP project, then the URP project (see PACK_EXPLORATION.md) | "HDRP vs URP" / "Unity: Partially Verified, runtime Unverified" | "HDRP and URP editions of the pack, side by side. The Unity package is compile checked against stubs and I am running it for the first time on camera, so it stays marked Unverified." |
| 2:40-2:50 | card | none | none | "Pack by DLNK (Daelonik Artworks). Built with Kiro." Repo URL, live URL, #KiroweenHackathon26 | "Specs, steering, hooks and property tests, stitched together. Thanks for watching." |

Pairing notes for the fly-through row (0:18 onwards, 1:00-1:14): the web URL uses `night=3`, which is in the range where omen framing can take over the web camera as dread rises, so the two takes are the same base path, not frame-identical. For a frame-matched take use `night=1` (no omen framing) or accept the divergence and say it. Beat lengths: the web beats last `beatDurationMs(text length)` each (Core `StoryBeats.BeatDurationMs`), while `VillageFlythroughCamera.beatDurationsMs` defaults to five 6000 ms beats; type matching values into the component or the stops will not line up in time. Unity scale: `cellSize` on the camera defaults to Core `DefaultCell` 4, but `VillageBuilder.cellSize` defaults to 6 and the camera uses the builder value when one is assigned, so camera height stays 4.6 m and look-at 1.6 m while the horizontal path grows, which is a different shot. Set both to 4 for a matching take. All Unity-side claims in this table (menu names, "opens Coast Scene", the pack prefab count, "Assets 1.0", "MystVillage") come from a pathname listing of the author's git-ignored packages and are **Unverified** until seen in the Unity editor.

Fallback if no Unity footage exists: give 0:18-0:34, 0:34-0:50 and 2:26-2:40 to web-only shots (`?view=3d`, `?view=3d&cinematic=1`) and say the Unity side is Unverified. Do not use the Unity lines.

## How we used Kiro (54 second shot, 117 words of narration, 1:32-2:26)
Show in this order: `.kiro/specs` (`requirements.md`, `design.md`, `tasks.md`) for 10 s, `.kiro/steering` for 8 s, `.kiro/hooks` (`asset-guard`, `test-on-save`, `validate-repo`) for 8 s, the passing `dotnet test` output (101 tests) for 10 s, the pull request list for 10 s, closing on the `docs/MCP.md` honest-limits paragraph for 8 s.

Narration:

"I built this with Kiro Web. Specs first: requirements, design and tasks turned every rule into a correctness property, and each property runs three hundred seeded cases. A golden file written by the C# core keeps the JavaScript port honest, a hundred and one dotnet tests and two hundred ninety four node tests. Steering files carry my rules so I never repeat them. Three hooks: test on save, an asset guard that refuses paid pack files, and validate repo. An orchestrator delegates to a planner, a coder and a reviewer, with the GitHub CLI power, merged round by round as pull requests. Unity and Blender MCP are prepared on my machine, the cloud sandbox never ran them."

Facts behind each line: [KIRO_USAGE.md](KIRO_USAGE.md) and [KIRO_PITCH.md](KIRO_PITCH.md). Re-check the test counts with the commands in CONTRIBUTING.md before you record; they change every round.

## Before you record
Run the pre-flight checklist in [RECORDING.md](RECORDING.md). Rehearse the web take once: the same seed and night give identical fly-through takes.

## Why third-party promo footage is not used
- Copyright: the DLNK trailer belongs to DLNK Works; a submission cannot reuse it without permission.
- Licensing: the pack license covers using the assets in your own project, not redistributing their marketing.
- Hackathon rules: the video must show the project built for the hackathon.
- Honesty: judges should see what this repo actually does, not footage that implies more.

## Judge shortcuts
If you cannot run Unity, open the browser demo (README, "Play it in your browser"). A 40 second cut: load `#seed=1818&sanity=100`, drag sanity to 0 while clicking the church, then paste `#seed=42&sanity=20` to show seed sharing.

Extra shots, all in the browser:
- Omen banners at Uneasy, Dire and Abyss (quiet, 4.5 s, rate-limited flashes; see the horror review in `docs/ARCHITECTURE_AUDIT.md`); tentacles at Dire, sky eye at Abyss.
- Buildings panel: `theme`, `cam=top` with the floor slider, `O` to try doors.
- Download the Markdown report; drive the demo from the keyboard (`W C L N [ ] D M T V F O ?`).
- Reduced motion with `?reduced=1`.
- Stitch panel: `?intro=0&stitch=1#seed=1818` shows how the parts connect, with numbers read from the repo.
- Codex and achievements: `?intro=0&codex=1#seed=1818&sanity=40&night=3`, then press `W` and `O` a few times to earn achievements.
- High contrast: press `H` (or `?contrast=1`). Today's village: press `Z` (opt-in daily seed).
- Cinematic take of a night: `?intro=0&cinematic=1#seed=1818&night=3` (2D cinematic; the take ends by itself, `B` or `Esc` stops it, `?reduced=1` holds one still viewpoint).
- Round 17 shots: bare URL shows the title screen (rumor, `Enter the village (3D)`); walk to a lantern and press `E`, the candle light pools on the wall; light all three lanterns and endure the night; the ending dialog and result card PNG (`Copy result` gives the code and link). Clean stills: `?caption=0&grain=0`.
- Original Blender meshes: open the About dialog (`A`) and follow the meshes link, or open `meshes.html` directly. Shows thirteen original low-poly models (seven village pieces plus a boat, dock, fence, cliff rock and two lamp variants), not pack assets.
- DLNK scene mode (local only, needs the owner's pack built into `web/local-pack/`): `?pack=1&scene=coast-scene`. Never show this in a public recording unless licensed to.

Tips: record at 1080p, upload to YouTube or Vimeo as public, no copyrighted music. Show only assets you are licensed to show, and keep pack textures out of the repo.

- Round 18 touch: on a phone (or add `?touch=1` to `?view=3d`) drag the stick to walk, the look pad to turn, tap Interact at a lantern, Lantern, Help. Still: `docs/media/r18-touch-controls.png`.
- Round 19 day and night: `?intro=0&view=3d&capture=1&caption=0&grain=0&tick=960#seed=1818&cam3d=54.4,56,200,4` (dusk, amber into violet), then the same link with `tick=540` (overcast day) and `tick=1200` (night). In play, gather two clues by day, press `E` to wait for dusk, `E` again to endure until dawn and watch the chip roll to Day 2.
