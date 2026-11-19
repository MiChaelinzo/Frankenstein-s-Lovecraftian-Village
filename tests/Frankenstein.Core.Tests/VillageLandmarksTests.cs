using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>The wider world: ten landmarks, lit paths, props, the church rise and the lore books at the landmarks.</summary>
    public class VillageLandmarksTests
    {
        private static readonly int[] Seeds = { 1, 7, 42, -7, 1818, 99999, 123456789, 2024 };
        private static readonly int[] Grids = { 24, VillageDistricts.CityGrid };

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return dir.FullName;
        }

        private static PrefabCatalog Catalog()
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_catalog.json")));
            var list = new List<CatalogEntry>();
            foreach (var e in doc.RootElement.GetProperty("entries").EnumerateArray())
                list.Add(new CatalogEntry { id = e.GetProperty("id").GetString(), category = e.GetProperty("category").GetString(), weight = e.GetProperty("weight").GetInt32(), footprintX = e.GetProperty("footprintX").GetInt32(), footprintZ = e.GetProperty("footprintZ").GetInt32(), horror = e.GetProperty("horror").GetInt32() });
            return new PrefabCatalog(list);
        }

        private static List<PlacedPiece> Layout(int seed, int grid)
        {
            return grid == VillageDistricts.CityGrid ? VillageLayoutGenerator.GenerateCity(Catalog(), grid, grid, VillageDistricts.CityPieces, seed) : VillageLayoutGenerator.Generate(Catalog(), grid, grid, 80, seed);
        }

        [Fact]
        public void Six_named_landmarks_in_a_fixed_order_with_both_languages_and_a_deterministic_world()
        {
            Assert.Equal(new[] { "cliffs", "shipwreck", "abbey", "cemetery", "marsh", "grove", "standing_stones", "hidden_cove", "ritual_site", "catacombs" }, VillageLandmarks.Ids);
            foreach (var id in VillageLandmarks.Ids) { Assert.NotEmpty(VillageLandmarks.Name(id, "en")); Assert.NotEmpty(VillageLandmarks.Name(id, "fr")); Assert.NotEqual(VillageLandmarks.Name(id, "en"), VillageLandmarks.Name(id, "fr")); }
            Assert.Equal("", VillageLandmarks.Name("nowhere", "en"));
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    var a = VillageLandmarks.All(seed, grid, grid);
                    Assert.Equal(VillageLandmarks.Ids, a.Select(l => l.Id).ToArray());
                    var b = VillageLandmarks.All(seed, grid, grid);
                    for (int i = 0; i < a.Count; i++) { Assert.Equal(a[i].X, b[i].X); Assert.Equal(a[i].Z, b[i].Z); }
                    Assert.Equal(VillageLandmarks.PathDressing(seed, grid, grid).Count, VillageLandmarks.PathDressing(seed, grid, grid).Count);
                }
            Assert.Contains(Seeds, s => VillageLandmarks.All(s, 36, 36)[2].X != VillageLandmarks.All(1, 36, 36)[2].X || VillageLandmarks.All(s, 36, 36)[2].Z != VillageLandmarks.All(1, 36, 36)[2].Z);
        }

        [Fact]
        public void Landmarks_stand_outside_the_grid_inside_the_walk_bounds_and_apart_from_each_other()
        {
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    double w = grid * VillageDressing.Cell;
                    VillageDressing.WalkBounds(seed, grid, grid, out double minX, out double maxX, out double minZ, out double maxZ);
                    var all = VillageLandmarks.All(seed, grid, grid);
                    foreach (var l in all)
                    {
                        Assert.False(l.X > 0 && l.X < w && l.Z > 0 && l.Z < w, l.Id + " inside the grid");
                        Assert.InRange(l.X, minX - 3, maxX + 3);
                        Assert.InRange(l.Z, minZ - 3, maxZ + 3);
                    }
                    for (int i = 0; i < all.Count; i++)
                        for (int j = i + 1; j < all.Count; j++)
                            Assert.True(Math.Sqrt(Math.Pow(all[i].X - all[j].X, 2) + Math.Pow(all[i].Z - all[j].Z, 2)) >= all[i].Radius + all[j].Radius, $"{all[i].Id} and {all[j].Id} overlap, seed {seed} grid {grid}");
                    foreach (var l in all) Assert.Equal(l.Id, VillageLandmarks.At(seed, grid, grid, l.X, l.Z));
                    Assert.Null(VillageLandmarks.At(seed, grid, grid, w / 2, w / 2));
                }
        }

        [Fact]
        public void Every_corruption_site_stands_inside_a_landmark_so_the_two_share_one_definition()
        {
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                    foreach (var it in CorruptionGrowth.Sites(seed, grid, grid))
                        Assert.NotNull(VillageLandmarks.At(seed, grid, grid, it.X, it.Z));
        }

        [Fact]
        public void Landmark_props_keep_clear_of_the_city_and_of_each_other()
        {
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    var layout = Layout(seed, grid);
                    var items = VillageLandmarks.Dressing(seed, grid, grid);
                    Assert.Contains(items, it => it.Kind == "shipwreck");
                    Assert.Equal(4, items.Count(it => it.Kind == "abbey_wall"));
                    Assert.Equal(4, items.Count(it => it.Kind == "abbey_pillar"));
                    foreach (var it in items)
                    {
                        if (!VillageDressing.TryCollisionHalfExtents(it, out double hx, out double hz)) continue;
                        foreach (var p in layout)
                        {
                            bool apart = it.X + hx <= p.X * VillageDressing.Cell || it.X - hx >= (p.X + p.SizeX) * VillageDressing.Cell || it.Z + hz <= p.Z * VillageDressing.Cell || it.Z - hz >= (p.Z + p.SizeZ) * VillageDressing.Cell;
                            Assert.True(apart, $"{it.Kind} overlaps a layout piece, seed {seed} grid {grid}");
                        }
                    }
                    var solids = items.Where(it => VillageDressing.TryCollisionHalfExtents(it, out double a, out double b) && it.Kind != "cliff_rock" && !it.Kind.StartsWith("church_")).ToList();
                    for (int i = 0; i < solids.Count; i++)
                        for (int j = i + 1; j < solids.Count; j++)
                        {
                            VillageDressing.TryCollisionHalfExtents(solids[i], out double ax, out double az);
                            VillageDressing.TryCollisionHalfExtents(solids[j], out double bx, out double bz);
                            bool apart = Math.Abs(solids[i].X - solids[j].X) >= ax + bx - 1e-9 || Math.Abs(solids[i].Z - solids[j].Z) >= az + bz - 1e-9;
                            Assert.True(apart, $"{solids[i].Kind} and {solids[j].Kind} overlap, seed {seed} grid {grid}");
                        }
                }
        }

        [Fact]
        public void The_round_24_places_are_named_reachable_and_hold_their_props_inside_their_radius()
        {
            var wild = new[] { VillageLandmarks.StandingStones, VillageLandmarks.HiddenCove, VillageLandmarks.RitualSite, VillageLandmarks.Catacombs };
            var kinds = new Dictionary<string, string[]>
            {
                { VillageLandmarks.StandingStones, new[] { "standing_stone" } },
                { VillageLandmarks.HiddenCove, new[] { "boat", "barrel", "crate_stack", "rope_coil" } },
                { VillageLandmarks.RitualSite, new[] { "ritual_circle", "stump", "fungus_cluster", "tentacle_sapling" } },
                { VillageLandmarks.Catacombs, new[] { "catacomb_gate", "gravestone_cross", "gravestone" } },
            };
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    var all = VillageLandmarks.All(seed, grid, grid);
                    var items = VillageLandmarks.Dressing(seed, grid, grid);
                    var solids = items.Where(it => VillageDressing.TryCollisionHalfExtents(it, out double a, out double b)).ToList();
                    foreach (var id in wild)
                    {
                        var land = all.First(l => l.Id == id);
                        Assert.NotEmpty(VillageLandmarks.Name(id, "en"));
                        Assert.NotEqual(VillageLandmarks.Name(id, "en"), VillageLandmarks.Name(id, "fr"));
                        foreach (var it in items.Where(i => kinds[id].Contains(i.Kind)))
                        {
                            double d = Math.Sqrt(Math.Pow(it.X - land.X, 2) + Math.Pow(it.Z - land.Z, 2));
                            Assert.True(d <= land.Radius, $"{it.Kind} stands {d:F1} m from {id}, radius {land.Radius}, seed {seed} grid {grid}");
                        }
                        foreach (var k in kinds[id]) Assert.Contains(items, it => it.Kind == k);
                        // the centre can be walked to: no solid prop covers it
                        foreach (var it in solids)
                        {
                            VillageDressing.TryCollisionHalfExtents(it, out double hx, out double hz);
                            Assert.False(Math.Abs(land.X - it.X) < hx + WorldScale.BodyRadius && Math.Abs(land.Z - it.Z) < hz + WorldScale.BodyRadius, $"the centre of {id} is blocked by a {it.Kind}, seed {seed} grid {grid}");
                        }
                    }
                    var cove = all.First(l => l.Id == VillageLandmarks.HiddenCove);
                    Assert.Equal(2, items.Count(it => it.Kind == "cliff_rock" && Math.Sqrt(Math.Pow(it.X - cove.X, 2) + Math.Pow(it.Z - cove.Z, 2)) <= cove.Radius)); // the two rocks that screen the cove (the sea stacks lie far off)
                    Assert.Equal(7, items.Count(it => it.Kind == "standing_stone"));
                    Assert.Equal(5, items.Count(it => it.Kind == "stump"));
                    Assert.Single(items, it => it.Kind == "catacomb_gate");
                }
        }

        [Fact]
        public void The_round_24_places_hold_a_lore_book_with_a_clue_each_on_free_ground()
        {
            var lib = LoreLibrary.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "lore_books.json")));
            foreach (var place in new[] { "standing_stones", "hidden_cove", "ritual_site", "catacombs" })
            {
                Assert.True(lib.Books.Count(b => b.Place == place) >= 2, place);
                Assert.Contains(lib.Books, b => b.Place == place && b.Clue);
            }
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    var books = LoreBookRules.Place(seed, grid, grid, Layout(seed, grid), lib);
                    foreach (var place in new[] { "standing_stones", "hidden_cove", "ritual_site", "catacombs" })
                    {
                        var at = books.Where(b => b.Place == place).ToList();
                        Assert.Single(at);
                        var land = VillageLandmarks.All(seed, grid, grid).First(l => l.Id == place);
                        Assert.True(Math.Sqrt(Math.Pow(at[0].X - land.X, 2) + Math.Pow(at[0].Z - land.Z, 2)) <= land.Radius, $"{place} book outside its place, seed {seed} grid {grid}");
                    }
                }
        }

        [Fact]
        public void Lit_paths_start_at_the_city_end_at_their_landmark_and_stay_walkable()
        {
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    double w = grid * VillageDressing.Cell;
                    VillageDressing.WalkBounds(seed, grid, grid, out double minX, out double maxX, out double minZ, out double maxZ);
                    var paths = VillageLandmarks.Paths(seed, grid, grid);
                    var marks = VillageLandmarks.All(seed, grid, grid);
                    Assert.Equal(5, paths.Count);
                    Assert.Equal(new[] { "cliffs", "shipwreck", "abbey", "cemetery", "grove" }, paths.Select(p => p.Target).ToArray());
                    foreach (var path in paths)
                    {
                        var land = marks.First(l => l.Id == path.Target);
                        foreach (var pt in path.Points) { Assert.InRange(pt[0], minX, maxX); Assert.InRange(pt[1], minZ, maxZ); }
                        var first = path.Points.First(); var last = path.Points.Last();
                        double dx = Math.Max(0, Math.Max(-first[0], first[0] - w)), dz = Math.Max(0, Math.Max(-first[1], first[1] - w));
                        Assert.True(Math.Sqrt(dx * dx + dz * dz) <= 6.5, $"{path.Target} starts {Math.Sqrt(dx * dx + dz * dz)} m from the city");
                        Assert.True(Math.Sqrt(Math.Pow(last[0] - land.X, 2) + Math.Pow(last[1] - land.Z, 2)) <= land.Radius, $"{path.Target} ends outside its landmark");
                    }
                    var stones = VillageLandmarks.PathDressing(seed, grid, grid);
                    Assert.True(stones.Count(i => i.Kind == "path_stone") > 40, "stones " + stones.Count(i => i.Kind == "path_stone") + $" seed {seed} grid {grid}");
                    Assert.True(stones.Count(i => i.Kind == "lamp") >= 6, "lamps " + stones.Count(i => i.Kind == "lamp") + $" seed {seed} grid {grid}");
                    Assert.All(stones, i => Assert.True(i.Kind == "path_stone" || i.Kind == "lamp"));
                }
        }

        [Fact]
        public void Lit_path_lamps_and_walkers_keep_clear_of_solid_props_and_full_grown_corruption()
        {
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    var solids = VillageLandmarks.Dressing(seed, grid, grid).Concat(CorruptionGrowth.Grow(seed, grid, grid, CorruptionGrowth.Levels)).ToList();
                    foreach (var lamp in VillageLandmarks.PathDressing(seed, grid, grid).Where(i => i.Kind == "lamp"))
                        foreach (var it in solids)
                            if (VillageDressing.TryCollisionHalfExtents(it, out double hx, out double hz))
                                Assert.False(Math.Abs(lamp.X - it.X) < hx && Math.Abs(lamp.Z - it.Z) < hz, $"a path lamp stands inside a {it.Kind}, seed {seed} grid {grid}");
                    foreach (var path in VillageLandmarks.Paths(seed, grid, grid))
                        foreach (var pt in path.Points)
                            foreach (var it in solids)
                                if (VillageDressing.TryCollisionHalfExtents(it, out double hx, out double hz))
                                    Assert.False(Math.Abs(pt[0] - it.X) < hx + WorldScale.BodyRadius && Math.Abs(pt[1] - it.Z) < hz + WorldScale.BodyRadius && it.Kind != "church_nave" && it.Kind != "church_tower", $"the {path.Target} path waypoint is blocked by a {it.Kind}, seed {seed} grid {grid}");
                }
        }

        [Fact]
        public void The_church_rise_is_flat_on_top_never_below_the_ground_and_the_church_is_a_solid_box()
        {
            foreach (int seed in Seeds)
            {
                VillageDressing.ChurchSite(seed, 36, 36, out double cx, out double cz, out int face, out double hill);
                Assert.Equal(hill, VillageLandmarks.HillHeight(hill, 0, 0), 9);
                Assert.Equal(hill, VillageLandmarks.GroundHeight(seed, 36, 36, cx, cz), 9);
                Assert.Equal(0.0, VillageLandmarks.GroundHeight(seed, 36, 36, cx + 40, cz));
                for (double dx = -30; dx <= 30; dx += 1.5)
                    for (double dz = -30; dz <= 30; dz += 1.5)
                    {
                        Assert.True(VillageLandmarks.HillHeight(hill, dx, dz) >= VillageLandmarks.HillFoot - 1e-9);
                        Assert.InRange(VillageLandmarks.GroundHeight(seed, 36, 36, cx + dx, cz + dz), 0.0, hill + 1.5);
                    }
                var boxes = VillageLandmarks.Dressing(seed, 36, 36).Where(i => i.Kind.StartsWith("church_")).ToList();
                Assert.Equal(2, boxes.Count);
                Assert.All(boxes, b => Assert.True(VillageDressing.TryCollisionHalfExtents(b, out double a, out double c)));
            }
        }

        [Fact]
        public void Landmarks_hold_their_own_lore_books_on_free_walkable_ground()
        {
            var lib = LoreLibrary.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "lore_books.json")));
            foreach (int seed in Seeds)
                foreach (int grid in Grids)
                {
                    var layout = Layout(seed, grid);
                    var books = LoreBookRules.Place(seed, grid, grid, layout, lib);
                    VillageDressing.WalkBounds(seed, grid, grid, out double minX, out double maxX, out double minZ, out double maxZ);
                    foreach (var place in new[] { "cliffs", "shipwreck", "abbey", "marsh" })
                    {
                        var at = books.Where(b => b.Place == place).ToList();
                        Assert.True(at.Count == 1, $"{place} has {at.Count} books, seed {seed} grid {grid}");
                        Assert.InRange(at[0].X, minX, maxX); Assert.InRange(at[0].Z, minZ, maxZ);
                        Assert.Equal(place, lib.Find(at[0].BookId).Place);
                    }
                }
        }

        [Fact]
        public void Lighthouse_beam_turns_once_per_period_and_is_deterministic()
        {
            foreach (int seed in Seeds)
            {
                Assert.Equal(LighthouseBeam.Yaw(seed, 3.7), LighthouseBeam.Yaw(seed, 3.7));
                Assert.Equal(LighthouseBeam.Yaw(seed, 0), LighthouseBeam.Phase(seed), 12);
                Assert.Equal(LighthouseBeam.Yaw(seed, 5.0), LighthouseBeam.Yaw(seed, 5.0 + LighthouseBeam.PeriodSeconds), 9);
                Assert.Equal(Math.PI, (LighthouseBeam.Yaw(seed, LighthouseBeam.PeriodSeconds / 2) - LighthouseBeam.Yaw(seed, 0) + 2 * Math.PI) % (2 * Math.PI), 9);
                foreach (double t in new[] { 0, 1.25, 7.5, 16, 123.4, 99999.9 }) Assert.InRange(LighthouseBeam.Yaw(seed, t), 0, 2 * Math.PI);
                foreach (int grid in Grids)
                {
                    LighthouseBeam.Site(seed, grid, grid, out double x, out double z);
                    VillageDressing.WalkBounds(seed, grid, grid, out double minX, out double maxX, out double minZ, out double maxZ);
                    Assert.True(x > minX - 20 && x < maxX + 20 && z > minZ - 20 && z < maxZ + 20, $"lighthouse near the village, seed {seed} grid {grid}");
                }
            }
        }
    }
}
