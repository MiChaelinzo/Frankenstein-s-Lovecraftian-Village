using System;
using System.Collections.Generic;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class LayoutProperties
    {
        [Fact]
        public void Layout_is_deterministic_for_same_seed()
        {
            Property.ForAll((r, seed) =>
            {
                var cat = Property.RandomCatalog(r);
                var a = VillageLayoutGenerator.Generate(cat, 16, 16, 30, seed);
                var b = VillageLayoutGenerator.Generate(cat, 16, 16, 30, seed);
                Assert.Equal(a.Count, b.Count);
                for (int i = 0; i < a.Count; i++) Assert.Equal(a[i], b[i]);
            });
        }

        [Fact]
        public void Pieces_stay_in_bounds_never_overlap_and_use_catalog_ids()
        {
            Property.ForAll((r, seed) =>
            {
                var cat = Property.RandomCatalog(r);
                int w = 1 + r.Next(20), d = 1 + r.Next(20), count = 1 + r.Next(60);
                var layout = VillageLayoutGenerator.Generate(cat, w, d, count, seed);
                Assert.True(layout.Count <= count);
                var seen = new HashSet<(int, int)>();
                foreach (var p in layout)
                {
                    Assert.True(cat.Contains(p.Id));
                    Assert.True(p.X >= 0 && p.Z >= 0 && p.X + p.SizeX <= w && p.Z + p.SizeZ <= d);
                    for (int x = 0; x < p.SizeX; x++)
                        for (int z = 0; z < p.SizeZ; z++)
                            Assert.True(seen.Add((p.X + x, p.Z + z)), "overlap");
                }
            });
        }

        [Fact]
        public void Degenerate_inputs_yield_empty_layout()
        {
            var cat = new PrefabCatalog(new CatalogEntry[0]);
            Assert.Empty(VillageLayoutGenerator.Generate(cat, 10, 10, 10, 1));
            Assert.Empty(VillageLayoutGenerator.Generate(null, 10, 10, 10, 1));
            Assert.Empty(VillageLayoutGenerator.Generate(Property.RandomCatalog(new SeededRandom(1)), 0, 10, 10, 1));
        }
    }

    public class CatalogProperties
    {
        [Fact]
        public void PickByWeight_always_returns_an_entry_for_any_valid_roll()
        {
            Property.ForAll((r, seed) =>
            {
                var cat = Property.RandomCatalog(r);
                for (int roll = 0; roll < cat.TotalWeight; roll++)
                    Assert.NotNull(cat.PickByWeight(roll));
            });
        }

        [Fact]
        public void Invalid_and_duplicate_entries_are_dropped()
        {
            var cat = new PrefabCatalog(new[]
            {
                new CatalogEntry { id = "a", weight = 1 },
                new CatalogEntry { id = "a", weight = 5 },
                new CatalogEntry { id = "", weight = 1 },
                new CatalogEntry { id = "bad", weight = 0 },
            });
            Assert.Single(cat.Entries);
            Assert.Equal(1, cat.TotalWeight);
        }
    }

    public class SanityProperties
    {
        [Fact]
        public void Sanity_stays_within_bounds_under_any_sequence_of_deltas()
        {
            Property.ForAll((r, seed) =>
            {
                var s = new SanityModel(r.Next(201) - 50);
                for (int i = 0; i < 50; i++)
                {
                    s.Apply(r.Next(401) - 200);
                    Assert.InRange(s.Value, 0f, SanityModel.Max);
                    Assert.InRange(s.Dread, 0f, 1f);
                }
            });
        }

        [Fact]
        public void Dread_is_monotonic_non_increasing_in_sanity()
        {
            Property.ForAll((r, seed) =>
            {
                float a = r.Next(101), b = r.Next(101);
                if (a <= b) Assert.True(SanityModel.DreadFor(a) >= SanityModel.DreadFor(b));
                else Assert.True(SanityModel.DreadFor(a) <= SanityModel.DreadFor(b));
            });
        }

        [Fact]
        public void NaN_is_treated_as_zero_sanity()
        {
            var s = new SanityModel();
            s.Apply(float.NaN);
            Assert.Equal(0f, s.Value);
        }
    }

    public class NarrationProperties
    {
        private sealed class Throwing : INarrationProvider { public string Narrate(string l, float d) { throw new InvalidOperationException(); } }
        private sealed class Empty : INarrationProvider { public string Narrate(string l, float d) { return "  "; } }

        [Fact]
        public void Safe_provider_never_throws_and_never_returns_blank()
        {
            Property.ForAll((r, seed) =>
            {
                INarrationProvider primary = r.Next(3) == 0 ? new Throwing() : r.Next(2) == 0 ? (INarrationProvider)new Empty() : null;
                var safe = new SafeNarrationProvider(primary, null);
                var text = safe.Narrate(r.Next(2) == 0 ? null : "crypt", r.Next(101) / 100f);
                Assert.False(string.IsNullOrWhiteSpace(text));
            });
        }
    }
}
