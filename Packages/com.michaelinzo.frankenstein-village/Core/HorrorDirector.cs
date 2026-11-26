using System;

namespace Frankenstein.Core
{
    /// <summary>Pacing beat, in escalation order. Relief only follows an Omen.</summary>
    public enum DirectorBeat { Quiet = 0, Unease = 1, Pressure = 2, Omen = 3, Relief = 4 }

    /// <summary>What the village knows about the player at one director step. Permille fields are 0..1000 and clamped on use.</summary>
    public struct DirectorInput
    {
        public int Tick;
        public int Sanity;
        public int Knowledge;
        public int Stress;
        public int SafeZoneTicks;
        public int ClueProgress;
        public int CultExposure;
        public int Encounters;
        /// <summary>Director 2.0 (spec 175): time spent camping in safe zones, tracked by <see cref="HorrorDirector.NextSafeZoneAbuse"/>. 0..<see cref="HorrorDirector.SafeZoneAbuseCap"/>.</summary>
        public int SafeZoneAbuse;
        /// <summary>Director 2.0: the knowledge tier 0..5 (the investigation board). Only gates which ambient beats may appear.</summary>
        public int KnowledgeTier;
        /// <summary>Director 2.0: 0 when no villager is remembered, otherwise the villager index plus one (see <see cref="VillagerMemoryModel"/>).</summary>
        public int RememberedVillager;
    }

    /// <summary>Director 2.0 presentation settings. IntensityScale is the Horror Intensity in per mille (500 gentle, 1000 standard, 1500 dread).</summary>
    public struct AmbientSettings
    {
        public int IntensityScale;
        public bool ReducedMotion;
    }

    /// <summary>One ambient beat (Director 2.0). Presentation only: a text line, a bounded sound level, a bounded dimming step and an optional prop cue. Never a scare.</summary>
    public struct AmbientBeat
    {
        public bool Emitted;
        public string Id;
        public string Cause;
        /// <summary>Cue volume per mille, 0..<see cref="HorrorDirector.MaxCueVolume"/>.</summary>
        public int Volume;
        /// <summary>Light change per mille, 0 down to -<see cref="HorrorDirector.MaxBrightnessStep"/> (dimming only, never a flash).</summary>
        public int Brightness;
        /// <summary>True when a small prop or visual cue goes with the line. Always false under reduced motion.</summary>
        public bool Prop;
        /// <summary>The remembered villager's index for a sighting, otherwise -1.</summary>
        public int Villager;
    }

    /// <summary>Director state between steps. QuietLeft counts the steps still owed after an Omen.</summary>
    public struct DirectorState
    {
        public int Intensity;
        public DirectorBeat Beat;
        public int QuietLeft;
        public string Cause;
    }

