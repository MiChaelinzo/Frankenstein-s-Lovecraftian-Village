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
        private const double BodyRadius = 0.35;
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
                var f = VillageDressing.FootprintOf(it.Kind);
                if (!f.Solid) continue;
                double c = Math.Abs(Math.Cos(it.Yaw)), s = Math.Abs(Math.Sin(it.Yaw));
                double hx = (c * f.HalfX + s * f.HalfZ) * it.Scale, hz = (s * f.HalfX + c * f.HalfZ) * it.Scale;
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
                Assert.Equal(side == 0 ? -shore : -VillageDressing.EdgeWalkMargin, minX);
                Assert.Equal(side == 1 ? 96 + shore : 96 + VillageDressing.EdgeWalkMargin, maxX);
                Assert.Equal(side == 2 ? -shore : -VillageDressing.EdgeWalkMargin, minZ);
                Assert.Equal(96 + VillageDressing.EdgeWalkMargin, maxZ);
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
            var doorStep = new HashSet<string>(VillageDressing.DoorKinds.Where(k => k.Length > 0)) { "well", "market_stall", "bench", "sign", "wall_lantern" };
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
    }
}
