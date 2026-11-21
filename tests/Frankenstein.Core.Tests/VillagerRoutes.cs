using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 25: townsfolk by district and villager walks snapped to the street lanes (spec tasks 135 and 140).</summary>
    public class VillagerRoutes
    {
        private static readonly int[] Seeds = { 1, 2, 7, 42, 1818 };
        private const int Grid = VillageDistricts.CityGrid;
        private const double Inset = 1e-6;

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static List<PlacedPiece> City(int seed) =>
            VillageLayoutGenerator.GenerateCity(GoldenParity.LoadCatalog(Root()), Grid, Grid, VillageDistricts.CityPieces, seed);

        private static bool SegmentHitsBox(double x0, double z0, double x1, double z1, PlacedPiece p)
        {
            double minX = Math.Min(x0, x1), maxX = Math.Max(x0, x1), minZ = Math.Min(z0, z1), maxZ = Math.Max(z0, z1);
            return maxX > p.X + Inset && minX < p.X + p.SizeX - Inset && maxZ > p.Z + Inset && minZ < p.Z + p.SizeZ - Inset;
        }

        [Fact]
        public void The_city_has_townsfolk_in_every_district_and_the_principals_do_not_change()
        {
            foreach (int seed in Seeds)
            {
                var layout = City(seed);
                var principals = VillagerRules.GenerateRoster(seed, layout);
                var roster = VillagerRules.GenerateRoster(seed, layout, Grid, Grid);
                Assert.Equal(VillagerRules.RoleCount, principals.Count);
                Assert.True(roster.Count >= 3 * VillagerRules.RoleCount);
                for (int i = 0; i < principals.Count; i++)
                    Assert.Equal(principals[i].Name + principals[i].Role + principals[i].HomeIndex + principals[i].WorkIndex, roster[i].Name + roster[i].Role + roster[i].HomeIndex + roster[i].WorkIndex);
                Assert.Equal(roster.Count, roster.Select(v => v.Name).Distinct().Count());
                for (int i = 0; i < roster.Count; i++)
                {
                    Assert.Equal(i, roster[i].Index);
                    Assert.StartsWith("house", layout[roster[i].HomeIndex].Id);
                }
                foreach (var v in roster.Skip(VillagerRules.RoleCount))
                    Assert.NotEqual(VillagerRole.Lamplighter, v.Role);
                var again = VillagerRules.GenerateRoster(seed, layout, Grid, Grid);
                Assert.Equal(roster.Select(v => v.Name + v.HomeIndex + v.WorkIndex), again.Select(v => v.Name + v.HomeIndex + v.WorkIndex));
            }
        }

        [Fact]
        public void A_small_village_keeps_only_the_seven_principals()
        {
            var layout = VillageLayoutGenerator.Generate(GoldenParity.LoadCatalog(Root()), 24, 24, 80, 5);
            Assert.Equal(VillagerRules.RoleCount, VillagerRules.GenerateRoster(5, layout, 24, 24).Count);
        }

        [Fact]
        public void Lane_routes_run_on_lane_centre_lines_between_stops()
        {
            var route = VillageStreets.LaneRoute(6.5, 3.2, 24.5, 30.8, Grid, Grid, null);
            Assert.Equal(6.5, route[0][0]);
            Assert.Equal(30.8, route[route.Count - 1][1]);
            for (int i = 1; i < route.Count; i++)
                Assert.True(route[i][0] == route[i - 1][0] || route[i][1] == route[i - 1][1], "every leg is axis aligned");
            Assert.Equal(route.Select(p => p[0] + "," + p[1]), VillageStreets.LaneRoute(6.5, 3.2, 24.5, 30.8, Grid, Grid, null).Select(p => p[0] + "," + p[1]));
        }

        [Fact]
        public void Without_streets_the_route_is_x_then_z()
        {
            var route = VillageStreets.LaneRoute(1, 2, 5, 9, 10, 10, null);
            Assert.Equal(3, route.Count);
            Assert.Equal(new[] { 5.0, 2.0 }, route[1]);
        }

        [Fact]
        public void No_route_segment_between_door_fronts_and_the_square_crosses_a_building()
        {
            int checkedRoutes = 0;
            foreach (int seed in Seeds)
            {
                var layout = City(seed);
                var roster = VillagerRules.GenerateRoster(seed, layout, Grid, Grid);
                var buildings = layout.Where(p => VillageStreets.IsBuilding(p.SizeX, p.SizeZ)).ToList();
                var points = new List<double[]>();
                foreach (var v in roster)
                {
                    foreach (var kind in new[] { VillagerPlaceKind.Home, VillagerPlaceKind.Workplace, VillagerPlaceKind.Square })
                    {
                        var pt = VillagerRules.StandPoint(v, kind, layout, Grid, Grid, seed);
                        points.Add(new[] { pt.X, pt.Z });
                    }
                }
                foreach (var a in points)
                    foreach (var b in points)
                    {
                        var route = VillageStreets.LaneRoute(a[0], a[1], b[0], b[1], Grid, Grid, layout);
                        checkedRoutes++;
                        for (int i = 1; i < route.Count; i++)
                            foreach (var p in buildings.Where(q => !SegmentHitsBox(a[0], a[1], a[0], a[1], q) && !SegmentHitsBox(b[0], b[1], b[0], b[1], q)))
                                Assert.False(SegmentHitsBox(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1], p),
                                    "seed " + seed + " route from " + a[0] + "," + a[1] + " to " + b[0] + "," + b[1] + " crosses " + p.Id + " at " + p.X + "," + p.Z);
                    }
            }
            Assert.True(checkedRoutes > 1000);
        }

        [Fact]
        public void Walking_presence_stays_out_of_buildings_over_a_day()
        {
            foreach (int seed in new[] { 1, 1818 })
            {
                var layout = City(seed);
                var roster = VillagerRules.GenerateRoster(seed, layout, Grid, Grid);
                var buildings = layout.Where(p => VillageStreets.IsBuilding(p.SizeX, p.SizeZ)).ToList();
                foreach (var v in roster)
                {
                    // A stand point pressed against a wall may sit inside the neighbouring box by a spread step; that box is exempt, as in LaneRoute.
                    var own = new[] { VillagerPlaceKind.Home, VillagerPlaceKind.Workplace, VillagerPlaceKind.Square }.Select(k => VillagerRules.StandPoint(v, k, layout, Grid, Grid, seed)).ToList();
                    var obstacles = buildings.Where(q => !own.Any(o => SegmentHitsBox(o.X, o.Z, o.X, o.Z, q))).ToList();
                    for (double t = 0; t < GameClock.MinutesPerDay; t += 5)
                    {
                        var pr = VillagerRules.PresenceAt(roster, v, t, 0f, layout, Grid, Grid, seed);
                        if (pr.Gone || !pr.Walking || pr.Stop == VillagerStopKind.Patrol || pr.Stop == VillagerStopKind.Shore) continue;
                        foreach (var p in obstacles)
                            Assert.False(SegmentHitsBox(pr.X, pr.Z, pr.X, pr.Z, p), "villager " + v.Index + " walks through " + p.Id + " at tick " + t);
                    }
                }
            }
        }
    }
}
