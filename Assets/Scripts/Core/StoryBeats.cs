using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One step of the story mode sequence. Kind is "title", "rumor", "lore", "omen" or "weather".</summary>
    public sealed class StoryBeat
    {
        public int Index;
        public int NightNumber;   // 1-based
        public string Kind;
        public string Text;
        public int DreadPercent;  // dread target of the night this beat belongs to
        public string Sky;
        public string Weather;
        public int DurationMs;    // suggested autoplay time
    }

    /// <summary>
    /// Builds a deterministic, ordered list of story beats from a Campaign and offers pure navigation and
    /// timing helpers. Engine-free and integer-only; any random choice uses SeededRandom keyed on the campaign seed.
    /// </summary>
    public static class StorySequencer
    {
        public const int MinDurationMs = 2500;
        public const int MaxDurationMs = 12000;
        public const int BaseDurationMs = 1500;
        public const int PerCharMs = 45;

        // Integer percent thresholds that mirror DreadThresholds (0.34, 0.67, 0.9).
        public static readonly int[] TierPercents = { 34, 67, 90 };

        public static readonly string[][] Omens =
        {
            new[] { "The lanterns burn steady and the dogs are quiet. That will not last.", "Nothing stirs but the tide, and even the tide seems to be listening.", "A calm so complete that it feels arranged." },
            new[] { "The bells hum a note nobody struck.", "Shadows lean a little longer than the lamps allow.", "Doors that were closed at dusk are ajar by midnight." },
            new[] { "Every window faces the sea, and something faces back.", "The well breathes in when you breathe out.", "Footsteps follow you in a rhythm that is almost your own." },
            new[] { "The sky has stopped pretending to be a sky.", "The village is no longer being watched. It is being read.", "All the bells ring at once, and no one is holding the ropes." },
        };

        public static readonly string[] SkyPhrases = { "The last light bleeds out over the roofs.", "A starless night settles on the harbor.", "The witching hour hangs low and wrong." };
        public static readonly string[] SkyNames = { "dusk", "night", "witching" };
        public static readonly string[] WeatherNames = { "clear", "rain", "fog" };
        public static readonly string[] WeatherPhrases = { "The air is clear and far too still.", "Cold rain drums on the slate.", "Fog crawls up from the marsh and swallows the lanes." };

        /// <summary>Omen tier (0 Calm .. 3 Abyss) for an integer dread percent.</summary>
        public static int TierForPercent(int percent)
        {
            int tier = 0;
            while (tier < TierPercents.Length && percent >= TierPercents[tier]) tier++;
            return tier;
        }

        public static List<StoryBeat> Build(Campaign campaign)
        {
            var beats = new List<StoryBeat>();
            if (campaign == null) return beats;
            var rng = new SeededRandom(campaign.Seed ^ 0x1badf00d);
            foreach (var night in campaign.Nights)
            {
                var omens = Omens[TierForPercent(night.DreadTargetPercent)];
                string omen = omens[rng.Next(omens.Length)];
                Add(beats, night, "title", "Night " + night.Number + ": " + night.Title);
                Add(beats, night, "rumor", night.Rumor);
                Add(beats, night, "lore", night.Lore);
                Add(beats, night, "omen", omen);
                Add(beats, night, "weather", PhraseFor(SkyNames, SkyPhrases, night.Sky) + " " + PhraseFor(WeatherNames, WeatherPhrases, night.Weather));
            }
            return beats;
        }

        private static string PhraseFor(string[] names, string[] phrases, string name)
        {
            int i = Array.IndexOf(names, name);
            return i < 0 ? "" : phrases[i];
        }

        private static void Add(List<StoryBeat> beats, CampaignNight night, string kind, string text)
        {
            beats.Add(new StoryBeat
            {
                Index = beats.Count,
                NightNumber = night.Number,
                Kind = kind,
                Text = text,
                DreadPercent = night.DreadTargetPercent,
                Sky = night.Sky,
                Weather = night.Weather,
                DurationMs = BeatDurationMs(text.Length),
            });
        }

        public static int Clamp(int index, int count)
        {
            if (count <= 0) return 0;
            return Math.Max(0, Math.Min(count - 1, index));
        }

        public static int Next(int index, int count) => Clamp(Clamp(index, count) + 1, count);

        public static int Previous(int index, int count) => Clamp(Clamp(index, count) - 1, count);

        /// <summary>Index of the title beat of the given night; out of range nights clamp to the first or last night.</summary>
        public static int NightStart(IList<StoryBeat> beats, int night)
        {
            int found = 0;
            for (int i = 0; i < beats.Count; i++)
            {
                if (beats[i].Kind != "title") continue;
                if (beats[i].NightNumber <= night) found = i;
            }
            return found;
        }

        /// <summary>Integer reading time: 1500 ms plus 45 ms per character, clamped to 2500..12000.</summary>
        public static int BeatDurationMs(int textLength)
        {
            long ms = BaseDurationMs + (long)PerCharMs * Math.Max(0, textLength);
            return (int)Math.Max(MinDurationMs, Math.Min(MaxDurationMs, ms));
        }
    }
}
