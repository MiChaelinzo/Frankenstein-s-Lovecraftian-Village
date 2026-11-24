using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>What became of a missing person. Order is stable (golden data uses the integers).</summary>
    public enum MissingOutcome { Dead = 0, Escaped = 1, Recruited = 2, Transformed = 3, Hidden = 4, Displaced = 5 }

    /// <summary>How much of the outcome the player may be told. Order is stable.</summary>
    public enum RevealLevel { Nothing = 0, Taken = 1, Outcome = 2 }

    /// <summary>A missing person's authored limits: outcomes the authored text rules out, and the line that rules them out (shown to authors, never to players).</summary>
    public sealed class OutcomeConstraint
    {
        public string Missing;
        public List<MissingOutcome> Excludes = new List<MissingOutcome>();
        public string Basis;
    }

    /// <summary>The parsed Data/outcomes.json. The same file is read by web/src/outcomes.js; a drift test compares the two copies.</summary>
    public sealed class OutcomeLibrary
    {
        public static readonly string[] OutcomeIds = { "dead", "escaped", "recruited", "transformed", "hidden", "displaced" };

        /// <summary>Template with {missing}: the only thing told once a missing person is known to be gone.</summary>
        public LocalizedName Taken;
        /// <summary>One epitaph per outcome, in <see cref="MissingOutcome"/> order. Templates with {missing} and {village}.</summary>
        public List<LocalizedName> Epitaphs = new List<LocalizedName>();
        public List<OutcomeConstraint> Constraints = new List<OutcomeConstraint>();

        public OutcomeConstraint ConstraintFor(string missingId)
        {
            foreach (var c in Constraints) if (c.Missing == missingId) return c;
            return null;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed or when a constraint would exclude <see cref="MissingOutcome.Hidden"/> (the one outcome that always stays possible).</summary>
        public static OutcomeLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("outcomes: root is not an object");
            var lib = new OutcomeLibrary();
            var taken = root.ContainsKey("taken") ? root["taken"] as Dictionary<string, object> : null;
            if (taken == null) throw new FormatException("outcomes: missing taken object");
            lib.Taken = Text(taken, "taken");
            var epitaphs = new LocalizedName[OutcomeIds.Length];
            foreach (var o in Objects(root, "outcomes"))
            {
                string id = Str(o, "id", "outcome");
                int k = Array.IndexOf(OutcomeIds, id);
                if (k < 0) throw new FormatException("outcomes: unknown outcome id " + id);
                if (epitaphs[k] != null) throw new FormatException("outcomes: duplicate outcome id " + id);
                epitaphs[k] = Text(o, "outcome " + id);
            }
            for (int k = 0; k < OutcomeIds.Length; k++)
            {
                if (epitaphs[k] == null) throw new FormatException("outcomes: lacks outcome " + OutcomeIds[k]);
                lib.Epitaphs.Add(epitaphs[k]);
            }
            foreach (var o in Objects(root, "constraints"))
            {
                var c = new OutcomeConstraint { Missing = Str(o, "missing", "constraint"), Basis = Str(o, "basis", "constraint") };
                if (lib.ConstraintFor(c.Missing) != null) throw new FormatException("outcomes: duplicate constraint for " + c.Missing);
                var list = o.ContainsKey("excludes") ? o["excludes"] as List<object> : null;
                if (list == null) throw new FormatException("outcomes: constraint " + c.Missing + " lacks excludes");
                foreach (var item in list)
                {
                    int k = Array.IndexOf(OutcomeIds, item as string);
                    if (k < 0) throw new FormatException("outcomes: constraint " + c.Missing + " excludes unknown outcome");
                    if ((MissingOutcome)k == MissingOutcome.Hidden) throw new FormatException("outcomes: constraint " + c.Missing + " must not exclude hidden");
                    c.Excludes.Add((MissingOutcome)k);
                }
                lib.Constraints.Add(c);
            }
            return lib;
        }

        private static List<Dictionary<string, object>> Objects(Dictionary<string, object> o, string key)
        {
            var list = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (list == null) throw new FormatException("outcomes: missing " + key + " array");
            var result = new List<Dictionary<string, object>>();
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException("outcomes: " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("outcomes: " + owner + " lacks " + key);
            return s;
        }

        private static LocalizedName Text(Dictionary<string, object> o, string owner)
        {
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = o.ContainsKey(lang) ? o[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("outcomes: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>What the board may show of one missing person: nothing, only that they were taken, or the epitaph. Text is "" at <see cref="RevealLevel.Nothing"/>.</summary>
    public struct MissingReveal
    {
        public RevealLevel Level;
        public string Text;
    }

    /// <summary>
    /// Round 30, spec 163: exactly one outcome per missing person, a pure function of the society, the story, the finished mythos simulation, the data and the number of leads the
    /// player has on that person. Integer arithmetic only. Same seed and same leads always give the same outcome.
    /// Weights (higher is likelier): Dead <see cref="DeadBase"/>, Escaped and Hidden <see cref="SurvivalBase"/> each, Recruited <see cref="RecruitedBase"/> plus <see cref="RecruitedPerCultist"/> for kin
    /// and witness who belong to a cult on the last night (0 when no cult exists), Transformed <see cref="TransformedPerCorrupted"/> for kin and witness at stage Corrupted or worse on the last night plus
    /// <see cref="TransformedPerCultistFate"/> for each whose fate is Cultist, Displaced <see cref="DisplacedPerOmen"/> per omen of the run (at most <see cref="DisplacedOmenCap"/>).
    /// Each lead adds <see cref="LeadStep"/> to Escaped and to Hidden (at most <see cref="MaxLeads"/> leads count), as a tested capability of the function. In play both callers (theory ground truth and board reveal) pass 0 leads on purpose, so what the player finds never changes what happened: leads only decide how much of the outcome the board reveals (<see cref="LevelFor"/>). The lead bonus is kept because it is covered by golden parity and tests; it does not affect the game.
    /// An outcome the authored text rules out (<see cref="OutcomeConstraint"/>) has weight 0. The roll does not depend on the leads and is compared against the cumulative weights in the order
    /// Escaped, Hidden, Dead, Recruited, Transformed, Displaced, so more leads never turn a survivable outcome (Escaped or Hidden) into any other.
    /// </summary>
    public static class MissingOutcomes
    {
        public const int OutcomeStream = 0x4F5554;
        public const int DeadBase = 30, SurvivalBase = 15, RecruitedBase = 10, RecruitedPerCultist = 25, TransformedPerCorrupted = 20, TransformedPerCultistFate = 10, DisplacedPerOmen = 15, DisplacedOmenCap = 4;
        public const int LeadStep = 10, MaxLeads = 6;
        /// <summary>Leads needed before the board says only that the person was taken, and before it tells the outcome.</summary>
        public const int TakenAtLeads = 1, OutcomeAtLeads = 4;
        /// <summary>Cumulative order of the roll. The two survivable outcomes come first.</summary>
        private static readonly MissingOutcome[] RollOrder = { MissingOutcome.Escaped, MissingOutcome.Hidden, MissingOutcome.Dead, MissingOutcome.Recruited, MissingOutcome.Transformed, MissingOutcome.Displaced };

        public static bool IsSurvivable(MissingOutcome outcome) { return outcome == MissingOutcome.Escaped || outcome == MissingOutcome.Hidden; }

        /// <summary>The weight of each outcome (indexed by <see cref="MissingOutcome"/>) for one missing person with <paramref name="leads"/> leads. Hidden is always above 0.</summary>
        public static int[] Weights(VillageSociety society, VillageStory story, MythosState state, OutcomeLibrary library, int missingIndex, int leads)
        {
            var w = new int[OutcomeLibrary.OutcomeIds.Length];
            var m = story.Missing[missingIndex];
            int nights = state == null ? 0 : state.Nights.Count;
            int night = Math.Max(1, nights);
            var schedule = MythosInputs.Schedule(night);
            float dread = MythosInputs.At(schedule.DreadPermille, night) / (float)VillageSociety.Scale;
            int ritual = MythosInputs.At(schedule.RitualStage, night);
            var last = state == null ? null : state.AtNight(night);
            int[] involved = { m.KinIndex, m.WitnessIndex };

            w[(int)MissingOutcome.Dead] = DeadBase;
            w[(int)MissingOutcome.Escaped] = SurvivalBase;
            w[(int)MissingOutcome.Hidden] = SurvivalBase;
            int cultists = 0, corrupted = 0, fated = 0;
            foreach (int v in involved)
            {
                if (v < 0 || v >= society.Roster.Count) continue;
                if (last != null) foreach (var members in last.CultMembers) if (members.Contains(v)) cultists++;
                if ((int)society.CorruptionAt(v, night, dread, ritual) >= (int)CorruptionStage.Corrupted) corrupted++;
                if (society.Fate[v] == CorruptionStage.Cultist) fated++;
            }
            bool cultExists = state != null && state.Cults.Count > 0;
            if (cultExists) w[(int)MissingOutcome.Recruited] = RecruitedBase + cultists * RecruitedPerCultist;
            w[(int)MissingOutcome.Transformed] = corrupted * TransformedPerCorrupted + fated * TransformedPerCultistFate;
            int omens = 0;
            if (state != null) foreach (var n in state.Nights) foreach (var e in n.Events) if (e.Kind == MythosEventKind.CosmicOmen) omens++;
            w[(int)MissingOutcome.Displaced] = Math.Min(omens, DisplacedOmenCap) * DisplacedPerOmen;
            int bonus = Math.Max(0, Math.Min(MaxLeads, leads)) * LeadStep;
            w[(int)MissingOutcome.Escaped] += bonus;
            w[(int)MissingOutcome.Hidden] += bonus;
            var constraint = library == null ? null : library.ConstraintFor(m.Id);
            if (constraint != null) foreach (var x in constraint.Excludes) w[(int)x] = 0;
            return w;
        }

        /// <summary>The one outcome of missing person <paramref name="missingIndex"/> (index into <see cref="VillageStory.Missing"/>) given <paramref name="leads"/> leads.</summary>
        public static MissingOutcome Resolve(VillageSociety society, VillageStory story, MythosState state, OutcomeLibrary library, int missingIndex, int leads)
        {
            var w = Weights(society, story, state, library, missingIndex, leads);
            long total = 0;
            foreach (var k in RollOrder) total += w[(int)k];
            int roll = new SeededRandom(society.Seed ^ OutcomeStream ^ (missingIndex * VillageSociety.IndexStep)).Next(VillageSociety.Scale);
            long target = roll * total / VillageSociety.Scale;
            long cumulative = 0;
            foreach (var k in RollOrder)
            {
                cumulative += w[(int)k];
                if (target < cumulative) return k;
            }
            return MissingOutcome.Hidden;
        }

        /// <summary>
        /// The leads the player has on one missing person: their lore page read (1), found as a Vigil clue (1), their kin met (1), their witness met (1), and one for each statement
        /// heard from kin or witness (at most 2). At most <see cref="MaxLeads"/>.
        /// </summary>
        public static int CountLeads(VillageStory story, LoreLibrary lore, InvestigationEvidence evidence, int missingIndex)
        {
            return CountLeads(story, lore, evidence, missingIndex, null);
        }

        /// <summary>As above plus the missing-person trails of the places: each found Lead discovery whose trail ends at this person is one more lead (<see cref="VillagePlaces.LeadsFor"/>).</summary>
        public static int CountLeads(VillageStory story, LoreLibrary lore, InvestigationEvidence evidence, int missingIndex, PlaceLibrary places)
        {
            if (evidence == null) return 0;
            var m = story.Missing[missingIndex];
            int leads = 0;
            foreach (var book in lore.Books)
            {
                if (book.Missing != m.Id) continue;
                if (evidence.BooksRead.Contains(book.Id)) leads++;
                if (evidence.ClueIds.Contains(LoreBookRules.ClueIdPrefix + book.Id)) leads++;
            }
            if (m.KinIndex >= 0 && evidence.Met.Contains(m.KinIndex)) leads++;
            if (m.WitnessIndex >= 0 && evidence.Met.Contains(m.WitnessIndex)) leads++;
            int heard = 0;
            foreach (var h in evidence.Heard) if (h.Villager >= 0 && (h.Villager == m.KinIndex || h.Villager == m.WitnessIndex)) heard++;
            return Math.Min(MaxLeads, leads + Math.Min(2, heard) + VillagePlaces.LeadsFor(places, evidence.ClueIds, story.Seed, story.Missing.Count, missingIndex));
        }

        public static RevealLevel LevelFor(int leads)
        {
            return leads >= OutcomeAtLeads ? RevealLevel.Outcome : leads >= TakenAtLeads ? RevealLevel.Taken : RevealLevel.Nothing;
        }

        /// <summary>What the board shows of the person: nothing at 0 leads, only the "taken" line from <see cref="TakenAtLeads"/>, the epitaph of the outcome from <see cref="OutcomeAtLeads"/>.</summary>
        public static MissingReveal Reveal(VillageStory story, OutcomeLibrary library, MissingOutcome outcome, int missingIndex, int leads, string lang)
        {
            var level = LevelFor(leads);
            if (level == RevealLevel.Nothing) return new MissingReveal { Level = level, Text = "" };
            var vars = story.MissingVars(story.Missing[missingIndex], lang);
            string template = level == RevealLevel.Taken ? library.Taken.Get(lang) : library.Epitaphs[(int)outcome].Get(lang);
            return new MissingReveal { Level = level, Text = VillageStory.Render(template, vars) };
        }
    }
}