    /// <summary>
    /// Dynamic Horror Director (spec 161). Paces dread from state, never from a scare: intensity moves at most
    /// <see cref="MaxStep"/> per step (no spikes), an Omen forces <see cref="QuietAfterOmen"/> quiet steps, and every
    /// non-quiet beat names the narrative cause that produced it. Pure, integer math, deterministic per seed.
    /// Extends <see cref="GameClock"/> (night weighting) and <see cref="DreadCurve"/> (presentation level).
    /// </summary>
    public static class HorrorDirector
    {
        public const int MaxIntensity = 1000;
        /// <summary>Largest intensity change in one step, up or down.</summary>
        public const int MaxStep = 40;
        public const int UneaseAt = 150;
        public const int PressureAt = 350;
        public const int OmenAt = 600;
        /// <summary>Percent chance per eligible step that intensity at or above OmenAt becomes an Omen.</summary>
        public const int OmenChancePercent = 35;
        /// <summary>Steps held quiet after an Omen. The first is Relief, the rest Quiet. 10 * MaxStep lets an Omen fully settle.</summary>
        public const int QuietAfterOmen = 10;
        /// <summary>The intensity target never exceeds this during a quiet stretch.</summary>
        public const int QuietCeiling = 200;
        public const int SafeZoneCap = 120;
        public const int EncounterCap = 3;
        public const int NightWeight = 150;
        public const int DuskWeight = 60;
        public const int SanityWeightPercent = 30;
        public const int StressWeightPercent = 20;
        public const int CultWeightPercent = 20;
        public const int KnowledgeWeightPercent = 10;
        public const int EncounterWeight = 60;
        public const int SafeZoneWeightPerTick = 2;
        public const int ClueReliefPercent = 10;
        public const int AbuseWeightPercent = 20;
        /// <summary>Director 2.0: safe-zone ticks at or above this count as camping for <see cref="NextSafeZoneAbuse"/>.</summary>
        public const int CampingTicks = 60;
        public const int SafeZoneAbuseCap = 1000;
        public const int AbuseGainPerStep = 20;
        public const int AbuseDecayPerStep = 10;
        /// <summary>Ambient beats: smallest tick gap between two beats, chance per eligible step, loudest cue and deepest dimming (per mille).</summary>
        public const int MinBeatGapTicks = 45;
        public const int BeatChancePercent = 15;
        public const int MaxCueVolume = 150;
        public const int MaxBrightnessStep = 40;
        /// <summary>At or below this Horror Intensity (gentle) ambient beats are skipped entirely.</summary>
        public const int GentleScale = 500;
        public const int StandardScale = 1000;
        /// <summary>Round 37 (spec 175): a dimming step eases in over <see cref="DimRiseMs"/>, holds for <see cref="DimHoldMs"/> and eases out over <see cref="DimFallMs"/>, so the light never jumps.</summary>
        public const int DimRiseMs = 2000, DimHoldMs = 4000, DimFallMs = 6000;
        public const int NoBeatYet = int.MinValue;
        private const int BeatStream = 0x1750;

        public static readonly string[] CauseIds = { "waning_sanity", "mounting_stress", "cult_exposure", "creature_sighting", "nightfall", "forbidden_knowledge", "safe_zone_abuse", "omen_passed" };
        private const int CauseSanity = 0, CauseStress = 1, CauseCult = 2, CauseCreature = 3, CauseNight = 4, CauseKnowledge = 5, CauseAbuse = 6, CauseOmenPassed = 7;

        public static DirectorState Start() { return new DirectorState { Intensity = 0, Beat = DirectorBeat.Quiet, QuietLeft = 0, Cause = "" }; }

        private static int Permille(int v) { return Math.Max(0, Math.Min(1000, v)); }

        /// <summary>Unbounded pressure per cause before relief, in the order of <see cref="CauseIds"/> (without omen_passed).</summary>
        private static int[] Pressures(DirectorInput x)
        {
            DayPhase phase = GameClock.PhaseAt(x.Tick);
            return new[]
            {
                (1000 - Permille(x.Sanity)) * SanityWeightPercent / 100,
                Permille(x.Stress) * StressWeightPercent / 100,
                Permille(x.CultExposure) * CultWeightPercent / 100,
                Math.Max(0, Math.Min(EncounterCap, x.Encounters)) * EncounterWeight,
                phase == DayPhase.Night ? NightWeight : phase == DayPhase.Dusk ? DuskWeight : 0,
                Permille(x.Knowledge) * KnowledgeWeightPercent / 100,
                Permille(x.SafeZoneAbuse) * AbuseWeightPercent / 100,
            };
        }

        /// <summary>The intensity the village is drifting toward (0..1000): summed pressures minus safe-zone time and clue progress.</summary>
        public static int Target(DirectorInput x)
        {
            int total = 0;
            foreach (int p in Pressures(x)) total += p;
            int relief = Math.Max(0, Math.Min(SafeZoneCap, x.SafeZoneTicks)) * SafeZoneWeightPerTick + Permille(x.ClueProgress) * ClueReliefPercent / 100;
            return Math.Max(0, Math.Min(MaxIntensity, total - relief));
        }

        /// <summary>
        /// The narrative cause rule for creature appearances (spec 166): a cause is accepted only when it is a known cause id (not the relief marker) and its own pressure
        /// is above zero in <paramref name="x"/>. An appearance with an empty, unknown or idle cause is rejected, so nothing arrives without a reason the village can show.
        /// </summary>
        public static bool CauseHolds(string cause, DirectorInput x)
        {
            int i = Array.IndexOf(CauseIds, cause);
            return i >= 0 && i != CauseOmenPassed && Pressures(x)[i] > 0;
        }

