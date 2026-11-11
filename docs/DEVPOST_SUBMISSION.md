# Devpost submission draft

## Before submitting

Only the author can supply these. Nothing below has been filled in or guessed.

- [x] Web extras (session save/load, map, case file, fr stub, perf HUD, offline shell) are covered by node tests; offline behaviour on a real host is Unverified
- [x] Seeded ritual chain (Core, JS port, golden parity) shown in the web night panel, journal and case file; night schedule plus dread-reached stage with a floor-based effective stage; Unity `RitualDirector`, `RitualStateAsset`, `RitualSaveBridge` Unverified in Unity
- [x] Seeded investigator walking a lantern route (Core, JS port, golden parity; web toggle `I` / `?investigator=1`, off by default; sanity hits in the journal, minimap marker, screen reader village description)
- [x] Stitch panel from generated repo data, seeded codex and achievements saved in the session, high-contrast theme, opt-in daily village (node and Python tests; headless screenshots of the web demo only)
- [x] Round 11: judge tour (`?tour=1`), About dialog, journal Story and Progress tabs, progress gated on player actions; node tested, only headless Chrome tried
- [x] Round 12: stub-based Unity compile check (not a Unity run), DLNK scene mode `?pack=1&scene=` (local pack only), original Blender 4.2 LTS meshes as GLB with `meshes.html` viewer; MCP only documented, never run
- [ ] Public demo video URL (under 3 minutes), recorded by Michael G. Inso, added to the Devpost form
- [ ] Public social post URL using #KiroweenHackathon26 (Social Blitz Prize)
- [ ] Published blog post URL (Bonus Blog Prize; draft in `docs/BLOG_POST.md`)
- [ ] Confirm CI (`ci.yml`) is green on GitHub
- [ ] Run the catalog auto-binder in Unity against the owned pack (unverified so far)
- [ ] Connect a static host per `docs/HOSTING.md` (Netlify, Vercel or Cloudflare Pages), then verify `/` and `/selftest.html` on it
- [x] Live URL in `README.md`: https://frankensteinlovecraftianvillage.vercel.app/ (paste the same URL, or the deep link https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1, into the Devpost form)
- [ ] Optional: fix the GitHub account billing lock so `pages.yml` can run
- [ ] Confirm wording of prize rules on the official Devpost page

Bonus prizes **not claimed**: Best Startup Project, Best Student Project, Best Ghost of Kiroween Past, Best Kiro Crew App. Kiro surface used: Kiro Web only (no IDE or CLI use claimed).

**Project name:** Frankenstein's Lovecraftian Village
**Category:** Frankenstein
**Repo:** https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village (public, Apache-2.0)
**Tagline:** Cosmic horror stitched from an asset kit, procedural layout, a sanity engine and AI narration.

## Inspiration
Frankenstein's creature was assembled from unlike parts. Game environments are too: bought art, generated layout, scripted mood, AI text. We wanted to make the stitching itself the star.

## What it does
Builds a Lovecraftian village in Unity 6 HDRP from a catalog of modular pieces, deterministic per seed. A sanity model drives dread, which drives audio and narration through a pluggable, failure-safe provider.

## How we built it with Kiro
Specs for core rules, steering to keep logic engine-free and legal, hooks for test-on-save and a paid-asset guard, property-based tests derived from requirements. See `docs/KIRO_USAGE.md` and the `.kiro` directory. See `docs/KIRO_USAGE.md` for details.

Beyond the base village, the repo adds dread threshold events (omens), a Markdown and JSON village report, a prefab name matcher with an editor auto-binder (unverified in Unity), and a browser demo with a Whispers journal, report download, keyboard control and reduced motion support.

## Challenges
Keeping a commercial asset pack out of an open-source repo; testing Unity-bound ideas without the editor.

## Accomplishments
Pure-C# core with property tests that run anywhere; guardrails that make the legal boundary automatic.

## What's next
Verifying the Unity-side scripts in the editor, recording the demo video, and more catalog pieces. HDRP volume blending and the AI narration provider are Unverified in Unity.

## Built with
Unity 6, HDRP, C#, JavaScript (canvas), Kiro, xunit, Node test runner, GitHub Actions, Python.

## Asset disclosure
Uses the Lovecraftian Village 1.3 environment (HDRP and URP editions) by DLNK Artworks, linked from the README and not committed to the repo.

## Submission checklist
- [x] Public repo with detectable open source license (Apache-2.0)
- [x] `/.kiro` at root with specs, hooks and steering, not gitignored
- [x] Verifiable claims: parity self-test at `web/selftest.html` (served by Pages) and history in `docs/BUILD_LOG.md`
- [ ] Demo video under 3 minutes, public (timed script with a 40 to 60 second Kiro segment in `docs/DEMO_SCRIPT.md`; no DLNK trailer footage or copyrighted music, credit DLNK)
- [x] Kiro pitch (60 to 90 second spoken script) and short Devpost write-up drafted in `docs/KIRO_PITCH.md`; paste the write-up into the Devpost Kiro field
- [x] Kiro usage write-up finished (`docs/KIRO_USAGE.md`)
- [ ] Category selected: Frankenstein

## Bonus prizes

Prize names and rules below follow the hackathon rules as provided to us. Confirm wording on the official Devpost page before submitting.

### Summary

