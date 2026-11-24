using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 31 (spec 164): the place model and the Abandoned Manor. Placement, bounds, overlap, round trip, triangle budget, and the feeds into knowledge, board, outcomes and theory evidence.</summary>
    public class VillagePlacesTests
    {
        private static readonly int[] Grids = { 24, VillageDistricts.CityGrid };

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string DataPath(string name) { return Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", name); }
        public static string DataText() { return File.ReadAllText(DataPath("places.json")); }
        public static PlaceLibrary Library() { return PlaceLibrary.Parse(DataText()); }
        private static PlaceData Manor() { return Library().Find(VillagePlaces.Manor); }
        private static IEnumerable<int> Seeds() { return Enumerable.Range(-20, 80).Concat(new[] { 1818, 123456789, int.MaxValue, int.MinValue }); }

        [Fact]
        public void Web_data_copy_matches_the_package_data()
        {
            Assert.Equal(File.ReadAllBytes(DataPath("places.json")), File.ReadAllBytes(Path.Combine(Root(), "web", "data", "places.json")));
        }

        [Fact]
        public void Placement_is_deterministic_and_varies_with_the_seed()
        {
            var data = Manor();
            var seen = new HashSet<string>();
            foreach (int seed in Seeds())
                foreach (int grid in Grids)
                {
                    var a = VillagePlaces.Place(data, seed, grid, grid, null);
                    var b = VillagePlaces.Place(data, seed, grid, grid, null);
                    Assert.Equal(a.X, b.X); Assert.Equal(a.Z, b.Z); Assert.Equal(a.FaceX, b.FaceX); Assert.Equal(a.FaceZ, b.FaceZ);
                    Assert.Equal(a.Entrance, b.Entrance); Assert.Equal(a.TunnelExit, b.TunnelExit);
                    seen.Add(a.X.ToString("R") + "," + a.Z.ToString("R"));
                }
            Assert.True(seen.Count > 10, "different seeds should give different sites");
        }

        [Fact]
        public void Every_placement_is_in_bounds_clear_of_landmarks_and_the_city_and_has_a_way_back()
        {
            var data = Manor();
            foreach (int seed in Seeds())
                foreach (int grid in Grids)
                {
                    var p = VillagePlaces.Place(data, seed, grid, grid, null);
                    Assert.True(VillagePlaces.InBounds(p, seed, grid, grid), "bounds seed " + seed);
                    Assert.Null(VillagePlaces.OverlappingLandmark(p, seed, grid, grid));
                    Assert.False(VillagePlaces.OverlapsCity(p, grid, grid));
                    Assert.True(VillagePlaces.RoundTrip(p));
                    Assert.Equal("", VillagePlaces.Check(data, p, seed, grid, grid, null));
                    Assert.Equal(p.Entrance, VillagePlaces.Leave(p, PlaceExit.Door));
                    Assert.Equal(p.Door, VillagePlaces.Enter(p));
                    foreach (var item in VillagePlaces.Dressing(data, p))
                    {
                        double dx = item.X - p.X, dz = item.Z - p.Z;
                        Assert.True(Math.Sqrt(dx * dx + dz * dz) <= p.Radius, item.Kind + " inside the footprint");
                        Assert.True(VillagePlaces.PointInBounds(seed, grid, grid, item.X, item.Z));
                    }
                }
        }

        [Fact]
        public void Check_names_each_failure()
        {
            var data = Manor();
            int seed = 42, grid = VillageDistricts.CityGrid;
            var good = VillagePlaces.Place(data, seed, grid, grid, null);
            Assert.Equal("out of bounds", VillagePlaces.Check(data, VillagePlaces.Build(data, seed, grid, grid, 500.0, 500.0, 0.0, 1.0), seed, grid, grid, null));
            var onLandmark = VillageLandmarks.All(seed, grid, grid).First(l => l.Id == VillageLandmarks.Grove);
            Assert.StartsWith("overlaps landmark", VillagePlaces.Check(data, VillagePlaces.Build(data, seed, grid, grid, onLandmark.X, onLandmark.Z, 0.0, 1.0), seed, grid, grid, null));
            Assert.Equal("overlaps the city", VillagePlaces.Check(data, VillagePlaces.Build(data, seed, grid, grid, 60.0, 60.0, 0.0, 1.0), seed, grid, grid, null));
            var twin = VillagePlaces.Build(data, seed, grid, grid, good.X, good.Z, good.FaceX, good.FaceZ);
            twin.Id = "other";
            Assert.Equal("overlaps place other", VillagePlaces.Check(data, good, seed, grid, grid, new List<PlacePlacement> { twin }));
            var noWay = VillagePlaces.Build(data, seed, grid, grid, good.X, good.Z, good.FaceX, good.FaceZ);
            noWay.Door = noWay.Entrance;
            Assert.False(VillagePlaces.RoundTrip(noWay));
            Assert.Equal("no way back", VillagePlaces.Check(data, noWay, seed, grid, grid, null));
        }

        [Fact]
        public void Placement_that_fits_nowhere_throws()
        {
            var json = DataText().Replace("\"radius\": 10.0", "\"radius\": 400.0");
            Assert.Throws<InvalidOperationException>(() => VillagePlaces.Place(PlaceLibrary.Parse(json).Find("manor"), 1, 24, 24, null));
        }

        [Fact]
        public void Triangle_budget_holds_at_every_tier_and_rises_with_it()
        {
            var data = Manor();
            for (int t = 0; t < VillagePlaces.Tiers; t++)
            {
                Assert.True(VillagePlaces.Triangles(data, t) > 0);
                Assert.True(VillagePlaces.WithinBudget(data, t), "tier " + t);
                if (t > 0) Assert.True(VillagePlaces.Triangles(data, t) >= VillagePlaces.Triangles(data, t - 1));
            }
            var tight = PlaceLibrary.Parse(DataText().Replace("\"low\": 200", "\"low\": 20")).Find("manor");
            Assert.False(VillagePlaces.WithinBudget(tight, 0));
            Assert.StartsWith("over the triangle budget", VillagePlaces.Check(tight, VillagePlaces.Place(Manor(), 1, 24, 24, null), 1, 24, 24, null));
        }

        [Fact]
        public void Parse_rejects_malformed_data_naming_the_field()
        {
            string text = DataText();
            Assert.Throws<FormatException>(() => PlaceLibrary.Parse("[]"));
            Assert.Throws<FormatException>(() => PlaceLibrary.Parse("{\"places\": []}"));
            Assert.Contains("anchor", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(text.Replace("\"anchor\": \"abbey\"", "\"anchor\": \"nowhere\""))).Message);
            Assert.Contains("knowledge source", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(text.Replace("\"source\": \"ruins\"", "\"source\": \"bogus\""))).Message);
            Assert.Contains("fr", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(text.Replace("\"fr\": \"Le manoir abandonne\"", "\"fr\": \"\""))).Message);
            Assert.Contains("outside its room", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(text.Replace("\"x\": -3.1", "\"x\": -30.1"))).Message);
            Assert.Contains("clue", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(text.Replace("place@manor_archives", "manor_archives"))).Message);
        }

        [Fact]
        public void Place_clues_earn_ruins_and_cult_discovery_instead_of_investigation()
        {
            var lib = Library();
            var e = new InvestigationEvidence();
            e.ClueIds.Add("place@manor_archives"); e.ClueIds.Add("place@manor_cult_records"); e.ClueIds.Add("book@b39");
            var with = InvestigationRules.KnowledgeSources(e, lib);
            Assert.Equal(new[] { "cult_discovery", "investigation", "ruins" }, with.OrderBy(s => s, StringComparer.Ordinal).ToArray());
            Assert.Equal(new[] { "investigation", "investigation", "investigation" }, InvestigationRules.KnowledgeSources(e));
            Assert.Equal(InvestigationRules.KnowledgeSources(e), InvestigationRules.KnowledgeSources(e, null));
        }

        [Fact]
        public void Tunnel_opens_at_forbidden_texts()
        {
            var know = KnowledgeLibrary.Parse(File.ReadAllText(DataPath("knowledge.json")));
            var data = Manor();
            for (int tier = 0; tier <= KnowledgeLibrary.MaxTier; tier++) Assert.Equal(tier >= 3, VillagePlaces.TunnelOpen(data, know, tier));
            Assert.Equal("forbidden_texts", know.Tiers[3].Id);
            Assert.Contains(data.TunnelBenefit, know.Tiers[3].Benefits);
            foreach (int seed in Seeds())
            {
                var p = VillagePlaces.Place(data, seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, null);
                Assert.True(VillagePlaces.PointInBounds(seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, p.TunnelExit[0], p.TunnelExit[1]));
                var cemetery = VillageLandmarks.All(seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid).First(l => l.Id == data.TunnelExitsTo);
                double dx = p.TunnelExit[0] - cemetery.X, dz = p.TunnelExit[1] - cemetery.Z;
                Assert.True(Math.Sqrt(dx * dx + dz * dz) < cemetery.Radius, "the tunnel comes up inside the cemetery");
            }
        }

        [Fact]
        public void Cult_records_are_a_lead_on_exactly_one_missing_person_chosen_by_the_seed()
        {
            var lib = Library();
            var lore = MissingOutcomesTests.Lore();
            foreach (int seed in new[] { 1, 42, 1818, -7 })
            {
                VillageSocietyTests.SocietyOf(seed, out var story, out _);
                int target = VillagePlaces.TrailMissing(seed, VillagePlaces.Manor, story.Missing.Count);
                Assert.InRange(target, 0, story.Missing.Count - 1);
                Assert.Equal(target, VillagePlaces.TrailMissing(seed, VillagePlaces.Manor, story.Missing.Count));
                var e = new InvestigationEvidence();
                e.ClueIds.Add("place@manor_cult_records");
                var archivesOnly = new InvestigationEvidence();
                archivesOnly.ClueIds.Add("place@manor_archives");
                for (int k = 0; k < story.Missing.Count; k++)
                {
                    int baseLeads = MissingOutcomes.CountLeads(story, lore, e, k);
                    Assert.Equal(baseLeads + (k == target ? 1 : 0), MissingOutcomes.CountLeads(story, lore, e, k, lib));
                    Assert.Equal(MissingOutcomes.CountLeads(story, lore, archivesOnly, k), MissingOutcomes.CountLeads(story, lore, archivesOnly, k, lib));
                }
            }
            Assert.Equal(-1, VillagePlaces.TrailMissing(1, VillagePlaces.Manor, 0));
        }

        [Fact]
        public void Place_clues_reach_the_board_the_statements_and_theory_evidence()
        {
            var lib = Library();
            var lore = MissingOutcomesTests.Lore();
            var statements = StatementLibrary.Parse(File.ReadAllText(DataPath("statements.json")));
            VillageSocietyTests.SocietyOf(42, out var story, out _);
            foreach (var d in lib.Find("manor").Discoveries)
            {
                var st = statements.Find(d.StatementId);
                Assert.NotNull(st);
                Assert.Equal(StatementSource.Clue, st.Source);
                Assert.Equal(d.ClueId, st.Ref);
                var none = InvestigationRules.Build(story, lore, statements, new InvestigationEvidence(), null, null, 0, lib);
                Assert.DoesNotContain(none.Cards, c => c.Id == InvestigationRules.ClueCardId(d.ClueId));
                var e = new InvestigationEvidence();
                e.ClueIds.Add(d.ClueId);
                var board = InvestigationRules.Build(story, lore, statements, e, null, null, 0, lib);
                var card = board.Cards.Single(c => c.Id == InvestigationRules.ClueCardId(d.ClueId));
                Assert.True(card.Revealed);
                Assert.Equal(d.Title.Get("en"), InvestigationRules.CardTitle(card, story, lore, statements, null, "en", null, lib));
                Assert.Contains(board.Links, l => l.Kind == BoardLinkKind.ClueSubject && l.From == card.Id && l.To == InvestigationRules.LandmarkId("abbey"));
                Assert.Contains(board.Scores, s => s.StatementId == d.StatementId);
                Assert.Contains(board.Cards, c => c.Id == InvestigationRules.EventId(d.StatementId) && c.Revealed);
            }
            var plain = InvestigationRules.Build(story, lore, statements, new InvestigationEvidence(), null);
            var withLib = InvestigationRules.Build(story, lore, statements, new InvestigationEvidence(), null, null, 0, lib);
            Assert.Equal(plain.Cards.Count, withLib.Cards.Count);
            Assert.Equal(plain.Links.Count, withLib.Links.Count);
        }
    }
}
