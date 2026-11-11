using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One Necronomicon codex entry. Stage entries carry a creature and sigil; omen entries carry a tier.</summary>
    public sealed class CodexEntry
    {
        public string Id;       // "s0".. for ritual stages, "o1".."o3" for omen tiers
        public string Kind;     // "stage" or "omen"
        public int Index;       // stage index (stage entries only)
        public int Creature;    // index 0..CreatureCount-1 (stage entries only)
        public string Sigil;    // stage entries only
        public string StageName;
        public int Night;       // 1-based night number (stage entries only)
        public int Tier;        // 1..OmenTiers (omen entries only)
    }

    /// <summary>
    /// Engine-free codex rules: which creature a ritual stage reveals, which entries exist for a ritual and which
    /// are unlocked by reaching a ritual stage and an omen tier. Display text lives in the clients, ids are stable.
    /// </summary>
    public static class CodexModel
    {
        public const int CreatureCount = 9;
        public const int OmenTiers = 3;
        private const int CreatureOrderSalt = 0x3c0de5;

        /// <summary>Seeded permutation of 0..CreatureCount-1, so a ritual stage always shows the same creature for a seed.</summary>
        public static int[] CreatureOrder(int seed)
        {
            var rng = new SeededRandom(seed ^ CreatureOrderSalt);
            var order = new int[CreatureCount];
            for (int i = 0; i < order.Length; i++) order[i] = i;
            for (int i = order.Length - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                int tmp = order[i]; order[i] = order[j]; order[j] = tmp;
            }
            return order;
        }

        /// <summary>One entry per ritual stage, then one per omen tier. A null ritual gives an empty list.</summary>
        public static List<CodexEntry> Entries(Ritual ritual)
        {
            var list = new List<CodexEntry>();
            if (ritual == null || ritual.Stages == null) return list;
            var order = CreatureOrder(ritual.Seed);
            for (int i = 0; i < ritual.Stages.Count; i++)
            {
                var st = ritual.Stages[i];
                list.Add(new CodexEntry { Id = "s" + i, Kind = "stage", Index = i, Creature = order[i % CreatureCount], Sigil = st.Sigil, StageName = st.Name, Night = st.NightNumber });
            }
            for (int t = 1; t <= OmenTiers; t++) list.Add(new CodexEntry { Id = "o" + t, Kind = "omen", Tier = t });
            return list;
        }

        /// <summary>Ids unlocked by reaching ritual stage <paramref name="stage"/> (-1 for none) and omen tier <paramref name="tier"/> (0 for none).</summary>
        public static List<string> UnlockedIds(Ritual ritual, int stage, int tier)
        {
            var ids = new List<string>();
            if (ritual == null || ritual.Stages == null) return ids;
            for (int i = 0; i < ritual.Stages.Count && i <= stage; i++) ids.Add("s" + i);
            for (int t = 1; t <= OmenTiers && t <= tier; t++) ids.Add("o" + t);
            return ids;
        }

        /// <summary>Adds ids that are entries of this ritual to the set. Returns the newly added ids in order; foreign ids are ignored.</summary>
        public static List<string> UnlockInto(ISet<string> unlocked, Ritual ritual, IEnumerable<string> ids)
        {
            var valid = new HashSet<string>();
            foreach (var e in Entries(ritual)) valid.Add(e.Id);
            var fresh = new List<string>();
            foreach (var id in ids)
                if (valid.Contains(id) && unlocked.Add(id)) fresh.Add(id);
            return fresh;
        }
    }
}
