using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// Engine-free district map of the city. A district is a quarter with its own dressing palette and its own taste in buildings:
    /// Harbour (the quay band around the dock), Fishers' Row (the rest of the coast band), Chapel Hill (the quarter beside the church rise),
    /// Market (around the cobbled square) and Old Town (everything else). The map depends on the seed (which side is the coast, where the dock
    /// stands) and the grid size, and on nothing else. The city grid is cut into square chunks that are generated independently.
    /// The JS mirror is web/src/districts.js; the golden data checks both.
    /// </summary>
    public static class VillageDistricts
    {
        public const int Harbour = 0, OldTown = 1, ChapelHill = 2, Market = 3, FishersRow = 4, Count = 5;
        public static readonly string[] Ids = { "harbour", "old_town", "chapel_hill", "market", "fishers_row" };

        /// <summary>The grid and piece count of the city the web demo builds (round 23; the village before was 24 by 24 with 80 pieces).</summary>
        public const int CityGrid = 36;
        public const int CityPieces = 180;
        /// <summary>Cells along one side of a chunk. A building never crosses a chunk edge, so every chunk is generated on its own.</summary>
        public const int ChunkCells = 12;
        /// <summary>Seed multiplier per chunk index; chunk 0 uses the seed itself.</summary>
        public const int ChunkSeedStep = 0x2545;

        /// <summary>Chebyshev radius in cells around the square centre cell that belongs to the market.</summary>
        public const int MarketRadius = 4;
        /// <summary>Radius in cells around the cell nearest the church rise that belongs to Chapel Hill.</summary>
        public const int ChapelReach = 8;
        /// <summary>Depth in cells of the coast band (harbour and fishers' row).</summary>
        public const int CoastBand = 6;
        /// <summary>Cells each side of the dock that belong to the harbour.</summary>
        public const int HarbourHalfSpan = 7;

        public static int ChunkCount(int extent) { return extent <= 0 ? 0 : (extent + ChunkCells - 1) / ChunkCells; }

        public static int ChunkOf(int cell) { return cell / ChunkCells; }

        /// <summary>The district of a cell. Priority: market, chapel hill, harbour, fishers' row, old town.</summary>
        public static int At(int seed, int gridW, int gridD, int x, int z)
        {
            int mx = gridW / 2, mz = gridD / 2;
            if (Math.Abs(x - mx) <= MarketRadius && Math.Abs(z - mz) <= MarketRadius) return Market;

            int side = VillagerRules.CoastSide(seed);
            bool east = side == 0 ? true : side == 1 ? false : (((seed ^ 0x3c3c) & 1) == 0);
            int ax = east ? gridW - 1 : 0, az = (int)Math.Floor(gridD * VillageDressing.Cell * 0.35 / VillageDressing.Cell);
            int dx = x - ax, dz = z - az;
            if (dx * dx + dz * dz <= ChapelReach * ChapelReach) return ChapelHill;

            int depth = side == 0 ? x : side == 1 ? gridW - 1 - x : z;
            if (depth >= CoastBand) return OldTown;
            int along = side == 2 ? x : z;
            int dockCell = (int)Math.Floor(VillageDressing.DockU(seed, gridW, gridD) / VillageDressing.Cell);
            return Math.Abs(along - dockCell) <= HarbourHalfSpan ? Harbour : FishersRow;
        }

        /// <summary>The whole map, indexed [x, z].</summary>
        public static int[,] Map(int seed, int gridW, int gridD)
        {
            var map = new int[Math.Max(0, gridW), Math.Max(0, gridD)];
            for (int x = 0; x < gridW; x++)
                for (int z = 0; z < gridD; z++) map[x, z] = At(seed, gridW, gridD, x, z);
            return map;
        }

        /// <summary>Dressing kinds of a district, in roll order (a repeated kind is weighted double). Every kind exists in VillageDressing.FootprintOf. The CC0 barrel and bench are left out on purpose: their textured meshes cost 600 to 1500 triangles each.</summary>
        public static string[] Palette(int district)
        {
            switch (district)
            {
                case Harbour: return new[] { "crate_stack", "rope_coil", "sack", "bollard", "crate_stack" };
                case ChapelHill: return new[] { "gravestone", "gravestone_cross", "fence_iron", "stump", "bush" };
                case Market: return new[] { "market_stall", "cart", "crate_stack", "sack", "market_stall" };
                case FishersRow: return new[] { "net", "laundry_line", "woodpile", "rope_coil", "sack" };
                default: return new[] { "hedge", "wall_low", "sign", "picket_fence", "bush" };
            }
        }

        /// <summary>Percent chance, per cell, that a district puts one palette prop in a free yard cell.</summary>
        public static int PaletteDensity(int district)
        {
            switch (district)
            {
                case Market: return 45;
                case Harbour: return 40;
                case FishersRow: return 35;
                case ChapelHill: return 30;
                default: return 12;
            }
        }

        /// <summary>Percent chance that a catalog piece is accepted when its roll lands in a district: the quarters keep their character without forbidding anything.</summary>
        public static int Affinity(int district, string pieceId)
        {
            switch (pieceId)
            {
                case "church": return district == ChapelHill ? 100 : 25;
                case "altar": return district == ChapelHill ? 100 : district == OldTown ? 60 : 20;
                case "well": return district == Market ? 100 : district == OldTown ? 80 : district == ChapelHill ? 30 : 50;
                case "house_b": return district == FishersRow ? 100 : district == Harbour ? 80 : district == OldTown ? 70 : 60;
                case "dead_tree": return district == ChapelHill ? 100 : district == FishersRow ? 60 : 40;
                default: return district == OldTown || district == Market ? 100 : 90;
            }
        }

        public static int ChunkSeed(int seed, int chunkIndex) { return seed ^ (chunkIndex * ChunkSeedStep); }
    }
}
