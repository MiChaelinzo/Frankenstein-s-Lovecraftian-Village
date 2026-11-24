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
            foreach (var place in lib.Places)
            foreach (var d in place.Discoveries)
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
                Assert.Contains(board.Links, l => l.Kind == BoardLinkKind.ClueSubject && l.From == card.Id && l.To == InvestigationRules.LandmarkId(place.Anchor));
                Assert.Contains(board.Scores, s => s.StatementId == d.StatementId);
                Assert.Contains(board.Cards, c => c.Id == InvestigationRules.EventId(d.StatementId) && c.Revealed);
            }
            var plain = InvestigationRules.Build(story, lore, statements, new InvestigationEvidence(), null);
            var withLib = InvestigationRules.Build(story, lore, statements, new InvestigationEvidence(), null, null, 0, lib);
            Assert.Equal(plain.Cards.Count, withLib.Cards.Count);
            Assert.Equal(plain.Links.Count, withLib.Links.Count);
        }

        private static PlaceData Forest() { return Library().Find(VillagePlaces.Forest); }

        private static List<PlacePlacement> Standing(PlaceLibrary lib, int seed, int grid)
        {
            var placed = new List<PlacePlacement>();
            foreach (var data in lib.Places) placed.Add(VillagePlaces.Place(data, seed, grid, grid, placed));
            return placed;
        }

        [Fact]
        public void Every_place_stands_in_bounds_clear_of_landmarks_the_city_and_each_other_for_every_seed()
        {
            var lib = Library();
            foreach (int seed in Seeds())
                foreach (int grid in Grids)
                {
                    var placed = new List<PlacePlacement>();
                    foreach (var data in lib.Places)
                    {
                        var p = VillagePlaces.Place(data, seed, grid, grid, placed);
                        Assert.Equal("", VillagePlaces.Check(data, p, seed, grid, grid, placed));
                        Assert.Equal(p.Entrance, VillagePlaces.Leave(p, PlaceExit.Door));
                        placed.Add(p);
                        var again = VillagePlaces.Place(data, seed, grid, grid, placed.Take(placed.Count - 1).ToList());
                        Assert.Equal(p.X, again.X); Assert.Equal(p.Z, again.Z);
                    }
                }
        }

        [Fact]
        public void Forest_placement_varies_with_the_seed_and_props_stay_inside_the_footprint()
        {
            var data = Forest();
            var seen = new HashSet<string>();
            foreach (int seed in Seeds())
            {
                var p = VillagePlaces.Place(data, seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, null);
                seen.Add(p.X.ToString("R") + "," + p.Z.ToString("R"));
                foreach (var item in VillagePlaces.Dressing(data, p))
                {
                    double dx = item.X - p.X, dz = item.Z - p.Z;
                    Assert.True(Math.Sqrt(dx * dx + dz * dz) <= p.Radius);
                    Assert.True(VillagePlaces.PointInBounds(seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, item.X, item.Z));
                }
            }
            Assert.True(seen.Count > 10);
            for (int t = 0; t < VillagePlaces.Tiers; t++) Assert.True(VillagePlaces.WithinBudget(data, t));
        }

        [Fact]
        public void Lantern_markers_lead_back_to_the_entrance_and_pass_every_discovery()
        {
            var data = Forest();
            Assert.Empty(Manor().Lanterns);
            Assert.True(data.Lanterns.Count >= 4);
            foreach (int seed in Seeds())
            {
                int grid = VillageDistricts.CityGrid;
                var p = VillagePlaces.Place(data, seed, grid, grid, null);
                var lanterns = VillagePlaces.LanternPoints(data, p);
                Assert.Equal(data.Lanterns.Count, lanterns.Count);
                for (int i = 1; i < lanterns.Count; i++)
                    Assert.True(Math.Sqrt(Math.Pow(lanterns[i][0] - lanterns[i - 1][0], 2) + Math.Pow(lanterns[i][1] - lanterns[i - 1][1], 2)) <= VillagePlaces.LanternGap + 1e-9);
                var last = lanterns[lanterns.Count - 1];
                Assert.True(Math.Sqrt(Math.Pow(last[0] - p.Entrance[0], 2) + Math.Pow(last[1] - p.Entrance[1], 2)) <= VillagePlaces.LanternGap + 1e-9);
                foreach (var d in data.Discoveries)
                {
                    var at = VillagePlaces.DiscoveryPoint(p, d);
                    Assert.Contains(lanterns, l => Math.Sqrt(Math.Pow(l[0] - at[0], 2) + Math.Pow(l[1] - at[1], 2)) <= VillagePlaces.LanternReach);
                }
                foreach (var l in lanterns) Assert.True(VillagePlaces.PointInBounds(seed, grid, grid, l[0], l[1]));
                Assert.Equal(p.Entrance, VillagePlaces.Leave(p, PlaceExit.Door));
            }
            int glowing = data.Parts.Count(part => part.Glow > 0 && part.Id.StartsWith("lantern_glass_", StringComparison.Ordinal));
            Assert.Equal(data.Lanterns.Count, glowing);
        }

        [Fact]
        public void Hunting_trail_runs_from_the_lit_paths_to_the_entrance_inside_the_world()
        {
            var data = Forest();
            Assert.Empty(VillagePlaces.HuntingTrail(Manor(), VillagePlaces.Place(Manor(), 1, 24, 24, null), 1, 24, 24));
            foreach (int seed in Seeds())
                foreach (int grid in Grids)
                {
                    var p = VillagePlaces.Place(data, seed, grid, grid, null);
                    var pts = VillagePlaces.HuntingTrail(data, p, seed, grid, grid);
                    Assert.True(pts.Count <= (int)(VillagePlaces.MaxTrailLength / VillagePlaces.TrailSpacing) + 1);
                    foreach (var pt in pts) Assert.True(VillagePlaces.PointInBounds(seed, grid, grid, pt[0], pt[1]));
                    if (pts.Count > 0)
                    {
                        var last = pts[pts.Count - 1];
                        Assert.True(Math.Sqrt(Math.Pow(last[0] - p.Entrance[0], 2) + Math.Pow(last[1] - p.Entrance[1], 2)) <= VillagePlaces.TrailSpacing * 1.5 + 1e-9);
                    }
                    var again = VillagePlaces.HuntingTrail(data, p, seed, grid, grid);
                    Assert.Equal(pts.Count, again.Count);
                    Assert.Equal(pts.Count, VillagePlaces.TrailDressing(data, p, seed, grid, grid).Count);
                }
        }

        [Fact]
        public void Forest_trail_is_nonempty_for_some_seeds()
        {
            var data = Forest();
            Assert.Contains(Seeds(), seed => VillagePlaces.HuntingTrail(data, VillagePlaces.Place(data, seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, null), seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid).Count > 0);
        }

        [Fact]
        public void Hidden_hollow_is_revealed_only_by_the_missing_person_trail_clue()
        {
            var data = Forest();
            var hollow = data.Discoveries.Single(d => d.Id == "hidden_hollow");
            Assert.Equal("place@forest_trail", hollow.Requires);
            Assert.False(VillagePlaces.Revealed(hollow, null));
            Assert.False(VillagePlaces.Revealed(hollow, new List<string> { "place@forest_ritual_circle" }));
            Assert.True(VillagePlaces.Revealed(hollow, new List<string> { "place@forest_trail" }));
            Assert.All(data.Discoveries.Where(d => d.Id != "hidden_hollow"), d => Assert.True(VillagePlaces.Revealed(d, null)));
            var text = DataText();
            Assert.Contains("requires", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(text.Replace("\"requires\": \"place@forest_trail\"", "\"requires\": \"place@nowhere\""))).Message);
            Assert.Contains("lantern", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(text.Replace("\"z\": -3.0\n    },\n    {\n     \"x\": -0.5", "\"z\": -30.0\n    },\n    {\n     \"x\": -0.5"))).Message);
        }

        [Fact]
        public void Forest_clues_earn_ritual_and_investigation_and_cult_discovery_and_one_lead()
        {
            var lib = Library();
            var e = new InvestigationEvidence();
            e.ClueIds.Add("place@forest_ritual_circle"); e.ClueIds.Add("place@forest_trail"); e.ClueIds.Add("place@forest_hollow");
            Assert.Equal(new[] { "cult_discovery", "investigation", "ritual" }, InvestigationRules.KnowledgeSources(e, lib).OrderBy(x => x, StringComparer.Ordinal).ToArray());
            var lore = MissingOutcomesTests.Lore();
            foreach (int seed in new[] { 1, 42, 1818, -7 })
            {
                VillageSocietyTests.SocietyOf(seed, out var story, out _);
                int target = VillagePlaces.TrailMissing(seed, VillagePlaces.Forest, story.Missing.Count);
                Assert.InRange(target, 0, story.Missing.Count - 1);
                var trail = new InvestigationEvidence(); trail.ClueIds.Add("place@forest_trail");
                var circle = new InvestigationEvidence(); circle.ClueIds.Add("place@forest_ritual_circle"); circle.ClueIds.Add("place@forest_hollow");
                for (int k = 0; k < story.Missing.Count; k++)
                {
                    Assert.Equal(MissingOutcomes.CountLeads(story, lore, trail, k) + (k == target ? 1 : 0), MissingOutcomes.CountLeads(story, lore, trail, k, lib));
                    Assert.Equal(MissingOutcomes.CountLeads(story, lore, circle, k), MissingOutcomes.CountLeads(story, lore, circle, k, lib));
                }
            }
        }

        private static PlaceData Catacomb() { return Library().Find(VillagePlaces.Catacomb); }

        [Fact]
        public void Catacomb_graph_is_seeded_connected_has_a_way_back_and_varies()
        {
            var seen = new HashSet<string>();
            var sizes = new HashSet<int>();
            foreach (int seed in Seeds())
            {
                var g = PlaceGraph.Generate(seed, 3);
                Assert.Equal(g.Dump(seed), PlaceGraph.Generate(seed, 3).Dump(seed));
                Assert.InRange(g.Rooms.Count, PlaceGraph.MinRooms, PlaceGraph.Cols * PlaceGraph.Rows);
                Assert.True(g.Connected(), "connected seed " + seed);
                Assert.Equal(g.Rooms.Count - 1 + g.Loops, g.Edges.Count);
                foreach (var r in g.Rooms)
                {
                    var path = g.PathBack(r.Cell);
                    Assert.Equal(r.Depth + 1, path.Count);
                    Assert.Equal(r.Cell, path[0]);
                    Assert.Equal(PlaceGraph.EntranceCell, path[path.Count - 1]);
                    for (int i = 0; i + 1 < path.Count; i++) Assert.Contains(g.Edges, e => (e[0] == path[i] && e[1] == path[i + 1]) || (e[1] == path[i] && e[0] == path[i + 1]));
                }
                Assert.Empty(g.PathBack(PlaceGraph.Cols * PlaceGraph.Rows));
                foreach (var role in PlaceGraph.Roles) Assert.Single(g.Rooms, r => r.Role == role);
                Assert.Single(g.Rooms, r => r.Role == PlaceGraph.EntranceRole);
                Assert.Equal(0, g.RoomWithRole(PlaceGraph.EntranceRole).Depth);
                seen.Add(g.Dump(seed).Substring(g.Dump(seed).IndexOf('|')));
                sizes.Add(g.Rooms.Count);
            }
            Assert.True(seen.Count > 10, "different seeds should give different graphs");
            Assert.True(sizes.Count > 1);
            Assert.StartsWith("catacomb seed=1 rooms=", PlaceGraph.Generate(1, 3).Dump(1));
        }

        [Fact]
        public void Catacomb_stands_clear_with_its_graph_inside_the_footprint_and_a_way_back_to_the_entrance()
        {
            var lib = Library();
            var data = lib.Find(VillagePlaces.Catacomb);
            Assert.True(data.Procedural);
            Assert.Equal("catacombs", data.Anchor);
            foreach (int seed in Seeds())
                foreach (int grid in Grids)
                {
                    var placed = Standing(lib, seed, grid);
                    var p = placed.Single(x => x.Id == VillagePlaces.Catacomb);
                    Assert.Equal("", VillagePlaces.Check(data, p, seed, grid, grid, placed.Where(x => x != p).ToList()));
                    Assert.Equal(PlaceGraph.Generate(seed, 3).Dump(seed), p.Graph.Dump(seed));
                    Assert.Equal(p.Entrance, VillagePlaces.Leave(p, PlaceExit.Door));
                    foreach (var r in p.Graph.Rooms)
                    {
                        var w = VillagePlaces.ToWorld(p, r.X, r.Z);
                        Assert.True(Math.Sqrt((w[0] - p.X) * (w[0] - p.X) + (w[1] - p.Z) * (w[1] - p.Z)) + PlaceGraph.RoomHalf * Math.Sqrt(2.0) <= p.Radius + 1e-9, "room inside the footprint");
                        Assert.True(VillagePlaces.PointInBounds(seed, grid, grid, w[0], w[1]));
                    }
                    var entranceRoom = p.Graph.RoomAt(PlaceGraph.EntranceCell);
                    var door = VillagePlaces.Enter(p);
                    Assert.True(Math.Abs(door[0] - VillagePlaces.ToWorld(p, entranceRoom.X, entranceRoom.Z)[0]) <= PlaceGraph.RoomHalf + 1e-9, "the door opens into the entrance room");
                    for (int t = 0; t < VillagePlaces.Tiers; t++)
                    {
                        Assert.True(VillagePlaces.TotalTriangles(data, p, t) <= data.Budget[t], "budget tier " + t);
                        if (t > 0) Assert.True(VillagePlaces.TotalTriangles(data, p, t) > VillagePlaces.TotalTriangles(data, p, t - 1));
                    }
                }
        }

        [Fact]
        public void Catacomb_discoveries_sit_in_their_role_rooms_and_the_catacombs_have_a_lore_book()
        {
            var data = Catacomb();
            var lore = MissingOutcomesTests.Lore();
            Assert.Contains(lore.Books, b => b.Place == "catacombs");
            foreach (int seed in new[] { 1, 42, 1818 })
            {
                var p = VillagePlaces.Place(data, seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, null);
                foreach (var d in data.Discoveries)
                {
                    var room = p.Graph.RoomWithRole(d.Room);
                    Assert.NotNull(room);
                    var at = VillagePlaces.DiscoveryPoint(p, d);
                    var centre = VillagePlaces.ToWorld(p, room.X, room.Z);
                    Assert.Equal(centre[0], at[0]); Assert.Equal(centre[1], at[1]);
                }
            }
            Assert.Contains("graph role", Assert.Throws<FormatException>(() => PlaceLibrary.Parse(DataText().Replace("\"room\": \"prison\"", "\"room\": \"nowhere\""))).Message);
        }

        [Fact]
        public void Dimensional_tear_needs_eldritch_science_and_a_night_that_shows_the_door()
        {
            var know = KnowledgeLibrary.Parse(File.ReadAllText(DataPath("knowledge.json")));
            var tear = Catacomb().Discoveries.Single(d => d.Id == "dimensional_tear");
            Assert.Equal("dimensional_gateways", tear.RequiresBenefit);
            Assert.Equal("door_appearing", tear.RequiresEffect);
            Assert.Contains(tear.RequiresBenefit, know.Tiers[4].Benefits);
            Assert.Equal("eldritch_science", know.Tiers[4].Id);
            Assert.Contains(know.Effects, e => e.Id == tear.RequiresEffect && e.MinTier <= 4);
            int shown = 0, hidden = 0;
            foreach (int seed in new[] { 1, 42, 1818, -7 })
                for (int night = 1; night <= 8; night++)
                    for (int tier = 0; tier <= KnowledgeLibrary.MaxTier; tier++)
                    {
                        bool open = VillagePlaces.Revealed(tear, new string[0], know, seed, night, tier);
                        if (tier < 4) Assert.False(open, "below eldritch_science");
                        else if (open) { shown++; Assert.Contains("door_appearing", RealityDistortion.For(know, seed, night, tier)); }
                        else if (tier >= 4) hidden++;
                    }
            Assert.True(shown > 0 && hidden > 0, "some nights show the tear and some do not");
            Assert.False(VillagePlaces.Revealed(tear, new string[0], null, 1, 1, 5));
            Assert.True(VillagePlaces.Revealed(Catacomb().Discoveries.Single(d => d.Id == "forbidden_texts"), null, know, 1, 1, 0));
        }

        [Fact]
        public void Catacomb_texts_prison_and_tear_feed_knowledge_the_board_and_one_lead()
        {
            var lib = Library();
            var data = Catacomb();
            var prison = data.Discoveries.Single(d => d.Id == "ancient_prison");
            Assert.Equal("place@catacomb_texts", prison.Requires);
            Assert.False(VillagePlaces.Revealed(prison, null));
            Assert.True(VillagePlaces.Revealed(prison, new List<string> { "place@catacomb_texts" }));
            var e = new InvestigationEvidence();
            e.ClueIds.Add("place@catacomb_texts"); e.ClueIds.Add("place@catacomb_tear"); e.ClueIds.Add("place@catacomb_prison");
            Assert.Equal(new[] { "catacombs", "cult_discovery", "mythos_event" }, InvestigationRules.KnowledgeSources(e, lib).OrderBy(x => x, StringComparer.Ordinal).ToArray());
            var lore = MissingOutcomesTests.Lore();
            foreach (int seed in new[] { 1, 42, 1818, -7 })
            {
                VillageSocietyTests.SocietyOf(seed, out var story, out _);
                int target = VillagePlaces.TrailMissing(seed, VillagePlaces.Catacomb, story.Missing.Count);
                Assert.InRange(target, 0, story.Missing.Count - 1);
                var prisonOnly = new InvestigationEvidence(); prisonOnly.ClueIds.Add("place@catacomb_prison");
                var others = new InvestigationEvidence(); others.ClueIds.Add("place@catacomb_texts"); others.ClueIds.Add("place@catacomb_tear");
                for (int k = 0; k < story.Missing.Count; k++)
                {
                    Assert.Equal(MissingOutcomes.CountLeads(story, lore, prisonOnly, k) + (k == target ? 1 : 0), MissingOutcomes.CountLeads(story, lore, prisonOnly, k, lib));
                    Assert.Equal(MissingOutcomes.CountLeads(story, lore, others, k), MissingOutcomes.CountLeads(story, lore, others, k, lib));
                }
            }
            Assert.NotEqual(VillagePlaces.TrailMissing(1, VillagePlaces.Forest, 7) * 100 + VillagePlaces.TrailMissing(42, VillagePlaces.Forest, 7), -1);
        }

        private static PlaceData Mine() { return Library().Find(VillagePlaces.Mine); }

        [Fact]
        public void Mine_graph_is_its_own_seeded_stream_named_for_the_mine_with_a_way_back()
        {
            var data = Mine();
            Assert.True(data.Procedural);
            Assert.Equal("standing_stones", data.Anchor);
            var dumps = new HashSet<string>();
            foreach (int seed in Seeds())
            {
                var g = PlaceGraph.Generate(seed, 4);
                Assert.True(g.Connected());
                foreach (var r in g.Rooms)
                {
                    var path = g.PathBack(r.Cell);
                    Assert.Equal(r.Depth + 1, path.Count);
                    Assert.Equal(PlaceGraph.EntranceCell, path[path.Count - 1]);
                }
                foreach (var role in PlaceGraph.Roles) Assert.Single(g.Rooms, r => r.Role == role);
                var p = VillagePlaces.Place(data, seed, 24, 24, null);
                Assert.Equal("mine", p.Graph.Theme);
                string dump = p.Graph.Dump(seed);
                Assert.StartsWith("mine seed=" + seed + " rooms=", dump);
                Assert.Equal(g.Dump(seed).Substring(g.Dump(seed).IndexOf('|')), dump.Substring(dump.IndexOf('|')));
                dumps.Add(dump.Substring(dump.IndexOf('|')));
            }
            Assert.True(dumps.Count > 10);
        }

        [Fact]
        public void Mine_stands_clear_of_landmarks_the_city_and_other_places_with_a_way_back_for_many_seeds_and_both_grids()
        {
            var lib = Library();
            var data = lib.Find(VillagePlaces.Mine);
            for (int seed = -40; seed < 400; seed++)
                foreach (int grid in Grids)
                {
                    var placed = Standing(lib, seed, grid);
                    var p = placed.Single(x => x.Id == VillagePlaces.Mine);
                    Assert.Equal("", VillagePlaces.Check(data, p, seed, grid, grid, placed.Where(x => x != p).ToList()));
                    Assert.True(VillagePlaces.RoundTrip(p));
                    Assert.Equal(p.Entrance, VillagePlaces.Leave(p, PlaceExit.Door));
                    foreach (var r in p.Graph.Rooms)
                    {
                        var w = VillagePlaces.ToWorld(p, r.X, r.Z);
                        Assert.True(Math.Sqrt((w[0] - p.X) * (w[0] - p.X) + (w[1] - p.Z) * (w[1] - p.Z)) + PlaceGraph.RoomHalf * Math.Sqrt(2.0) <= p.Radius + 1e-9, "room inside the footprint");
                    }
                    for (int t = 0; t < VillagePlaces.Tiers; t++)
                    {
                        Assert.True(VillagePlaces.TotalTriangles(data, p, t) <= data.Budget[t], "budget tier " + t);
                        if (t > 0) Assert.True(VillagePlaces.TotalTriangles(data, p, t) > VillagePlaces.TotalTriangles(data, p, t - 1));
                    }
                }
        }

        [Fact]
        public void Mine_geometry_has_emissive_crystals_and_water_with_the_catacombs_part_counts_and_cheap_pyramids()
        {
            var g = PlaceGraph.Generate(42, 4);
            g.Theme = VillagePlaces.Mine;
            var parts = g.Parts();
            Assert.Equal(g.Rooms.Count * 4 + g.Edges.Count * 2 + 3, parts.Count);
            Assert.Equal(g.Rooms.Count, parts.Count(x => x.Tier == 2 && x.Glow == 1));
            Assert.Contains(parts, x => x.Id.StartsWith("lake_") && x.Glow == 1);
            Assert.Contains(parts, x => x.Id.StartsWith("vein_") && x.Glow == 1 && x.Taper == 0.0);
            Assert.All(parts, x => Assert.Equal(x.Taper > 0.0 ? 10 : 8, VillagePlaces.TrianglesOf(x)));
        }

        [Fact]
        public void Mine_veins_resonance_deep_tunnel_and_lake_feed_knowledge_the_board_one_lead_and_the_bay_evidence()
        {
            var lib = Library();
            var data = Mine();
            var know = KnowledgeLibrary.Parse(File.ReadAllText(DataPath("knowledge.json")));
            var statements = File.ReadAllText(DataPath("statements.json"));
            Assert.Equal(new[] { "crystal_veins:ruins:False", "vein_resonance:mythos_event:False", "deep_tunnel:cult_discovery:True", "underground_lake:investigation:False" }, data.Discoveries.Select(d => d.Id + ":" + d.Source + ":" + d.Lead).ToArray());
            foreach (var d in data.Discoveries) Assert.Contains("\"id\": \"" + d.StatementId + "\"", statements);
            var veins = new[] { "place@mine_veins" };
            var res = data.Discoveries.Single(d => d.Id == "vein_resonance");
            Assert.False(VillagePlaces.Revealed(res, new string[0], know, 1, 1, 5));
            int shown = 0, hidden = 0;
            foreach (int seed in new[] { 1, 42, 1818, -7 })
                for (int night = 1; night <= 8; night++)
                    for (int tier = 0; tier <= KnowledgeLibrary.MaxTier; tier++)
                    {
                        bool open = VillagePlaces.Revealed(res, veins, know, seed, night, tier);
                        if (tier < 3) Assert.False(open);
                        else if (open) { shown++; Assert.Contains("altered_board_link", RealityDistortion.For(know, seed, night, tier)); }
                        else hidden++;
                    }
            Assert.True(shown > 0 && hidden > 0);
            Assert.True(VillagePlaces.Revealed(data.Discoveries.Single(d => d.Id == "crystal_veins"), null, know, 1, 1, 0));
            Assert.False(VillagePlaces.Revealed(data.Discoveries.Single(d => d.Id == "deep_tunnel"), new string[0], know, 1, 1, 5));
            Assert.True(VillagePlaces.Revealed(data.Discoveries.Single(d => d.Id == "deep_tunnel"), veins, know, 1, 1, 0));
            var lake = data.Discoveries.Single(d => d.Id == "underground_lake");
            Assert.Equal("new_deduction_the_bay", lake.RequiresBenefit);
            Assert.False(VillagePlaces.Revealed(lake, veins, know, 1, 1, 4));
            Assert.True(VillagePlaces.Revealed(lake, veins, know, 1, 1, 5));
            Assert.False(VillagePlaces.Revealed(lake, new string[0], know, 1, 1, 5));
            var e = new InvestigationEvidence();
            foreach (var d in data.Discoveries) e.ClueIds.Add(d.ClueId);
            Assert.Equal(new[] { "cult_discovery", "investigation", "mythos_event", "ruins" }, InvestigationRules.KnowledgeSources(e, lib).OrderBy(x => x, StringComparer.Ordinal).ToArray());
            var lore = MissingOutcomesTests.Lore();
            foreach (int seed in new[] { 1, 42, 1818, -7 })
            {
                VillageSocietyTests.SocietyOf(seed, out var story, out _);
                int target = VillagePlaces.TrailMissing(seed, VillagePlaces.Mine, story.Missing.Count);
                Assert.InRange(target, 0, story.Missing.Count - 1);
                var only = new InvestigationEvidence(); only.ClueIds.Add("place@mine_deep");
                var rest = new InvestigationEvidence();
                foreach (var id in new[] { "place@mine_veins", "place@mine_resonance", "place@mine_lake" }) rest.ClueIds.Add(id);
                for (int k = 0; k < story.Missing.Count; k++)
                {
                    Assert.Equal(MissingOutcomes.CountLeads(story, lore, only, k) + (k == target ? 1 : 0), MissingOutcomes.CountLeads(story, lore, only, k, lib));
                    Assert.Equal(MissingOutcomes.CountLeads(story, lore, rest, k), MissingOutcomes.CountLeads(story, lore, rest, k, lib));
                }
            }
        }

        [Fact]
        public void All_four_places_together_stand_valid_and_each_feeds_knowledge_the_board_a_missing_trail_and_theory_evidence()
        {
            var lib = Library();
            var lore = MissingOutcomesTests.Lore();
            var statements = StatementLibrary.Parse(File.ReadAllText(DataPath("statements.json")));
            Assert.Equal(new[] { VillagePlaces.Manor, VillagePlaces.Forest, VillagePlaces.Catacomb, VillagePlaces.Mine }, lib.Places.Select(p => p.Id).ToArray());
            foreach (int seed in new[] { 1, 42, 1818, -7, 123456789 })
                foreach (int grid in Grids)
                {
                    var placed = new List<PlacePlacement>();
                    VillageSocietyTests.SocietyOf(seed, out var story, out _);
                    foreach (var data in lib.Places)
                    {
                        var p = VillagePlaces.Place(data, seed, grid, grid, placed);
                        Assert.Equal("", VillagePlaces.Check(data, p, seed, grid, grid, placed));
                        Assert.True(VillagePlaces.InBounds(p, seed, grid, grid), data.Id + " bounds");
                        Assert.True(VillagePlaces.RoundTrip(p), data.Id + " round trip");
                        Assert.Equal(p.Entrance, VillagePlaces.Leave(p, PlaceExit.Door));
                        Assert.Equal(p.Door, VillagePlaces.Enter(p));
                        Assert.Null(VillagePlaces.OverlappingPlace(p, placed));
                        placed.Add(p);

                        var all = new InvestigationEvidence();
                        foreach (var d in data.Discoveries) all.ClueIds.Add(d.ClueId);
                        Assert.Contains(InvestigationRules.KnowledgeSources(all, lib), s => data.Discoveries.Any(d => d.Source == s));
                        foreach (var d in data.Discoveries) Assert.Equal(d.Source, VillagePlaces.SourceOfClue(lib, d.ClueId));

                        var board = InvestigationRules.Build(story, lore, statements, all, null, null, 0, lib);
                        foreach (var d in data.Discoveries)
                        {
                            Assert.True(board.Cards.Single(c => c.Id == InvestigationRules.ClueCardId(d.ClueId)).Revealed, d.ClueId + " on the board");
                            Assert.Contains(board.Scores, s => s.StatementId == d.StatementId);
                        }

                        Assert.Contains(data.Discoveries, d => d.Lead);
                        int target = VillagePlaces.TrailMissing(seed, data.Id, story.Missing.Count);
                        Assert.InRange(target, 0, story.Missing.Count - 1);
                        Assert.True(VillagePlaces.LeadsFor(lib, all.ClueIds, seed, story.Missing.Count, target) >= 1, data.Id + " leads");
                        Assert.Equal(MissingOutcomes.CountLeads(story, lore, all, target) + VillagePlaces.LeadsFor(lib, all.ClueIds, seed, story.Missing.Count, target), MissingOutcomes.CountLeads(story, lore, all, target, lib));
                    }
                }
        }
    }
}
