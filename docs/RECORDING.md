# Recording guide

How to capture the side-by-side demo in [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Everything here is a recommendation for the author's machine; none of it was run in the Kiro Web sandbox (no GPU, no Unity, no OBS). Status: Unverified.

## Rules
Own footage only. No DLNK trailer footage, no copyrighted music. Credit DLNK (Daelonik Artworks) on the closing card and in the description.

## OBS layout
- Canvas and output: 1920x1080, 30 fps (60 fps is fine for the web side but doubles file size; keep one value for both sides).
- Scene "Side by side": two Window Capture (or Display Capture) sources, each cropped to its client area.
  - Left, 960x1080: the browser (web game).
  - Right, 960x1080: the Unity Game view.
  - A 1920x1080 browser window scaled into 960 wide letterboxes; for crisp text give the browser a 960x1080 window instead (the web UI is responsive) or record each side alone and compose in an editor.
- Scenes "Web full", "Unity full", "Kiro" (full-frame captures) for the shots the script marks as full.
- Encoder: x264 or hardware H.264, CBR 12000 to 20000 kbps, keyframe interval 2 s, MP4 or MKV, remux to MP4 afterwards.
- Record the web side and the Unity side in separate OBS tracks or files if you plan to cut between them.

## Unity Recorder (optional, for the fly-through shot)
Package `com.unity.recorder` (Window > Package Manager, Unity Registry). It is not a dependency of this repo; install it in your own project only.
1. Window > General > Recorder > Recorder Window, add a **Movie** recorder.
2. Source: Game View, output resolution 1920x1080.
3. Frame rate: **Constant**, 30 fps, "Cap FPS" on. `VillageFlythroughCamera` advances by `Time.deltaTime` only, so a constant rate gives the same frames on every take.
4. Format: MP4 (H.264), quality High.
5. Recording range: Start Play Mode / Manual. The take length is `VillageFlythroughCamera.TotalSeconds` (shown by the component, from Core); `loop` stays off.
6. Output outside `Assets/` (for example `Recordings/`), never inside `Assets/ThirdParty`.

## Browser settings
- A real browser at 1920x1080 (headless captures clip the bottom of the page).
- Add `?intro=0` before the `#` to skip the title sequence, for every shot except the first.
- Hide the cursor: use OBS "Capture Cursor" off for the web source. For 3D walking the pointer is locked anyway.
- Reduced motion **off**: turn off the OS reduced-motion setting and do not add `?reduced=1`, otherwise the fly-through holds one still viewpoint and flicker is disabled.
- Zoom 100 %, bookmarks bar and extensions hidden, notifications off (do not disturb).
- Music: leave unticked, or tick it for story mode only (see below).

## Exact URLs
Host: `https://frankensteinlovecraftianvillage.vercel.app/`
- Title and intro: `/#seed=1818&sanity=100&night=1`
- Tour: `/?intro=0&tour=1`
- Story: `/?intro=0#seed=1818&story=1&night=1`, then `/?intro=0#seed=1818&story=1&night=3&beat=3`
- First-person 3D: `/?intro=0&view=3d#seed=1818&sanity=60&night=2`
- 3D fly-through: `/?intro=0&view=3d&cinematic=1#seed=1818&night=3`
- Meshes: `/?intro=0&meshes=1#seed=1818` and `/meshes.html`
- Self-test: `/selftest.html`

The live host was last deployed before round 16: its `?meshes=1` and `meshes.html` show 7 meshes, not 13, and the 3D fly-through has no omen framing. Redeploy first, or serve locally with `python3 -m http.server 8000 -d web` and use `http://localhost:8000/` instead.

## Audio tips
- The web soundtrack is original: it is generated live with WebAudio, off until you tick Music, and has no audio files. It is safe to record. Anything else playing on your machine is not, so mute system sounds.
- Record the voice-over separately in a quiet room (pop filter, 44.1 or 48 kHz) and mix it under the soundtrack at about -18 dB.
- No streaming-service music, no DLNK trailer audio.

## Pre-flight checklist
- [ ] `python3 tools/check_live.py` passes against the live URL (HTTP level only).
- [ ] Live host serves the build you want to show (see the note above), or a local server is running.
- [ ] Unity 6 project opens with the pack imported under `Assets/_DLNK` and the package `com.michaelinzo.frankenstein-village` installed; console has no red errors.
- [ ] `VillageBuilder.seed` and `VillageFlythroughCamera.seed` are 1818; `pieceCount` 80.
- [ ] OBS canvas 1920x1080, 30 fps, scenes and audio meters checked with a 10 second test.
- [ ] Reduced motion off, cursor hidden, notifications off, `?intro=0` on every URL except the first.
- [ ] Rehearsed the timed shot list once; total under 3:00.
- [ ] Closing card text includes the DLNK credit and #KiroweenHackathon26.
- [ ] No trailer footage, no copyrighted music, no pack files committed.
