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

        public static readonly string[] CauseIds = { "waning_sanity", "mounting_stress", "cult_exposure", "creature_sighting", "nightfall", "forbidden_knowledge", "omen_passed" };
        private const int CauseSanity = 0, CauseStress = 1, CauseCult = 2, CauseCreature = 3, CauseNight = 4, CauseKnowledge = 5, CauseOmenPassed = 6;

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
    }
}
