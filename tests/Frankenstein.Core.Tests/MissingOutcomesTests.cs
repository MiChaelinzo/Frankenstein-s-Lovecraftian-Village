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

        // ---- Round 34, spec 170: aftermath and source reliability ----

        private static List<MissingOutcome> Forced(VillageStory story)
        {
            var list = new List<MissingOutcome>();
            for (int k = 0; k < story.Missing.Count; k++) list.Add(new[] { MissingOutcome.Recruited, MissingOutcome.Displaced, MissingOutcome.Dead }[k % 3]);
            return list;
        }

        private static List<int> LeadsOf(VillageStory story, int leads) => Enumerable.Repeat(leads, story.Missing.Count).ToList();

        [Fact]
        public void Aftermath_waits_for_its_resolve_night_and_for_the_outcome_reveal_and_is_deterministic()
        {
            var lib = Library();
            for (int seed = 1; seed <= 20; seed++)
            {
                VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var forced = Forced(story);
                for (int k = 0; k < story.Missing.Count; k++)
                {
                    int resolve = MissingOutcomes.ResolveNight(story.Seed, k);
                    Assert.InRange(resolve, MissingOutcomes.FirstResolveNight, MissingOutcomes.FirstResolveNight + MissingOutcomes.ResolveNightSpan - 1);
                    Assert.Equal(resolve, MissingOutcomes.ResolveNight(story.Seed, k));
                }
                Assert.Empty(MissingOutcomes.Aftermath(story, lib, forced, LeadsOf(story, MissingOutcomes.MaxLeads), 1));
                Assert.Empty(MissingOutcomes.Aftermath(story, lib, forced, LeadsOf(story, MissingOutcomes.OutcomeAtLeads - 1), 12));
                var late = MissingOutcomes.Aftermath(story, lib, forced, LeadsOf(story, MissingOutcomes.OutcomeAtLeads), 12);
                Assert.Equal(forced.Count(o => o == MissingOutcome.Recruited || o == MissingOutcome.Displaced), late.Count);
                var again = MissingOutcomes.Aftermath(story, lib, forced, LeadsOf(story, MissingOutcomes.OutcomeAtLeads), 12);
                Assert.Equal(late.Select(a => a.Id + a.Text.Get("fr") + a.Minute), again.Select(a => a.Id + a.Text.Get("fr") + a.Minute));
                foreach (var a in late)
                {
                    Assert.Equal(a.Kind == AftermathKind.PlantedStatement ? MissingOutcomes.PlantedReliability : MissingOutcomes.DisplacedReliability, a.Reliability);
                    Assert.False(a.Text.Get("en").Contains('\u2014') || a.Text.Get("fr").Contains('\u2014'));
                }
            }
        }

        [Fact]
        public void Sightings_are_limited_to_the_nights_after_resolving()
        {
            for (int seed = 1; seed <= 40; seed++)
                for (int k = 0; k < 3; k++)
                {
                    int resolve = MissingOutcomes.ResolveNight(seed, k);
                    for (int night = 1; night <= 20; night++)
                        if (night < resolve || night >= resolve + MissingOutcomes.SightingNights) Assert.False(MissingOutcomes.SightingOn(seed, k, night));
                }
            Assert.Contains(Enumerable.Range(1, 40), seed => Enumerable.Range(1, 12).Any(n => MissingOutcomes.SightingOn(seed, 0, n)));
        }

        [Fact]
        public void Recruits_change_the_mythos_run_only_when_supplied()
        {
            var lib = MythosSimulationTests.Library();
            bool differed = false;
            for (int seed = 1; seed <= 40; seed++)
            {
                var society = VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var plain = MythosSimulationTests.GridInputs();
                var baseline = MythosSimulation.Run(society, story, lib, plain, MythosSimulationTests.Nights);
                var none = MythosSimulationTests.GridInputs();
                none.RecruitedByNight = new int[MythosSimulationTests.Nights];
                Assert.Equal(Signature(baseline), Signature(MythosSimulation.Run(society, story, lib, none, MythosSimulationTests.Nights)));
                var recruits = MythosSimulationTests.GridInputs();
                recruits.RecruitedByNight = MissingOutcomes.RecruitedByNight(story.Seed, Forced(story), MythosSimulationTests.Nights);
                var boosted = MythosSimulation.Run(society, story, lib, recruits, MythosSimulationTests.Nights);
                Assert.True(boosted.AtNight(MythosSimulationTests.Nights).CultMembers.Sum(m => m.Count) >= baseline.AtNight(MythosSimulationTests.Nights).CultMembers.Sum(m => m.Count), "seed " + seed);
                if (Signature(boosted) != Signature(baseline)) differed = true;
            }
            Assert.True(differed);
        }

        private static string Signature(MythosState state)
        {
            return string.Join("|", state.Nights.Select(n => string.Join(",", n.CultMembers.Select(m => string.Join(".", m))) + ";" + string.Join(",", n.Events.Select(e => (int)e.Kind + ":" + e.Subject + ":" + e.Other)) + ";" + n.Exposed.Count));
        }

        [Fact]
        public void Reliability_follows_source_corruption_memory_and_displaced_contradiction()
        {
            int clue = InvestigationRules.ReliabilityScore(InvestigationRules.BaseReliability(StatementSource.Clue), false, MemoryOutcome.None, false);
            Assert.Equal(InvestigationRules.ClueReliability, clue);
            Assert.True(clue > InvestigationRules.BaseReliability(StatementSource.Journal) && InvestigationRules.BaseReliability(StatementSource.Journal) > InvestigationRules.BaseReliability(StatementSource.Lore) && InvestigationRules.BaseReliability(StatementSource.Lore) > InvestigationRules.BaseReliability(StatementSource.Chat));
            Assert.Equal(clue - InvestigationRules.CorruptedReliabilityPenalty, InvestigationRules.ReliabilityScore(clue, true, MemoryOutcome.None, false));
            Assert.Equal(clue - InvestigationRules.MemoryReliabilityPenalty, InvestigationRules.ReliabilityScore(clue, false, MemoryOutcome.Paranoid, false));
            Assert.Equal(clue - InvestigationRules.MemoryReliabilityPenalty, InvestigationRules.ReliabilityScore(clue, false, MemoryOutcome.Obsessed, false));
            Assert.Equal(clue, InvestigationRules.ReliabilityScore(clue, false, MemoryOutcome.Loyal, false));
            Assert.Equal(clue - InvestigationRules.DisplacedContradictionPenalty, InvestigationRules.ReliabilityScore(clue, false, MemoryOutcome.None, true));
            Assert.Equal(0, InvestigationRules.ReliabilityScore(10, true, MemoryOutcome.Paranoid, true));
        }

        [Fact]
        public void Displaced_aftermath_contradicts_a_kin_or_witness_statement_and_lowers_its_reliability()
        {
            var lib = Library();
            var lore = Lore();
            var statements = StatementLibrary.Parse(File.ReadAllText(DataFile("statements.json")));
            bool found = false;
            for (int seed = 1; seed <= 60 && !found; seed++)
            {
                VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var forced = Enumerable.Repeat(MissingOutcome.Displaced, story.Missing.Count).ToList();
                var evidence = InvestigationModelTests.SynergyEvidence();
                for (int k = 0; k < story.Missing.Count; k++) { var one = FullEvidence(story, lore, k); foreach (var b in one.BooksRead) evidence.BooksRead.Add(b); foreach (var c in one.ClueIds) evidence.ClueIds.Add(c); foreach (var m in one.Met) evidence.Met.Add(m); foreach (var h in one.Heard) if (!evidence.Heard.Exists(x => x.StatementId == h.StatementId)) evidence.Heard.Add(h); }
                var plain = InvestigationRules.Build(story, lore, statements, evidence, null, null, 0, null, null, null);
                var after = MissingOutcomes.Aftermath(story, lib, forced, LeadsOf(story, MissingOutcomes.MaxLeads), 12);
                var board = InvestigationRules.Build(story, lore, statements, evidence, null, null, 0, null, null, after);
                Assert.Equal(plain.Scores.Count, board.Scores.Count);
                foreach (var c in board.Contradictions.Where(c => c.PairId.StartsWith(InvestigationRules.AftermathPairPrefix, StringComparison.Ordinal)))
                {
                    found = true;
                    string other = c.CardB.Substring(InvestigationRules.EventPrefix.Length);
                    int before = plain.Reliabilities.First(r => r.StatementId == other).Reliability;
                    Assert.Equal(Math.Max(0, before - InvestigationRules.DisplacedContradictionPenalty), board.Reliabilities.First(r => r.StatementId == other).Reliability);
                }
                Assert.Equal(after.Count, board.Reliabilities.Count - plain.Reliabilities.Count);
            }
            Assert.True(found, "no seed produced a displaced contradiction");
        }

        [Fact]
        public void Reliabilities_are_listed_for_every_revealed_statement_and_leave_scores_unchanged()
        {
            var lore = Lore();
            var statements = StatementLibrary.Parse(File.ReadAllText(DataFile("statements.json")));
            VillageSocietyTests.SocietyOf(1, out var story, out _);
            var board = InvestigationRules.Build(story, lore, statements, InvestigationModelTests.SynergyEvidence(), null);
            Assert.Equal(board.Scores.Select(x => x.StatementId), board.Reliabilities.Select(x => x.StatementId));
            foreach (var r in board.Reliabilities) Assert.InRange(r.Reliability, 0, 100);
        }
    }
}
