# Demo video script (target 2:50, hard limit under 3:00)

The same video is used for the Devpost demo and for the author's own live demo. Record your own footage from this repo; the narration lines below are meant to be read aloud as written.

**Do not include the DLNK trailer footage or any copyrighted music.** The trailer at https://www.youtube.com/watch?v=Jbj-us1DTv0 is DLNK's (Daelonik Artworks) own promo. Record your own footage and credit DLNK in the description and on the closing card. The soundtrack in the demo is original and generated live with WebAudio, off until you tick Music; otherwise record with no music at all.

## Setup before recording
- Live site: https://frankensteinlovecraftianvillage.vercel.app/ in a 1920x1080 browser window (a real browser; headless captures clip the bottom of the page).
- Main deep link: https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1
- Add `?intro=0` before the `#` whenever you want to skip the title sequence. Rehearse once; cinematic takes are identical for the same seed and night.
- Windows to have open: (A) browser on the live site, (B) browser on `selftest.html`, (C) GitHub repo page on `.kiro/`, (D) editor or terminal with a `dotnet test tests/Frankenstein.Core.Tests` run ready, (E) optional Unity editor, only if you have opened the project yourself.

## Timed shot list
Timings sum to 2:50 including the optional Unity segment. If you skip Unity, give the 15 seconds to the 3D view and the closing card, and say the Unity side is Unverified.

| Time | Window and URL | On-screen text | Narration (read aloud) |
|------|----------------|----------------|------------------------|
| 0:00-0:10 | A: `https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1`, intro plays on a bare URL | "Frankenstein's Lovecraftian Village" and the live URL | "A village that watches you back. This is Frankenstein's Lovecraftian Village, playable right now in any browser." |
| 0:10-0:25 | A: `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&tour=1`, let two or three stops play, Esc to leave | "Guided tour: ?tour=1" | "A short tour explains the controls. Every village is a seed, and every seed gives the same village on every machine." |
| 0:25-0:55 | A: `https://frankensteinlovecraftianvillage.vercel.app/?intro=0#seed=1818&story=1&night=1`, press Play, then jump to `#seed=1818&story=1&night=3&beat=3`. Optional: tick Music. Press `P` for the postcard | "Story mode (S)", "Night 3: sanity 100 down to 0" | "Story mode walks every night: rumor, lore, omen, weather, and sanity falls with it. Fog thickens, the moon reddens, the narrator turns on you. The soundtrack is original and generated live in the browser." |
| 0:55-1:10 | A: `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&view=3d#seed=1818&sanity=60&night=2`, walk with WASD and mouse, press `E` at a door. Optional fixed viewpoint: add `&cam3d=x,z,yawDeg,pitchDeg` | "First-person 3D: ?view=3d" | "Add view equals 3d and you walk the village in first person, in plain WebGL with no libraries. Interacting uses the same rules as the Unity layer." |
| 1:10-1:20 | A: `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&meshes=1#seed=1818`, then `https://frankensteinlovecraftianvillage.vercel.app/meshes.html` | "Original Blender meshes: ?meshes=1" | "The houses, church and trees can be drawn with original low-poly meshes I modelled in Blender. No pack assets are in this repo." |
| 1:20-1:30 | B: `https://frankensteinlovecraftianvillage.vercel.app/selftest.html`, wait for the green result | "Self-test: JS port equals C# output" | "This page replays a golden file written by the C# core and checks the JavaScript port against it." |
| 1:30-2:25 | Kiro segment, 55 seconds. C: GitHub `.kiro/specs`, `.kiro/steering`, `.kiro/hooks`; D: `dotnet test` passing; GitHub pull request list | "Built with Kiro Web", "specs, steering, hooks", "Merged round by round" | See "How we used Kiro" below |
| 2:25-2:40 | E (optional): Unity, Tools > Frankenstein > Create Playable Village Scene, press Play, walk. Only if you ran it yourself | "Unity package: Unverified until run" | "The same Core rules ship as a Unity package. I have run it myself in the editor." Use this line only if true. Otherwise: "The Unity package is written and compile checked, but I have not yet run it in the editor, so it is marked Unverified." |
| 2:40-2:50 | Closing card: repo URL, live URL, #KiroweenHackathon26 | "Pack by DLNK (Daelonik Artworks). Built with Kiro." | "Specs, steering, hooks and property tests, stitched together. Thanks for watching." |

