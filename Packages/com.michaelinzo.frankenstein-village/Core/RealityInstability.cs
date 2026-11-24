using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// The data file Data/reality.json (round 34, spec 169): the wrong house names, the false villagers, the small changes to a known place and the diegetic journal notes
    /// that the reality instability presentation draws on. The same file is read by web/src/reality.js and a drift test compares the two copies.
    /// </summary>
    public sealed class RealityLibrary
    {
        /// <summary>Note ids in a stable order: house, villager, board, identity, location.</summary>
        public static readonly string[] NoteIds = { "house", "villager", "board", "identity", "location" };
        public const int MinEntries = 4;

        public List<LocalizedName> HouseNames = new List<LocalizedName>();
        public List<LocalizedName> FalseVillagers = new List<LocalizedName>();
        public List<LocalizedName> LocationLooks = new List<LocalizedName>();
        public List<LocalizedName> Notes = new List<LocalizedName>();

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed, has too few entries, lacks a note id or lacks a language.</summary>
        public static RealityLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("reality: root is not an object");
            var lib = new RealityLibrary();
            lib.HouseNames = Pool(root, "houseNames");
            lib.FalseVillagers = Pool(root, "falseVillagers");
            lib.LocationLooks = Pool(root, "locationLooks");
            var notes = root.ContainsKey("notes") ? root["notes"] as List<object> : null;
            if (notes == null || notes.Count != NoteIds.Length) throw new FormatException("reality: notes needs one entry per note id");
            for (int i = 0; i < NoteIds.Length; i++)
            {
                var o = notes[i] as Dictionary<string, object>;
                if (o == null || !o.ContainsKey("id") || (o["id"] as string) != NoteIds[i]) throw new FormatException("reality: notes entry " + i + " must have id " + NoteIds[i]);
                lib.Notes.Add(Localized(o, "notes " + NoteIds[i]));
            }
            return lib;
        }

        private static List<LocalizedName> Pool(Dictionary<string, object> root, string field)
        {
            var list = root.ContainsKey(field) ? root[field] as List<object> : null;
            if (list == null || list.Count < MinEntries) throw new FormatException("reality: " + field + " needs at least " + MinEntries + " entries");
            var result = new List<LocalizedName>();
            foreach (var item in list) result.Add(Localized(item as Dictionary<string, object>, field));
            return result;
        }

        private static LocalizedName Localized(Dictionary<string, object> d, string owner)
        {
            if (d == null) throw new FormatException("reality: " + owner + " holds a non-object");
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = d.ContainsKey(lang) ? d[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("reality: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>
    /// Truth changes reality. Reality instability extends <see cref="RealityDistortion"/> into concrete alterations a client may show: tier 3 gives some houses a wrong name, tier 4 adds a
    /// false villager, tier 5 hides some board contradictions, blurs some villagers' names with another's and alters how some places are described.
    /// PRESENTATION ONLY. Every function is pure over (seed, night, tier, subject). Nothing here reads or writes a save, a Vigil rule, a clue, sanity or an ending, and the underlying data
    /// stays intact, so a client can always show the truth. Below tier 3 nothing changes.
    /// </summary>
    public static class RealityInstability
    {
        public const int Stream = 0x52454c;
        public const int HouseTier = 3, VillagerTier = 4, BoardTier = 5;
        public const int KindHouse = 1, KindFalseVillager = 2, KindContradiction = 3, KindIdentity = 4, KindLocation = 5;

        /// <summary>Whether the badge "reality unreliable" shows at this knowledge tier.</summary>
        public static bool Unreliable(int tier) { return tier >= HouseTier; }

        /// <summary>Chance per mille that one subject of a kind is altered at a tier; 0 below the kind's tier.</summary>
        public static int Chance(int kind, int tier)
        {
            tier = Math.Min(tier, KnowledgeLibrary.MaxTier);
            switch (kind)
            {
                case KindHouse: return tier >= HouseTier ? 250 + 150 * (tier - HouseTier) : 0;
                case KindFalseVillager: return tier >= VillagerTier ? 600 + 200 * (tier - VillagerTier) : 0;
                case KindContradiction: return tier >= BoardTier ? 500 : 0;
                case KindIdentity: return tier >= BoardTier ? 350 : 0;
                case KindLocation: return tier >= BoardTier ? 400 : 0;
                default: return 0;
            }
        }

        /// <summary>32 bit FNV-1a of the id, masked non-negative: the subject number of a string id (a board pair id or a place id).</summary>
        public static int SubjectOf(string id)
        {
            uint h = 2166136261;
            foreach (char c in id) { h ^= c; h *= 16777619; }
            return (int)(h & 0x7fffffff);
        }

        private static SeededRandom Rng(int seed, int night, int kind, int subject)
        {
            return new SeededRandom(seed ^ Stream ^ (night * VillageSociety.IndexStep) ^ (kind * 0x9e37) ^ (subject * 0x2545));
        }

        private static bool Hit(SeededRandom rng, int kind, int tier)
        {
            int chance = Chance(kind, tier);
            return chance > 0 && rng.Next(1000) < chance;
        }

        /// <summary>Index into <see cref="RealityLibrary.HouseNames"/> of the wrong name house number <paramref name="house"/> carries tonight, or -1 for its true name.</summary>
        public static int HouseName(RealityLibrary lib, int seed, int night, int tier, int house)
        {
            var rng = Rng(seed, night, KindHouse, house);
            return Hit(rng, KindHouse, tier) ? rng.Next(lib.HouseNames.Count) : -1;
        }

        /// <summary>Index into <see cref="RealityLibrary.FalseVillagers"/> of the false villager standing in the square tonight, or -1 for none. At most one per night.</summary>
        public static int FalseVillager(RealityLibrary lib, int seed, int night, int tier)
        {
            var rng = Rng(seed, night, KindFalseVillager, 0);
            return Hit(rng, KindFalseVillager, tier) ? rng.Next(lib.FalseVillagers.Count) : -1;
        }

        /// <summary>Whether the board hides the contradiction <paramref name="pairId"/> tonight. The evidence behind it is never hidden.</summary>
        public static bool ContradictionHidden(int seed, int night, int tier, string pairId)
        {
            return Hit(Rng(seed, night, KindContradiction, SubjectOf(pairId)), KindContradiction, tier);
        }

        /// <summary>The villager index whose name villager <paramref name="villager"/> is shown under tonight (never its own), or -1 for the true identity. Needs at least two villagers.</summary>
        public static int BlurredIdentity(int seed, int night, int tier, int villager, int count)
        {
            if (count < 2) return -1;
            var rng = Rng(seed, night, KindIdentity, villager);
            if (!Hit(rng, KindIdentity, tier)) return -1;
            int other = rng.Next(count - 1);
            return other >= villager ? other + 1 : other;
        }

        /// <summary>Index into <see cref="RealityLibrary.LocationLooks"/> of the small change a client adds to the description of place <paramref name="placeId"/> tonight, or -1 for none.</summary>
        public static int LocationLook(RealityLibrary lib, int seed, int night, int tier, string placeId)
        {
            var rng = Rng(seed, night, KindLocation, SubjectOf(placeId));
            return Hit(rng, KindLocation, tier) ? rng.Next(lib.LocationLooks.Count) : -1;
        }
    }
}
