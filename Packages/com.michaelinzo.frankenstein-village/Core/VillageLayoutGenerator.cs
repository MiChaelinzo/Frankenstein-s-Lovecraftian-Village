using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    public struct PlacedPiece
    {
        public string Id;
        public int X;
        public int Z;
        public int SizeX;
        public int SizeZ;
    }

    /// <summary>
    /// Stitches catalog pieces onto a grid. Deterministic for a given seed and
    /// guarantees: in bounds, no overlaps, only catalog ids.
    /// </summary>
    public static class VillageLayoutGenerator
    {
        public static List<PlacedPiece> Generate(PrefabCatalog catalog, int width, int depth, int targetCount, int seed)
        {
            var result = new List<PlacedPiece>();
            if (catalog == null || catalog.Entries.Count == 0 || width <= 0 || depth <= 0 || targetCount <= 0)
                return result;

            var rng = new SeededRandom(seed);
            var occupied = new bool[width, depth];
            int total = catalog.TotalWeight;
            int attempts = targetCount * 20;

            for (int i = 0; i < attempts && result.Count < targetCount; i++)
            {
                var entry = catalog.PickByWeight(rng.Next(total));
                int x = rng.Next(width);
                int z = rng.Next(depth);
                if (!Fits(occupied, width, depth, x, z, entry.footprintX, entry.footprintZ)) continue;

                for (int dx = 0; dx < entry.footprintX; dx++)
                    for (int dz = 0; dz < entry.footprintZ; dz++)
                        occupied[x + dx, z + dz] = true;

                result.Add(new PlacedPiece { Id = entry.id, X = x, Z = z, SizeX = entry.footprintX, SizeZ = entry.footprintZ });
            }
            return result;
        }

        private static bool Fits(bool[,] occ, int w, int d, int x, int z, int sx, int sz)
        {
            if (x + sx > w || z + sz > d) return false;
            for (int dx = 0; dx < sx; dx++)
                for (int dz = 0; dz < sz; dz++)
                    if (occ[x + dx, z + dz]) return false;
            return true;
        }
    }
}
