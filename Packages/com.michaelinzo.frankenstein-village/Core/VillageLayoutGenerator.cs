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
        /// <summary>Quarter turns of the door side (0 faces +z, 1 +x, 2 -z, 3 -x); see VillageStreets. Always 0 where the grid has no streets.</summary>
        public int Facing;
    }

    /// <summary>
    /// Stitches catalog pieces onto a grid. Deterministic for a given seed and
    /// guarantees: in bounds, no overlaps, only catalog ids, no piece on a street cell
    /// and every building (footprint of at least 2 by 2 cells) touching a street.
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
            for (int sx = 0; sx < width; sx++)
                for (int sz = 0; sz < depth; sz++)
                    occupied[sx, sz] = VillageStreets.IsStreetCell(width, depth, sx, sz);
            int total = catalog.TotalWeight;
            int attempts = targetCount * 20;

            for (int i = 0; i < attempts && result.Count < targetCount; i++)
            {
                var entry = catalog.PickByWeight(rng.Next(total));
                int x = rng.Next(width);
                int z = rng.Next(depth);
                if (!Fits(occupied, width, depth, x, z, entry.footprintX, entry.footprintZ)) continue;
                int facing = 0;
                if (VillageStreets.Enabled(width, depth) && VillageStreets.IsBuilding(entry.footprintX, entry.footprintZ))
                {
                    facing = VillageStreets.FacingFor(width, depth, x, z, entry.footprintX, entry.footprintZ);
                    if (facing < 0) continue;
                }

                for (int dx = 0; dx < entry.footprintX; dx++)
                    for (int dz = 0; dz < entry.footprintZ; dz++)
                        occupied[x + dx, z + dz] = true;

                result.Add(new PlacedPiece { Id = entry.id, X = x, Z = z, SizeX = entry.footprintX, SizeZ = entry.footprintZ, Facing = facing });
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