| Prize | Eligible? | Action |
|-------|-----------|--------|
| Best Startup Project | Not claimed | None |
| Best Student Project | Not claimed | None |
| Best Ghost of Kiroween Past | Not claimed | None |
| Best Kiro Crew App | Not claimed | None |
| Social Blitz Prize | Eligible | Post the draft below and add the link |
| Bonus Blog Prize | Eligible | Publish `docs/BLOG_POST.md` and add the link |
| Best Demo | Eligible | Follow the checklist below |

### Best Startup Project
- **Requirements:** a project presented as the foundation of a startup or company.
- **Eligibility:** nothing in the repo shows a startup. The author is an individual (Michael G. Inso). **Not claimed.**
- **Fields that would be needed if it were claimed:** company or startup name; one-paragraph business case (customer, problem, revenue model); public website or pitch link; stage and team size.

### Best Student Project
- **Requirements:** the entrant is a student.
- **Eligibility:** nothing in the repo shows student status. **Not claimed.**
- **Fields that would be needed if it were claimed:** school or program name; enrollment status and expected graduation; the proof the rules ask for (for example a student email or ID statement).

### Best Ghost of Kiroween Past
- **Requirements:** a project that revives or builds on an entry from a previous Kiroween (2025).
- **Eligibility:** nothing in the repo shows a Kiroween 2025 registration or a predecessor project. **Not claimed.**
- **Fields that would be needed if it were claimed:** link to the 2025 Devpost submission; what changed since then; what is new in this entry.

### Best Kiro Crew App
- **Requirements:** an app built with Kiro Crew, submitted as a separate Crew app.
- **Eligibility:** the scaffold was made by an orchestrated multi-agent run in Kiro Web, but no separate Kiro Crew app repository exists. **Not claimed.**
- **Fields that would be needed if it were claimed:** link to the separate Crew app repo; description of the crew (agents and roles); how the crew is used by the app.

### Social Blitz Prize
- **Requirements:** a public social media post about the project using #KiroweenHackathon26, with the link added to the submission.
- **Eligibility:** eligible. Publish the post and paste its URL in the submission.
- **Post draft:**

```
#KiroweenHackathon26 I stitched a cosmic-horror village together like Frankenstein's monster: a modular Lovecraftian asset kit, a seeded procedural layout, a sanity engine that turns fear into dread, and AI narration with an offline fallback. Built in Unity 6 with @kirodotdev specs, hooks, steering and property-based tests. Repo and demo: https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village
```
Add the demo video link and a screenshot or clip. Check that the Kiro handle is correct for the platform you post on.

### Bonus Blog Prize
- **Requirements:** a blog post about building with Kiro that states it was written as part of the Kiroween 2026 hackathon, published publicly with the link in the submission.
- **Eligibility:** eligible.
- **Content:** full draft in [docs/BLOG_POST.md](BLOG_POST.md). Publish it (dev.to, Medium, Hashnode) and add the URL.

### Best Demo
- **Requirements:** a clear, well-produced demo video under 3 minutes, public, showing the project working.
- **Eligibility:** eligible.
- **Checklist (tied to [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md)):**
  - [ ] Total length under 3:00 (script targets 2:50; live URL https://frankensteinlovecraftianvillage.vercel.app/ shown in the first and last shot)
  - [ ] 0:00-0:15 hook with fog and title card (web demo intro, `?intro=0` skips it)
  - [ ] Cinematic take recorded with `?intro=0&cinematic=1` (steps in DEMO_SCRIPT, "Cinematic mode for a clean take")
  - [ ] Optional 3D fly-through shot with `?view=3d&cinematic=1` (DEMO_SCRIPT, "3D fly-through shot"); needs the round 15 deploy or a local server
  - [ ] Web story mode segment (deep links in DEMO_SCRIPT); soundtrack is original, procedural and opt-in, no audio files
  - [ ] 1:30-2:25 Kiro segment per `docs/DEMO_SCRIPT.md` ("How we used Kiro"): specs, steering, hooks, `dotnet test`, PR list
  - [ ] Unity segment only if you ran the package yourself (otherwise say Unverified)
  - [ ] Older sub-timings below are superseded by the shot list in `docs/DEMO_SCRIPT.md`
  - [ ] 0:15-0:40 `.kiro` folder shown on GitHub
  - [ ] 0:40-1:10 spec requirements and the properties table in `design.md`
  - [ ] 1:10-1:35 `dotnet test` passing in the terminal
  - [ ] 1:35-2:00 hooks and steering panels; asset guard shown
  - [ ] 2:00-2:30 Unity: change the seed, village rebuilds; sanity drops, dread rises, narration line appears
  - [ ] 2:30-2:50 recap slide with Kiro features, repo link and #KiroweenHackathon26
  - [ ] 1080p, clear narration, no copyrighted music
  - [ ] Only licensed assets on screen, with DLNK Artworks credited
  - [ ] Uploaded public to YouTube or Vimeo and linked in the submission

### Try it without Unity
Browser demo (no paid assets, same Core logic, parity-tested against C#): https://michaelinzo.github.io/Frankenstein-s-Lovecraftian-Village/ (requires GitHub Pages enabled with the "GitHub Actions" source; see the checklist at the top).

### Asset note for judges
The Lovecraftian Village pack (HDRP and URP editions) is by DLNK Artworks and is linked from OneDrive in the README, not committed to the repo. Git LFS is not used. `.gitignore` and `tools/validate_repo.py` still keep these files out of the repo.
