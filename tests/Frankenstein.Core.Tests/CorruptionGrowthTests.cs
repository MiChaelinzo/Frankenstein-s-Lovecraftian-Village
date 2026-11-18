using System;
using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class CorruptionGrowthTests
    {
        private static readonly int[] Seeds = { 1, 42, -7, 1818, 123456789 };

        [Fact]
        public void Level_is_zero_when_calm_and_full_when_dread_and_night_are_maximal()
        {
            Assert.Equal(0, CorruptionGrowth.Level(0.0, 1));
            Assert.Equal(0, CorruptionGrowth.Level(double.NaN, -5));
            Assert.Equal(CorruptionGrowth.Levels, CorruptionGrowth.Level(1.0, CorruptionGrowth.FullNight));
            Assert.Equal(CorruptionGrowth.Levels, CorruptionGrowth.Level(5.0, 400));
        }

        [Fact]
        public void Level_never_decreases_as_dread_or_night_rises()
        {
            for (int night = 1; night <= 12; night++)
            {
                int prev = 0;
                for (int step = 0; step <= 100; step++)
                {
                    int level = CorruptionGrowth.Level(step / 100.0, night);
                    Assert.True(level >= prev, $"night {night} dread {step / 100.0}");
                    prev = level;
                }
            }
            for (int step = 0; step <= 100; step += 5)
                for (int night = 1; night < 12; night++)
                    Assert.True(CorruptionGrowth.Level(step / 100.0, night + 1) >= CorruptionGrowth.Level(step / 100.0, night));
        }

        [Fact]
        public void Growth_is_deterministic_and_monotonic_in_count_and_scale()
        {
            foreach (var seed in Seeds)
                foreach (var grid in new[] { 24, 16, VillageDistricts.CityGrid })
                {
                    var sites = CorruptionGrowth.Sites(seed, grid, grid);
                    var again = CorruptionGrowth.Sites(seed, grid, grid);
                    Assert.Equal(sites.Count, again.Count);
                    for (int i = 0; i < sites.Count; i++) { Assert.Equal(sites[i].Kind, again[i].Kind); Assert.Equal(sites[i].X, again[i].X); Assert.Equal(sites[i].Z, again[i].Z); }
                    Assert.Empty(CorruptionGrowth.Grow(seed, grid, grid, 0));
                    Assert.Equal(sites.Count, CorruptionGrowth.Grow(seed, grid, grid, CorruptionGrowth.Levels).Count);
                    int prevCount = 0;
                    var prevScale = new double[sites.Count];
                    for (int level = 0; level <= CorruptionGrowth.Levels; level++)
                    {
                        var grown = CorruptionGrowth.Grow(seed, grid, grid, level);
                        Assert.True(grown.Count >= prevCount);
                        prevCount = grown.Count;
                        for (int rank = 0; rank < sites.Count; rank++)
                        {
                            double s = CorruptionGrowth.ScaleAt(rank, sites.Count, level);
                            Assert.InRange(s, 0.0, 1.0);
                            Assert.True(s >= prevScale[rank]);
                            prevScale[rank] = s;
                        }
                        Assert.All(grown, it => Assert.InRange(it.Scale, CorruptionGrowth.FirstScale, 1.0));
                    }
                }
        }

        [Fact]
        public void Growth_starts_subtle_and_every_candidate_has_a_footprint_kind()
        {
            foreach (var seed in Seeds)
            {
                var sites = CorruptionGrowth.Sites(seed, 24, 24);
                Assert.True(CorruptionGrowth.Grow(seed, 24, 24, 1).Count <= sites.Count / 4 + 1);
                Assert.All(sites, it => Assert.True(VillageDressing.FootprintOf(it.Kind).Height > 0.5 || it.Kind == "fungus_cluster"));
                foreach (var kind in new[] { "tentacle_tree", "tentacle_sapling", "fungus_tall", "fungus_cluster", "fungus_shelf", "spire_horn", "spire_ribbed" })
                    Assert.Contains(sites, it => it.Kind == kind);
            }
        }

        [Fact]
        public void Sites_stay_outside_the_village_grid_and_the_grove_clears_the_church_rise()
        {
            foreach (var seed in Seeds)
                foreach (var grid in new[] { 24, 16, VillageDistricts.CityGrid })
                {
                    double w = grid * VillageDressing.Cell;
                    VillageDressing.ChurchSite(seed, grid, grid, out double chX, out double chZ, out _, out double hill);
                    foreach (var it in CorruptionGrowth.Sites(seed, grid, grid))
                    {
                        bool inGrid = it.X > 0 && it.X < w && it.Z > 0 && it.Z < w;
                        Assert.False(inGrid, $"{it.Kind} at {it.X},{it.Z} is inside the grid");
                        double rho = Math.Sqrt(Math.Pow((it.X - chX) / 25.0, 2) + Math.Pow((it.Z - chZ) / 23.0, 2));
                        if (it.Y > 0) { Assert.Equal(hill, it.Y); Assert.True(rho < 0.4, $"{it.Kind} is off the flat summit"); }
                        else Assert.True(rho > 1.0, $"{it.Kind} at {it.X},{it.Z} stands on the church rise");
                    }
                }
        }
    }
}
