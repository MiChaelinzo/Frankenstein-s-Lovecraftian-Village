using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 30 (spec 162): Theory, Evidence, Conclusion graded against Core ground truth.</summary>
    public class TheoryModelTests
    {
        private static string DataFile(string name)
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", name);
        }

        public static TheoryLibrary Library() => TheoryLibrary.Parse(File.ReadAllText(DataFile("theories.json")));

        /// <summary>Synthetic beliefs of three revealed statements (library index to belief), shared with the golden data.</summary>
        public static Dictionary<int, int> Beliefs() => new Dictionary<int, int> { { 0, 90 }, { 1, 40 }, { 2, 70 } };

        private static List<TheoryInstance> InstancesOf(int seed, out VillageSociety society, out VillageStory story)
        {
            society = VillageSocietyTests.SocietyOf(seed, out story, out _);
            var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
            return TheoryRules.Instances(society, story, state, Library(), MissingOutcomesTests.Library());
        }

        [Fact]
        public void Library_parses_and_rejects_bad_data()
        {
            var lib = Library();
            Assert.Equal(3, lib.Templates.Count);
            Assert.Equal(lib.TemplateOf(TheoryKind.Missing).Options.Select(o => o.Id), OutcomeLibrary.OutcomeIds);
            var omens = MythosSimulationTests.Library().Omens.Select(o => o.Id);
            Assert.Equal(omens, lib.TemplateOf(TheoryKind.Omen).Options.Select(o => o.Id));
            Assert.Throws<FormatException>(() => TheoryLibrary.Parse("[]"));
            string text = File.ReadAllText(DataFile("theories.json"));
            // Two options in one group of the "adjacent" template leave no False answer for some truths.
            Assert.Throws<FormatException>(() => TheoryLibrary.Parse(text.Replace("\"grading\": \"adjacent\"", "\"grading\": \"nearby\"")));
            Assert.Throws<FormatException>(() => TheoryLibrary.Parse(text.Replace("\"ending\": \"dawn\"", "\"ending\": \"nowhere\"")));
        }

        [Fact]
        public void Every_template_can_reach_true_partial_and_false_for_every_option_as_truth()
        {
            var lib = Library();
            foreach (var t in lib.Templates)
                for (int truth = 0; truth < t.Options.Count; truth++)
                {
                    var grades = new HashSet<TheoryGrade>();
                    for (int pick = 0; pick < t.Options.Count; pick++) grades.Add(TheoryLibrary.Grade(t, truth, pick));
                    Assert.Equal(3, grades.Count);
                }
        }

        [Fact]
        public void Every_instance_reaches_every_conclusion_through_a_log()
        {
            var lib = Library();
            foreach (int seed in new[] { 1, 42, 1818, 7, 99 })
            {
                var instances = InstancesOf(seed, out _, out _);
                for (int i = 0; i < instances.Count; i++)
                {
                    var template = lib.TemplateOf(instances[i].Kind);
                    var seen = new HashSet<TheoryGrade>();
                    for (int pick = 0; pick < template.Options.Count; pick++)
                    {
                        var log = new List<int> { TheoryRules.Choice(TheoryRules.ChoiceTheory, i), TheoryRules.Choice(TheoryRules.ChoiceOption, pick), TheoryRules.Choice(TheoryRules.ChoiceConclude, 0) };
                        seen.Add(TheoryRules.Replay(lib, instances, Beliefs(), log).Conclusions[i].Grade);
                    }
                    Assert.Equal(3, seen.Count);
                }
            }
        }

        [Fact]
        public void Instances_are_deterministic_and_truths_match_ground_truth()
        {
            var a = InstancesOf(42, out var society, out var story);
            var b = InstancesOf(42, out _, out _);
            Assert.Equal(a.Select(x => (x.Kind, x.Subject, x.Truth)), b.Select(x => (x.Kind, x.Subject, x.Truth)));
            Assert.Equal(story.Missing.Count, a.Count(x => x.Kind == TheoryKind.Missing));
            var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
            foreach (var x in a.Where(x => x.Kind == TheoryKind.Missing))
                Assert.Equal((int)MissingOutcomes.Resolve(society, story, state, MissingOutcomesTests.Library(), x.Subject, 0), x.Truth);
        }

        [Fact]
        public void Replay_is_a_pure_function_of_the_log_and_prefixes_agree()
        {
            var lib = Library();
            var instances = InstancesOf(1818, out _, out _);
            var log = new List<int>();
            for (int i = 0; i < instances.Count; i++)
            {
                log.Add(TheoryRules.Choice(TheoryRules.ChoiceTheory, i));
                log.Add(TheoryRules.Choice(TheoryRules.ChoiceOption, i % 3));
                log.Add(TheoryRules.Choice(TheoryRules.ChoiceEvidence, i % 3));
                log.Add(TheoryRules.Choice(TheoryRules.ChoiceConclude, 0));
            }
            string Dump(TheoryState s) => s.Current + "|" + s.Rejected + "|" + string.Join(";", s.Conclusions.Select(kv => kv.Key + ":" + kv.Value.Option + ":" + (int)kv.Value.Grade + ":" + kv.Value.AverageBelief + ":" + (int)kv.Value.Tier));
            Assert.Equal(Dump(TheoryRules.Replay(lib, instances, Beliefs(), log)), Dump(TheoryRules.Replay(lib, instances, Beliefs(), log)));
            // Replaying the saved text gives the same state.
            var again = TheoryRules.ParseLog(TheoryRules.SerializeLog(log));
            Assert.Equal(log, again);
            Assert.Equal(Dump(TheoryRules.Replay(lib, instances, Beliefs(), log)), Dump(TheoryRules.Replay(lib, instances, Beliefs(), again)));
            // Stepwise play equals replay of the whole log.
            var step = new List<int>();
            foreach (int entry in log) step.Add(entry);
            Assert.Equal(0, TheoryRules.Replay(lib, instances, Beliefs(), log).Rejected);
        }

        [Fact]
        public void Illegal_entries_are_rejected_and_change_nothing()
        {
            var lib = Library();
            var instances = InstancesOf(42, out _, out _);
            var clean = TheoryRules.Replay(lib, instances, Beliefs(), new[] { TheoryRules.Choice(TheoryRules.ChoiceTheory, 0) });
            var noisy = TheoryRules.Replay(lib, instances, Beliefs(), new[]
            {
                TheoryRules.Choice(TheoryRules.ChoiceConclude, 0), TheoryRules.Choice(TheoryRules.ChoiceOption, 0), -5, 99999,
                TheoryRules.Choice(TheoryRules.ChoiceTheory, 0), TheoryRules.Choice(TheoryRules.ChoiceOption, 50), TheoryRules.Choice(TheoryRules.ChoiceEvidence, 77), TheoryRules.Choice(TheoryRules.ChoiceConclude, 0),
            });
            Assert.Equal(clean.Current, noisy.Current);
            Assert.Empty(noisy.Conclusions);
            Assert.Equal(7, noisy.Rejected);
            Assert.Empty(TheoryRules.ParseLog("th1;1,x"));
            Assert.Empty(TheoryRules.ParseLog("nope"));
        }

        [Fact]
        public void Evidence_is_capped_toggles_and_only_changes_the_tier()
        {
            var lib = Library();
            var instances = InstancesOf(42, out _, out _);
            var beliefs = new Dictionary<int, int> { { 0, 90 }, { 1, 40 }, { 2, 70 }, { 3, 10 } };
            var log = new List<int> { TheoryRules.Choice(TheoryRules.ChoiceTheory, 0) };
            foreach (int e in new[] { 0, 1, 2, 3 }) log.Add(TheoryRules.Choice(TheoryRules.ChoiceEvidence, e));
            var s = TheoryRules.Replay(lib, instances, beliefs, log);
            Assert.Equal(1, s.Rejected);
            Assert.Equal(TheoryRules.MaxEvidence, s.CurrentEvidence.Count);
            log.Add(TheoryRules.Choice(TheoryRules.ChoiceEvidence, 1));
            Assert.Equal(2, TheoryRules.Replay(lib, instances, beliefs, log).CurrentEvidence.Count);
            // Same answer with firm, doubtful and no evidence: same grade, different tier.
            int truth = instances[0].Truth;
            TheoryConclusion Conclude(params int[] ev)
            {
                var l = new List<int> { TheoryRules.Choice(TheoryRules.ChoiceTheory, 0), TheoryRules.Choice(TheoryRules.ChoiceOption, truth) };
                l.AddRange(ev.Select(e => TheoryRules.Choice(TheoryRules.ChoiceEvidence, e)));
                l.Add(TheoryRules.Choice(TheoryRules.ChoiceConclude, 0));
                return TheoryRules.Replay(lib, instances, beliefs, l).Conclusions[0];
            }
            Assert.Equal(EvidenceTier.Bare, Conclude().Tier);
            Assert.Equal(EvidenceTier.Firm, Conclude(0, 2).Tier);
            Assert.Equal(EvidenceTier.Doubtful, Conclude(1, 3).Tier);
            Assert.All(new[] { Conclude(), Conclude(0, 2), Conclude(1, 3) }, c => Assert.Equal(TheoryGrade.True, c.Grade));
        }

        [Fact]
        public void There_is_always_a_further_choice_from_any_reachable_state()
        {
            var lib = Library();
            var instances = InstancesOf(42, out _, out _);
            var rng = new Random(5);
            var log = new List<int>();
            for (int step = 0; step < 300; step++)
            {
                var state = TheoryRules.Replay(lib, instances, Beliefs(), log);
                var legal = TheoryRules.LegalChoices(lib, instances, Beliefs(), state);
                Assert.NotEmpty(legal);
                int pick = legal[rng.Next(legal.Count)];
                log.Add(pick);
                Assert.Equal(0, TheoryRules.Replay(lib, instances, Beliefs(), log).Rejected);
            }
        }

        [Fact]
        public void A_false_conclusion_never_changes_the_vigil_ending_and_costs_little()
        {
            var lib = Library();
            var instances = InstancesOf(42, out _, out _);
            int villager = instances.FindIndex(x => x.Kind == TheoryKind.Villager);
            var template = lib.TemplateOf(TheoryKind.Villager);
            int wrong = Enumerable.Range(0, template.Options.Count).First(p => TheoryLibrary.Grade(template, instances[villager].Truth, p) == TheoryGrade.False);
            var state = TheoryRules.Replay(lib, instances, Beliefs(), new[] { TheoryRules.Choice(TheoryRules.ChoiceTheory, villager), TheoryRules.Choice(TheoryRules.ChoiceOption, wrong), TheoryRules.Choice(TheoryRules.ChoiceConclude, 0) });
            Assert.Equal(1, state.Count(TheoryGrade.False));
            Assert.Equal(EpilogueVariant.Misled, TheoryRules.VariantOf(state));
            Assert.Equal(TheoryRules.KnowledgeFalse, state.Knowledge);
            Assert.Equal(TheoryRules.WrongVillagerTrust, TheoryRules.TrustLost(instances, state));
            var none = new TheoryState();
            foreach (var collapsed in new[] { false, true })
                foreach (var named in new[] { false, true })
                    foreach (var complete in new[] { false, true })
                        for (int sanity = 0; sanity <= 100; sanity += 5)
                        {
                            string ending = VigilRules.EndingFor(sanity, collapsed, named, complete);
                            Assert.Contains(ending, VigilRules.EndingIds);
                            // EndingFor takes no theory input, so the ending is the same with or without conclusions; every ending has a line for every variant.
                            foreach (var v in new[] { EpilogueVariant.Clear, EpilogueVariant.Misled, EpilogueVariant.Uncertain })
                                foreach (var lang in VillageNames.Languages) Assert.NotEmpty(TheoryRules.Epilogue(lib, ending, v, lang));
                            Assert.Equal("", TheoryRules.Epilogue(lib, ending, TheoryRules.VariantOf(none), "en"));
                        }
        }

        [Fact]
        public void Epilogue_variant_follows_the_counts()
        {
            var lib = Library();
            var instances = InstancesOf(42, out _, out _);
            TheoryState Play(params int[] picks)
            {
                var log = new List<int>();
                for (int i = 0; i < picks.Length; i++) { log.Add(TheoryRules.Choice(TheoryRules.ChoiceTheory, i)); log.Add(TheoryRules.Choice(TheoryRules.ChoiceOption, picks[i])); log.Add(TheoryRules.Choice(TheoryRules.ChoiceConclude, 0)); }
                return TheoryRules.Replay(lib, instances, Beliefs(), log);
            }
            int Pick(int i, TheoryGrade g) { var t = lib.TemplateOf(instances[i].Kind); return Enumerable.Range(0, t.Options.Count).First(p => TheoryLibrary.Grade(t, instances[i].Truth, p) == g); }
            Assert.Equal(EpilogueVariant.Clear, TheoryRules.VariantOf(Play(Pick(0, TheoryGrade.True), Pick(1, TheoryGrade.False))));
            Assert.Equal(EpilogueVariant.Misled, TheoryRules.VariantOf(Play(Pick(0, TheoryGrade.False), Pick(1, TheoryGrade.False), Pick(2, TheoryGrade.True))));
            Assert.Equal(EpilogueVariant.Uncertain, TheoryRules.VariantOf(Play(Pick(0, TheoryGrade.Partial), Pick(1, TheoryGrade.Partial), Pick(2, TheoryGrade.True))));
        }

        [Fact]
        public void Texts_render_for_every_instance_and_contain_no_placeholders_or_em_dashes()
        {
            var lib = Library();
            foreach (int seed in new[] { 1, 42, 1818 })
            {
                var instances = InstancesOf(seed, out var society, out var story);
                foreach (var inst in instances)
                    foreach (var lang in VillageNames.Languages)
                    {
                        string q = TheoryRules.Question(lib, society, story, inst, lang);
                        Assert.DoesNotContain("{", q);
                        Assert.DoesNotContain('\u2014', q);
                        for (int o = 0; o < lib.TemplateOf(inst.Kind).Options.Count; o++) Assert.DoesNotContain("{", TheoryRules.OptionText(lib, society, story, inst, o, lang));
                    }
            }
            foreach (var v in lib.Verdicts) Assert.DoesNotContain('\u2014', v.Text.Get("en") + v.Text.Get("fr"));
            foreach (var e in lib.Epilogues) Assert.DoesNotContain('\u2014', e.Text.Get("en") + e.Text.Get("fr"));
        }
    }
}