        /// <summary>The strongest cause id; ties go to the earlier id in <see cref="CauseIds"/>.</summary>
        public static string DominantCause(DirectorInput x)
        {
            int[] p = Pressures(x);
            int best = 0;
            for (int i = 1; i < p.Length; i++) if (p[i] > p[best]) best = i;
            return CauseIds[best];
        }

        private static DirectorBeat BeatFor(int intensity)
        {
            return intensity >= PressureAt ? DirectorBeat.Pressure : intensity >= UneaseAt ? DirectorBeat.Unease : DirectorBeat.Quiet;
        }

        /// <summary>One deterministic step. Same seed, state and input give the same result.</summary>
        public static DirectorState Step(int seed, DirectorState state, DirectorInput x)
        {
            int target = Target(x);
            bool quiet = state.QuietLeft > 0;
            if (quiet) target = Math.Min(target, QuietCeiling);
            int delta = Math.Max(-MaxStep, Math.Min(MaxStep, target - state.Intensity));
            int intensity = Math.Max(0, Math.Min(MaxIntensity, state.Intensity + delta));

            if (quiet)
            {
                int left = state.QuietLeft - 1;
                bool first = state.QuietLeft == QuietAfterOmen;
                return new DirectorState { Intensity = intensity, Beat = first ? DirectorBeat.Relief : DirectorBeat.Quiet, QuietLeft = left, Cause = first ? CauseIds[CauseOmenPassed] : "" };
            }
            if (intensity >= OmenAt && new SeededRandom(unchecked(seed ^ x.Tick * 7919)).Next(100) < OmenChancePercent)
                return new DirectorState { Intensity = intensity, Beat = DirectorBeat.Omen, QuietLeft = QuietAfterOmen, Cause = DominantCause(x) };
            DirectorBeat beat = BeatFor(intensity);
            return new DirectorState { Intensity = intensity, Beat = beat, QuietLeft = 0, Cause = beat == DirectorBeat.Quiet ? "" : DominantCause(x) };
        }

        /// <summary>Safe-zone abuse (Director 2.0): camping (<see cref="CampingTicks"/> or more safe-zone ticks) adds <see cref="AbuseGainPerStep"/>, anything else decays by <see cref="AbuseDecayPerStep"/>. Bounded 0..<see cref="SafeZoneAbuseCap"/>.</summary>
        public static int NextSafeZoneAbuse(int abuse, int safeZoneTicks)
        {
            int next = safeZoneTicks >= CampingTicks ? abuse + AbuseGainPerStep : abuse - AbuseDecayPerStep;
            return Math.Max(0, Math.Min(SafeZoneAbuseCap, next));
        }

        private struct BeatDef
        {
            public string Id, Cause;
            public int MinTier, Volume, Brightness;
            public bool Prop, NeedsVillager;
        }

        /// <summary>The ambient beat kinds in stable order. Each names the cause that lets it appear; Brightness is a dimming step (0 or negative) and Volume a base cue level, both before scaling.</summary>
        private static readonly BeatDef[] Beats =
        {
            new BeatDef { Id = "distant_bell", Cause = "nightfall", Volume = 120 },
            new BeatDef { Id = "false_footprints", Cause = "safe_zone_abuse", Prop = true, Volume = 30 },
            new BeatDef { Id = "moved_lantern", Cause = "safe_zone_abuse", Prop = true, Volume = 30, Brightness = -30 },
            new BeatDef { Id = "empty_boat", Cause = "waning_sanity", MinTier = 1, Prop = true },
            new BeatDef { Id = "wrong_road_sign", Cause = "mounting_stress", Prop = true },
            new BeatDef { Id = "distant_singing", Cause = "cult_exposure", MinTier = 1, Volume = 80 },
            new BeatDef { Id = "impossible_stars", Cause = "forbidden_knowledge", MinTier = 2, Prop = true, Brightness = -20 },
            new BeatDef { Id = "npc_sighting", Cause = "waning_sanity", Prop = true, NeedsVillager = true },
        };

