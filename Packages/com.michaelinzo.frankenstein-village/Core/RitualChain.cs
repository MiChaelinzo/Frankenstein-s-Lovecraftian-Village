using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One stage of a cult ritual. One stage per campaign night, linked to that night's omen story beat.</summary>
    public sealed class RitualStage
    {
        public int Index;               // 0-based, equals NightNumber - 1
        public int NightNumber;         // 1-based
        public string Name;             // stage name, ordered from first whisper to completion
        public string Sigil;            // seeded sigil flavor
        public int DreadThresholdPercent; // strictly rising, 1..100, never above the night's dread target
        public string OmenId;           // "tier.index" into StorySequencer.Omens, e.g. "2.1"
        public int BeatIndex;           // index of the night's "omen" beat in StorySequencer.Build
    }

    /// <summary>Night-schedule versus dread-reached ritual progress. Stage values are 0-based indexes, -1 means none.</summary>
    public sealed class RitualProgress
    {
        public int Scheduled;
        public int DreadReached;
        public int Effective;
        public string Pace; // "behind", "on" or "ahead"
    }

    /// <summary>A seeded chain of ritual stages across campaign nights.</summary>
    public sealed class Ritual
    {
        public int Seed;
        public string Name;
        public List<RitualStage> Stages = new List<RitualStage>();
    }

    /// <summary>Deterministic ritual chain generator. Engine-free, integer-only, SeededRandom keyed on the campaign seed.</summary>
    public static class RitualChain
    {
        public static readonly string[] RitualNames =
        {
            "The Rite of Drowned Bells", "The Tallow Vigil", "The Congregation of Salt", "The Hollow Litany", "The Unlit Procession", "The Choir Beneath the Well",
        };

        // Ordered stages; a campaign of n nights samples them in order, so stages never repeat or go backwards.
        public static readonly string[] StageNames =
        {
            "Whispers", "Gathering", "Offering", "Vigil", "Invocation", "Opening", "Communion", "Ascension", "Completion",
        };

        public static readonly string[] Sigils = { "eye", "spiral", "crown", "tide", "knot", "star" };

        public static Ritual Generate(Campaign campaign)
        {
            var ritual = new Ritual();
            if (campaign == null) return ritual;
            ritual.Seed = campaign.Seed;
            var rng = new SeededRandom(campaign.Seed ^ 0x2f6e2b1);
            ritual.Name = RitualNames[rng.Next(RitualNames.Length)];
            var beats = StorySequencer.Build(campaign);
            int n = campaign.Nights.Count;
            int prev = 0;
            for (int i = 0; i < n; i++)
            {
                var night = campaign.Nights[i];
                int threshold = night.DreadTargetPercent - rng.Next(3);
                if (threshold <= prev) threshold = prev + 1;
                if (threshold > 100) threshold = 100;
                prev = threshold;

                int nameIndex = n == 1 ? StageNames.Length / 2 : (i * (StageNames.Length - 1)) / (n - 1);
                string sigil = Sigils[rng.Next(Sigils.Length)];

                int beatIndex = 0;
                string omenId = "0.0";
                for (int b = 0; b < beats.Count; b++)
                {
                    if (beats[b].NightNumber != night.Number || beats[b].Kind != "omen") continue;
                    beatIndex = b;
                    int tier = StorySequencer.TierForPercent(night.DreadTargetPercent);
                    omenId = tier + "." + Math.Max(0, Array.IndexOf(StorySequencer.Omens[tier], beats[b].Text));
                    break;
                }

                ritual.Stages.Add(new RitualStage
                {
                    Index = i,
                    NightNumber = night.Number,
                    Name = StageNames[nameIndex],
                    Sigil = sigil,
                    DreadThresholdPercent = threshold,
                    OmenId = omenId,
                    BeatIndex = beatIndex,
                });
            }
            return ritual;
        }

        /// <summary>Index of the highest stage whose threshold is at or below the dread percent, or -1 when none is reached.</summary>
        public static int StageForDread(Ritual ritual, int dreadPercent)
        {
            int found = -1;
            if (ritual == null) return found;
            for (int i = 0; i < ritual.Stages.Count; i++)
                if (ritual.Stages[i].DreadThresholdPercent <= dreadPercent) found = i;
            return found;
        }

        /// <summary>
        /// Stage the night schedule expects: night N maps to stage N-1, clamped to the chain. -1 for a null or empty ritual
        /// or a night below 1.
        /// </summary>
        public static int ScheduledStageForNight(Ritual ritual, int nightNumber)
        {
            if (ritual == null || ritual.Stages.Count == 0 || nightNumber < 1) return -1;
            return Math.Min(nightNumber, ritual.Stages.Count) - 1;
        }

        /// <summary>
        /// Combines the night schedule with the dread actually reached. The night sets a floor, so Effective is the larger of the two
        /// and never goes backwards when the player has low sanity on a late night. Pace is "behind" when dread has not caught up
        /// with the schedule, "ahead" when it has passed it, otherwise "on".
        /// </summary>
        public static RitualProgress Progress(Ritual ritual, int nightNumber, int dreadPercent)
        {
            int scheduled = ScheduledStageForNight(ritual, nightNumber);
            int reached = StageForDread(ritual, dreadPercent);
            return new RitualProgress
            {
                Scheduled = scheduled,
                DreadReached = reached,
                Effective = Math.Max(scheduled, reached),
                Pace = reached < scheduled ? "behind" : reached > scheduled ? "ahead" : "on",
            };
        }

        /// <summary>Stable text form, e.g. "scheduled 3 reached 1 effective 3 behind" (stage values are 0-based, -1 means none).</summary>
        public static string Describe(RitualProgress p) =>
            "scheduled " + p.Scheduled + " reached " + p.DreadReached + " effective " + p.Effective + " " + p.Pace;

        /// <summary>Stable text form, e.g. "Night 2: Offering [spiral] at 40% omen 1.2 beat 8".</summary>
        public static string Describe(RitualStage s) =>
            "Night " + s.NightNumber + ": " + s.Name + " [" + s.Sigil + "] at " + s.DreadThresholdPercent + "% omen " + s.OmenId + " beat " + s.BeatIndex;
    }
}
