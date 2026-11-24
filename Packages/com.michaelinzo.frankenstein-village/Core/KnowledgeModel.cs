using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>Where the player learned something (round 28, spec 158). Order is stable: golden data and saves use the integers.</summary>
    public enum KnowledgeSource { Journal = 0, Ritual = 1, Investigation = 2, Ruins = 3, Catacombs = 4, MythosEvent = 5, CultDiscovery = 6 }

    public sealed class KnowledgeTier
    {
        public string Id;
        /// <summary>Points needed to reach this tier. Tier 0 needs 0; the others strictly increase.</summary>
        public int Threshold;
        public LocalizedName Name;
        /// <summary>Benefit ids this tier unlocks on top of every lower tier.</summary>
        public List<string> Benefits = new List<string>();
    }

    /// <summary>One rumor told in several versions. A version applies from its tier up, until a higher tier has its own.</summary>
    public sealed class KnowledgeRumor
    {
        public string Id;
        public List<int> Tiers = new List<int>();
        public List<LocalizedName> Texts = new List<LocalizedName>();
    }

    /// <summary>A reality effect the village may show a player who knows enough. Presentation only.</summary>
    public sealed class RealityEffect
    {
        public string Id;
        public int MinTier;
        public LocalizedName Text;
    }

    /// <summary>The data of Forbidden Knowledge (Data/knowledge.json): six tiers, the points of each source, tiered rumors and reality effects.</summary>
    public sealed class KnowledgeLibrary
    {
        public const int TierCount = 6, MaxTier = TierCount - 1;
        public static readonly string[] SourceIds = { "journal", "ritual", "investigation", "ruins", "catacombs", "mythos_event", "cult_discovery" };

        public List<KnowledgeTier> Tiers = new List<KnowledgeTier>();
        /// <summary>Default points of one gain from each source, indexed by <see cref="KnowledgeSource"/>.</summary>
        public int[] SourcePoints = new int[SourceIds.Length];
        public List<KnowledgeRumor> Rumors = new List<KnowledgeRumor>();
        public List<RealityEffect> Effects = new List<RealityEffect>();

        /// <summary>The highest tier whose threshold <paramref name="points"/> reaches. Negative points read as 0, so no tier above 0 is reached without a gain.</summary>
        public int TierFor(int points)
        {
            int tier = 0;
            for (int i = 1; i < Tiers.Count; i++) if (points >= Tiers[i].Threshold) tier = i;
            return tier;
        }

        public static int SourceIndex(string id) { return Array.IndexOf(SourceIds, id); }

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed (an unknown source id names sources).</summary>
        public static KnowledgeLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("knowledge: root is not an object");
            var lib = new KnowledgeLibrary();
            foreach (var o in Objects(root, "tiers"))
            {
                var t = new KnowledgeTier { Id = Str(o, "id", "tier"), Threshold = Int(o, "threshold", "tier"), Name = Text(o, "tier") };
                var benefits = o.ContainsKey("benefits") ? o["benefits"] as List<object> : null;
                if (benefits == null) throw new FormatException("knowledge: tier " + t.Id + " lacks benefits");
                foreach (var b in benefits)
                {
                    var s = b as string;
                    if (string.IsNullOrEmpty(s)) throw new FormatException("knowledge: tier " + t.Id + " has an empty benefit");
                    t.Benefits.Add(s);
                }
                lib.Tiers.Add(t);
            }
            if (lib.Tiers.Count != TierCount) throw new FormatException("knowledge: tiers needs exactly " + TierCount + " entries");
            if (lib.Tiers[0].Threshold != 0) throw new FormatException("knowledge: tiers[0] threshold must be 0");
            for (int i = 1; i < lib.Tiers.Count; i++)
                if (lib.Tiers[i].Threshold <= lib.Tiers[i - 1].Threshold) throw new FormatException("knowledge: tiers thresholds must strictly increase at " + lib.Tiers[i].Id);
            var seen = new HashSet<string>();
            foreach (var o in Objects(root, "sources"))
            {
                string id = Str(o, "id", "source");
                int index = SourceIndex(id);
                if (index < 0) throw new FormatException("knowledge: sources has unknown source " + id);
                if (!seen.Add(id)) throw new FormatException("knowledge: sources lists " + id + " twice");
                int points = Int(o, "points", "source " + id);
                if (points <= 0) throw new FormatException("knowledge: source " + id + " points must be above 0");
                lib.SourcePoints[index] = points;
            }
            if (seen.Count != SourceIds.Length) throw new FormatException("knowledge: sources must list all " + SourceIds.Length + " sources");
            foreach (var o in Objects(root, "rumors"))
            {
                var r = new KnowledgeRumor { Id = Str(o, "id", "rumor") };
                foreach (var v in Objects(o, "versions"))
                {
                    int tier = Int(v, "tier", "rumor " + r.Id);
                    if (tier < 0 || tier > MaxTier) throw new FormatException("knowledge: rumor " + r.Id + " has tier out of range");
                    if (r.Tiers.Count > 0 && tier <= r.Tiers[r.Tiers.Count - 1]) throw new FormatException("knowledge: rumor " + r.Id + " versions must rise in tier");
                    r.Tiers.Add(tier);
                    r.Texts.Add(Text(v, "rumor " + r.Id));
                }
                if (r.Tiers.Count == 0 || r.Tiers[0] != 0) throw new FormatException("knowledge: rumor " + r.Id + " needs a tier 0 version");
                lib.Rumors.Add(r);
            }
            if (lib.Rumors.Count < 4) throw new FormatException("knowledge: rumors needs at least 4 entries");
            foreach (var o in Objects(root, "effects"))
            {
                var e = new RealityEffect { Id = Str(o, "id", "effect"), MinTier = Int(o, "minTier", "effect"), Text = Text(o, "effect") };
                if (e.MinTier < 1 || e.MinTier > MaxTier) throw new FormatException("knowledge: effect " + e.Id + " minTier out of range");
                lib.Effects.Add(e);
            }
            if (lib.Effects.Count == 0) throw new FormatException("knowledge: effects must not be empty");
            return lib;
        }

        private static List<Dictionary<string, object>> Objects(Dictionary<string, object> o, string key)
        {
            var list = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (list == null) throw new FormatException("knowledge: missing " + key + " array");
            var result = new List<Dictionary<string, object>>();
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException("knowledge: " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("knowledge: " + owner + " lacks " + key);
            return s;
        }

        private static int Int(Dictionary<string, object> o, string key, string owner)
        {
            if (!o.ContainsKey(key) || !(o[key] is double)) throw new FormatException("knowledge: " + owner + " lacks " + key);
            return (int)(double)o[key];
        }

        private static LocalizedName Text(Dictionary<string, object> o, string owner)
        {
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = o.ContainsKey(lang) ? o[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("knowledge: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>One thing the player learned: where, and how many points it was worth.</summary>
    public struct KnowledgeGain
    {
        public KnowledgeSource Source;
        public int Points;
    }

    /// <summary>
    /// What the player knows. A log of gains folded into points and a tier. It is independent of <see cref="SanityModel"/>: learning never changes sanity and sanity never changes knowledge.
    /// Replaying a log with <see cref="Replay"/> gives the same state as adding its gains one by one.
    /// </summary>
    public sealed class KnowledgeState
    {
        private readonly List<KnowledgeGain> log = new List<KnowledgeGain>();

        public IList<KnowledgeGain> Log { get { return log; } }
        public int Points { get; private set; }

        /// <summary>Adds a gain. Negative points read as 0 (the gain is logged and counts nothing).</summary>
        public void Add(KnowledgeSource source, int points)
        {
            if (points < 0) points = 0;
            log.Add(new KnowledgeGain { Source = source, Points = points });
            Points += points;
        }

        /// <summary>Adds a gain worth the data's default points of that source.</summary>
        public void Add(KnowledgeLibrary lib, KnowledgeSource source) { Add(source, lib.SourcePoints[(int)source]); }

        public int Tier(KnowledgeLibrary lib) { return lib.TierFor(Points); }

        public static KnowledgeState Replay(IEnumerable<KnowledgeGain> gains)
        {
            var s = new KnowledgeState();
            foreach (var g in gains) s.Add(g.Source, g.Points);
            return s;
        }

        /// <summary>Builds a state from source ids (a save or an event list), each worth its default points. An unknown id throws FormatException naming sources[i].</summary>
        public static KnowledgeState FromSourceIds(KnowledgeLibrary lib, IList<string> ids)
        {
            var s = new KnowledgeState();
            for (int i = 0; i < ids.Count; i++)
            {
                int index = KnowledgeLibrary.SourceIndex(ids[i]);
                if (index < 0) throw new FormatException("knowledge: sources[" + i + "] has unknown source " + ids[i]);
                s.Add(lib, (KnowledgeSource)index);
            }
            return s;
        }
    }

    public static class KnowledgeRules
    {
        /// <summary>Every benefit id unlocked at <paramref name="tier"/> (clamped to the data), lowest tier first.</summary>
        public static List<string> Benefits(KnowledgeLibrary lib, int tier)
        {
            var list = new List<string>();
            tier = Math.Max(0, Math.Min(tier, KnowledgeLibrary.MaxTier));
            for (int i = 0; i <= tier; i++) list.AddRange(lib.Tiers[i].Benefits);
            return list;
        }

        public static bool HasBenefit(KnowledgeLibrary lib, int tier, string benefit) { return Benefits(lib, tier).Contains(benefit); }

        /// <summary>The rumor as told to a player of this tier: the version with the highest tier not above it. Throws FormatException naming rumors when the id is unknown.</summary>
        public static string RumorText(KnowledgeLibrary lib, string rumorId, int tier, string lang)
        {
            foreach (var r in lib.Rumors)
            {
                if (r.Id != rumorId) continue;
                int pick = 0;
                for (int i = 0; i < r.Tiers.Count; i++) if (r.Tiers[i] <= tier) pick = i;
                return r.Texts[pick].Get(lang);
            }
            throw new FormatException("knowledge: rumors has no rumor " + rumorId);
        }
    }

    /// <summary>
    /// The cost of knowing: reality slips. Presentation only. The result is a list of effect ids for the client to show; no Core output, Vigil rule or ending reads it.
    /// </summary>
    public static class RealityDistortion
    {
        public const int Stream = 0x4b4e57;

        /// <summary>The effects shown on <paramref name="night"/> at <paramref name="tier"/>, in a seed-driven order. Tier 0 returns none; otherwise up to <c>tier</c> distinct effects whose minimum tier is reached.</summary>
        public static List<string> For(KnowledgeLibrary lib, int seed, int night, int tier)
        {
            var result = new List<string>();
            if (tier <= 0) return result;
            tier = Math.Min(tier, KnowledgeLibrary.MaxTier);
            var eligible = new List<string>();
            foreach (var e in lib.Effects) if (e.MinTier <= tier) eligible.Add(e.Id);
            var rng = new SeededRandom(seed ^ Stream ^ (night * VillageSociety.IndexStep));
            int count = Math.Min(tier, eligible.Count);
            for (int i = 0; i < count; i++)
            {
                int j = i + rng.Next(eligible.Count - i);
                string t = eligible[i]; eligible[i] = eligible[j]; eligible[j] = t;
                result.Add(eligible[i]);
            }
            return result;
        }
    }
}
