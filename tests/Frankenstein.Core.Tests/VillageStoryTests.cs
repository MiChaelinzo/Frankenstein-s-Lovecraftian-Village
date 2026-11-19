using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 24 narrative layer: families, house ownership, missing persons across lore pages, chat and journals, rumors and legends. Seeded and free of drift.</summary>
    public class VillageStoryTests
    {
        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string DataPath(string file) => Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", file);
        private static StoryLibrary Library() => StoryLibrary.Parse(File.ReadAllText(DataPath("story.json")));
        private static LoreLibrary Lore() => LoreLibrary.Parse(File.ReadAllText(DataPath("lore_books.json")));
        private static NameLibrary NameLib() => NameLibrary.Parse(File.ReadAllText(DataPath("names.json")));

        private static List<PlacedPiece> City(int seed) =>
            VillageLayoutGenerator.GenerateCity(GoldenParity.LoadCatalog(Root()), VillageDistricts.CityGrid, VillageDistricts.CityGrid, VillageDistricts.CityPieces, seed);

        private static VillageStory StoryOf(int seed, out List<PlacedPiece> layout)
        {
            layout = City(seed);
            var roster = VillagerRules.GenerateRoster(seed, layout);
            var names = VillageNames.Assign(NameLib(), seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, layout);
            return VillageStory.Build(Library(), seed, layout, roster, names, CampaignGenerator.Generate(seed, 5).VillageName);
        }

        [Fact]
        public void Web_copy_of_the_data_file_is_identical()
        {
            Assert.Equal(File.ReadAllText(DataPath("story.json")), File.ReadAllText(Path.Combine(Root(), "web", "data", "story.json")));
        }

        [Fact]
        public void Data_file_is_complete_bilingual_and_free_of_em_dashes()
        {
            var lib = Library();
            Assert.Equal(12, lib.Families.Count);
            foreach (var id in VillageDistricts.Ids) Assert.True(lib.Districts.ContainsKey(id), id);
            foreach (var id in VillageLandmarks.Ids) Assert.NotNull(lib.Legends.FirstOrDefault(l => l.Id == id));
            Assert.Equal(5, lib.Missing.Count);
            for (int band = 0; band < VillageStory.Stages; band++)
                for (int tier = 0; tier < VillageStory.Tiers; tier++)
                    Assert.True(lib.Rumors.Count(r => r.Band == band && r.Tier == tier) >= 2, band + "/" + tier);
            Assert.DoesNotContain("\u2014", File.ReadAllText(DataPath("story.json")));
            Assert.DoesNotContain("\u2014", File.ReadAllText(DataPath("lore_books.json")));
        }

        [Fact]
        public void Every_roster_surname_has_a_family()
        {
            var lib = Library();
            for (int seed = 1; seed <= 40; seed++)
                foreach (var v in VillagerRules.GenerateRoster(seed, City(seed)))
                    Assert.True(lib.FamilyIndex(VillageStory.SurnameOf(v.Name)) >= 0, v.Name);
        }

        [Fact]
        public void Story_is_deterministic_and_ties_homes_families_and_missing_persons_together()
        {
            foreach (var seed in new[] { 1, 42, 1818, 7 })
            {
                List<PlacedPiece> layout;
                var a = StoryOf(seed, out layout);
                var b = StoryOf(seed, out layout);
                Assert.Equal(a.Owners, b.Owners);
                Assert.Equal(a.Missing.Select(m => m.Id + m.KinIndex + m.WitnessIndex), b.Missing.Select(m => m.Id + m.KinIndex + m.WitnessIndex));
                Assert.Equal(VillageStory.MissingCount, a.Missing.Count);
                Assert.Equal(a.Missing.Count, a.Missing.Select(m => m.Id).Distinct().Count());
                foreach (var v in a.Roster)
                {
                    var fam = a.Families.Single(f => f.Members.Contains(v.Index));
                    Assert.Equal(fam.Surname, VillageStory.SurnameOf(v.Name));
                    Assert.True(fam.HomePiece >= 0);
                    Assert.Equal(fam.SurnameIndex, a.Owners[fam.HomePiece]);
                }
                foreach (var m in a.Missing)
                {
                    var fam = a.Families[m.FamilyIndex];
                    Assert.True(fam.HomePiece >= 0);
                    if (m.KinIndex >= 0) Assert.Contains(m.KinIndex, fam.Members);
                    if (m.WitnessIndex >= 0) Assert.DoesNotContain(m.WitnessIndex, fam.Members);
                }
                foreach (var f in a.Families) Assert.StartsWith("house", layout[f.HomePiece].Id);
            }
        }

        [Fact]
        public void Different_seeds_tell_different_stories()
        {
            var sets = new HashSet<string>();
            List<PlacedPiece> layout;
            for (int seed = 1; seed <= 12; seed++) sets.Add(string.Join(",", StoryOf(seed, out layout).Missing.Select(m => m.Id)));
            Assert.True(sets.Count >= 4);
        }

        [Fact]
        public void Journals_and_missing_pages_lie_only_where_the_story_puts_them()
        {
            var lore = Lore();
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                List<PlacedPiece> layout;
                var story = StoryOf(seed, out layout);
                int grid = VillageDistricts.CityGrid;
                var without = LoreBookRules.Place(seed, grid, grid, layout, lore);
                Assert.DoesNotContain(without, p => p.Place == "journal" || lore.Find(p.BookId).Missing.Length > 0);
                var with = LoreBookRules.Place(seed, grid, grid, layout, lore, story);
                var journals = with.Where(p => p.Place == "journal").ToList();
                Assert.Equal(story.Roster.Count, journals.Count);
                foreach (var j in journals)
                {
                    var book = lore.Find(j.BookId);
                    var owner = story.Roster[story.JournalOwner(book)];
                    var home = layout[owner.HomeIndex];
                    // the journal lies within a few metres of the owner's front door
                    double cx = (home.X + home.SizeX / 2.0) * VillageDressing.Cell, cz = (home.Z + home.SizeZ / 2.0) * VillageDressing.Cell;
                    Assert.True(Math.Abs(j.X - cx) < 8 && Math.Abs(j.Z - cz) < 8, book.Id);
                }
                foreach (var m in story.Missing) Assert.Contains(with, p => lore.Find(p.BookId).Missing == m.Id);
                Assert.Equal(with.Select(p => p.BookId + p.X + p.Z), LoreBookRules.Place(seed, grid, grid, layout, lore, story).Select(p => p.BookId + p.X + p.Z));
            }
        }

        [Fact]
        public void Journal_text_names_the_house_the_neighbour_and_the_missing_person()
        {
            var lore = Lore();
            List<PlacedPiece> layout;
            var story = StoryOf(1818, out layout);
            foreach (var lang in new[] { "en", "fr" })
                foreach (var book in lore.Books.Where(b => b.Role.Length > 0))
                {
                    var text = story.BookText(book, lang);
                    Assert.DoesNotContain("{", text);
                    var v = story.Roster[story.JournalOwner(book)];
                    if (book.Texts["en"].Contains("{home}")) Assert.Contains(story.PieceName(v.HomeIndex, lang, VillageStory.SurnameOf(v.Name)), text);
                    var nb = story.Roster[story.NeighbourOf(v.Index)];
                    Assert.NotEqual(v.Index, nb.Index);
                }
            foreach (var m in story.Missing)
            {
                var given = story.Library.Missing[m.DataIndex].Given.Get("en");
                bool told = false;
                foreach (var book in lore.Books.Where(b => b.Role.Length > 0)) told |= story.BookText(book, "en").Contains(given);
                Assert.True(told || (m.KinIndex < 0 && m.WitnessIndex < 0), m.Id);
            }
        }

        [Fact]
        public void Gossip_is_seeded_complete_and_tells_the_missing_arc_by_stage()
        {
            List<PlacedPiece> layout;
            var story = StoryOf(42, out layout);
            var kinds = new HashSet<int>();
            foreach (var v in story.Roster)
                for (int night = 1; night <= 5; night++)
                {
                    int stage = VillageStory.StageOfNight(night, 5);
                    var g = story.GossipFor(v, night, stage);
                    Assert.Equal(g, story.GossipFor(v, night, stage));
                    kinds.Add(g.Kind);
                    foreach (var lang in new[] { "en", "fr" })
                    {
                        var text = story.GossipText(g, v, night, night % 4, lang);
                        Assert.False(string.IsNullOrWhiteSpace(text));
                        Assert.DoesNotContain("{", text);
                    }
                }
            Assert.True(kinds.Count >= 3);
            var m = story.Missing[0];
            var lines = Enumerable.Range(0, 3).Select(s => story.GossipText(new StoryGossip { Kind = VillageStory.GossipKindMissing, Subject = 0, Stage = s }, story.Roster[0], 1, 0, "en")).ToList();
            Assert.Equal(3, lines.Distinct().Count());
            Assert.Contains(story.Library.Missing[m.DataIndex].Given.Get("en"), lines[0]);
        }

        [Fact]
        public void Kin_and_witness_always_bring_the_missing_person_up()
        {
            List<PlacedPiece> layout;
            var story = StoryOf(1818, out layout);
            foreach (var m in story.Missing)
                foreach (var idx in new[] { m.KinIndex, m.WitnessIndex }.Where(i => i >= 0))
                    for (int night = 1; night <= 6; night++)
                    {
                        var g = story.GossipFor(story.Roster[idx], night, 0);
                        Assert.True(g.Kind == VillageStory.GossipKindMissing || g.Kind == VillageStory.GossipKindRumor);
                    }
        }

        [Fact]
        public void Rumors_change_with_the_night_and_the_dread_tier()
        {
            List<PlacedPiece> layout;
            var story = StoryOf(1, out layout);
            var byTier = Enumerable.Range(0, 4).Select(t => story.RumorText(3, 1, t, "en")).ToList();
            Assert.Equal(4, byTier.Distinct().Count());
            var byStage = Enumerable.Range(0, 3).Select(s => story.RumorText(3, s, 2, "en")).ToList();
            Assert.Equal(3, byStage.Distinct().Count());
            Assert.Equal(story.RumorText(2, 1, 1, "fr"), story.RumorText(2, 1, 1, "fr"));
            Assert.Contains(story.VillageName, string.Join(" ", Enumerable.Range(0, 4).SelectMany(t => Enumerable.Range(0, 3).Select(s => story.RumorText(1, s, t, "en")))));
        }

        [Fact]
        public void Render_replaces_known_keys_once_and_keeps_unknown_ones()
        {
            var vars = new Dictionary<string, string> { { "a", "{b}" }, { "b", "B" } };
            Assert.Equal("x {b} y {c} {", VillageStory.Render("x {a} y {c} {", vars));
        }

        [Fact]
        public void Chat_has_a_village_topic_that_only_a_lucid_villager_answers()
        {
            List<PlacedPiece> layout;
            var story = StoryOf(1, out layout);
            Assert.Equal(4, VillagerRules.ChatTopics);
            var v = story.Roster[0];
            var r = VillagerRules.Chat(1, v, 600, 0.0f, 1, 3, 0, 0, 80);
            Assert.True(r.Available);
            Assert.Equal(3, r.Topic);
            Assert.Equal("village", r.HintId);
            Assert.Equal(3, VillagerRules.Chat(1, v, 600, 0.0f, 1, 7, 0, 0, 80).Topic);
        }

        [Fact]
        public void Campaign_nights_carry_their_story_stage_and_malformed_data_is_rejected()
        {
            var c = CampaignGenerator.Generate(5, 5);
            for (int i = 0; i < c.Nights.Count; i++) Assert.Equal(VillageStory.StageOfNight(i + 1, 5), c.Nights[i].Stage);
            Assert.Throws<FormatException>(() => StoryLibrary.Parse("{\"families\":[]}"));
            var ex = Assert.Throws<FormatException>(() => LoreLibrary.Parse("{\"books\":[{\"id\":\"j99\",\"place\":\"journal\",\"en\":{},\"fr\":{}}]}"));
            Assert.Contains("j99", ex.Message);
        }
    }
}
