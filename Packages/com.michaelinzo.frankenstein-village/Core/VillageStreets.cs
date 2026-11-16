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

        private static readonly int[] FacingDxTable = { 0, 1, 0, -1 };
        private static readonly int[] FacingDzTable = { 1, 0, -1, 0 };
        /// <summary>Unit direction of a facing in x, exact (no trigonometry), so golden JSON round-trips.</summary>
        public static int FacingDx(int facing) { return FacingDxTable[((facing % 4) + 4) % 4]; }
        /// <summary>Unit direction of a facing in z.</summary>
        public static int FacingDz(int facing) { return FacingDzTable[((facing % 4) + 4) % 4]; }

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

        // ---------- street walkers: display-only townsfolk pacing the lanes (no talk, no clue, no sanity effect) ----------
        /// <summary>Metres a walker covers per clock tick (one tick is one village minute, a real second in the session): a calm walking pace.</summary>
        public const double WalkerSpeedMin = 0.8;
        /// <summary>Metres from the grid edge where a walker turns round.</summary>
        public const double WalkerEndPad = 3.0;
        /// <summary>Metres off the lane centre line, clear of the well and of the door step clutter.</summary>
        public const double WalkerLateral = 1.2;
        /// <summary>The main lanes run through the square, where the well stands on the lane centre line. A walker there swings out to this lateral offset (metres) at the well and back over <see cref="WellDeflectRadius"/> metres, so it never walks through the well.</summary>
        public const double WellDeflectLateral = 2.0;
        public const double WellDeflectRadius = 2.6;
        /// <summary>Walkers per lane: the main lanes (through the square) carry more.</summary>
        public const int MainLaneWalkers = 3;
        public const int SideLaneWalkers = 2;
        /// <summary>Fraction of walkers that leave the street per unit of dread (the village empties as it darkens).</summary>
        public const double DreadThinning = 0.9;

        /// <summary>Lateral offset of a main lane walker that is distanceToWell metres (along the lane) from the well: the normal offset far away, <see cref="WellDeflectLateral"/> at the well, a cosine squared blend between.</summary>
        public static double WellDeflected(double lateral, double distanceToWell)
        {
            if (distanceToWell >= WellDeflectRadius) return lateral;
            double b = Math.Cos(Math.PI / 2 * distanceToWell / WellDeflectRadius);
            return (lateral < 0 ? -1.0 : 1.0) * (WalkerLateral + (WellDeflectLateral - WalkerLateral) * b * b);
        }

        public struct StreetWalker
        {
            public int Id;
            public double X;
            public double Z;
            public double Yaw;
            public bool Lantern;
        }

        /// <summary>
        /// Walkers on the lanes at a clock tick (fractional ticks allowed) and a dread of 0..1. Every walker rolls its seed values first and
        /// then may be hidden by dread, so the roster never shifts. Walkers carry a lantern when the village lanterns are lit.
        /// </summary>
        public static List<StreetWalker> Walkers(int seed, int gridW, int gridD, double tick, double dread)
        {
            var walkers = new List<StreetWalker>();
            if (!Enabled(gridW, gridD)) return walkers;
            var rng = new SeededRandom(seed ^ 0x5742);
            double visible = Math.Floor((1.0 - DreadThinning * Math.Max(0.0, Math.Min(1.0, dread))) * 100.0);
            bool lantern = GameClock.LanternsLit((int)Math.Floor(tick));
            int id = 0;
            for (int axis = 0; axis < 2; axis++)
            {
                int extent = axis == 0 ? gridW : gridD, across = axis == 0 ? gridD : gridW;
                double length = across * VillageDressing.Cell - 2 * WalkerEndPad;
                foreach (int line in LaneLines(extent))
                {
                    int count = line == extent / 2 ? MainLaneWalkers : SideLaneWalkers;
                    for (int k = 0; k < count; k++, id++)
                    {
                        double phase = rng.Next(1000) / 1000.0, speed = WalkerSpeedMin + rng.Next(50) / 100.0;
                        double lateral = rng.Next(2) == 0 ? -WalkerLateral : WalkerLateral;
                        int keep = rng.Next(100);
                        if (keep >= visible) continue;
                        double d = phase * 2 * length + speed * tick;
                        d -= 2 * length * Math.Floor(d / (2 * length));
                        bool forward = d < length;
                        double along = WalkerEndPad + (forward ? d : 2 * length - d);
                        if (line == extent / 2) lateral = WellDeflected(lateral, Math.Abs(along - (across / 2 + 0.5) * VillageDressing.Cell));
                        double centre = (line + 0.5) * VillageDressing.Cell + lateral;
                        walkers.Add(new StreetWalker
                        {
                            Id = id, X = axis == 0 ? centre : along, Z = axis == 0 ? along : centre, Lantern = lantern,
                            Yaw = axis == 0 ? (forward ? 0.0 : Math.PI) : (forward ? Math.PI / 2 : -Math.PI / 2),
                        });
                    }
                }
            }
            return walkers;
        }
    }
}
