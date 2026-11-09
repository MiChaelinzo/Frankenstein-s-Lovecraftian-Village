# Devpost submission draft

**Project name:** Frankenstein's Lovecraftian Village
**Category:** Frankenstein
**Repo:** https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village (public, Apache-2.0)
**Tagline:** Cosmic horror stitched from an asset kit, procedural layout, a sanity engine and AI narration.

## Inspiration
Frankenstein's creature was assembled from unlike parts. Game environments are too: bought art, generated layout, scripted mood, AI text. We wanted to make the stitching itself the star.

## What it does
Builds a Lovecraftian village in Unity 6 HDRP from a catalog of modular pieces, deterministic per seed. A sanity model drives dread, which drives audio and narration through a pluggable, failure-safe provider.

## How we built it with Kiro
Specs for core rules, steering to keep logic engine-free and legal, hooks for test-on-save and a paid-asset guard, property-based tests derived from requirements. See `docs/KIRO_USAGE.md` and the `.kiro` directory. TODO: add concrete stories.

## Challenges
Keeping a commercial asset pack out of an open-source repo; testing Unity-bound ideas without the editor.

## Accomplishments
Pure-C# core with property tests that run anywhere; guardrails that make the legal boundary automatic.

## What's next
HDRP volume blending, AI narration provider, more catalog pieces.

## Built with
Unity 6, HDRP, C#, Kiro, xunit, Python.

## Asset disclosure
Uses the commercial "Lovecraftian Village 1.3 HDRP", licensed to the author, not distributed in the repo.

## Submission checklist
- [x] Public repo with detectable open source license (Apache-2.0)
- [x] `/.kiro` at root with specs, hooks and steering, not gitignored
- [ ] Demo video under 3 minutes, public (script in `docs/DEMO_SCRIPT.md`)
- [ ] Kiro usage write-up finished (`docs/KIRO_USAGE.md`)
- [ ] Category selected: Frankenstein

## Bonus prizes checklist
- [ ] **Social Blitz:** post about the project on social media with #KiroweenHackathon26 and tag Kiro; add link in submission
- [ ] **Blog:** publish a post on building with Kiro (dev.to, Medium, etc.) and add the link
- [ ] **Best Demo / video quality:** polished, narrated video within 3 minutes
- [ ] Confirm exact bonus prize names and rules on the official Devpost page before submitting
