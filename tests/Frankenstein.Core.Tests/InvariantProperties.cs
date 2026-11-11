using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 10 cross-module invariants. JS counterparts live in web/test/invariants.test.js.</summary>
    public class InvariantProperties
    {
        [Fact]
        public void Layout_pieces_stay_in_bounds_and_never_overlap()
        {
            Property.ForAll((r, seed) =>
            {
                var cat = Property.RandomCatalog(r);
                int w = 1 + r.Next(20), d = 1 + r.Next(20), n = 1 + r.Next(80);
                var cells = new HashSet<(int, int)>();
                foreach (var p in VillageLayoutGenerator.Generate(cat, w, d, n, seed))
                {
                    Assert.True(p.X >= 0 && p.Z >= 0 && p.X + p.SizeX <= w && p.Z + p.SizeZ <= d);
                    for (int x = 0; x < p.SizeX; x++)
                        for (int z = 0; z < p.SizeZ; z++)
                            Assert.True(cells.Add((p.X + x, p.Z + z)));
                }
            });
        }

        [Fact]
        public void Layout_never_exceeds_target_count()
        {
            Property.ForAll((r, seed) =>
            {
                var cat = Property.RandomCatalog(r);
                int n = 1 + r.Next(40);
                Assert.True(VillageLayoutGenerator.Generate(cat, 1 + r.Next(20), 1 + r.Next(20), n, seed).Count <= n);
            });
        }

        [Fact]
        public void Dread_is_unit_range_and_non_increasing_in_sanity()
        {
            Property.ForAll((r, seed) =>
            {
                float a = r.Next(1001) / 10f, b = r.Next(1001) / 10f;
                float lo = System.Math.Min(a, b), hi = System.Math.Max(a, b);
                float dLo = SanityModel.DreadFor(lo), dHi = SanityModel.DreadFor(hi);
                Assert.True(dLo >= dHi);
                Assert.True(dLo >= 0f && dLo <= 1f && dHi >= 0f && dHi <= 1f);
            });
        }

        [Fact]
        public void Tier_is_monotone_in_dread_and_within_range()
        {
            Property.ForAll((r, seed) =>
            {
                float a = r.Next(101) / 100f, b = r.Next(101) / 100f;
                float lo = System.Math.Min(a, b), hi = System.Math.Max(a, b);
                int tLo = DreadThresholds.TierFor(lo), tHi = DreadThresholds.TierFor(hi);
                Assert.True(tLo <= tHi);
                Assert.InRange(tHi, 0, DreadThresholds.TierNames.Length - 1);
            });
        }

        [Fact]
        public void Campaign_nights_are_numbered_in_order_and_sky_never_lightens()
        {
            string[] order = { "dusk", "night", "witching" };
            Property.ForAll((r, seed) =>
            {
                var c = CampaignGenerator.Generate(r.Next(2000000) - 1000000, r.Next(14) - 2);
                Assert.Equal(Enumerable.Range(1, c.Nights.Count), c.Nights.Select(x => x.Number));
                Assert.InRange(c.Nights.Count, CampaignGenerator.MinNights, CampaignGenerator.MaxNights);
                int prev = 0;
                foreach (var n in c.Nights)
                {
                    int idx = System.Array.IndexOf(order, n.Sky);
                    Assert.True(idx >= prev);
                    prev = idx;
                }
            });
        }

        [Fact]
        public void Report_landmarks_match_category_and_average_horror_is_bounded()
        {
            Property.ForAll((r, seed) =>
            {
                var cat = Property.RandomCatalog(r);
                int w = 1 + r.Next(20), d = 1 + r.Next(20);
                var layout = VillageLayoutGenerator.Generate(cat, w, d, 1 + r.Next(60), seed);
                var rep = VillageReport.Build(cat, layout, w, d, seed, r.Next(101) / 100f);
                Assert.Equal(rep.ByCategory.Where(c => c.Key == "Landmark").Sum(c => c.Value), rep.Landmarks.Count);
                if (rep.PieceCount == 0) { Assert.Equal(0, rep.AverageHorrorX100); return; }
                var horrors = layout.Select(p => { cat.TryGet(p.Id, out var e); return e.horror; }).ToList();
                Assert.InRange(rep.AverageHorrorX100, horrors.Min() * 100, horrors.Max() * 100);
                Assert.InRange(rep.DreadPercent, 0, 100);
            });
        }
    }
}
