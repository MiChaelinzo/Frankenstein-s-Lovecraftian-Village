using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 30 (spec 163): each missing person resolves to exactly one outcome, shaped by the mythos run and by the player's leads.</summary>
    public class MissingOutcomesTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };

        private static string DataFile(string name)
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", name);
        }

        public static OutcomeLibrary Library() => OutcomeLibrary.Parse(File.ReadAllText(DataFile("outcomes.json")));
        public static LoreLibrary Lore() => LoreLibrary.Parse(File.ReadAllText(DataFile("lore_books.json")));

        /// <summary>Evidence with every lead for one missing person: page read and found, kin and witness met, two statements heard from the kin.</summary>
        public static InvestigationEvidence FullEvidence(VillageStory story, LoreLibrary lore, int missingIndex)
        {
            var e = new InvestigationEvidence();
            var m = story.Missing[missingIndex];
            foreach (var b in lore.Books.Where(b => b.Missing == m.Id)) { e.BooksRead.Add(b.Id); e.ClueIds.Add(LoreBookRules.ClueIdPrefix + b.Id); }
            if (m.KinIndex >= 0) { e.Met.Add(m.KinIndex); e.Heard.Add(new HeardStatement { Villager = m.KinIndex, StatementId = "lie_not_me", Night = 1 }); e.Heard.Add(new HeardStatement { Villager = m.KinIndex, StatementId = "lie_saw_nothing", Night = 2 }); }
            if (m.WitnessIndex >= 0) e.Met.Add(m.WitnessIndex);
            return e;
        }

        private static MissingOutcome Resolve(int seed, int missing, int leads, out VillageStory story)
        {
            var society = VillageSocietyTests.SocietyOf(seed, out story, out _);
            var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
            return MissingOutcomes.Resolve(society, story, state, Library(), missing, leads);
        }

        [Fact]
        public void Library_parses_and_rejects_excluding_hidden()
        {
            var lib = Library();
            Assert.Equal(OutcomeLibrary.OutcomeIds.Length, lib.Epitaphs.Count);
            var story = StoryLibrary.Parse(File.ReadAllText(DataFile("story.json")));
            foreach (var c in lib.Constraints) Assert.True(story.Missing.Any(m => m.Id == c.Missing), c.Missing);
            string json = File.ReadAllText(DataFile("outcomes.json")).Replace("\"excludes\": [\"escaped\"]", "\"excludes\": [\"hidden\"]");
            Assert.Throws<FormatException>(() => OutcomeLibrary.Parse(json));
            Assert.Throws<FormatException>(() => OutcomeLibrary.Parse("[]"));
        }

        [Fact]
        public void Every_missing_person_resolves_to_exactly_one_known_outcome_for_many_seeds()
        {
            for (int seed = 1; seed <= 60; seed++)
            {
                var society = VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
                for (int k = 0; k < story.Missing.Count; k++)
                    for (int leads = 0; leads <= MissingOutcomes.MaxLeads; leads++)
                    {
                        var o = MissingOutcomes.Resolve(society, story, state, Library(), k, leads);
                        Assert.True(Enum.IsDefined(typeof(MissingOutcome), o));
                        Assert.Equal(o, MissingOutcomes.Resolve(society, story, state, Library(), k, leads));
                    }
            }
        }

        [Fact]
        public void More_leads_never_move_a_survivable_outcome_away_from_survivable()
        {
            foreach (int seed in Enumerable.Range(1, 80).Concat(Seeds))
            {
                var society = VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
                for (int k = 0; k < story.Missing.Count; k++)
                    for (int leads = 0; leads < MissingOutcomes.MaxLeads; leads++)
                        if (MissingOutcomes.IsSurvivable(MissingOutcomes.Resolve(society, story, state, Library(), k, leads)))
                            Assert.True(MissingOutcomes.IsSurvivable(MissingOutcomes.Resolve(society, story, state, Library(), k, leads + 1)), "seed " + seed + " missing " + k + " leads " + leads);
            }
        }

        [Fact]
        public void Leads_beyond_the_cap_change_nothing()
        {
            var society = VillageSocietyTests.SocietyOf(42, out var story, out _);
            var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
            for (int k = 0; k < story.Missing.Count; k++)
                Assert.Equal(MissingOutcomes.Resolve(society, story, state, Library(), k, MissingOutcomes.MaxLeads), MissingOutcomes.Resolve(society, story, state, Library(), k, 99));
        }

        [Fact]
        public void No_outcome_contradicts_an_authored_constraint()
        {
            var lib = Library();
            foreach (int seed in Enumerable.Range(1, 120))
            {
                var society = VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
                for (int k = 0; k < story.Missing.Count; k++)
                {
                    var c = lib.ConstraintFor(story.Missing[k].Id);
                    for (int leads = 0; leads <= MissingOutcomes.MaxLeads; leads++)
                    {
                        var o = MissingOutcomes.Resolve(society, story, state, lib, k, leads);
                        if (c != null) Assert.DoesNotContain(o, c.Excludes);
                    }
                }
            }
        }

        [Fact]
        public void No_authored_statement_names_a_missing_person()
        {
            // Audit of Data/statements.json: no statement speaks about a missing person, so none can contradict an outcome.
            // If one is added, give the person a constraint in Data/outcomes.json and replace this check.
            var story = StoryLibrary.Parse(File.ReadAllText(DataFile("story.json")));
            var statements = StatementLibrary.Parse(File.ReadAllText(DataFile("statements.json")));
            foreach (var s in statements.Statements)
                foreach (var m in story.Missing)
                    foreach (var lang in VillageNames.Languages)
                        Assert.DoesNotContain(m.Given.Get(lang), s.Text.Get(lang));
        }

        [Fact]
        public void Recruited_needs_a_cult()
        {
            var society = VillageSocietyTests.SocietyOf(7, out var story, out _);
            var noCult = new MythosState { Seed = society.Seed };
            for (int k = 0; k < story.Missing.Count; k++)
            {
                Assert.Equal(0, MissingOutcomes.Weights(society, story, noCult, Library(), k, 0)[(int)MissingOutcome.Recruited]);
                for (int leads = 0; leads <= MissingOutcomes.MaxLeads; leads++)
                    Assert.NotEqual(MissingOutcome.Recruited, MissingOutcomes.Resolve(society, story, noCult, Library(), k, leads));
            }
            var withCult = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
            Assert.True(MissingOutcomes.Weights(society, story, withCult, null, 0, 0)[(int)MissingOutcome.Recruited] > 0);
        }

        [Fact]
        public void Hidden_always_has_weight()
        {
            foreach (int seed in Seeds)
            {
                var society = VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var state = MythosSimulation.Run(society, story, MythosSimulationTests.Library(), MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
                for (int k = 0; k < story.Missing.Count; k++) Assert.True(MissingOutcomes.Weights(society, story, state, Library(), k, 0)[(int)MissingOutcome.Hidden] > 0);
            }
        }

        [Fact]
        public void Reveal_is_nothing_then_taken_then_outcome()
        {
            var society = VillageSocietyTests.SocietyOf(42, out var story, out _);
            var lib = Library();
            foreach (var lang in VillageNames.Languages)
            {
                var none = MissingOutcomes.Reveal(story, lib, MissingOutcome.Dead, 0, 0, lang);
                Assert.Equal(RevealLevel.Nothing, none.Level);
                Assert.Equal("", none.Text);
                var taken = MissingOutcomes.Reveal(story, lib, MissingOutcome.Dead, 0, MissingOutcomes.TakenAtLeads, lang);
                Assert.Equal(RevealLevel.Taken, taken.Level);
                Assert.NotEqual("", taken.Text);
                foreach (var o in Enum.GetValues(typeof(MissingOutcome)).Cast<MissingOutcome>())
                {
                    var r = MissingOutcomes.Reveal(story, lib, o, 0, MissingOutcomes.OutcomeAtLeads, lang);
                    Assert.Equal(RevealLevel.Outcome, r.Level);
                    Assert.DoesNotContain("{", r.Text);
                    Assert.NotEqual(taken.Text, r.Text);
                }
                Assert.DoesNotContain("{", taken.Text);
            }
        }

        [Fact]
        public void Leads_count_the_evidence_and_cap()
        {
            var society = VillageSocietyTests.SocietyOf(42, out var story, out _);
            var lore = Lore();
            Assert.Equal(0, MissingOutcomes.CountLeads(story, lore, new InvestigationEvidence(), 0));
            Assert.Equal(0, MissingOutcomes.CountLeads(story, lore, null, 0));
            for (int k = 0; k < story.Missing.Count; k++)
            {
                int full = MissingOutcomes.CountLeads(story, lore, FullEvidence(story, lore, k), k);
                Assert.InRange(full, 1, MissingOutcomes.MaxLeads);
                var kinOnly = new InvestigationEvidence();
                if (story.Missing[k].KinIndex >= 0) kinOnly.Met.Add(story.Missing[k].KinIndex);
                Assert.Equal(story.Missing[k].KinIndex >= 0 ? 1 : 0, MissingOutcomes.CountLeads(story, lore, kinOnly, k));
            }
        }
    }
}
