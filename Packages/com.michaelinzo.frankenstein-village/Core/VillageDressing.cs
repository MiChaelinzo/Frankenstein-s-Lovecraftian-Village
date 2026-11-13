using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One placed prop or building of the dressing: a mesh kind at a world position (metres), a lift above the ground and a yaw.</summary>
    public struct DressingItem
    {
        public string Kind;
        public double X;
        public double Y;
        public double Z;
        /// <summary>Radians about the vertical axis; applied to the mesh as authored (its front faces +z at yaw 0).</summary>
        public double Yaw;
        /// <summary>Uniform scale, at most 1: meshes are authored in metres and are only ever shrunk to fit.</summary>
        public double Scale;
    }

    /// <summary>
    /// Engine-free composition of the village dressing: the harbour quarter along the coast road (cottages, an inn, a lighthouse, lamps,
    /// crates and barrels by the dock), a market stall in the square, and gravestones with iron fence on the church rise and beside the church.
    /// Hand authored rules and numbers; same seed, grid and layout always give the same items. Nothing here changes the layout.
    /// Coast local coordinates: u runs along the shore, v is metres out to sea (negative is inland).
    /// </summary>
    public static class VillageDressing
    {
        public const double Cell = 4.0;
        public const double ShoreInset = 6.0;
        /// <summary>Inland depth of the free strip between the shoreline and the first layout cell.</summary>
        public const double StripDepth = 6.0;
        public const double RoadV = -1.7;
        public const double CottageV = -3.9;
        public const double LampV = -0.9;
        public const double LampSpacing = 9.0;
        public const double MinSlotSpacing = 6.0;
        public const double DockClearance = 7.0;
        public const double LighthouseClearance = 6.5;
        public const double ChapelClearance = 5.5;
        public const double InnScale = 0.65;
        public const double ChapelOffset = 8.0;
        public const double ChapelScale = 0.8;
        public const int HillGraveRows = 4;

        /// <summary>Footprint half extents (x, z at yaw 0) and height in metres per kind, measured from the committed meshes at scale 1. Kinds that do not block walking have Solid false.</summary>
        public struct Footprint
        {
            public double HalfX;
            public double HalfZ;
            public double Height;
            public bool Solid;
        }

        public static Footprint FootprintOf(string kind)
        {
            switch (kind)
            {
                case "cottage_thatch": return new Footprint { HalfX = 1.8, HalfZ = 1.82, Height = 4.1, Solid = true };
                case "cottage_tall": return new Footprint { HalfX = 1.4, HalfZ = 1.4, Height = 6.1, Solid = true };
                case "inn": return new Footprint { HalfX = 3.48, HalfZ = 3.58, Height = 4.9, Solid = true };
                case "chapel": return new Footprint { HalfX = 2.0, HalfZ = 2.88, Height = 6.1, Solid = true };
                case "lighthouse": return new Footprint { HalfX = 2.2, HalfZ = 2.2, Height = 10.2, Solid = true };
                case "market_stall": return new Footprint { HalfX = 1.3, HalfZ = 1.0, Height = 2.5, Solid = true };
                case "crate_stack": return new Footprint { HalfX = 1.02, HalfZ = 0.57, Height = 1.4, Solid = true };
                case "barrel": return new Footprint { HalfX = 0.88, HalfZ = 0.5, Height = 0.93, Solid = true };
                case "gravestone": return new Footprint { HalfX = 0.45, HalfZ = 0.71, Height = 1.38, Solid = false };
                case "gravestone_cross": return new Footprint { HalfX = 0.45, HalfZ = 0.9, Height = 1.6, Solid = false };
                case "fence_iron": return new Footprint { HalfX = 1.5, HalfZ = 0.1, Height = 1.52, Solid = false };
                default: return new Footprint { HalfX = 0.5, HalfZ = 0.26, Height = 3.45, Solid = false }; // lamps
            }
        }

        public static readonly string[] LampKinds = { "lamp", "lamp_tall", "lamp_double" };

        /// <summary>Metres of the dock root along the shore. The first draw of the harbour roll, so it matches the web coastFeatures dock.</summary>
        public static double DockU(int seed, int gridW, int gridD)
        {
            double lo = 0, hi = HiOf(seed, gridW, gridD), span = hi - lo;
            return lo + span * (0.3 + new SeededRandom(seed ^ 0x51ed).Next(40) / 100.0);
        }

        private static double HiOf(int seed, int gridW, int gridD)
        {
            return VillagerRules.CoastSide(seed) == 2 ? gridW * Cell : gridD * Cell;
        }

        /// <summary>Where the church rise stands: world x and z of its centre, the direction it faces along x, and the summit height.</summary>
        public static void ChurchSite(int seed, int gridW, int gridD, out double x, out double z, out int faceX, out double hill)
        {
            int side = VillagerRules.CoastSide(seed);
            bool east = side == 0 ? true : side == 1 ? false : (((seed ^ 0x3c3c) & 1) == 0);
            x = east ? gridW * Cell + 30 : -30;
            z = gridD * Cell * 0.35;
            faceX = east ? -1 : 1;
            hill = 9;
        }

        /// <summary>Local (u, v) to world x and z for the coast side of the seed.</summary>
        public static void CoastToWorld(int seed, int gridW, int gridD, double u, double v, out double x, out double z)
        {
            int side = VillagerRules.CoastSide(seed);
            if (side == 0) { x = -ShoreInset - v; z = u; }
            else if (side == 1) { x = gridW * Cell + ShoreInset + v; z = u; }
            else { x = u; z = -ShoreInset - v; }
        }

        /// <summary>Yaw that turns a mesh front (+z) toward the sea.</summary>
        public static double SeawardYaw(int seed)
        {
            int side = VillagerRules.CoastSide(seed);
            return side == 0 ? -Math.PI / 2 : side == 1 ? Math.PI / 2 : Math.PI;
        }

        /// <summary>Yaw of a mesh whose long axis (x) should run along the shore.</summary>
        public static double AlongShoreYaw(int seed)
        {
            return VillagerRules.CoastSide(seed) == 2 ? 0.0 : Math.PI / 2;
        }

        private static double Cm(SeededRandom rng, int range) { return rng.Next(range) / 100.0; }

        public static List<DressingItem> Compose(int seed, int gridW, int gridD, IList<PlacedPiece> layout)
        {
            var items = new List<DressingItem>();
            if (gridW <= 0 || gridD <= 0) return items;
            var rng = new SeededRandom(seed ^ 0x4d52);
            double lo = 0, hi = HiOf(seed, gridW, gridD), dockU = DockU(seed, gridW, gridD);
            double seaward = SeawardYaw(seed), along = AlongShoreYaw(seed);

            // The lighthouse stands at the end of the shore farther from the dock.
            double lightU = dockU - lo > hi - dockU ? lo + 6 : hi - 6;
            AddShore(items, seed, gridW, gridD, "lighthouse", lightU, -3.2, seaward, 1.0);
            // A small seamen's chapel stands a little inland of the light, toward the middle of the shore.
            double chapelU = lightU < (lo + hi) / 2 ? lightU + ChapelOffset : lightU - ChapelOffset;
            AddShore(items, seed, gridW, gridD, "chapel", chapelU, -3.5, seaward, ChapelScale);

            // Cottages on the road side of the strip. Every slot draws its rolls first, so the stream never depends on what is skipped.
            var slots = new List<double[]>();
            for (double u = lo + 4.0; u < hi - 3.0; u += MinSlotSpacing + rng.Next(15) / 10.0)
                slots.Add(new[] { u, rng.Next(3), Cm(rng, 40) - 0.2, (rng.Next(25) - 12) / 100.0 });
            int innSide = rng.Next(2) == 0 ? -1 : 1, innSlot = -1;
            double best = double.MaxValue;
            for (int i = 0; i < slots.Count; i++)
            {
                double u = slots[i][0];
                if (Math.Abs(u - dockU) < DockClearance || Math.Abs(u - lightU) < LighthouseClearance || Math.Abs(u - chapelU) < ChapelClearance) continue;
                double d = Math.Abs(u - (dockU + innSide * 11.0));
                if (d < best) { best = d; innSlot = i; }
            }
            for (int i = 0; i < slots.Count; i++)
            {
                double u = slots[i][0];
                if (Math.Abs(u - dockU) < DockClearance || Math.Abs(u - lightU) < LighthouseClearance || Math.Abs(u - chapelU) < ChapelClearance) continue;
                string kind = i == innSlot ? "inn" : slots[i][1] == 0 ? "cottage_tall" : "cottage_thatch";
                double v = i == innSlot ? -3.7 : CottageV + slots[i][2];
                AddShore(items, seed, gridW, gridD, kind, u, v, seaward + slots[i][3], i == innSlot ? InnScale : 1.0);
                if (i == innSlot) AddShore(items, seed, gridW, gridD, "barrel", u - 3.1, -3.4, along + 0.2, 1.0);
            }

            // Harbour yard at the dock root, inside the fence runs that flank the dock.
            AddShore(items, seed, gridW, gridD, "crate_stack", dockU - 2.7, -1.6 + Cm(rng, 30) - 0.15, along, 1.0);
            AddShore(items, seed, gridW, gridD, "barrel", dockU + 2.6, -1.4, along + 0.4, 1.0);
            AddShore(items, seed, gridW, gridD, "barrel", dockU + 3.3, -2.5, along - 0.3, 1.0);
            AddShore(items, seed, gridW, gridD, "crate_stack", dockU - 3.4, -2.7, along + 0.15, 1.0);

            // Lamps at an even spacing along the road, none on the dock.
            int lampIndex = 0;
            for (double u = lo + 4.0; u < hi - 2.0; u += LampSpacing, lampIndex++)
                if (Math.Abs(u - dockU) > 2.6) AddShore(items, seed, gridW, gridD, LampKinds[lampIndex % LampKinds.Length], u, LampV, seaward, 1.0);

            // Church rise: gravestones in two columns facing the village, and a short iron fence on the summit's village side.
            ChurchSite(seed, gridW, gridD, out double cx, out double cz, out int faceX, out double hill);
            for (int col = 0; col < 2; col++)
                for (int row = 0; row < HillGraveRows; row++)
                {
                    bool cross = rng.Next(4) == 0;
                    double jx = Cm(rng, 40) - 0.2, jz = Cm(rng, 40) - 0.2, tilt = (rng.Next(20) - 10) / 100.0;
                    items.Add(new DressingItem
                    {
                        Kind = cross ? "gravestone_cross" : "gravestone", X = cx + faceX * (4.2 + col * 1.5) + jx, Y = hill, Z = cz - 4.5 + row * 1.8 + jz,
                        Yaw = faceX * Math.PI / 2 + tilt, Scale = 1.0,
                    });
                }
            foreach (double dz in new[] { -1.5, 1.5 })
                items.Add(new DressingItem { Kind = "fence_iron", X = cx + faceX * 6.3, Y = hill, Z = cz + dz, Yaw = Math.PI / 2, Scale = 1.0 });

            // The square and the churchyard live among the layout, so each candidate is checked against the pieces.
            double midX = gridW * Cell / 2, midZ = gridD * Cell / 2;
            double[][] squareSpots = { new[] { 0.0, 0.0 }, new[] { 2.5, 0.0 }, new[] { -2.5, 0.0 }, new[] { 0.0, 2.5 }, new[] { 0.0, -2.5 }, new[] { 4.0, 4.0 }, new[] { -4.0, 4.0 } };
            double stallYaw = Cm(rng, 60) - 0.3;
            foreach (var s in squareSpots)
            {
                var stall = new DressingItem { Kind = "market_stall", X = midX + s[0], Z = midZ + s[1], Yaw = stallYaw, Scale = 1.0 };
                if (!OverlapsLayout(stall, layout, 0.8)) { items.Add(stall); break; }
            }

            int church = -1;
            if (layout != null) for (int i = 0; i < layout.Count; i++) if (layout[i].Id == "church") { church = i; break; }
            if (church >= 0)
            {
                var p = layout[church];
                double gx = (p.X + p.SizeX / 2.0) * Cell, gz = (p.Z + p.SizeZ) * Cell + 2.6;
                foreach (double dx in new[] { -1.6, 1.6 })
                    TryAdd(items, new DressingItem { Kind = "fence_iron", X = gx + dx, Z = gz, Yaw = 0, Scale = 1.0 }, layout, gridW, gridD);
                double[] stones = { -2.2, -0.5, 1.2, 2.9 };
                for (int i = 0; i < stones.Length; i++)
                {
                    bool cross = rng.Next(4) == 0;
                    TryAdd(items, new DressingItem { Kind = cross ? "gravestone_cross" : "gravestone", X = gx + stones[i], Z = gz - 1.4, Yaw = Math.PI + (rng.Next(20) - 10) / 100.0, Scale = 1.0 }, layout, gridW, gridD);
                }
            }
            return items;
        }

        private static void AddShore(List<DressingItem> items, int seed, int gridW, int gridD, string kind, double u, double v, double yaw, double scale)
        {
            CoastToWorld(seed, gridW, gridD, u, v, out double x, out double z);
            items.Add(new DressingItem { Kind = kind, X = x, Z = z, Yaw = yaw, Scale = scale });
        }

        private static void TryAdd(List<DressingItem> items, DressingItem item, IList<PlacedPiece> layout, int gridW, int gridD)
        {
            if (item.X < 0.5 || item.Z < 0.5 || item.X > gridW * Cell - 0.5 || item.Z > gridD * Cell - 0.5) return;
            if (!OverlapsLayout(item, layout, 0.3)) items.Add(item);
        }

        /// <summary>True when the item's footprint (swept by its yaw) comes within clearance metres of any layout piece.</summary>
        public static bool OverlapsLayout(DressingItem item, IList<PlacedPiece> layout, double clearance)
        {
            if (layout == null) return false;
            var f = FootprintOf(item.Kind);
            double c = Math.Abs(Math.Cos(item.Yaw)), s = Math.Abs(Math.Sin(item.Yaw));
            double hx = (c * f.HalfX + s * f.HalfZ) * item.Scale + clearance, hz = (s * f.HalfX + c * f.HalfZ) * item.Scale + clearance;
            foreach (var p in layout)
                if (item.X + hx > p.X * Cell && item.X - hx < (p.X + p.SizeX) * Cell && item.Z + hz > p.Z * Cell && item.Z - hz < (p.Z + p.SizeZ) * Cell) return true;
            return false;
        }
    }
}
