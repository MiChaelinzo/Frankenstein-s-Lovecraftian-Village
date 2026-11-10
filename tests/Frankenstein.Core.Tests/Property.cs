using System;
using Frankenstein.Core;

namespace Frankenstein.Core.Tests
{
    /// <summary>Tiny dependency-free property runner: many seeded random cases, failing seed reported.</summary>
    internal static class Property
    {
        public const int Cases = 300;

        public static void ForAll(Action<SeededRandom, int> check)
        {
            for (int seed = 1; seed <= Cases; seed++)
            {
                try { check(new SeededRandom(seed * 7919), seed); }
                catch (Exception ex)
                {
                    throw new Exception($"Property failed for case seed {seed}: {ex.Message}", ex);
                }
            }
        }

        public static PrefabCatalog RandomCatalog(SeededRandom r)
        {
            var list = new System.Collections.Generic.List<CatalogEntry>();
            int n = 1 + r.Next(8);
            for (int i = 0; i < n; i++)
                list.Add(new CatalogEntry { id = "p" + i, category = "c", weight = 1 + r.Next(9), footprintX = 1 + r.Next(3), footprintZ = 1 + r.Next(3), horror = r.Next(10) });
            return new PrefabCatalog(list);
        }
    }
}
