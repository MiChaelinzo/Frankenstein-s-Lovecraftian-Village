using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    public enum TheoryKind { Missing = 0, Villager = 1, Omen = 2 }

    /// <summary>How a conclusion compares with the ground truth. Order is stable (golden data uses the integers).</summary>
    public enum TheoryGrade { True = 0, Partial = 1, False = 2 }

    /// <summary>How well the attached evidence is believed. It changes the wording of a verdict, never the grade.</summary>
    public enum EvidenceTier { Bare = 0, Doubtful = 1, Firm = 2 }

    /// <summary>Which wording the chronicle epilogue takes. Unexplored has no extra line, so an untouched run reads exactly as before.</summary>
    public enum EpilogueVariant { Unexplored = 0, Clear = 1, Misled = 2, Uncertain = 3 }

    public sealed class TheoryOption
    {
        public string Id;
        /// <summary>Same group is "near" for the group rule; the integer is the rung for the adjacent rule.</summary>
        public int Group;
        public LocalizedName Text;
    }

    public sealed class TheoryTemplate
    {
        public string Id;
        public TheoryKind Kind;
        /// <summary>"group": a wrong option in the truth's group is Partial. "adjacent": a wrong option one rung away is Partial.</summary>
        public string Grading;
        public LocalizedName Question;
        public List<TheoryOption> Options = new List<TheoryOption>();
    }

    public sealed class TheoryVerdictText
    {
        public TheoryGrade Grade;
        public EvidenceTier Tier;
        public LocalizedName Text;
    }

    public sealed class TheoryEpilogueText
    {
        public string Ending;
        public EpilogueVariant Variant;
        public LocalizedName Text;
    }

    /// <summary>The parsed Data/theories.json. The same file is read by web/src/theory.js; a drift test compares the two copies.</summary>
    public sealed class TheoryLibrary
    {
        public static readonly string[] KindIds = { "missing", "villager", "omen" };
        public static readonly string[] GradeIds = { "true", "partial", "false" };
        public static readonly string[] TierIds = { "bare", "doubtful", "firm" };
        public static readonly string[] VariantIds = { "unexplored", "clear", "misled", "uncertain" };
        public const string GradingGroup = "group", GradingAdjacent = "adjacent";

        public List<TheoryTemplate> Templates = new List<TheoryTemplate>();
        public List<TheoryVerdictText> Verdicts = new List<TheoryVerdictText>();
        public List<TheoryEpilogueText> Epilogues = new List<TheoryEpilogueText>();

        public TheoryTemplate TemplateOf(TheoryKind kind)
        {
            foreach (var t in Templates) if (t.Kind == kind) return t;
            return null;
        }

        /// <summary>
        /// Parses the data file. Throws FormatException naming the offending field when it is malformed, when a kind, verdict or epilogue is missing or repeated, or when some option
        /// of a template could not be the truth and still leave both a Partial and a False answer to pick (every conclusion must stay reachable).
        /// </summary>
        public static TheoryLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("theories: root is not an object");
            var lib = new TheoryLibrary();
            foreach (var o in Objects(root, "templates"))
            {
                var t = new TheoryTemplate { Id = Str(o, "id", "template"), Grading = Str(o, "grading", "template") };
                int kind = Array.IndexOf(KindIds, Str(o, "kind", "template " + t.Id));
                if (kind < 0) throw new FormatException("theories: template " + t.Id + " has unknown kind");
                t.Kind = (TheoryKind)kind;
                if (t.Grading != GradingGroup && t.Grading != GradingAdjacent) throw new FormatException("theories: template " + t.Id + " has unknown grading");
                if (lib.TemplateOf(t.Kind) != null) throw new FormatException("theories: two templates of kind " + KindIds[kind]);
                t.Question = Text(o, "template " + t.Id);
                foreach (var oo in Objects(o, "options"))
                {
                    var opt = new TheoryOption { Id = Str(oo, "id", "option of " + t.Id), Group = Int(oo, "group", "option of " + t.Id), Text = Text(oo, "option " + t.Id) };
                    if (t.Options.Exists(x => x.Id == opt.Id)) throw new FormatException("theories: template " + t.Id + " repeats option " + opt.Id);
                    t.Options.Add(opt);
                }
                for (int truth = 0; truth < t.Options.Count; truth++)
                {
                    bool partial = false, wrong = false;
                    for (int pick = 0; pick < t.Options.Count; pick++)
                    {
                        if (pick == truth) continue;
                        var g = Grade(t, truth, pick);
                        if (g == TheoryGrade.Partial) partial = true; else wrong = true;
                    }
                    if (!partial || !wrong) throw new FormatException("theories: template " + t.Id + " option " + t.Options[truth].Id + " cannot be the truth with a Partial and a False answer both reachable");
                }
                lib.Templates.Add(t);
            }
            if (lib.Templates.Count != KindIds.Length) throw new FormatException("theories: needs one template per kind");
            foreach (var o in Objects(root, "verdicts"))
            {
                int g = Array.IndexOf(GradeIds, Str(o, "grade", "verdict")), ti = Array.IndexOf(TierIds, Str(o, "tier", "verdict"));
                if (g < 0 || ti < 0) throw new FormatException("theories: verdict has unknown grade or tier");
                if (lib.Verdicts.Exists(v => (int)v.Grade == g && (int)v.Tier == ti)) throw new FormatException("theories: duplicate verdict " + GradeIds[g] + "/" + TierIds[ti]);
                lib.Verdicts.Add(new TheoryVerdictText { Grade = (TheoryGrade)g, Tier = (EvidenceTier)ti, Text = Text(o, "verdict " + GradeIds[g] + "/" + TierIds[ti]) });
            }
            if (lib.Verdicts.Count != GradeIds.Length * TierIds.Length) throw new FormatException("theories: verdicts must cover every grade and tier");
            foreach (var o in Objects(root, "epilogues"))
            {
                string ending = Str(o, "ending", "epilogue");
                int v = Array.IndexOf(VariantIds, Str(o, "variant", "epilogue"));
                if (Array.IndexOf(VigilRules.EndingIds, ending) < 0) throw new FormatException("theories: epilogue names unknown ending " + ending);
                if (v < 1) throw new FormatException("theories: epilogue " + ending + " has unknown variant");
                if (lib.Epilogues.Exists(e => e.Ending == ending && (int)e.Variant == v)) throw new FormatException("theories: duplicate epilogue " + ending + "/" + VariantIds[v]);
                lib.Epilogues.Add(new TheoryEpilogueText { Ending = ending, Variant = (EpilogueVariant)v, Text = Text(o, "epilogue " + ending) });
            }
            if (lib.Epilogues.Count != VigilRules.EndingIds.Length * (VariantIds.Length - 1)) throw new FormatException("theories: epilogues must cover every ending and variant");
            return lib;
        }

        /// <summary>The integer grading rule, shared by data validation and play. Equal is True; otherwise Partial when near (see <see cref="TheoryTemplate.Grading"/>), else False.</summary>
        public static TheoryGrade Grade(TheoryTemplate template, int truth, int pick)
        {
            if (pick == truth) return TheoryGrade.True;
            int a = template.Options[truth].Group, b = template.Options[pick].Group;
            bool near = template.Grading == GradingAdjacent ? Math.Abs(a - b) == 1 : a == b;
            return near ? TheoryGrade.Partial : TheoryGrade.False;
        }

        private static List<Dictionary<string, object>> Objects(Dictionary<string, object> o, string key)
        {
            var list = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (list == null) throw new FormatException("theories: missing " + key + " array");
            var result = new List<Dictionary<string, object>>();
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException("theories: " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("theories: " + owner + " lacks " + key);
            return s;
        }

        private static int Int(Dictionary<string, object> o, string key, string owner)
        {
            if (!o.ContainsKey(key) || !(o[key] is double)) throw new FormatException("theories: " + owner + " lacks " + key);
            return (int)(double)o[key];
        }

        private static LocalizedName Text(Dictionary<string, object> o, string owner)
        {
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = o.ContainsKey(lang) ? o[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("theories: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>One question the village poses: a template applied to a subject. Subject is the missing index, the roster index or the night, by kind.</summary>
    public sealed class TheoryInstance
    {
        public TheoryKind Kind;
        public int Subject;
        /// <summary>The option index that is the ground truth (index into the template options).</summary>
        public int Truth;
    }

    /// <summary>A finished conclusion. Evidence holds statement library indices, ascending. AverageBelief is the whole percent mean (0 with no evidence).</summary>
    public sealed class TheoryConclusion
    {
        public int Instance;
        public int Option;
        public TheoryGrade Grade;
        public List<int> Evidence = new List<int>();
        public int AverageBelief;
        public EvidenceTier Tier;
    }

    /// <summary>
    /// The state of the player's investigation, a pure function of the choice log (see <see cref="TheoryRules.Replay"/>). Current is the instance being worked on or -1.
    /// Conclusions holds the latest conclusion of each instance, in instance order. Rejected counts log entries that were not legal at their point (they change nothing).
    /// </summary>
    public sealed class TheoryState
    {
        public int Current = -1;
        public int CurrentOption = -1;
        public List<int> CurrentEvidence = new List<int>();
        public SortedDictionary<int, TheoryConclusion> Conclusions = new SortedDictionary<int, TheoryConclusion>();
        public int Rejected;

        public int Count(TheoryGrade grade)
        {
            int n = 0;
            foreach (var c in Conclusions.Values) if (c.Grade == grade) n++;
            return n;
        }

        /// <summary>Knowledge gained from the conclusions: <see cref="TheoryRules.KnowledgeTrue"/>, <see cref="TheoryRules.KnowledgePartial"/> or <see cref="TheoryRules.KnowledgeFalse"/> each.</summary>
        public int Knowledge
        {
            get { return Count(TheoryGrade.True) * TheoryRules.KnowledgeTrue + Count(TheoryGrade.Partial) * TheoryRules.KnowledgePartial + Count(TheoryGrade.False) * TheoryRules.KnowledgeFalse; }
        }
    }

    /// <summary>
    /// Round 30, spec 162: Theory, Evidence, Conclusion. The player picks a theory (an instance), chooses an answer, may attach up to <see cref="MaxEvidence"/> revealed statements, then concludes.
    /// A conclusion is graded True, Partial or False against Core ground truth: the resolved <see cref="MissingOutcome"/> of a missing person, the corruption or cult standing of a villager on the
    /// last night, the first cosmic omen of the run. Being wrong is a normal result: it changes the chronicle epilogue, costs <see cref="WrongVillagerTrust"/> trust when the question was about a
    /// villager, and still earns <see cref="KnowledgeFalse"/> knowledge. It never blocks the Vigil and never changes <see cref="VigilRules.EndingFor"/>. Evidence belief only changes how a verdict is worded.
    /// A concluded instance can be opened again and re-concluded, so there is always a further choice. Integer arithmetic only, no randomness of its own.
    /// Log entries are single ints: kind * <see cref="KindStep"/> + value, with kinds <see cref="ChoiceTheory"/>, <see cref="ChoiceOption"/>, <see cref="ChoiceEvidence"/>, <see cref="ChoiceConclude"/>.
    /// </summary>
    public static class TheoryRules
    {
        public const int KindStep = 10000, ChoiceTheory = 1, ChoiceOption = 2, ChoiceEvidence = 3, ChoiceConclude = 4;
        public const int MaxEvidence = 3, FirmBelief = 60;
        public const int KnowledgeTrue = 6, KnowledgePartial = 3, KnowledgeFalse = 1, WrongVillagerTrust = 5;
        public const string LogPrefix = "th1;";

        public static int Choice(int kind, int value) { return kind * KindStep + value; }

        /// <summary>The questions this village poses: one per missing person, one per cult founder or kin of a missing person (ascending roster index), and the first omen of the run when there is one.</summary>
        public static List<TheoryInstance> Instances(VillageSociety society, VillageStory story, MythosState state, TheoryLibrary library, OutcomeLibrary outcomes)
        {
            var list = new List<TheoryInstance>();
            var missing = library.TemplateOf(TheoryKind.Missing);
            for (int k = 0; k < story.Missing.Count; k++)
            {
                int leads = 0; // ground truth does not depend on what the player has found
                list.Add(new TheoryInstance { Kind = TheoryKind.Missing, Subject = k, Truth = (int)MissingOutcomes.Resolve(society, story, state, outcomes, k, leads) });
            }
            var subjects = new SortedSet<int>();
            if (state != null) foreach (var c in state.Cults) subjects.Add(c.Founder);
            foreach (var m in story.Missing) if (m.KinIndex >= 0) subjects.Add(m.KinIndex);
            foreach (int v in subjects) if (v >= 0 && v < society.Roster.Count) list.Add(new TheoryInstance { Kind = TheoryKind.Villager, Subject = v, Truth = VillagerTruth(society, state, v) });
            if (state != null)
                foreach (var n in state.Nights)
                {
                    bool found = false;
                    foreach (var e in n.Events)
                        if (e.Kind == MythosEventKind.CosmicOmen) { list.Add(new TheoryInstance { Kind = TheoryKind.Omen, Subject = n.Night, Truth = e.Other }); found = true; break; }
                    if (found) break;
                }
            return list;
        }

        /// <summary>Option index of the villager template: 0 untouched, 1 uneasy (Uneasy), 2 corrupted, 3 sworn (in a cult on the last night, or fated Cultist stage).</summary>
        public static int VillagerTruth(VillageSociety society, MythosState state, int villager)
        {
            int night = Math.Max(1, state == null ? 0 : state.Nights.Count);
            var schedule = MythosInputs.Schedule(night);
            float dread = MythosInputs.At(schedule.DreadPermille, night) / (float)VillageSociety.Scale;
            int ritual = MythosInputs.At(schedule.RitualStage, night);
            var last = state == null ? null : state.AtNight(night);
            if (last != null) foreach (var members in last.CultMembers) if (members.Contains(villager)) return 3;
            var stage = society.CorruptionAt(villager, night, dread, ritual);
            if (stage == CorruptionStage.Cultist) return 3;
            if ((int)stage >= (int)CorruptionStage.Corrupted) return 2;
            return stage == CorruptionStage.Uneasy ? 1 : 0;
        }

        /// <summary>The belief tier of a mean belief and an evidence count.</summary>
        public static EvidenceTier TierOf(int count, int averageBelief)
        {
            if (count == 0) return EvidenceTier.Bare;
            return averageBelief >= FirmBelief ? EvidenceTier.Firm : EvidenceTier.Doubtful;
        }

        /// <summary>
        /// The state after a choice log. <paramref name="beliefs"/> maps the statement library index of every revealed statement to its Belief (from <see cref="InvestigationBoard.Scores"/>);
        /// only those can be attached. An illegal entry is counted in Rejected and skipped, so a log from an older or damaged save always replays.
        /// </summary>
        public static TheoryState Replay(TheoryLibrary library, IList<TheoryInstance> instances, IDictionary<int, int> beliefs, IList<int> log)
        {
            var s = new TheoryState();
            foreach (int entry in log)
            {
                int kind = entry / KindStep, value = entry % KindStep;
                bool ok = false;
                if (entry >= 0)
                {
                    if (kind == ChoiceTheory && value < instances.Count)
                    {
                        s.Current = value; s.CurrentOption = -1; s.CurrentEvidence.Clear(); ok = true;
                    }
                    else if (kind == ChoiceOption && s.Current >= 0 && value < library.TemplateOf(instances[s.Current].Kind).Options.Count)
                    {
                        s.CurrentOption = value; ok = true;
                    }
                    else if (kind == ChoiceEvidence && s.Current >= 0 && beliefs.ContainsKey(value))
                    {
                        if (s.CurrentEvidence.Contains(value)) { s.CurrentEvidence.Remove(value); ok = true; }
                        else if (s.CurrentEvidence.Count < MaxEvidence) { s.CurrentEvidence.Add(value); ok = true; }
                    }
                    else if (kind == ChoiceConclude && value == 0 && s.Current >= 0 && s.CurrentOption >= 0)
                    {
                        var inst = instances[s.Current];
                        var c = new TheoryConclusion { Instance = s.Current, Option = s.CurrentOption, Grade = TheoryLibrary.Grade(library.TemplateOf(inst.Kind), inst.Truth, s.CurrentOption) };
                        c.Evidence.AddRange(s.CurrentEvidence);
                        c.Evidence.Sort();
                        int total = 0;
                        foreach (int e in c.Evidence) total += beliefs[e];
                        c.AverageBelief = c.Evidence.Count == 0 ? 0 : total / c.Evidence.Count;
                        c.Tier = TierOf(c.Evidence.Count, c.AverageBelief);
                        s.Conclusions[s.Current] = c;
                        s.Current = -1; s.CurrentOption = -1; s.CurrentEvidence.Clear(); ok = true;
                    }
                }
                if (!ok) s.Rejected++;
            }
            return s;
        }

        /// <summary>
        /// Every legal next choice (as log entries) from a state: open any instance, and while one is open, choose any option, toggle any attachable statement, and conclude once an option is chosen.
        /// Never empty when there is at least one instance, so the investigation has no dead end.
        /// </summary>
        public static List<int> LegalChoices(TheoryLibrary library, IList<TheoryInstance> instances, IDictionary<int, int> beliefs, TheoryState state)
        {
            var list = new List<int>();
            for (int i = 0; i < instances.Count; i++) list.Add(Choice(ChoiceTheory, i));
            if (state.Current >= 0)
            {
                int options = library.TemplateOf(instances[state.Current].Kind).Options.Count;
                for (int o = 0; o < options; o++) list.Add(Choice(ChoiceOption, o));
                var keys = new List<int>(beliefs.Keys);
                keys.Sort();
                foreach (int k in keys) if (state.CurrentEvidence.Contains(k) || state.CurrentEvidence.Count < MaxEvidence) list.Add(Choice(ChoiceEvidence, k));
                if (state.CurrentOption >= 0) list.Add(Choice(ChoiceConclude, 0));
            }
            return list;
        }

        /// <summary>
        /// Trust lost by wrong accusations: <see cref="WrongVillagerTrust"/> for each villager question concluded False. Applied by the caller as a village-wide cost: the web subtracts it from every villager's trust, not only the accused;
        /// a small cost, not a lock.
        /// </summary>
        public static int TrustLost(IList<TheoryInstance> instances, TheoryState state)
        {
            int lost = 0;
            foreach (var c in state.Conclusions.Values) if (c.Grade == TheoryGrade.False && instances[c.Instance].Kind == TheoryKind.Villager) lost += WrongVillagerTrust;
            return lost;
        }

        /// <summary>
        /// The epilogue variant from the conclusion counts: Unexplored with no conclusion, Misled when more than half are False, Clear when at least half are True, otherwise Uncertain.
        /// Does not depend on the vigil, so it cannot alter a win or a loss.
        /// </summary>
        public static EpilogueVariant VariantOf(TheoryState state)
        {
            int n = state.Conclusions.Count;
            if (n == 0) return EpilogueVariant.Unexplored;
            if (state.Count(TheoryGrade.False) * 2 > n) return EpilogueVariant.Misled;
            if (state.Count(TheoryGrade.True) * 2 >= n) return EpilogueVariant.Clear;
            return EpilogueVariant.Uncertain;
        }

        /// <summary>The extra epilogue line of an ending for a variant ("" for Unexplored or an unknown ending). The ending itself is chosen by <see cref="VigilRules.EndingFor"/> and is not touched.</summary>
        public static string Epilogue(TheoryLibrary library, string endingId, EpilogueVariant variant, string lang)
        {
            foreach (var e in library.Epilogues) if (e.Ending == endingId && e.Variant == variant) return e.Text.Get(lang);
            return "";
        }

        public static string Verdict(TheoryLibrary library, TheoryGrade grade, EvidenceTier tier, string lang)
        {
            foreach (var v in library.Verdicts) if (v.Grade == grade && v.Tier == tier) return v.Text.Get(lang);
            return "";
        }

        /// <summary>The question of an instance in a language, with {missing}, {village}, {name} or {night} filled in.</summary>
        public static string Question(TheoryLibrary library, VillageSociety society, VillageStory story, TheoryInstance inst, string lang)
        {
            return VillageStory.Render(library.TemplateOf(inst.Kind).Question.Get(lang), Vars(society, story, inst, lang));
        }

        /// <summary>The text of option <paramref name="option"/> of an instance in a language.</summary>
        public static string OptionText(TheoryLibrary library, VillageSociety society, VillageStory story, TheoryInstance inst, int option, string lang)
        {
            return VillageStory.Render(library.TemplateOf(inst.Kind).Options[option].Text.Get(lang), Vars(society, story, inst, lang));
        }

        private static Dictionary<string, string> Vars(VillageSociety society, VillageStory story, TheoryInstance inst, string lang)
        {
            if (inst.Kind == TheoryKind.Missing) return story.MissingVars(story.Missing[inst.Subject], lang);
            if (inst.Kind == TheoryKind.Villager) return story.VillagerVars(society.Roster[inst.Subject], lang);
            var vars = new Dictionary<string, string>();
            vars["village"] = story.VillageName;
            vars["night"] = inst.Subject.ToString(System.Globalization.CultureInfo.InvariantCulture);
            return vars;
        }

        /// <summary>Choice log text for saves: "th1;" and the entries, comma separated.</summary>
        public static string SerializeLog(IList<int> log) { return LogPrefix + string.Join(",", log); }

        /// <summary>Entries of a saved log text; anything malformed gives an empty log.</summary>
        public static List<int> ParseLog(string text)
        {
            var log = new List<int>();
            if (text == null || !text.StartsWith(LogPrefix, StringComparison.Ordinal)) return log;
            string body = text.Substring(LogPrefix.Length);
            if (body.Length == 0) return log;
            foreach (var part in body.Split(','))
            {
                int v;
                if (part.Length == 0 || part.Length > 9 || !int.TryParse(part, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out v)) return new List<int>();
                log.Add(v);
            }
            return log;
        }
    }
}
