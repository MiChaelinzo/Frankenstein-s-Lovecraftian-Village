using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// Engine-free street network of the village, derived from the grid size alone (no seed, no randomness), so it can be reserved before any
    /// building is placed. Lanes are one cell (4 m) wide and run the full grid in both directions every <see cref="LaneSpacing"/> cells, centred
    /// on the main lane. A cobbled square of 3 by 3 cells sits where the two main lanes cross. Buildings (footprints of at least 2 by 2 cells)
    /// must touch a street cell; <see cref="FacingFor"/> turns their door toward it. Grids smaller than <see cref="MinGrid"/> have no streets.
    /// Facing is a number of quarter turns: 0 faces +z (yaw 0), 1 faces +x, 2 faces -z, 3 faces -x.
    /// </summary>
    public static class VillageStreets
    {
        public const int MinGrid = 16;
        public const int LaneSpacing = 6;
        /// <summary>Lane centre lines keep this many cells from the grid edge so a building can stand on the outer side of the outermost lane.</summary>
        public const int EdgeMargin = 3;
        public const int SquareRadius = 1;

        public static bool Enabled(int gridW, int gridD) { return gridW >= MinGrid && gridD >= MinGrid; }

        /// <summary>Cell indices of the lanes that run along z (columns), or of the lanes that run along x (rows) for an extent of that many cells, ascending.</summary>
        public static List<int> LaneLines(int extent)
        {
            var lines = new List<int>();
            if (extent < MinGrid) return lines;
            int mid = extent / 2;
            for (int c = mid % LaneSpacing; c < extent; c += LaneSpacing)
                if (c >= EdgeMargin && c <= extent - 1 - EdgeMargin) lines.Add(c);
            return lines;
        }

        public static bool IsSquareCell(int gridW, int gridD, int x, int z)
        {
            if (!Enabled(gridW, gridD)) return false;
            return Math.Abs(x - gridW / 2) <= SquareRadius && Math.Abs(z - gridD / 2) <= SquareRadius;
        }

        public static bool IsStreetCell(int gridW, int gridD, int x, int z)
        {
            if (!Enabled(gridW, gridD) || x < 0 || z < 0 || x >= gridW || z >= gridD) return false;
            return LaneLines(gridW).Contains(x) || LaneLines(gridD).Contains(z) || IsSquareCell(gridW, gridD, x, z);
        }

        /// <summary>True for a footprint that is a building and so has to front a street.</summary>
        public static bool IsBuilding(int sizeX, int sizeZ)
        {
            return sizeX >= WorldScale.HouseFootprintMinCells && sizeZ >= WorldScale.HouseFootprintMinCells;
        }

        /// <summary>Facing (quarter turns) of a building footprint toward the first street side it touches, or -1 when it touches none. Non square footprints face along z only, since their mesh is long along x.</summary>
        public static int FacingFor(int gridW, int gridD, int x, int z, int sizeX, int sizeZ)
        {
            if (!Enabled(gridW, gridD)) return 0;
            if (SideTouches(gridW, gridD, x, z + sizeZ, sizeX, true)) return 0;
            if (SideTouches(gridW, gridD, x, z - 1, sizeX, true)) return 2;
            if (sizeX != sizeZ) return -1;
            if (SideTouches(gridW, gridD, z, x + sizeX, sizeZ, false)) return 1;
            if (SideTouches(gridW, gridD, z, x - 1, sizeZ, false)) return 3;
            return -1;
        }

        private static bool SideTouches(int gridW, int gridD, int from, int fixedLine, int length, bool alongX)
        {
            for (int i = 0; i < length; i++)
                if (alongX ? IsStreetCell(gridW, gridD, from + i, fixedLine) : IsStreetCell(gridW, gridD, fixedLine, from + i)) return true;
            return false;
        }

        public static double FacingYaw(int facing) { return facing * Math.PI / 2; }

        /// <summary>Axis aligned rectangles (x0, z0, x1, z1 in metres) that make up the street surface: every lane across the whole grid, and the square.</summary>
        public static List<double[]> Surfaces(int gridW, int gridD, double cell)
        {
            var rects = new List<double[]>();
            if (!Enabled(gridW, gridD)) return rects;
            foreach (int c in LaneLines(gridW)) rects.Add(new[] { c * cell, 0.0, (c + 1) * cell, gridD * cell });
            foreach (int r in LaneLines(gridD)) rects.Add(new[] { 0.0, r * cell, gridW * cell, (r + 1) * cell });
            rects.Add(new[] { (gridW / 2 - SquareRadius) * cell, (gridD / 2 - SquareRadius) * cell, (gridW / 2 + SquareRadius + 1) * cell, (gridD / 2 + SquareRadius + 1) * cell });
            return rects;
        }
    }
}
