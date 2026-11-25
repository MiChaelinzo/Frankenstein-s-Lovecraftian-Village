using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One authored mutation chain (Data/rumor-mutations.json): the rumor it retells (source and ref as in a mythos rumor line), the true account and the stages the telling drifts through.</summary>
    public sealed class RumorMutationChain
    {
        public string Id;
        public RumorSource Source;
        public string Ref;
        public LocalizedName Original;
        public List<LocalizedName> Stages = new List<LocalizedName>();
    }

    /// <summary>The data file Data/rumor-mutations.json (round 36, spec 181). The same file is read by web/src/rumor-mutation.js and a drift test compares the two copies.</summary>
    public sealed class RumorMutationLibrary
    {
        public const int MinStages = 3;
        /// <summary>The knowledge tier from which the true account is shown next to the mutated telling.</summary>
        public int TrueTier;
        public LocalizedName TrueLabel;
        public List<RumorMutationChain> Chains = new List<RumorMutationChain>();

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed, a chain has too few stages, a language is missing or two chains tell the same rumor.</summary>
        public static RumorMutationLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("rumor-mutations: root is not an object");
            var lib = new RumorMutationLibrary();
            lib.TrueTier = root.ContainsKey("trueTier") && root["trueTier"] is double ? (int)(double)root["trueTier"] : -1;
            if (lib.TrueTier < 1 || lib.TrueTier > KnowledgeLibrary.MaxTier) throw new FormatException("rumor-mutations: trueTier must be between 1 and " + KnowledgeLibrary.MaxTier);
            lib.TrueLabel = Localized(root.ContainsKey("trueLabel") ? root["trueLabel"] as Dictionary<string, object> : null, "trueLabel");
            var chains = root.ContainsKey("chains") ? root["chains"] as List<object> : null;
            if (chains == null || chains.Count == 0) throw new FormatException("rumor-mutations: chains needs at least one entry");
            var seen = new HashSet<string>();
            foreach (var item in chains)
            {
                var o = item as Dictionary<string, object>;
                if (o == null) throw new FormatException("rumor-mutations: chains holds a non-object");
                var c = new RumorMutationChain { Id = o.ContainsKey("id") ? o["id"] as string : null };
                if (string.IsNullOrEmpty(c.Id)) throw new FormatException("rumor-mutations: a chain lacks an id");
                string source = o.ContainsKey("source") ? o["source"] as string : null;
                if (source == "secret") c.Source = RumorSource.Secret;
                else if (source == "cosmic") c.Source = RumorSource.Cosmic;
                else if (source == "missing") c.Source = RumorSource.Missing;
                else throw new FormatException("rumor-mutations: chain " + c.Id + " has an unknown source");
                c.Ref = o.ContainsKey("ref") ? o["ref"] as string : null;
                if (c.Ref == null) throw new FormatException("rumor-mutations: chain " + c.Id + " lacks ref");
                if (!seen.Add(c.Source + ":" + c.Ref)) throw new FormatException("rumor-mutations: chain " + c.Id + " tells a rumor another chain tells");
                c.Original = Localized(o.ContainsKey("original") ? o["original"] as Dictionary<string, object> : null, "chain " + c.Id + " original");
                var stages = o.ContainsKey("stages") ? o["stages"] as List<object> : null;
                if (stages == null || stages.Count < MinStages) throw new FormatException("rumor-mutations: chain " + c.Id + " needs at least " + MinStages + " stages");
                foreach (var s in stages) c.Stages.Add(Localized(s as Dictionary<string, object>, "chain " + c.Id + " stage"));
                lib.Chains.Add(c);
            }
            return lib;
        }

        /// <summary>The index of the chain that retells this rumor, or -1.</summary>
        public int ChainIndex(RumorSource source, string refId)
        {
            for (int i = 0; i < Chains.Count; i++) if (Chains[i].Source == source && Chains[i].Ref == refId) return i;
            return -1;
        }

        private static LocalizedName Localized(Dictionary<string, object> d, string owner)
        {
            if (d == null) throw new FormatException("rumor-mutations: " + owner + " holds a non-object");
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = d.ContainsKey(lang) ? d[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("rumor-mutations: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>
    /// How a rumor drifts as it is retold (round 36, spec 181). The stage is a pure function of the seed, the nights since the rumor began and the exposure (per mille) of the cult behind the night:
    /// it never exceeds the chain length and never falls as nights pass. PRESENTATION ONLY: the saved state and the simulation are untouched, and the true account stays recoverable at the knowledge tier gate.
    /// </summary>
    public static class RumorMutation
    {
        public const int MutationStream = 0x4D5554, ChainSalt = 7919;
        /// <summary>Progress per night, per mille of exposure, and the progress one stage needs. A seed adds a head start in [0, <see cref="JitterRange"/>).</summary>
        public const int NightStep = 60, ExposureWeight = 500, StageSize = 300, JitterRange = 100, ExposureScale = 1000;

        /// <summary>The stage (index into the chain's stages) of a rumor told <paramref name="nightsSince"/> nights after it began. Negative nights and exposure read as 0.</summary>
        public static int Stage(RumorMutationLibrary lib, int chain, int seed, int rumorNight, int nightsSince, int exposure)
        {
            int jitter = new SeededRandom(seed ^ MutationStream ^ (rumorNight * VillageSociety.IndexStep) ^ (chain * ChainSalt)).Next(JitterRange);
            int progress = Math.Max(0, nightsSince) * NightStep + Math.Min(Math.Max(0, exposure), ExposureScale) * ExposureWeight / ExposureScale + jitter;
            return Math.Min(lib.Chains[chain].Stages.Count - 1, progress / StageSize);
        }

        /// <summary>The wording of a rumor that has a chain: the mutated stage, with the true account after the label at or above the gate tier. Empty when no chain retells the rumor.</summary>
        public static string Text(RumorMutationLibrary lib, MythosRumor rumor, string refId, int seed, int nightsSince, int exposure, int knowledgeTier, string lang)
        {
            int chain = lib.ChainIndex(rumor.Source, refId);
            if (chain < 0) return "";
            var c = lib.Chains[chain];
            string text = c.Stages[Stage(lib, chain, seed, rumor.Night, nightsSince, exposure)].Get(lang);
            return knowledgeTier >= lib.TrueTier ? text + " " + lib.TrueLabel.Get(lang) + " " + c.Original.Get(lang) : text;
        }

        /// <summary>The highest exposure among the cult leaders at the end of a night (0 with none): the shared pressure that makes the village retell things faster.</summary>
        public static int Exposure(MythosNight night)
        {
            int best = 0;
            if (night != null) foreach (var l in night.Leaders) best = Math.Max(best, l.Exposure);
            return best;
        }
    }
}