        public static readonly string[] BeatIds = Array.ConvertAll(Beats, b => b.Id);

        /// <summary>The cause id an ambient beat names, or "" for an unknown id.</summary>
        public static string BeatCause(string id)
        {
            foreach (var b in Beats) if (b.Id == id) return b.Cause;
            return "";
        }

        /// <summary>
        /// One ambient beat decision (Director 2.0, spec 175). Presentation only. Nothing is emitted at gentle intensity, outside an Unease or Pressure stretch (so never in the
        /// quiet after an Omen), within <see cref="MinBeatGapTicks"/> of <paramref name="lastBeatTick"/>, or when the seeded roll fails. Only beats whose cause passes
        /// <see cref="CauseHolds"/> and whose knowledge tier and remembered villager gates are met are candidates. Volume and dimming are scaled by the intensity and bounded.
        /// </summary>
        public static AmbientBeat PickAmbientBeat(int seed, DirectorState state, DirectorInput x, int lastBeatTick, AmbientSettings settings)
        {
            var none = new AmbientBeat { Emitted = false, Id = "", Cause = "", Villager = -1 };
            if (settings.IntensityScale <= GentleScale) return none;
            if (state.QuietLeft > 0 || (state.Beat != DirectorBeat.Unease && state.Beat != DirectorBeat.Pressure)) return none;
            if (lastBeatTick != NoBeatYet && x.Tick - lastBeatTick >= 0 && x.Tick - lastBeatTick < MinBeatGapTicks) return none;
            var rng = new SeededRandom(unchecked(seed ^ x.Tick * 104729 ^ BeatStream));
            if (rng.Next(100) >= BeatChancePercent) return none;
            var candidates = new System.Collections.Generic.List<BeatDef>();
            foreach (var b in Beats)
                if (CauseHolds(b.Cause, x) && x.KnowledgeTier >= b.MinTier && (!b.NeedsVillager || x.RememberedVillager > 0)) candidates.Add(b);
            if (candidates.Count == 0) return none;
            var pick = candidates[rng.Next(candidates.Count)];
            int scale = Math.Max(0, Math.Min(1500, settings.IntensityScale));
            return new AmbientBeat
            {
                Emitted = true,
                Id = pick.Id,
                Cause = pick.Cause,
                Volume = Math.Min(MaxCueVolume, pick.Volume * scale / StandardScale),
                Brightness = settings.ReducedMotion ? 0 : -Math.Min(MaxBrightnessStep, -pick.Brightness * scale / StandardScale),
                Prop = pick.Prop && !settings.ReducedMotion,
                Villager = pick.NeedsVillager ? x.RememberedVillager - 1 : -1,
            };
        }

        /// <summary>The 0..1000 shape of a dimming step <paramref name="elapsedMs"/> after its beat: linear rise, hold, linear fall, 0 before and after. Integer math.</summary>
        public static int DimEnvelope(int elapsedMs)
        {
            if (elapsedMs <= 0) return 0;
            if (elapsedMs < DimRiseMs) return elapsedMs * 1000 / DimRiseMs;
            if (elapsedMs < DimRiseMs + DimHoldMs) return 1000;
            int fall = elapsedMs - DimRiseMs - DimHoldMs;
            return fall >= DimFallMs ? 0 : (DimFallMs - fall) * 1000 / DimFallMs;
        }

        /// <summary>
        /// Round 37 (spec 175): how much light to take off right now, per mille, 0..<see cref="MaxBrightnessStep"/>, for an ambient beat whose <see cref="AmbientBeat.Brightness"/> is
        /// <paramref name="brightness"/> and that began <paramref name="elapsedMs"/> ago. Always 0 at gentle intensity (<see cref="GentleScale"/> or less) and under reduced motion, whatever the beat says.
        /// Presentation only: the scene multiplies its light by 1 - DimStep / 1000.
        /// </summary>
        public static int DimStep(int brightness, int elapsedMs, AmbientSettings settings)
        {
            if (settings.ReducedMotion || settings.IntensityScale <= GentleScale || brightness >= 0) return 0;
            return Math.Min(MaxBrightnessStep, -brightness) * DimEnvelope(elapsedMs) / 1000;
        }
    }
}
