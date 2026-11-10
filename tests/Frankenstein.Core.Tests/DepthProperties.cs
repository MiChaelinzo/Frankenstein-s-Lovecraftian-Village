using System;
using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class DreadEventProperties
    {
        private static float RandomDread(SeededRandom r)
        {
            int k = r.Next(20);
            if (k == 0) return float.NaN;
            if (k == 1) return float.PositiveInfinity;
            if (k == 2) return float.NegativeInfinity;
            return (r.Next(1400) - 200) / 1000f;
        }

        [Fact]
        public void Same_rising_event_never_repeats_without_a_falling_event_and_tier_is_consistent()
        {
            Property.ForAll((r, seed) =>
            {
                var t = new DreadEventTracker();
                var lastRising = new HashSet<string>();
                for (int i = 0; i < 80; i++)
                {
                    float d = RandomDread(r);
                    foreach (var e in t.Update(d))
                    {
                        if (e.Rising) Assert.True(lastRising.Add(e.Name), "duplicate rising " + e.Name);
                        else Assert.True(lastRising.Remove(e.Name), "falling without rising " + e.Name);
                    }
                    int stateless = DreadThresholds.TierFor(d);
                    Assert.True(t.Tier >= stateless);
                    if (t.Tier > stateless) Assert.True(DreadThresholds.Sanitize(d) >= DreadThresholds.FallingLevel(t.Tier - 1));
                    Assert.Equal(t.Tier, lastRising.Count);
                }
            });
        }

        [Fact]
        public void Monotonic_sweep_emits_each_rising_event_once_in_order()
        {
            Property.ForAll((r, seed) =>
            {
                var t = new DreadEventTracker();
                var all = new List<DreadEvent>();
                float d = 0f;
                while (d < 1f) { all.AddRange(t.Update(d)); d += (1 + r.Next(50)) / 1000f; }
                all.AddRange(t.Update(1f));
                Assert.Equal(new[] { "Uneasy+1", "Dire+2", "Abyss+3" }, all.Select(e => e.ToString()).ToArray());
            });
        }

        [Fact]
        public void Jitter_inside_the_hysteresis_band_is_silent()
        {
            var t = new DreadEventTracker();
            Assert.Single(t.Update(0.35f));
            for (int i = 0; i < 20; i++) Assert.Empty(t.Update(i % 2 == 0 ? 0.33f : 0.35f));
            var down = t.Update(0.2f);
            Assert.Equal("Uneasy-0", down.Single().ToString());
        }

        [Fact]
        public void Non_finite_dread_is_treated_as_zero()
        {
            var t = new DreadEventTracker();
            foreach (var d in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
            {
                Assert.Empty(t.Update(d));
                Assert.Equal(0, t.Tier);
                Assert.Equal(0, DreadThresholds.TierFor(d));
            }
        }

        [Fact]
        public void Tier_thresholds_align_with_narration_tiers()
        {
            Assert.Equal(0, DreadThresholds.TierFor(0.339f));
            Assert.Equal(1, DreadThresholds.TierFor(0.34f));
            Assert.Equal(2, DreadThresholds.TierFor(0.67f));
            Assert.Equal(3, DreadThresholds.TierFor(1f));
        }
    }

    public class VillageReportProperties
    {
        [Fact]
        public void Counts_sum_to_pieces_cells_match_footprints_and_output_is_deterministic()
        {
            Property.ForAll((r, seed) =>
            {
                var cat = Property.RandomCatalog(r);
                int w = 1 + r.Next(20), d = 1 + r.Next(20), n = 1 + r.Next(60);
                float dread = r.Next(101) / 100f;
                var layout = VillageLayoutGenerator.Generate(cat, w, d, n, seed);
                var a = VillageReport.Build(cat, layout, w, d, seed, dread);
                var b = VillageReport.Build(cat, layout, w, d, seed, dread);

                Assert.Equal(layout.Count, a.PieceCount);
                Assert.Equal(layout.Count, a.ById.Sum(c => c.Value));
                Assert.Equal(layout.Count, a.ByCategory.Sum(c => c.Value));
                Assert.Equal(layout.Sum(p => p.SizeX * p.SizeZ), a.CellsUsed);
                Assert.True(a.CellsUsed <= w * d);
                Assert.Equal(layout.Sum(p => { cat.TryGet(p.Id, out var e); return e.horror; }), a.TotalHorror);
                Assert.Equal(a.ToMarkdown(), b.ToMarkdown());
                Assert.Equal(a.ToJson(), b.ToJson());
                foreach (var s in new[] { a.ToMarkdown(), a.ToJson() })
                {
                    Assert.DoesNotContain('\u2014', s);
                    Assert.DoesNotContain("\r", s);
                }
            });
        }

        [Fact]
        public void Empty_and_null_inputs_produce_a_valid_report()
        {
            var r = VillageReport.Build(null, null, 4, 4, 1, float.NaN);
            Assert.Equal(0, r.PieceCount);
            Assert.Equal("Calm", r.Tier);
            Assert.Contains("- none", r.ToMarkdown());
            Assert.Contains("\"byId\": {}", r.ToJson());
        }
    }

    public class PrefabNameMatcherProperties
    {
        private static readonly string[] Words = { "house", "church", "well", "tree", "altar", "Barn", "Cottage", "Chapel", "Rock", "Fence", "Shrine", "Dead" };

        private static string RandomName(SeededRandom r)
        {
            int parts = 1 + r.Next(3);
            var sb = new System.Text.StringBuilder();
            for (int i = 0; i < parts; i++) sb.Append(i > 0 ? (r.Next(2) == 0 ? "_" : " ") : "").Append(Words[r.Next(Words.Length)]).Append(r.Next(3) == 0 ? r.Next(20).ToString() : "");
            return sb.ToString();
        }

        [Fact]
        public void Best_is_deterministic_and_independent_of_candidate_order()
        {
            Property.ForAll((r, seed) =>
            {
                var cands = Enumerable.Range(0, 1 + r.Next(10)).Select(_ => RandomName(r)).ToList();
                string id = RandomName(r);
                var a = PrefabNameMatcher.Best(id, cands);
                var reversed = new List<string>(cands); reversed.Reverse();
                Assert.Equal(a, PrefabNameMatcher.Best(id, reversed));
                Assert.Equal(a, PrefabNameMatcher.Best(id, cands));
            });
        }

        [Fact]
        public void Exact_name_wins_and_null_when_nothing_scores()
        {
            Property.ForAll((r, seed) =>
            {
                var cands = Enumerable.Range(0, 1 + r.Next(10)).Select(_ => RandomName(r)).ToList();
                string id = RandomName(r);
                cands.Insert(r.Next(cands.Count + 1), id.ToUpperInvariant().Replace(' ', '-') == id ? id : id);
                Assert.Equal(PrefabNameMatcher.Normalize(id), PrefabNameMatcher.Normalize(PrefabNameMatcher.Best(id, cands)));
                Assert.Equal(PrefabNameMatcher.ExactScore, PrefabNameMatcher.Score(id, id));
            });
            Assert.Null(PrefabNameMatcher.Best("house_a", new[] { "Rock", "Fence_02", "" }));
            Assert.Null(PrefabNameMatcher.Best("house_a", new string[0]));
            Assert.Null(PrefabNameMatcher.Best("house_a", null));
        }

        [Fact]
        public void Aliases_and_camel_case_match()
        {
            Assert.Equal("Cottage_03", PrefabNameMatcher.Best("house_a", new[] { "Rock", "Cottage_03" }));
            Assert.Equal("StoneChapel", PrefabNameMatcher.Best("church", new[] { "Fence", "StoneChapel" }));
            Assert.Equal("Tree01", PrefabNameMatcher.Best("dead_tree", new[] { "Tree01", "Well" }));
            Assert.Equal("House_B", PrefabNameMatcher.Best("house_b", new[] { "House_A", "House_B" }));
        }
    }
}
