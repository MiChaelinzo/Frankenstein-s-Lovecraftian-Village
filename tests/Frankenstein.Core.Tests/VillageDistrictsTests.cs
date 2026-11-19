using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class VillageDistrictsTests
    {
        private static readonly int[] Seeds = { 1, 42, -7, 1818, 123456789, 7, 2024 };
        private const int G = VillageDistricts.CityGrid;

        private static PrefabCatalog Catalog()
        {
            string dir = AppContext.BaseDirectory;
            while (dir != null && !Directory.Exists(Path.Combine(dir, "Packages"))) dir = Path.GetDirectoryName(dir);
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_catalog.json")));
            var list = doc.RootElement.GetProperty("entries").EnumerateArray().Select(e => new CatalogEntry
            {
                id = e.GetProperty("id").GetString(), category = e.GetProperty("category").GetString(), weight = e.GetProperty("weight").GetInt32(),
                footprintX = e.GetProperty("footprintX").GetInt32(), footprintZ = e.GetProperty("footprintZ").GetInt32(), horror = e.GetProperty("horror").GetInt32(),
            }).ToList();
            return new PrefabCatalog(list);
        }

        [Fact]
        public void Every_city_has_all_five_districts_and_the_market_holds_the_square()
        {
            foreach (var seed in Seeds)
            {
                var map = VillageDistricts.Map(seed, G, G);
                var seen = new HashSet<int>();
                foreach (var d in map) seen.Add(d);
                Assert.Equal(VillageDistricts.Count, seen.Count);
                for (int x = 0; x < G; x++)
                    for (int z = 0; z < G; z++)
                        if (VillageStreets.IsSquareCell(G, G, x, z)) Assert.Equal(VillageDistricts.Market, map[x, z]);
                Assert.Equal(VillageDistricts.Count, VillageDistricts.Ids.Length);
            }
        }

        [Fact]
        public void Harbour_and_fishers_row_lie_on_the_coast_band_and_the_harbour_holds_the_dock()
        {
            foreach (var seed in Seeds)
            {
                int side = VillagerRules.CoastSide(seed);
                int dock = (int)Math.Floor(VillageDressing.DockU(seed, G, G) / VillageDressing.Cell);
                int dx = side == 0 ? 0 : side == 1 ? G - 1 : dock, dz = side == 2 ? 0 : dock;
                int atDock = VillageDistricts.At(seed, G, G, dx, dz);
                Assert.True(atDock == VillageDistricts.Harbour || atDock == VillageDistricts.ChapelHill, $"seed {seed}: the dock cell is {VillageDistricts.Ids[atDock]}");
                for (int x = 0; x < G; x++)
                    for (int z = 0; z < G; z++)
                    {
                        int d = VillageDistricts.At(seed, G, G, x, z);
                        if (d != VillageDistricts.Harbour && d != VillageDistricts.FishersRow) continue;
                        int depth = side == 0 ? x : side == 1 ? G - 1 - x : z;
                        Assert.InRange(depth, 0, VillageDistricts.CoastBand - 1);
                    }
            }
        }

        [Fact]
        public void Every_palette_kind_has_a_measured_footprint()
        {
            for (int d = 0; d < VillageDistricts.Count; d++)
            {
                var palette = VillageDistricts.Palette(d);
                Assert.Equal(5, palette.Length);
                foreach (var kind in palette) Assert.NotEqual(3.45, VillageDressing.FootprintOf(kind).Height); // 3.45 is the lamp default for unknown kinds
                Assert.InRange(VillageDistricts.PaletteDensity(d), 1, 60);
            }
        }

        [Fact]
        public void City_layout_is_deterministic_bigger_and_keeps_every_layout_guarantee()
        {
            var cat = Catalog();
            foreach (var seed in Seeds)
            {
                var a = VillageLayoutGenerator.GenerateCity(cat, G, G, VillageDistricts.CityPieces, seed);
                var b = VillageLayoutGenerator.GenerateCity(cat, G, G, VillageDistricts.CityPieces, seed);
                Assert.Equal(a.Count, b.Count);
                for (int i = 0; i < a.Count; i++) { Assert.Equal(a[i].Id, b[i].Id); Assert.Equal(a[i].X, b[i].X); Assert.Equal(a[i].Z, b[i].Z); Assert.Equal(a[i].Facing, b[i].Facing); }
                var old = VillageLayoutGenerator.Generate(cat, 24, 24, 80, seed);
                Assert.True(a.Count > old.Count * 2, $"seed {seed}: {a.Count} city pieces vs {old.Count}");
                Assert.True(a.Count(p => VillageStreets.IsBuilding(p.SizeX, p.SizeZ)) > old.Count(p => VillageStreets.IsBuilding(p.SizeX, p.SizeZ)));
                Assert.True(VillageStreets.LaneLines(G).Count > VillageStreets.LaneLines(24).Count, "more streets");

                var occ = new bool[G, G];
                foreach (var p in a)
                {
                    Assert.True(cat.Contains(p.Id));
                    Assert.True(p.X >= 0 && p.Z >= 0 && p.X + p.SizeX <= G && p.Z + p.SizeZ <= G);
                    Assert.Equal(VillageDistricts.ChunkOf(p.X), VillageDistricts.ChunkOf(p.X + p.SizeX - 1));
                    Assert.Equal(VillageDistricts.ChunkOf(p.Z), VillageDistricts.ChunkOf(p.Z + p.SizeZ - 1));
                    for (int dx = 0; dx < p.SizeX; dx++)
                        for (int dz = 0; dz < p.SizeZ; dz++)
                        {
                            Assert.False(occ[p.X + dx, p.Z + dz], "overlap");
                            Assert.False(VillageStreets.IsStreetCell(G, G, p.X + dx, p.Z + dz), "on a street");
                            occ[p.X + dx, p.Z + dz] = true;
                        }
                    if (VillageStreets.IsBuilding(p.SizeX, p.SizeZ)) Assert.Equal(p.Facing, VillageStreets.FacingFor(G, G, p.X, p.Z, p.SizeX, p.SizeZ));
                }
            }
        }

        [Fact]
        public void City_pieces_follow_their_district_taste()
        {
            var cat = Catalog();
            int chapel = 0, elsewhere = 0, chapelCells = 0, otherCells = 0;
            foreach (var seed in Seeds)
            {
                var map = VillageDistricts.Map(seed, G, G);
                foreach (var d in map) if (d == VillageDistricts.ChapelHill) chapelCells++; else otherCells++;
                foreach (var p in VillageLayoutGenerator.GenerateCity(cat, G, G, VillageDistricts.CityPieces, seed))
                    if (p.Id == "dead_tree" || p.Id == "altar") { if (map[p.X, p.Z] == VillageDistricts.ChapelHill) chapel++; else elsewhere++; }
            }
            Assert.True((double)chapel / chapelCells > (double)elsewhere / otherCells, $"dead trees and altars per cell: chapel hill {chapel}/{chapelCells}, elsewhere {elsewhere}/{otherCells}");
        }

        [Fact]
        public void Chunk_counts_and_seeds()
        {
            Assert.Equal(3, VillageDistricts.ChunkCount(G));
            Assert.Equal(1, VillageDistricts.ChunkCount(12));
            Assert.Equal(2, VillageDistricts.ChunkCount(13));
            Assert.Equal(0, VillageDistricts.ChunkCount(0));
            Assert.Equal(1818, VillageDistricts.ChunkSeed(1818, 0));
            Assert.NotEqual(VillageDistricts.ChunkSeed(1818, 1), VillageDistricts.ChunkSeed(1818, 2));
        }

        [Fact]
        public void Districts_dress_their_yards_with_their_own_palette()
        {
            var cat = Catalog();
            foreach (var seed in new[] { 1818, 42, -7 })
            {
                var layout = VillageLayoutGenerator.GenerateCity(cat, G, G, VillageDistricts.CityPieces, seed);
                var items = VillageDressing.Compose(seed, G, G, layout);
                int inYards = items.Count(it => it.Kind == "market_stall" && VillageDistricts.At(seed, G, G, (int)(it.X / VillageDressing.Cell), (int)(it.Z / VillageDressing.Cell)) == VillageDistricts.Market);
                Assert.True(inYards >= 2, $"seed {seed}: {inYards} market stalls in the market");
                Assert.Contains(items, it => it.Kind == "net" && it.Y == 0 && it.X > 0 && it.X < G * VillageDressing.Cell && it.Z > 0 && it.Z < G * VillageDressing.Cell);
            }
        }

        private static void Swept(DressingItem it, out double hx, out double hz)
        {
            var f = VillageDressing.FootprintOf(it.Kind);
            double c = Math.Abs(Math.Cos(it.Yaw)), s = Math.Abs(Math.Sin(it.Yaw));
            hx = (c * f.HalfX + s * f.HalfZ) * it.Scale; hz = (s * f.HalfX + c * f.HalfZ) * it.Scale;
        }

        /// <summary>Round 22 reviewer note: the inn and chapel grew but DockClearance and ChapelClearance did not, so shore buildings and their props could touch. They now keep 0.1 m.</summary>
        [Fact]
        public void Shore_buildings_never_touch_each_other_or_the_harbour_props()
        {
            var big = new HashSet<string> { "cottage_thatch", "cottage_tall", "inn", "chapel", "lighthouse" };
            var shore = new HashSet<string>(big) { "crate_stack", "barrel" };
            foreach (var grid in new[] { 16, 24, G })
                for (int seed = 1; seed <= 200; seed++)
                {
                    var items = VillageDressing.Compose(seed, grid, grid, new List<PlacedPiece>()).Where(i => shore.Contains(i.Kind) && (i.X < 0 || i.Z < 0 || i.X > grid * VillageDressing.Cell)).ToList();
                    for (int i = 0; i < items.Count; i++)
                        for (int j = i + 1; j < items.Count; j++)
                        {
                            if (!big.Contains(items[i].Kind) && !big.Contains(items[j].Kind)) continue;
                            Swept(items[i], out double ax, out double az); Swept(items[j], out double bx, out double bz);
                            double gap = Math.Max(Math.Abs(items[i].X - items[j].X) - ax - bx, Math.Abs(items[i].Z - items[j].Z) - az - bz);
                            Assert.True(gap >= 0.1, $"seed {seed} grid {grid}: {items[i].Kind} and {items[j].Kind} are {gap:F2} m apart");
                        }
                }
        }
    }
}