## How we used Kiro (40 to 60 seconds, about 120 words)
Show windows C and D in this order: the `.kiro/specs` folder (`requirements.md`, `design.md`, `tasks.md`), `.kiro/steering` (`project.md`, `agent.md`), `.kiro/hooks` (`asset-guard`, `test-on-save`, `validate-repo`), the passing `dotnet test` output, then the pull request list on GitHub.

Narration, read aloud at an easy pace (about 50 seconds):

"I built this with Kiro Web. Specs first: requirements, design and tasks turned every rule into a correctness property, and property based tests run three hundred seeded cases each. A golden file written by the C# core keeps the JavaScript port honest. Steering files, project and agent, carry the rules so I never repeated them. Three hooks: test on save, an asset guard that refuses paid pack files, and validate repo. The work ran as an orchestrator with a planner, a coder and a reviewer, using the GitHub CLI power, and it was merged round by round as pull requests. Unity and Blender MCP are set up on my machine, but the cloud sandbox never ran them, so Unity stays unverified."

Facts behind each line are in [KIRO_USAGE.md](KIRO_USAGE.md); the longer spoken pitch and the Devpost write-up are in [KIRO_PITCH.md](KIRO_PITCH.md).

## 3D fly-through shot (optional, 10 to 15 seconds)
Open `https://frankensteinlovecraftianvillage.vercel.app/?intro=0&view=3d&cinematic=1#seed=1818&night=3` (the live host gets round 15 only after a redeploy; locally use `python3 -m http.server -d web 8000`). The first-person camera flies to one stop per story beat with captions, in layered fog with the sea, dock and church hill. Same seed and night give the same path. Use it in place of the 1:10-1:20 meshes shot if you want more atmosphere, and keep the total under 3:00. With `?reduced=1` the camera holds one still viewpoint. Headless frame time is only indicative (SwiftShader, mean 23.2 ms).

## Tour and About scenes (optional, about 15 seconds)
1. Open `http://localhost:8000/?intro=0&tour=1`. Let two or three stops play (or press Right arrow), say what each control does, then press Esc.
2. Press `A` to show the About dialog (credits and license), then close it.
Headless captures at 1280x720 clip the bottom of the page; in a real browser this is not an issue. Not recorded yet.

## Cinematic mode for a clean take
1. Serve the demo locally (`python3 -m http.server -d web 8000`) and open `http://localhost:8000/?intro=0&cinematic=1#seed=1818&night=3` in a full-screen browser window at 1920x1080.
2. The page hides its chrome, shows a large caption and pans and zooms through that night's story beats. Timings are fixed (the story beat reading times), so every take of the same seed and night is identical; rehearse once, then record.
3. The take ends by itself about two seconds after the last beat and the normal page comes back. Press `B` or `Esc` to stop early, `B` to start again on the current night.
4. With reduced motion (`?reduced=1` or the OS setting) the camera stays still and only the captions change, which is useful for a calm b-roll shot.
5. Music stays off unless you tick it before pressing `B`.

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
- Cinematic take of a night: `?intro=0&cinematic=1#seed=1818&night=3` (see above).
- Original Blender meshes: open the About dialog (`A`) and follow the meshes link, or open `meshes.html` directly. Shows thirteen original low-poly models (seven village pieces plus a boat, dock, fence, cliff rock and two lamp variants), not pack assets.
- DLNK scene mode (local only, needs the owner's pack built into `web/local-pack/`): `?pack=1&scene=coast-scene`. Never show this in a public recording unless licensed to.

Tips: record at 1080p, upload to YouTube or Vimeo as public, no copyrighted music. Show only assets you are licensed to show, and keep pack textures out of the repo.
