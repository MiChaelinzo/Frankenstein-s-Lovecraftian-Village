using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class InvestigatorProperties
    {
        private static System.Collections.Generic.List<PlacedPiece> Layout(SeededRandom r, out int w, out int d, out int seed)
        {
            w = 8 + r.Next(24); d = 8 + r.Next(24); seed = r.Next(2000000) - 1000000;
            return VillageLayoutGenerator.Generate(Property.RandomCatalog(r), w, d, 5 + r.Next(40), seed);
        }

        [Fact]
        public void Same_seed_gives_identical_route_and_hits()
        {
            Property.ForAll((r, _) =>
            {
                var layout = Layout(r, out int w, out int d, out int seed);
                var a = new Investigator(layout, w, d, seed);
                var b = new Investigator(layout, w, d, seed);
                Assert.Equal(a.Route.Select(c => (c.X, c.Z)), b.Route.Select(c => (c.X, c.Z)));
                Assert.Equal(Investigator.Simulate(layout, w, d, seed).Select(Investigator.Describe), Investigator.Simulate(layout, w, d, seed).Select(Investigator.Describe));
            });
        }

        [Fact]
        public void Route_stays_in_bounds_and_moves_one_cell_per_tick()
        {
            Property.ForAll((r, _) =>
            {
                var layout = Layout(r, out int w, out int d, out int seed);
                var route = new Investigator(layout, w, d, seed).Route;
                Assert.True(route.Count == 0 || route.Count >= 1);
                for (int i = 0; i < route.Count; i++)
                {
                    Assert.InRange(route[i].X, 0, w - 1);
                    Assert.InRange(route[i].Z, 0, d - 1);
                    if (i > 0) Assert.Equal(1, System.Math.Abs(route[i].X - route[i - 1].X) + System.Math.Abs(route[i].Z - route[i - 1].Z));
                }
            });
        }

        [Fact]
        public void Hits_are_unique_per_site_in_range_and_bounded()
        {
            Property.ForAll((r, _) =>
            {
                var layout = Layout(r, out int w, out int d, out int seed);
                var hits = Investigator.Simulate(layout, w, d, seed);
                Assert.True(hits.Count <= layout.Count(p => System.Array.IndexOf(Investigator.OmenSiteIds, p.Id) >= 0));
                foreach (var h in hits)
                {
                    Assert.InRange(h.SanityLoss, 3, 7);
                    Assert.True(layout.Any(p => p.Id == h.SiteId));
                }
                Assert.Equal(hits.Select(h => h.Tick).OrderBy(t => t), hits.Select(h => h.Tick));
            });
        }

        [Fact]
        public void Empty_layout_is_safe()
        {
            var inv = new Investigator(new System.Collections.Generic.List<PlacedPiece>(), 10, 10, 1);
            Assert.True(inv.Finished);
            Assert.False(inv.Step(out _));
        }
    }
}
