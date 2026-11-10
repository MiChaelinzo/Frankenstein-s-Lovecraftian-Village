using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One night of a campaign. All numbers are integers so the JS port matches exactly.</summary>
    public sealed class CampaignNight
    {
        public int Number;       // 1-based
        public string Title;
        public int DreadTargetPercent; // strictly rising across nights, 1..100
        public int SanityStart;  // 100 - DreadTargetPercent
        public string Sky;       // "dusk", "night" or "witching"
        public string Weather;   // "clear", "rain" or "fog"
        public string Rumor;
        public string Lore;
    }

    /// <summary>A seeded multi-night story arc: village name plus per-night title, dread target, rumor and lore.</summary>
    public sealed class Campaign
    {
        public int Seed;
        public string VillageName;
        public List<CampaignNight> Nights = new List<CampaignNight>();
    }

    /// <summary>Deterministic campaign generator. Same seed and night count give identical text. Engine-free.</summary>
    public static class CampaignGenerator
    {
        public const int MinNights = 1;
        public const int MaxNights = 9;
        public const int DefaultNights = 5;

        private static readonly string[] NamePrefix = { "Black", "Ash", "Gull", "Drowned", "Hollow", "Marrow", "Salt", "Pale", "Grey", "Weeping", "Tallow", "Brine" };
        private static readonly string[] NameSuffix = { "wick", "moor", "haven", "mere", "holm", "ford", "cliff", "by", "stead", "combe" };

        // Three stages (early, middle, late). Six titles each; a night never reuses a title.
        private static readonly string[][] Titles =
        {
            new[] { "The Quiet Arrival", "Lanterns on the Quay", "A Stranger's Welcome", "Salt on the Doorstep", "The First Bell", "Mist Over the Marsh" },
            new[] { "What the Well Remembers", "The Counting of Houses", "Footsteps in the Nave", "Tide Without a Moon", "The Stitched Streets", "Candles Gone Green" },
            new[] { "The Eye Opens", "Nothing Answers the Bell", "The Drowned Congregation", "When the Sea Walks", "The Last Lantern", "Beneath the Altar" },
        };

        private static readonly string[] RumorWho = { "The ferryman", "An old widow", "The sexton's boy", "A tinker passing through", "The night watchman", "A fisher with no catch" };
        private static readonly string[] RumorWhat = { "swears the church bell rings itself", "says the well has begun to hum", "saw every window turn toward the sea", "heard the tide counting under the floor", "found wet footprints leading up from the harbor", "claims the crows have started to pray" };
        private static readonly string[] RumorWhen = { "just after dusk.", "when the fog came in.", "three nights running.", "and will not say more.", "though nobody believes it yet.", "and has not slept since." };

        private static readonly string[][] Lore =
        {
            new[] { "The founders stitched the first houses from driftwood and a bargain nobody wrote down.", "Every hearth in the village was lit from one flame, carried in a jar from the shore.", "The lighthouse keeper stopped logging ships long before the ships stopped coming." },
            new[] { "The altar predates the church. The church was built so that something would have a roof.", "The well is deeper than the hill is tall, and the water rises when the bells are silent.", "Those who walk the lantern route at night never agree on how many of them there were." },
            new[] { "The sea is not retreating. It is waiting for the village to finish its sentence.", "The thing under the tower has been patient since before names, and the patience is wearing thin.", "By the final night the houses face the water, and the water faces back." },
        };

        private static readonly string[] Weathers = { "clear", "rain", "fog" };

        /// <summary>Clamps the night count into [MinNights, MaxNights].</summary>
        public static int ClampNights(int nights)
        {
            if (nights < MinNights) return MinNights;
            if (nights > MaxNights) return MaxNights;
            return nights;
        }

        public static Campaign Generate(int seed, int nights = DefaultNights)
        {
            nights = ClampNights(nights);
            var rng = new SeededRandom(seed ^ 0x5bd1e995);
            var c = new Campaign { Seed = seed };
            c.VillageName = NamePrefix[rng.Next(NamePrefix.Length)] + NameSuffix[rng.Next(NameSuffix.Length)];

            var usedTitles = new bool[Titles.Length][];
            for (int s = 0; s < Titles.Length; s++) usedTitles[s] = new bool[Titles[s].Length];

            int prev = 0;
            for (int i = 0; i < nights; i++)
            {
                int stage = nights == 1 ? 1 : i * 3 / nights;
                int baseTarget = nights == 1 ? 50 : 10 + 80 * i / (nights - 1);
                int target = baseTarget + rng.Next(7) - 3;
                if (target < 5) target = 5;
                if (target <= prev) target = prev + 1;
                if (target > 100) target = 100;
                prev = target;

                int free = 0;
                for (int k = 0; k < Titles[stage].Length; k++) if (!usedTitles[stage][k]) free++;
                int pick = rng.Next(free);
                int idx = 0;
                for (int k = 0; k < Titles[stage].Length; k++)
                {
                    if (usedTitles[stage][k]) continue;
                    if (pick == 0) { idx = k; break; }
                    pick--;
                }
                usedTitles[stage][idx] = true;

                // The sky darkens with the arc; weather is rolled per night.
                string sky = stage == 0 ? "dusk" : stage == 1 ? "night" : "witching";
                string weather = Weathers[rng.Next(Weathers.Length)];
                string rumor = RumorWho[rng.Next(RumorWho.Length)] + " " + RumorWhat[rng.Next(RumorWhat.Length)] + " " + RumorWhen[rng.Next(RumorWhen.Length)];
                string lore = Lore[stage][rng.Next(Lore[stage].Length)];

                c.Nights.Add(new CampaignNight
                {
                    Number = i + 1,
                    Title = Titles[stage][idx],
                    DreadTargetPercent = target,
                    SanityStart = 100 - target,
                    Sky = sky,
                    Weather = weather,
                    Rumor = rumor,
                    Lore = lore,
                });
            }
            return c;
        }
    }
}
