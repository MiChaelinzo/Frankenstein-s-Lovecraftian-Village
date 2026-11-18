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

            var occupied = ReserveStreets(width, depth);
            Fill(result, new SeededRandom(seed), occupied, catalog, width, depth, 0, 0, width, depth, targetCount, null);
            return result;
        }

        /// <summary>
        /// The city: the grid is cut into chunks of <see cref="VillageDistricts.ChunkCells"/> cells, each with its own seeded stream and its share of the
        /// piece count, and a piece is accepted according to its taste for the district it lands in (<see cref="VillageDistricts.Affinity"/>).
        /// A piece never crosses a chunk edge. Same guarantees as <see cref="Generate"/>.
        /// </summary>
        public static List<PlacedPiece> GenerateCity(PrefabCatalog catalog, int width, int depth, int targetCount, int seed)
        {
            var result = new List<PlacedPiece>();
            if (catalog == null || catalog.Entries.Count == 0 || width <= 0 || depth <= 0 || targetCount <= 0)
                return result;

            var occupied = ReserveStreets(width, depth);
            var districts = VillageDistricts.Map(seed, width, depth);
            int chunksX = VillageDistricts.ChunkCount(width), chunksZ = VillageDistricts.ChunkCount(depth);
            long total = (long)width * depth, before = 0;
            for (int cz = 0; cz < chunksZ; cz++)
                for (int cx = 0; cx < chunksX; cx++)
                {
                    int x0 = cx * VillageDistricts.ChunkCells, z0 = cz * VillageDistricts.ChunkCells;
                    int x1 = Math.Min(width, x0 + VillageDistricts.ChunkCells), z1 = Math.Min(depth, z0 + VillageDistricts.ChunkCells);
                    long after = before + (long)(x1 - x0) * (z1 - z0);
                    int target = (int)(targetCount * after / total - targetCount * before / total);
                    before = after;
                    var rng = new SeededRandom(VillageDistricts.ChunkSeed(seed, cz * chunksX + cx));
                    Fill(result, rng, occupied, catalog, width, depth, x0, z0, x1, z1, target, districts);
                }
            return result;
        }

        private static bool[,] ReserveStreets(int width, int depth)
        {
            var occupied = new bool[width, depth];
            for (int sx = 0; sx < width; sx++)
                for (int sz = 0; sz < depth; sz++)
                    occupied[sx, sz] = VillageStreets.IsStreetCell(width, depth, sx, sz);
            return occupied;
        }

        /// <summary>Places up to target pieces with their cells inside [x0, x1) by [z0, z1). With a district map every pick also rolls its taste for the district.</summary>
        private static void Fill(List<PlacedPiece> result, SeededRandom rng, bool[,] occupied, PrefabCatalog catalog, int width, int depth,
            int x0, int z0, int x1, int z1, int target, int[,] districts)
        {
            int total = catalog.TotalWeight;
            int attempts = target * 20, placed = 0;
            for (int i = 0; i < attempts && placed < target; i++)
            {
                var entry = catalog.PickByWeight(rng.Next(total));
                int x = x0 + rng.Next(x1 - x0);
                int z = z0 + rng.Next(z1 - z0);
                if (districts != null && rng.Next(100) >= VillageDistricts.Affinity(districts[x, z], entry.id)) continue;
                if (!Fits(occupied, x1, z1, x, z, entry.footprintX, entry.footprintZ)) continue;
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
                placed++;
            }
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
