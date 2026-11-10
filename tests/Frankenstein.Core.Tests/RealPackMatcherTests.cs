using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Matcher behavior against real prefab names (names only) seen in the Lovecraftian Village scenes.</summary>
    public class RealPackMatcherTests
    {
        private static readonly string[] RealNames =
        {
            "BigHouse00", "TallHouse00", "CoastalHouse00", "CoastalHouse01", "GuardHouse00", "_Sp_TrunkDead00", "_Sp_TrunkDead01",
            "_Sp_TrunkPinus00", "WallCross00", "Pinnacle00c", "PillarStone00a", "WoodBucket00", "WoodBucket00b",
            "CandleHolderWall00b Variant", "Barrel00b Variant", "Roof3x3_a", "Boat00",
        };

        [Fact]
        public void Single_letter_tokens_never_create_a_partial_score()
        {
            Assert.Equal(0, PrefabNameMatcher.Score("house_b", "CandleHolderWall00b Variant"));
            Assert.Equal(0, PrefabNameMatcher.Score("house_b", "Barrel00b Variant"));
            Assert.Equal(0, PrefabNameMatcher.Score("b", "Barrel00b"));
            Property.ForAll((r, seed) =>
            {
                char c = (char)('a' + r.Next(26));
                string single = c.ToString();
                string cand = "Prop" + r.Next(50) + c + " Variant";
                Assert.Equal(0, PrefabNameMatcher.Score(single, cand));
                Assert.Equal(0, PrefabNameMatcher.Score("house_" + single, "Candle00" + single));
            });
        }

        [Fact]
        public void Sp_prefix_and_variant_suffix_do_not_create_matches_but_exact_is_unchanged()
        {
            Assert.Equal(PrefabNameMatcher.ExactScore, PrefabNameMatcher.Score("_Sp_TrunkDead00", "_Sp_TrunkDead00"));
            Assert.Equal(0, PrefabNameMatcher.Score("sp", "_Sp_TrunkDead00"));
            Assert.Equal(0, PrefabNameMatcher.Score("variant", "Barrel00 Variant"));
            Assert.True(PrefabNameMatcher.Score("dead_tree", "_Sp_TrunkDead00") > 0);
            Assert.True(PrefabNameMatcher.Score("dead_tree", "_Sp_TrunkPinus00") > 0);
        }

        [Fact]
        public void Resolve_prefers_hint_and_falls_back_to_best()
        {
            Assert.Equal("BigHouse00", PrefabNameMatcher.Resolve("house_b", "BigHouse00", RealNames));
            Assert.Equal("CoastalHouse00", PrefabNameMatcher.Resolve("house_a", "coastal_house_00", RealNames));
            Assert.Equal(PrefabNameMatcher.Best("house_a", RealNames), PrefabNameMatcher.Resolve("house_a", null, RealNames));
            Assert.Equal(PrefabNameMatcher.Best("house_a", RealNames), PrefabNameMatcher.Resolve("house_a", "", RealNames));
            Assert.Equal(PrefabNameMatcher.Best("house_a", RealNames), PrefabNameMatcher.Resolve("house_a", "NoSuchPrefab", RealNames));
            Assert.Null(PrefabNameMatcher.Resolve("house_a", "NoSuchPrefab", null));
        }

        [Fact]
        public void Resolve_is_independent_of_candidate_order()
        {
            Property.ForAll((r, seed) =>
            {
                var cands = RealNames.ToList();
                for (int i = cands.Count - 1; i > 0; i--) { int j = r.Next(i + 1); (cands[i], cands[j]) = (cands[j], cands[i]); }
                foreach (var id in new[] { "house_a", "house_b", "church", "well", "dead_tree", "altar" })
                    foreach (var hint in new[] { null, "", "WoodBucket00", "Missing" })
                        Assert.Equal(PrefabNameMatcher.Resolve(id, hint, RealNames), PrefabNameMatcher.Resolve(id, hint, cands));
            });
        }

        [Fact]
        public void Every_catalog_entry_has_a_hint_that_resolves_to_itself()
        {
            string dir = AppContext.BaseDirectory;
            while (dir != null && !File.Exists(Path.Combine(dir, "tools", "validate_repo.py"))) dir = Path.GetDirectoryName(dir);
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, "Assets", "Data", "village_catalog.json")));
            var hints = new Dictionary<string, string>();
            foreach (var e in doc.RootElement.GetProperty("entries").EnumerateArray())
                hints[e.GetProperty("id").GetString()] = e.TryGetProperty("prefabHint", out var h) ? h.GetString() : null;
            Assert.NotEmpty(hints);
            foreach (var kv in hints)
            {
                Assert.False(string.IsNullOrWhiteSpace(kv.Value), kv.Key + " has no prefabHint");
                var cands = new List<string>(RealNames) { kv.Value };
                Assert.Equal(kv.Value, PrefabNameMatcher.Resolve(kv.Key, kv.Value, cands));
            }
        }

        [Fact]
        public void Catalog_tolerates_missing_prefab_hint()
        {
            var cat = new PrefabCatalog(new[] { new CatalogEntry { id = "a" }, new CatalogEntry { id = "b", prefabHint = "Foo" } });
            Assert.True(cat.TryGet("a", out var a));
            Assert.True(string.IsNullOrEmpty(a.prefabHint));
            Assert.True(cat.TryGet("b", out var b));
            Assert.Equal("Foo", b.prefabHint);
        }
    }
}
