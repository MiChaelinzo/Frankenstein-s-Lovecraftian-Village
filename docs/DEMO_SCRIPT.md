# Demo video script (target 2:50, hard limit under 3:00)

All footage is recorded by the author from this repo and the author's own Unity project. The DLNK Artworks promo trailer is not used, and DLNK Works is credited as the pack author.

| Time | Visual | Narration |
|------|--------|-----------|
| 0:00-0:20 | Open the web demo with `?pack=1` served locally (`python3 -m http.server -d web`), village with real pack textures, badge visible. Try the Texture theme select (Bricks, Rocks) | "Frankenstein's Lovecraftian Village. The textures here come from the DLNK Lovecraftian Village pack, loaded from my local copy and never committed." |
| 0:20-1:30 | Story mode. Open `#seed=1818&story=1&night=1` (or press `S`; add `?intro=0` to skip the title sequence, deep links skip it already). Step with Next / `.`, press Play for autoplay, then jump with `#seed=1818&story=1&night=3&beat=3` to show the omen beat at higher dread (rain, tentacles, the sky eye). Optionally tick Music to opt in to the procedural soundtrack and use Mute (`U`) and Volume. Finish with `P` for the postcard and a door in the top-down camera | "Story mode walks every night: title, rumor, lore, omen, weather, and the sanity falls with it. The soundtrack is original and generated live in the browser with WebAudio, off until I opt in. No copyrighted music, no audio files." |
| 1:30-2:20 | Kiro in action: `.kiro` specs, hooks firing on save, `dotnet test` property tests running, the `selftest.html` page passing | "Kiro turned requirements into correctness properties. Hooks run the tests and guard the paid assets. The self-test page checks the JS port against C# output." |
| 2:20-2:50 | Short Unity clip if available (only if you have opened the project in Unity yourself), then repo link and #KiroweenHackathon26 | "Specs, steering, hooks and property tests, stitched together. Thanks for watching." |

If you have no Unity footage, skip that clip and say so; the Unity side is Unverified in the editor.

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
- Original Blender meshes: open the About dialog (`A`) and follow the meshes link, or open `meshes.html` directly. Shows seven original low-poly models, not pack assets.
- DLNK scene mode (local only, needs the owner's pack built into `web/local-pack/`): `?pack=1&scene=coast-scene`. Never show this in a public recording unless licensed to.

Tips: record at 1080p, upload to YouTube or Vimeo as public, no copyrighted music. Show only assets you are licensed to show, and keep pack textures out of the repo.
