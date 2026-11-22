using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 26 investigation board: reveal by evidence, authored contradictions only, deterministic timeline, en and fr data.</summary>
    public class InvestigationModelTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string Data(string file) => Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", file);
        private static LoreLibrary Lore() => LoreLibrary.Parse(File.ReadAllText(Data("lore_books.json")));
        private static StatementLibrary Statements() => StatementLibrary.Parse(File.ReadAllText(Data("statements.json")));

        /// <summary>The fixed scenario of the golden data: some villagers met, journals and pages read, a clue found and statements heard.</summary>
        public static InvestigationEvidence RichEvidence()
        {
            var e = new InvestigationEvidence();
            foreach (int i in new[] { 0, 1, 2, 3, 4 }) e.Met.Add(i);
            foreach (var b in new[] { "j01", "j02", "j05", "p01", "b26", "b39", "b01" }) e.BooksRead.Add(b);
            e.ClueIds.Add("book@b39");
            e.ClueIds.Add("item@lantern");
            e.Heard.Add(new HeardStatement { Villager = 0, StatementId = "c_fisher_home", Night = 1 });
            e.Heard.Add(new HeardStatement { Villager = 3, StatementId = "lie_was_asleep", Night = 3 });
            e.Heard.Add(new HeardStatement { Villager = 1, StatementId = "c_priest_empty", Night = 4 });
            e.Heard.Add(new HeardStatement { Villager = 2, StatementId = "lie_not_me", Night = 2 });
            return e;
        }

        private static VillageStory StoryOf(int seed)
        {
            var layout = VillageLayoutGenerator.GenerateCity(GoldenParity.LoadCatalog(Root()), VillageDistricts.CityGrid, VillageDistricts.CityGrid, VillageDistricts.CityPieces, seed);
            var roster = VillagerRules.GenerateRoster(seed, layout);
            var names = VillageNames.Assign(NameLibrary.Parse(File.ReadAllText(Data("names.json"))), seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, layout);
            return VillageStory.Build(StoryLibrary.Parse(File.ReadAllText(Data("story.json"))), seed, layout, roster, names, CampaignGenerator.Generate(seed, 5).VillageName);
        }

        private static string Signature(InvestigationBoard b)
        {
            return string.Join("|", b.Cards.Select(c => c.Id + (c.Revealed ? "+" : "-") + (c.Invalidated ? "!" : ""))) + "#" + string.Join("|", b.Links.Select(l => l.Kind + l.From + l.To + l.Revealed))
                + "#" + string.Join("|", b.Contradictions.Select(c => c.PairId)) + "#" + string.Join("|", b.Timeline.Select(t => t.StatementId + t.Night + t.Minute));
        }

        [Fact]
        public void Board_is_deterministic_for_eight_seeds()
        {
            var lore = Lore(); var st = Statements();
            foreach (var seed in Seeds)
            {
                var a = InvestigationRules.Build(StoryOf(seed), lore, st, RichEvidence(), null);
                var b = InvestigationRules.Build(StoryOf(seed), lore, st, RichEvidence(), null);
                Assert.Equal(Signature(a), Signature(b));
                Assert.NotEmpty(a.Cards);
            }
        }

        [Fact]
        public void With_no_evidence_nothing_is_revealed()
        {
            var lore = Lore(); var st = Statements();
            foreach (var seed in Seeds)
            {
                var board = InvestigationRules.Build(StoryOf(seed), lore, st, new InvestigationEvidence(), null);
                Assert.DoesNotContain(board.Links, l => l.Revealed);
                Assert.DoesNotContain(board.Cards, c => c.Revealed);
                Assert.Empty(board.Contradictions);
                Assert.Empty(board.Timeline);
            }
        }

        [Fact]
        public void Evidence_reveals_its_links_and_nothing_more()
        {
            var lore = Lore(); var st = Statements(); var story = StoryOf(42);
            var e = new InvestigationEvidence();
            e.Met.Add(0);
            var board = InvestigationRules.Build(story, lore, st, e, null);
            Assert.Contains(board.Links, l => l.Kind == BoardLinkKind.VillagerHome && l.From == InvestigationRules.SuspectId(0) && l.Revealed);
            Assert.DoesNotContain(board.Links, l => l.Kind == BoardLinkKind.VillagerHome && l.From == InvestigationRules.SuspectId(1) && l.Revealed);
            Assert.DoesNotContain(board.Links, l => l.Kind == BoardLinkKind.VillagerJournal && l.Revealed);
            e.BooksRead.Add("j01");
            board = InvestigationRules.Build(story, lore, st, e, null);
            Assert.Single(board.Links, l => l.Kind == BoardLinkKind.VillagerJournal && l.Revealed);
            Assert.Contains(board.Timeline, t => t.StatementId == "j_fisher_out");
            e.BooksRead.Add("b39");
            board = InvestigationRules.Build(story, lore, st, e, null);
            Assert.Contains(board.Links, l => l.Kind == BoardLinkKind.LandmarkLegend && l.From == InvestigationRules.LandmarkId("ritual_site") && l.Revealed);
            Assert.Contains(board.Links, l => l.Kind == BoardLinkKind.ClueSubject && l.Revealed);
        }

        [Fact]
        public void Missing_person_link_reveals_when_its_page_is_read()
        {
            var lore = Lore(); var st = Statements(); var story = StoryOf(1);
            var m = story.Missing[0];
            var e = new InvestigationEvidence();
            e.BooksRead.Add(lore.Books.First(b => b.Missing == m.Id).Id);
            var board = InvestigationRules.Build(story, lore, st, e, null);
            Assert.Contains(board.Links, l => l.Kind == BoardLinkKind.VillagerMissing && l.To == InvestigationRules.VictimId(0) && l.Revealed);
            Assert.True(board.Cards.First(c => c.Id == InvestigationRules.VictimId(0)).Revealed);
        }

        [Fact]
        public void Contradiction_needs_both_statements_revealed()
        {
            var lore = Lore(); var st = Statements(); var story = StoryOf(42);
            var e = new InvestigationEvidence();
            e.BooksRead.Add("j01");
            Assert.Empty(InvestigationRules.Build(story, lore, st, e, null).Contradictions);
            e.Heard.Add(new HeardStatement { Villager = 0, StatementId = "c_fisher_home", Night = 1 });
            var board = InvestigationRules.Build(story, lore, st, e, null);
            var c = Assert.Single(board.Contradictions);
            Assert.Equal("fisher_night_out", c.PairId);
            Assert.Equal("event:j_fisher_out", c.CardA);
            Assert.Equal("event:c_fisher_home", c.CardB);
        }

        [Fact]
        public void Lie_meets_its_counterpart_and_contradictions_only_come_from_authored_pairs()
        {
            var lore = Lore(); var st = Statements(); var story = StoryOf(42);
            var board = InvestigationRules.Build(story, lore, st, RichEvidence(), null);
            var authored = new HashSet<string>(st.Contradictions.Select(c => c.Id));
            Assert.All(board.Contradictions, c => Assert.Contains(c.PairId, authored));
            Assert.Contains(board.Contradictions, c => c.PairId == "walker_on_cliff");
            Assert.Contains(board.Contradictions, c => c.PairId == "small_boots");
        }

        [Fact]
        public void Corrupted_speaker_pair_needs_the_corruption()
        {
            var lore = Lore(); var st = Statements(); var story = StoryOf(42);
            var e = new InvestigationEvidence();
            e.BooksRead.Add("j02");
            e.Heard.Add(new HeardStatement { Villager = 1, StatementId = "c_priest_empty", Night = 4 });
            Assert.DoesNotContain(InvestigationRules.Build(story, lore, st, e, null).Contradictions, c => c.PairId == "priest_pews");
            var stages = new CorruptionStage[story.Roster.Count];
            stages[1] = CorruptionStage.Uneasy;
            Assert.DoesNotContain(InvestigationRules.Build(story, lore, st, e, stages).Contradictions, c => c.PairId == "priest_pews");
            stages[1] = CorruptionStage.Corrupted;
            var board = InvestigationRules.Build(story, lore, st, e, stages);
            Assert.Contains(board.Contradictions, c => c.PairId == "priest_pews");
            Assert.True(board.Cards.First(c => c.Id == "event:c_priest_empty").Invalidated);
            Assert.True(board.Cards.First(c => c.Id == InvestigationRules.SuspectId(1)).Invalidated);
        }

        [Fact]
        public void Timeline_orders_by_night_minute_then_id_and_is_input_order_independent()
        {
            var events = new List<TimelineEvent>
            {
                new TimelineEvent { StatementId = "b", Villager = 2, Night = 2, Minute = 100 },
                new TimelineEvent { StatementId = "a", Villager = 5, Night = 2, Minute = 100 },
                new TimelineEvent { StatementId = "z", Villager = 1, Night = 1, Minute = 900 },
                new TimelineEvent { StatementId = "a", Villager = 3, Night = 2, Minute = 100 },
                new TimelineEvent { StatementId = "c", Villager = 0, Night = 2, Minute = 50 },
            };
            var ordered = InvestigationRules.OrderTimeline(events);
            Assert.Equal(new[] { "z", "c", "a", "a", "b" }, ordered.Select(t => t.StatementId));
            Assert.Equal(new[] { 1, 0, 3, 5, 2 }, ordered.Select(t => t.Villager));
            events.Reverse();
            Assert.Equal(ordered.Select(t => t.StatementId + t.Villager), InvestigationRules.OrderTimeline(events).Select(t => t.StatementId + t.Villager));
        }

        [Fact]
        public void Statement_data_is_complete_in_en_and_fr_and_consistent()
        {
            var lore = Lore(); var st = Statements();
            var text = File.ReadAllText(Data("statements.json"));
            Assert.DoesNotContain("\u2014", text);
            Assert.Equal(text, File.ReadAllText(Path.Combine(Root(), "web", "data", "statements.json")));
            foreach (var s in st.Statements)
            {
                foreach (var lang in VillageNames.Languages) Assert.False(string.IsNullOrWhiteSpace(s.Text.Get(lang)), s.Id + " " + lang);
                Assert.NotEqual(s.Text.Get("en"), s.Text.Get("fr"));
                if (s.Source == StatementSource.Lore) Assert.NotNull(lore.Find(s.Ref));
                if (s.Source == StatementSource.Journal) Assert.Contains(lore.Books, b => b.Role == s.Role);
                if (s.Source == StatementSource.Clue && s.Ref.StartsWith(LoreBookRules.ClueIdPrefix)) Assert.NotNull(lore.Find(s.Ref.Substring(LoreBookRules.ClueIdPrefix.Length)));
            }
            foreach (var c in st.Contradictions) foreach (var lang in VillageNames.Languages) Assert.False(string.IsNullOrWhiteSpace(c.Reason.Get(lang)));
            foreach (var id in VillageSociety.LieStatementIds)
            {
                var s = st.Find(id);
                Assert.NotNull(s);
                Assert.Equal(StatementSource.Chat, s.Source);
                Assert.Equal("", s.Role);
                Assert.Contains(st.Contradictions, c => c.A == id || c.B == id);
            }
            foreach (StatementSource src in Enum.GetValues(typeof(StatementSource))) Assert.Contains(st.Statements, s => s.Source == src);
        }

        [Fact]
        public void Card_titles_exist_in_both_languages()
        {
            var lore = Lore(); var st = Statements(); var story = StoryOf(42);
            var nameLib = NameLibrary.Parse(File.ReadAllText(Data("names.json")));
            var board = InvestigationRules.Build(story, lore, st, RichEvidence(), null);
            foreach (var c in board.Cards)
                foreach (var lang in VillageNames.Languages) Assert.False(string.IsNullOrWhiteSpace(InvestigationRules.CardTitle(c, story, lore, st, nameLib, lang)), c.Id + " " + lang);
        }

        [Fact]
        public void Malformed_statement_data_names_the_problem()
        {
            var ex = Assert.Throws<FormatException>(() => StatementLibrary.Parse("{\"statements\":[{\"id\":\"x\",\"source\":\"dream\"}],\"contradictions\":[]}"));
            Assert.Contains("unknown source", ex.Message);
        }
    }
}
