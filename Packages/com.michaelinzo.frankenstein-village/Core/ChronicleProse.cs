using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// The data file Data/chronicle.json: authored sentence variants for the generated chronicle (round 34, spec 168), per line id, plus one title per villager role. The same file is
    /// read by web/src/chronicle-prose.js and a drift test compares the two copies. Slots are {village}, {who}, {missing}, {home}, {cult} and {count}.
    /// </summary>
    public sealed class ChronicleLibrary
    {
        /// <summary>Every line id the prose reads, in a stable order. The order is part of the seed: a line id's position salts its pick.</summary>
        public static readonly string[] LineIds =
        {
            "opener_early", "opener_mid", "opener_late",
            "omen_tide_wrong", "omen_stars_wrong", "omen_bell_unrung", "omen_black_tide",
            "vanished", "cult",
            "secret_debt", "secret_affair", "secret_forbidden_book", "secret_witnessed_body", "secret_cult_ties",
            "rumor",
            "memory_forgive", "memory_paranoid", "memory_loyal", "memory_obsessed",
            "quiet_early", "quiet_mid", "quiet_late",
            "outcome_dead", "outcome_escaped", "outcome_recruited", "outcome_transformed", "outcome_hidden", "outcome_displaced",
            "taken",
            "summary_open", "summary_unknown", "summary_cults", "summary_omens", "summary_close_low", "summary_close_mid", "summary_close_high",
        };
        public const int MinVariants = 4;

        /// <summary>One title per <see cref="VillagerRole"/>, in role order, e.g. "the fisherman".</summary>
        public List<LocalizedName> Roles = new List<LocalizedName>();
        /// <summary>Variants per line id, in <see cref="LineIds"/> order.</summary>
        public List<List<LocalizedName>> Variants = new List<List<LocalizedName>>();

        public static int IndexOf(string id) { return Array.IndexOf(LineIds, id); }

        /// <summary>The variants of a line id, or null when the id is not a known line.</summary>
        public List<LocalizedName> Group(string id)
        {
            int k = IndexOf(id);
            return k < 0 ? null : Variants[k];
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed, lacks a line id or role, has too few variants or lacks a language.</summary>
        public static ChronicleLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("chronicle: root is not an object");
            var roles = root.ContainsKey("roles") ? root["roles"] as List<object> : null;
            if (roles == null || roles.Count != Enum.GetValues(typeof(VillagerRole)).Length) throw new FormatException("chronicle: roles needs one title per villager role");
            var lib = new ChronicleLibrary();
            foreach (var r in roles) lib.Roles.Add(Localized(r as Dictionary<string, object>, "roles"));
            var list = root.ContainsKey("lines") ? root["lines"] as List<object> : null;
            if (list == null) throw new FormatException("chronicle: missing lines array");
            var groups = new List<LocalizedName>[LineIds.Length];
            foreach (var item in list)
            {
                var o = item as Dictionary<string, object>;
                if (o == null) throw new FormatException("chronicle: lines holds a non-object");
                string id = o.ContainsKey("id") ? o["id"] as string : null;
                int k = IndexOf(id);
                if (k < 0) throw new FormatException("chronicle: unknown line id " + id);
                if (groups[k] != null) throw new FormatException("chronicle: duplicate line id " + id);
                var variants = o.ContainsKey("variants") ? o["variants"] as List<object> : null;
                if (variants == null || variants.Count < MinVariants) throw new FormatException("chronicle: line " + id + " needs at least " + MinVariants + " variants");
                groups[k] = new List<LocalizedName>();
                foreach (var v in variants) groups[k].Add(Localized(v as Dictionary<string, object>, "line " + id));
            }
            for (int k = 0; k < LineIds.Length; k++)
            {
                if (groups[k] == null) throw new FormatException("chronicle: lacks line id " + LineIds[k]);
                lib.Variants.Add(groups[k]);
            }
            return lib;
        }

        private static LocalizedName Localized(Dictionary<string, object> d, string owner)
        {
            if (d == null) throw new FormatException("chronicle: " + owner + " holds a non-object");
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = d.ContainsKey(lang) ? d[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("chronicle: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>
    /// Everything the chronicle may draw on. Heard holds the mythos statement ids the player was told ("mythos:omen:N", "mythos:cult:V", "mythos:secret:V", "mythos:rumor:N"), Leads the
    /// leads found per missing person (<see cref="MissingOutcomes.LevelFor"/> decides how much is told) and Met the roster indices of the villagers the player has met. Outcomes holds what
    /// really happened to each missing person, but the prose only reads an entry when the leads reach <see cref="RevealLevel.Outcome"/>. MemoryLog may be null.
    /// </summary>
    public sealed class ChronicleContext
    {
        public ChronicleLibrary Prose;
        public VillageStory Story;
        public MythosLibrary Mythos;
        public MythosState State;
        /// <summary>The number of nights of the run (decides the stage of the arc a night belongs to).</summary>
        public int Nights;
        public MissingOutcome[] Outcomes = new MissingOutcome[0];
        public int[] Leads = new int[0];
        public ISet<string> Heard = new HashSet<string>();
        public ISet<int> Met = new HashSet<int>();
        public IList<MemoryEvent> MemoryLog;
    }

    /// <summary>
    /// Chronicle 2.0 (round 34, spec 168): the story of the run written as prose, night by night and as a whole. A pure function of the context, the language and the seed of the village.
    /// Sentences come from authored variants in Data/chronicle.json, picked by a <see cref="SeededRandom"/>, so one village always reads the same and two villages read differently. A sentence
    /// is written only for something the player learned: an omen, cult tie or secret they were told, a disappearance whose rumor they heard or whose leads they found, an ending the leads
    /// reveal in full, and the mood of a villager they met. A night with nothing learned gets one opening line and a quiet line. No language model, no randomness beyond the seed.
    /// </summary>
    public static class ChronicleProse
    {
        public const int ChronicleStream = 0x43484E;
        public const int SummaryNight = 0;
        /// <summary>Total learned things up to which the closing line is "low", then "mid". Anything above is "high".</summary>
        public const int LowLearned = 2, MidLearned = 6;

        public static string Capitalize(string s) { return s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s.Substring(1); }

        private static string Pick(ChronicleContext ctx, string id, int night, int salt, string lang, IDictionary<string, string> vars)
        {
            var group = ctx.Prose.Group(id);
            if (group == null) return "";
            int pick = new SeededRandom(ctx.Story.Seed ^ ChronicleStream ^ (night * VillageSociety.IndexStep) ^ (ChronicleLibrary.IndexOf(id) * 131) ^ (salt * 7919)).Next(group.Count);
            return Capitalize(VillageStory.Render(group[pick].Get(lang), vars));
        }

        private static string WhoOf(ChronicleContext ctx, int villager, string lang)
        {
            var v = ctx.Story.Roster[villager];
            return ctx.Prose.Roles[(int)v.Role].Get(lang) + " " + v.Name;
        }

        private static Dictionary<string, string> Vars(ChronicleContext ctx) { return new Dictionary<string, string> { { "village", ctx.Story.VillageName } }; }

        private static string StageId(ChronicleContext ctx, int night) { return new[] { "early", "mid", "late" }[VillageStory.StageOfNight(night, ctx.Nights)]; }

        private static bool Simulated(ChronicleContext ctx, int night) { return ctx.State != null && ctx.Mythos != null && night >= 1 && night <= ctx.State.Nights.Count; }

        private static RevealLevel LevelOf(ChronicleContext ctx, int missing)
        {
            return MissingOutcomes.LevelFor(missing < ctx.Leads.Length ? ctx.Leads[missing] : 0);
        }

        private static string OutcomeSentence(ChronicleContext ctx, int missing, int night, string lang)
        {
            var vars = ctx.Story.MissingVars(ctx.Story.Missing[missing], lang);
            vars["village"] = ctx.Story.VillageName;
            return Pick(ctx, "outcome_" + OutcomeLibrary.OutcomeIds[(int)ctx.Outcomes[missing]], night, missing, lang, vars);
        }

        /// <summary>The sentences of one night, in the order they are told. Empty for a night that was not simulated. Never more than the player learned.</summary>
        public static List<string> NightSentences(ChronicleContext ctx, int night, string lang)
        {
            var list = new List<string>();
            if (!Simulated(ctx, night)) return list;
            var rec = NightTicks.At(ctx.State, ctx.Mythos, night);
            var tonight = ctx.State.AtNight(night);
            var vars = Vars(ctx);
            int told = 0;

            string omen = rec.NewOmen.Length > 0 && ctx.Heard.Contains(MythosRules.OmenId(night)) ? Pick(ctx, "omen_" + rec.NewOmen, night, 0, lang, vars) : "";
            if (omen.Length > 0) { list.Add(omen); told++; }
            else list.Add(Pick(ctx, "opener_" + StageId(ctx, night), night, 0, lang, vars));

            if (rec.NewMissingPerson > 0)
                foreach (var r in tonight.Rumors)
                {
                    if (r.Source != RumorSource.Missing || r.Night != night || r.Subject < 0 || r.Subject >= ctx.Story.Missing.Count) continue;
                    var level = LevelOf(ctx, r.Subject);
                    if (!ctx.Heard.Contains(MythosRules.RumorId(night)) && level == RevealLevel.Nothing) break;
                    var mv = ctx.Story.MissingVars(ctx.Story.Missing[r.Subject], lang);
                    list.Add(Pick(ctx, "vanished", night, r.Subject, lang, mv));
                    if (level == RevealLevel.Outcome && r.Subject < ctx.Outcomes.Length) list.Add(OutcomeSentence(ctx, r.Subject, night, lang));
                    told++;
                    break;
                }

            int cults = 0;
            foreach (var e in tonight.Events)
            {
                if (e.Kind != MythosEventKind.CultFounded && e.Kind != MythosEventKind.CultJoined) continue;
                if (e.Subject < 0 || e.Subject >= ctx.Story.Roster.Count || !ctx.Heard.Contains(MythosRules.CultId(e.Subject)) || cults >= 2) continue;
                int c = MythosLibrary.IndexOf(ctx.Mythos.Cults, e.Key);
                if (c < 0) continue;
                var cv = Vars(ctx);
                cv["who"] = WhoOf(ctx, e.Subject, lang);
                cv["cult"] = ctx.Mythos.Cults[c].Text.Get(lang);
                list.Add(Pick(ctx, "cult", night, cults, lang, cv));
                cults++; told++;
            }

            foreach (var e in tonight.Events)
            {
                if (e.Kind != MythosEventKind.SecretExposed || e.Subject < 0 || e.Subject >= ctx.Story.Roster.Count || !ctx.Heard.Contains(MythosRules.SecretId(e.Subject))) continue;
                var sv = Vars(ctx);
                sv["who"] = WhoOf(ctx, e.Subject, lang);
                string line = Pick(ctx, "secret_" + e.Key, night, e.Subject, lang, sv);
                if (line.Length == 0) continue;
                list.Add(line);
                told++;
                break;
            }

            if (rec.RumorsChanged > 0)
                foreach (var r in tonight.Rumors)
                {
                    if (r.Night >= night || !ctx.Heard.Contains(MythosRules.RumorId(r.Night))) continue;
                    bool mutated = false;
                    foreach (var h in r.Holders) if (h.Night == night && h.Distortion > 0) mutated = true;
                    if (!mutated) continue;
                    list.Add(Pick(ctx, "rumor", night, r.Night, lang, vars));
                    told++;
                    break;
                }

            string mood = MemorySentence(ctx, night, lang);
            if (mood.Length > 0) { list.Add(mood); told++; }

            if (told == 0) list.Add(Pick(ctx, "quiet_" + StageId(ctx, night), night, 0, lang, vars));
            return list;
        }

        /// <summary>One sentence about a villager the player has met whose memory has reached an outcome by this night, or "". The villager is picked by seed among those who qualify.</summary>
        private static string MemorySentence(ChronicleContext ctx, int night, string lang)
        {
            if (ctx.MemoryLog == null || ctx.Met == null || ctx.Met.Count == 0) return "";
            var model = VillagerMemoryModel.Replay(ctx.Story.Roster.Count, ctx.MemoryLog, night);
            var who = new List<int>();
            for (int v = 0; v < ctx.Story.Roster.Count; v++)
                if (ctx.Met.Contains(v) && model.OutcomeOf(v) != MemoryOutcome.None) who.Add(v);
            if (who.Count == 0) return "";
            int pick = who[new SeededRandom(ctx.Story.Seed ^ ChronicleStream ^ (night * VillageSociety.IndexStep) ^ 0x4D4F4F).Next(who.Count)];
            var vars = Vars(ctx);
            vars["who"] = WhoOf(ctx, pick, lang);
            return Pick(ctx, "memory_" + new[] { "none", "forgive", "paranoid", "loyal", "obsessed" }[(int)model.OutcomeOf(pick)], night, pick, lang, vars);
        }

        /// <summary>The paragraph of one night: its sentences joined by a space. "" for a night that was not simulated.</summary>
        public static string NightProse(ChronicleContext ctx, int night, string lang)
        {
            return string.Join(" ", NightSentences(ctx, night, lang));
        }

        /// <summary>The night by night chronicle, nights 1 to <paramref name="throughNight"/> (at most the nights simulated), one paragraph each.</summary>
        public static List<string> Chronicle(ChronicleContext ctx, int throughNight, string lang)
        {
            var list = new List<string>();
            if (ctx.State == null) return list;
            for (int night = 1; night <= Math.Min(throughNight, ctx.State.Nights.Count); night++) list.Add(NightProse(ctx, night, lang));
            return list;
        }

        /// <summary>The whole story for the ending: the fate of every missing person as far as the leads reveal, then the cults and omens the player learned of, then a closing line chosen by how much was learned.</summary>
        public static string Summary(ChronicleContext ctx, int throughNight, string lang)
        {
            var vars = Vars(ctx);
            var parts = new List<string> { Pick(ctx, "summary_open", SummaryNight, 0, lang, vars) };
            int learned = 0, unknown = 0;
            for (int k = 0; k < ctx.Story.Missing.Count; k++)
            {
                var level = LevelOf(ctx, k);
                if (level == RevealLevel.Nothing) { unknown++; continue; }
                learned++;
                if (level == RevealLevel.Outcome && k < ctx.Outcomes.Length) parts.Add(OutcomeSentence(ctx, k, SummaryNight, lang));
                else
                {
                    var mv = ctx.Story.MissingVars(ctx.Story.Missing[k], lang);
                    mv["village"] = ctx.Story.VillageName;
                    parts.Add(Pick(ctx, "taken", SummaryNight, k, lang, mv));
                }
            }
            if (unknown > 0) parts.Add(Pick(ctx, "summary_unknown", SummaryNight, 0, lang, Counted(ctx, unknown)));

            var cultFolk = new HashSet<int>();
            int omens = 0, secrets = 0;
            if (ctx.State != null)
                for (int night = 1; night <= Math.Min(throughNight, ctx.State.Nights.Count); night++)
                    foreach (var e in ctx.State.AtNight(night).Events)
                    {
                        if ((e.Kind == MythosEventKind.CultFounded || e.Kind == MythosEventKind.CultJoined) && ctx.Heard.Contains(MythosRules.CultId(e.Subject))) cultFolk.Add(e.Subject);
                        if (e.Kind == MythosEventKind.CosmicOmen && ctx.Heard.Contains(MythosRules.OmenId(night))) omens++;
                        if (e.Kind == MythosEventKind.SecretExposed && ctx.Heard.Contains(MythosRules.SecretId(e.Subject))) secrets++;
                    }
            if (cultFolk.Count > 0) parts.Add(Pick(ctx, "summary_cults", SummaryNight, 0, lang, Counted(ctx, cultFolk.Count)));
            if (omens > 0) parts.Add(Pick(ctx, "summary_omens", SummaryNight, 0, lang, Counted(ctx, omens)));

            learned += cultFolk.Count + omens + secrets;
            string band = learned <= LowLearned ? "low" : learned <= MidLearned ? "mid" : "high";
            parts.Add(Pick(ctx, "summary_close_" + band, SummaryNight, 0, lang, vars));
            return string.Join(" ", parts);
        }

        private static Dictionary<string, string> Counted(ChronicleContext ctx, int count)
        {
            var vars = Vars(ctx);
            vars["count"] = count.ToString(System.Globalization.CultureInfo.InvariantCulture);
            return vars;
        }
    }
}
