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

        /// <summary>Stable text form, e.g. "Night 2: Offering [spiral] at 40% omen 1.2 beat 8".</summary>
        public static string Describe(RitualStage s) =>
            "Night " + s.NightNumber + ": " + s.Name + " [" + s.Sigil + "] at " + s.DreadThresholdPercent + "% omen " + s.OmenId + " beat " + s.BeatIndex;
    }
}
