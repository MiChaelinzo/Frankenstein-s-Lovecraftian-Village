using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class VillageStreetsTests
    {
        private static readonly int[] Seeds = { 1, 7, 42, -7, 1818, 99999, 123456789 };
        private static readonly (int w, int d, int n)[] Grids = { (24, 24, 80), (20, 20, 60), (32, 24, 100) };
        private const double BodyRadius = WorldScale.BodyRadius;
        private const double VillagerRadius = WorldScale.VillagerRadius;
        /// <summary>Lanes end at the harbour quarter, where cottages overhang the grid edge by a metre or so, so the lane walk stops short of the edge.</summary>
        private const double EndMargin = 2.5;

        private static PrefabCatalog Catalog()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_catalog.json")));
            var list = new List<CatalogEntry>();
            foreach (var e in doc.RootElement.GetProperty("entries").EnumerateArray())
                list.Add(new CatalogEntry
                {
                    id = e.GetProperty("id").GetString(), category = e.GetProperty("category").GetString(), weight = e.GetProperty("weight").GetInt32(),
                    footprintX = e.GetProperty("footprintX").GetInt32(), footprintZ = e.GetProperty("footprintZ").GetInt32(), horror = e.GetProperty("horror").GetInt32(),
                });
            return new PrefabCatalog(list);
        }

        /// <summary>True when a circle at (x, z) overlaps the swept footprint box of a solid prop or a layout piece.</summary>
        private static bool Blocked(double x, double z, IList<DressingItem> items, IList<PlacedPiece> layout)
        {
            foreach (var it in items)
            {
                if (!VillageDressing.TryCollisionHalfExtents(it, out double hx, out double hz)) continue;
                if (CircleHitsBox(x, z, it.X - hx, it.X + hx, it.Z - hz, it.Z + hz)) return true;
            }
            foreach (var p in layout)
                if (CircleHitsBox(x, z, p.X * VillageDressing.Cell, (p.X + p.SizeX) * VillageDressing.Cell, p.Z * VillageDressing.Cell, (p.Z + p.SizeZ) * VillageDressing.Cell)) return true;
            return false;
        }

        private static bool CircleHitsBox(double x, double z, double x0, double x1, double z0, double z1)
        {
            double dx = x - Math.Max(x0, Math.Min(x, x1)), dz = z - Math.Max(z0, Math.Min(z, z1));
            return dx * dx + dz * dz < BodyRadius * BodyRadius;
        }

        /// <summary>The well stands in the middle of the square, so the lane centre line is only tested outside it (people walk around the well).</summary>
        private static bool InSquare(int w, int d, double x, double z)
        {
            return VillageStreets.IsSquareCell(w, d, (int)Math.Floor(x / VillageDressing.Cell), (int)Math.Floor(z / VillageDressing.Cell));
        }

        [Fact]
        public void Small_grids_have_no_streets_and_the_lane_pattern_is_centred()
        {
            Assert.False(VillageStreets.Enabled(12, 24));
            Assert.Empty(VillageStreets.LaneLines(15));
            Assert.False(VillageStreets.IsStreetCell(12, 12, 6, 6));
            Assert.Equal(new[] { 6, 12, 18 }, VillageStreets.LaneLines(24).ToArray());
            Assert.True(VillageStreets.IsStreetCell(24, 24, 12, 0));
            Assert.True(VillageStreets.IsStreetCell(24, 24, 0, 18));
            Assert.True(VillageStreets.IsStreetCell(24, 24, 11, 11), "the square covers 3 by 3 cells");
            Assert.False(VillageStreets.IsStreetCell(24, 24, 3, 3));
            Assert.False(VillageStreets.IsStreetCell(24, 24, -1, 12));
        }

        [Fact]
        public void Pieces_never_stand_on_a_street_and_every_building_fronts_one()
        {
            var cat = Catalog();
            int buildings = 0;
            foreach (var g in Grids)
                foreach (int seed in Seeds)
                {
                    var layout = VillageLayoutGenerator.Generate(cat, g.w, g.d, g.n, seed);
                    foreach (var p in layout)
                    {
                        for (int x = p.X; x < p.X + p.SizeX; x++)
                            for (int z = p.Z; z < p.Z + p.SizeZ; z++)
                                Assert.False(VillageStreets.IsStreetCell(g.w, g.d, x, z), $"{p.Id} on a street at {x},{z}");
                        if (!VillageStreets.IsBuilding(p.SizeX, p.SizeZ)) continue;
                        buildings++;
                        Assert.InRange(p.Facing, 0, 3);
                        Assert.Equal(p.Facing, VillageStreets.FacingFor(g.w, g.d, p.X, p.Z, p.SizeX, p.SizeZ));
                    }
                }
            Assert.True(buildings > 100, "streets must still leave room for a village");
        }

        [Fact]
        public void Layout_is_unchanged_without_streets()
        {
            var cat = Catalog();
            var layout = VillageLayoutGenerator.Generate(cat, 12, 12, 30, 1818);
            Assert.All(layout, p => Assert.Equal(0, p.Facing));
        }

        [Fact]
        public void Walk_bounds_open_the_coast_side_up_to_the_shore_only()
        {
            foreach (int seed in Seeds)
            {
                VillageDressing.WalkBounds(seed, 24, 24, out double minX, out double maxX, out double minZ, out double maxZ);
                int side = VillagerRules.CoastSide(seed);
                double shore = VillageDressing.ShoreInset - VillageDressing.ShoreStandOff;
                double m = VillageLandmarks.WorldMargin;
                Assert.Equal(side == 0 ? -shore : -m, minX);
                Assert.Equal(side == 1 ? 96 + shore : 96 + m, maxX);
                Assert.Equal(side == 2 ? -shore : -m, minZ);
                Assert.Equal(96 + m, maxZ);
            }
        }

        [Fact]
        public void Coast_road_is_walkable_along_the_whole_harbour_quarter()
        {
            var cat = Catalog();
            foreach (var g in Grids)
                foreach (int seed in Seeds)
                {
                    var layout = VillageLayoutGenerator.Generate(cat, g.w, g.d, g.n, seed);
                    var items = VillageDressing.Compose(seed, g.w, g.d, layout);
                    VillageDressing.WalkBounds(seed, g.w, g.d, out double minX, out double maxX, out double minZ, out double maxZ);
                    double hi = VillagerRules.CoastSide(seed) == 2 ? g.w * VillageDressing.Cell : g.d * VillageDressing.Cell;
                    for (double u = 0.5; u < hi - 0.5; u += 0.1)
                    {
                        VillageDressing.CoastToWorld(seed, g.w, g.d, u, VillageDressing.CoastRoadV, out double x, out double z);
                        Assert.True(x >= minX && x <= maxX && z >= minZ && z <= maxZ, $"road leaves the walk bounds at u={u} seed={seed}");
                        Assert.False(Blocked(x, z, items, layout), $"coast road blocked at u={u:F1} seed={seed} grid={g.w}x{g.d}");
                    }
                }
        }

        [Fact]
        public void Every_lane_centre_line_is_walkable_from_edge_to_edge()
        {
            var cat = Catalog();
            foreach (var g in Grids)
                foreach (int seed in Seeds)
                {
                    var layout = VillageLayoutGenerator.Generate(cat, g.w, g.d, g.n, seed);
                    var items = VillageDressing.Compose(seed, g.w, g.d, layout);
                    foreach (int c in VillageStreets.LaneLines(g.w))
                        for (double z = EndMargin; z < g.d * VillageDressing.Cell - EndMargin; z += 0.1)
                            if (!InSquare(g.w, g.d, (c + 0.5) * VillageDressing.Cell, z)) Assert.False(Blocked((c + 0.5) * VillageDressing.Cell, z, items, layout), $"lane column {c} blocked at z={z:F1} seed={seed}");
                    foreach (int r in VillageStreets.LaneLines(g.d))
                        for (double x = EndMargin; x < g.w * VillageDressing.Cell - EndMargin; x += 0.1)
                            if (!InSquare(g.w, g.d, x, (r + 0.5) * VillageDressing.Cell)) Assert.False(Blocked(x, (r + 0.5) * VillageDressing.Cell, items, layout), $"lane row {r} blocked at x={x:F1} seed={seed}");
                }
        }

        [Fact]
        public void Props_stay_off_the_lanes_except_door_step_clutter()
        {
            var cat = Catalog();
            var doorStep = new HashSet<string>(VillageDressing.DoorKinds.Where(k => k.Length > 0)) { "well", "market_stall", "bench", "sign", "wall_lantern", "grass_tuft" };
            foreach (var g in Grids)
                foreach (int seed in Seeds)
                {
                    var layout = VillageLayoutGenerator.Generate(cat, g.w, g.d, g.n, seed);
                    foreach (var it in VillageDressing.Compose(seed, g.w, g.d, layout))
                    {
                        if (it.X < 0 || it.Z < 0 || it.X > g.w * VillageDressing.Cell || it.Z > g.d * VillageDressing.Cell || it.Y > 0.01) continue;
                        if (doorStep.Contains(it.Kind) || it.Kind.StartsWith("lamp")) continue;
                        Assert.False(VillageDressing.TouchesStreet(it, g.w, g.d), $"{it.Kind} blocks a street at {it.X:F1},{it.Z:F1} seed {seed}");
                    }
                }
        }

        [Fact]
        public void Main_lane_walkers_swing_round_the_well_and_square_props()
        {
            Assert.Equal(VillageStreets.WalkerLateral, VillageStreets.WellDeflected(VillageStreets.WalkerLateral, 10));
            Assert.Equal(-VillageStreets.WellDeflectLateral, VillageStreets.WellDeflected(-VillageStreets.WalkerLateral, 0));
            var cat = Catalog();
            var square = new HashSet<string> { "well", "market_stall", "bench", "sign" };
            foreach (var g in Grids)
                foreach (int seed in new[] { 1818, 7, 42 })
                {
                    var solids = VillageDressing.Compose(seed, g.w, g.d, VillageLayoutGenerator.Generate(cat, g.w, g.d, g.n, seed)).Where(it => square.Contains(it.Kind)).ToList();
                    Assert.Contains(solids, it => it.Kind == "well");
                    for (double tick = 0; tick < 400; tick += 0.5)
                        foreach (var w in VillageStreets.Walkers(seed, g.w, g.d, tick, 0))
                            foreach (var it in solids)
                            {
                                var f = VillageDressing.FootprintOf(it.Kind);
                                double c = Math.Abs(Math.Cos(it.Yaw)), s = Math.Abs(Math.Sin(it.Yaw));
                                double dx = Math.Max(Math.Abs(w.X - it.X) - (c * f.HalfX + s * f.HalfZ) * it.Scale, 0), dz = Math.Max(Math.Abs(w.Z - it.Z) - (s * f.HalfX + c * f.HalfZ) * it.Scale, 0);
                                Assert.True(Math.Sqrt(dx * dx + dz * dz) >= VillagerRadius, $"walker {w.Id} inside the {it.Kind} at tick {tick} seed {seed}");
                            }
                }
        }

        [Fact]
        public void Lane_walkers_never_pass_through_a_lamp_post_pole()
        {
            var cat = Catalog();
            foreach (var g in Grids)
                foreach (int seed in new[] { 1818, 7, 42 })
                {
                    var poles = VillageDressing.Compose(seed, g.w, g.d, VillageLayoutGenerator.Generate(cat, g.w, g.d, g.n, seed)).Where(it => VillageDressing.LampKinds.Contains(it.Kind)).ToList();
                    Assert.NotEmpty(poles);
                    for (double tick = 0; tick < 400; tick += 0.5)
                        foreach (var w in VillageStreets.Walkers(seed, g.w, g.d, tick, 0))
                            foreach (var it in poles)
                            {
                                double dx = Math.Max(Math.Abs(w.X - it.X) - VillageDressing.LampPoleHalf, 0), dz = Math.Max(Math.Abs(w.Z - it.Z) - VillageDressing.LampPoleHalf, 0);
                                Assert.True(Math.Sqrt(dx * dx + dz * dz) >= VillagerRadius, $"walker {w.Id} through the {it.Kind} at tick {tick} seed {seed}");
                            }
                }
        }

        [Fact]
        public void Near_field_every_walk_position_has_ground_props_two_to_eight_metres_away()
        {
            var cat = Catalog();
            foreach (var g in new[] { (24, 24, 80), (20, 20, 60), (32, 32, 100) })
                foreach (int seed in new[] { 1818, 7, 42, 1, 99999 })
                {
                    var items = VillageDressing.Compose(seed, g.Item1, g.Item2, VillageLayoutGenerator.Generate(cat, g.Item1, g.Item2, g.Item3, seed)).Where(it => it.Y < 0.5).ToList();
                    var pts = new List<(double x, double z)>();
                    foreach (int c in VillageStreets.LaneLines(g.Item1)) for (double z = 3; z < g.Item2 * VillageDressing.Cell - 3; z += 2) pts.Add(((c + 0.5) * VillageDressing.Cell, z));
                    foreach (int r in VillageStreets.LaneLines(g.Item2)) for (double x = 3; x < g.Item1 * VillageDressing.Cell - 3; x += 2) pts.Add((x, (r + 0.5) * VillageDressing.Cell));
                    double hi = VillagerRules.CoastSide(seed) == 2 ? g.Item1 * VillageDressing.Cell : g.Item2 * VillageDressing.Cell;
                    for (double u = 1; u < hi - 1; u += 2) { VillageDressing.CoastToWorld(seed, g.Item1, g.Item2, u, VillageDressing.CoastRoadV, out double x, out double z); pts.Add((x, z)); }
                    var counts = pts.Select(p => items.Count(it => { double d = Math.Sqrt((it.X - p.x) * (it.X - p.x) + (it.Z - p.z) * (it.Z - p.z)); return d >= 2 && d <= 8; })).ToList();
                    Assert.True(counts.Min() >= 1, $"seed {seed} grid {g.Item1}: an empty spot");
                    Assert.True(counts.Count(k => k >= 3) >= counts.Count * 0.9, $"seed {seed} grid {g.Item1}: fewer than 90% of spots have three props");
                }
        }

        [Fact]
        public void Foreground_fill_places_every_new_kind_off_the_layout()
        {
            var cat = Catalog();
            var kinds = new[] { "grass_tuft", "stump", "log", "woodpile", "hedge", "picket_fence", "bollard", "rope_coil", "crop_row", "wheel_ruts" };
            var seen = new HashSet<string>();
            foreach (int seed in new[] { 1, 42, 1818, 7 })
            {
                var layout = VillageLayoutGenerator.Generate(cat, 24, 24, 40, seed);
                foreach (var it in VillageDressing.Compose(seed, 24, 24, layout))
                {
                    seen.Add(it.Kind);
                    if (it.Kind == "wheel_ruts")
                    {
                        Assert.Equal(VillageDressing.RutLift, it.Y);
                        Assert.True(VillageStreets.IsStreetCell(24, 24, (int)Math.Floor(it.X / VillageDressing.Cell), (int)Math.Floor(it.Z / VillageDressing.Cell)));
                    }
                    else if (kinds.Contains(it.Kind) && it.X > 0 && it.X < 96 && it.Z > 0 && it.Z < 96) Assert.False(VillageDressing.OverlapsLayout(it, layout, 0), $"{it.Kind} on a piece");
                }
            }
            foreach (var k in kinds) Assert.Contains(k, seen);
        }
    }
}
