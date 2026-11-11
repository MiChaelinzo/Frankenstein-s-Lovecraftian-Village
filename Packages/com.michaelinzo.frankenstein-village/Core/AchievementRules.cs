using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>What the player has done so far. Plain data in, earned achievement ids out.</summary>
    public sealed class AchievementStats
    {
        public int Whispers;
        public int Listens;
        public int Doors;
        public int NightsVisited;
        public int NightsTotal;
        public HashSet<string> Kinds = new HashSet<string>();
        public int Tier;
        public int Stage = -1;
        public int StageCount;
        public int CodexCount;
        public int CodexTotal;
        public bool InvestigatorDone;
    }

    /// <summary>Journal completion: how many tracked kinds were seen.</summary>
    public struct JournalCompletion
    {
        public int Seen;
        public int Total;
        public int Percent;
    }

    /// <summary>Engine-free achievement predicates. Ids and their order are stable (the clients persist the ids).</summary>
    public static class AchievementRules
    {
        public const int ListenTarget = 3;
        public const int DoorTarget = 3;
        public const int AbyssTier = 3;

        public static readonly string[] JournalKinds = { "narration", "omen", "door", "investigator" };

        /// <summary>Achievement ids in definition order.</summary>
        public static readonly string[] Ids =
        {
            "whisper", "listener", "doors", "nights", "journal", "abyss", "ritual", "codexhalf", "codexfull", "wanderer",
        };

        public static bool IsEarned(string id, AchievementStats s)
        {
            switch (id)
            {
                case "whisper": return s.Whispers >= 1;
                case "listener": return s.Listens >= ListenTarget;
                case "doors": return s.Doors >= DoorTarget;
                case "nights": return s.NightsTotal > 0 && s.NightsVisited >= s.NightsTotal;
                case "journal": return SeenKinds(s.Kinds) == JournalKinds.Length;
                case "abyss": return s.Tier >= AbyssTier;
                case "ritual": return s.StageCount > 0 && s.Stage >= s.StageCount - 1;
                case "codexhalf": return s.CodexTotal > 0 && s.CodexCount * 2 >= s.CodexTotal;
                case "codexfull": return s.CodexTotal > 0 && s.CodexCount >= s.CodexTotal;
                case "wanderer": return s.InvestigatorDone;
                default: return false;
            }
        }

        /// <summary>Ids earned by these stats, in definition order.</summary>
        public static List<string> EarnedIds(AchievementStats s)
        {
            var list = new List<string>();
            foreach (var id in Ids) if (IsEarned(id, s)) list.Add(id);
            return list;
        }

        /// <summary>Adds newly earned ids to <paramref name="earned"/> (sticky) and returns the new ones in definition order.</summary>
        public static List<string> Award(ISet<string> earned, AchievementStats s)
        {
            var fresh = new List<string>();
            foreach (var id in EarnedIds(s)) if (earned.Add(id)) fresh.Add(id);
            return fresh;
        }

        public static JournalCompletion Completion(ISet<string> kinds)
        {
            int seen = SeenKinds(kinds);
            return new JournalCompletion { Seen = seen, Total = JournalKinds.Length, Percent = (int)Math.Floor(seen * 100.0 / JournalKinds.Length + 0.5) };
        }

        private static int SeenKinds(ICollection<string> kinds)
        {
            int seen = 0;
            foreach (var k in JournalKinds) if (kinds != null && kinds.Contains(k)) seen++;
            return seen;
        }
    }
}
