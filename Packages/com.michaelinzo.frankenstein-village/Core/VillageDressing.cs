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
        public const double CottageV = -4.3;
        public const double LampV = -0.2; // the seaward edge of the coast road, so the pole is not in the middle of the road
        /// <summary>Half width of a lamp post's pole, metres: lamps block walking only at the pole, so the explorer no longer walks through them.</summary>
        public const double LampPoleHalf = 0.12;
        /// <summary>Metres between a lane's edge and the pole of a lane lamp post: lane walkers (at <see cref="VillageStreets.WalkerLateral"/> from the centre) pass clear of it.</summary>
        public const double LanePostInset = 0.2;
        /// <summary>Centre line of the walkable coast road: between the cottage fronts (about -2) and the shore stand off (-0.6).</summary>
        public const double CoastRoadV = -1.0;
        /// <summary>Nearest a shore rock may stand to the coast road, in metres seaward of the shore line: leaves a walker (body radius plus overhang clearance) room to pass.</summary>
        public const double RockMinV = 0.9;
        public const double LampSpacing = 9.0;
        public const double MinSlotSpacing = 6.0;
        public const double DockClearance = 8.6;
        public const double LighthouseClearance = 6.5;
        public const double ChapelClearance = 6.5;
        public const double InnScale = 0.75;
        /// <summary>Metres a cottage keeps from the inn along the shore: inn half length (3.27) plus a cottage swept half length (2.5) plus a margin.</summary>
        public const double InnClearance = 6.4;
        /// <summary>Metres from the inn centre to its barrel: inn half length (4.36 * <see cref="InnScale"/>, 3.27) plus the barrel swept half length (0.96) plus the 0.3 m prop clearance. Before round 23 the barrel stood 3.1 m off, inside the inn.</summary>
        public const double InnBarrelOffset = 4.7;
        public const double ChapelOffset = 8.0;
        public const double ChapelScale = 0.9;
        public const int HillGraveRows = 4;
        /// <summary>Metres between the edge of a building's cell rectangle and its wall (the house mesh is smaller than its cells).</summary>
        public const double HouseSetback = 0.7;
        /// <summary>
        /// Metres between a house wall and the back of the bench at its door. The bench stands in the setback, inside its own cell, so lane walkers and the
        /// explorer (who collide with the cell box) never meet it. Before round 23 the door prop was tested against its own cell with the 0.3 m layout clearance
        /// and so was always rejected: no house ever had a door prop.
        /// </summary>
        public const double DoorWallClearance = 0.15;
        public const double WallLanternLift = 2.2;
        /// <summary>Metres from the square centre to the well's benches and the market stall.</summary>
        public const double SquareBench = 3.8;
        public const double SquareStall = 3.4;
        /// <summary>One scatter candidate (tree, bush or rock) per this many grid cells.</summary>
        public const int ScatterPerCells = 16;
        /// <summary>Door step clutter by roll 0..7; an empty entry is a bare door.</summary>
        public static readonly string[] DoorKinds = { "", "", "", "", "bench", "", "", "" }; // a door prop stands in the setback between the wall and the cell edge, so only a bench is shallow enough; one house in eight keeps the CC0 bench triangles inside the frame budget
        /// <summary>Metres left between the player and the foam on the coast side, so the coast road is walkable up to the shore but not into the sea.</summary>
        public const double ShoreStandOff = 0.6;

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
                case "cottage_thatch": return new Footprint { HalfX = 2.25, HalfZ = 1.98, Height = 4.6, Solid = true };
                case "cottage_tall": return new Footprint { HalfX = 1.9, HalfZ = 1.65, Height = 6.9, Solid = true };
                case "inn": return new Footprint { HalfX = 4.36, HalfZ = 2.88, Height = 4.9, Solid = true };
                case "chapel": return new Footprint { HalfX = 2.4, HalfZ = 2.76, Height = 6.1, Solid = true };
                case "lighthouse": return new Footprint { HalfX = 2.2, HalfZ = 2.2, Height = 10.2, Solid = true };
                case "market_stall": return new Footprint { HalfX = 1.3, HalfZ = 1.0, Height = 2.5, Solid = true };
                case "crate_stack": return new Footprint { HalfX = 1.02, HalfZ = 0.57, Height = 1.4, Solid = true };
                case "barrel": return new Footprint { HalfX = 0.88, HalfZ = 0.5, Height = 0.93, Solid = true };
                case "gravestone": return new Footprint { HalfX = 0.45, HalfZ = 0.71, Height = 1.38, Solid = false };
                case "gravestone_cross": return new Footprint { HalfX = 0.45, HalfZ = 0.9, Height = 1.6, Solid = false };
                case "fence_iron": return new Footprint { HalfX = 1.5, HalfZ = 0.1, Height = 1.52, Solid = false };
                case "well": return new Footprint { HalfX = 1.05, HalfZ = 0.95, Height = 2.9, Solid = true };
                case "fence": return new Footprint { HalfX = 1.5, HalfZ = 0.24, Height = 1.1, Solid = true };
                case "boat": return new Footprint { HalfX = 1.8, HalfZ = 0.78, Height = 2.9, Solid = true };
                case "cart": return new Footprint { HalfX = 1.39, HalfZ = 0.66, Height = 1.04, Solid = true };
                case "sack": return new Footprint { HalfX = 0.57, HalfZ = 0.52, Height = 0.9, Solid = false };
                case "wall_low": return new Footprint { HalfX = 1.55, HalfZ = 0.25, Height = 0.92, Solid = true };
                case "net": return new Footprint { HalfX = 1.35, HalfZ = 0.05, Height = 1.9, Solid = false };
                case "bench": return new Footprint { HalfX = 0.75, HalfZ = 0.21, Height = 1.05, Solid = false };
                case "sign": return new Footprint { HalfX = 0.52, HalfZ = 0.1, Height = 2.46, Solid = false };
                case "wall_lantern": return new Footprint { HalfX = 0.13, HalfZ = 0.22, Height = 0.5, Solid = false };
                case "tree": return new Footprint { HalfX = 0.95, HalfZ = 0.97, Height = 6.0, Solid = true };
                case "bush": return new Footprint { HalfX = 1.07, HalfZ = 0.68, Height = 0.8, Solid = false };
                case "reeds": return new Footprint { HalfX = 0.33, HalfZ = 0.34, Height = 1.78, Solid = false };
                case "rock": return new Footprint { HalfX = 0.97, HalfZ = 0.73, Height = 0.7, Solid = true };
                case "laundry_line": return new Footprint { HalfX = 2.05, HalfZ = 0.05, Height = 2.3, Solid = false };
                case "grass_tuft": return new Footprint { HalfX = 0.19, HalfZ = 0.17, Height = 0.52, Solid = false };
                case "stump": return new Footprint { HalfX = 0.48, HalfZ = 0.36, Height = 0.48, Solid = true };
                case "log": return new Footprint { HalfX = 1.0, HalfZ = 0.27, Height = 0.34, Solid = false };
                case "woodpile": return new Footprint { HalfX = 0.95, HalfZ = 0.6, Height = 0.9, Solid = true };
                case "hedge": return new Footprint { HalfX = 1.4, HalfZ = 0.35, Height = 1.45, Solid = true };
                case "picket_fence": return new Footprint { HalfX = 1.5, HalfZ = 0.06, Height = 1.0, Solid = true };
                case "bollard": return new Footprint { HalfX = 0.15, HalfZ = 0.16, Height = 0.78, Solid = true };
                case "rope_coil": return new Footprint { HalfX = 0.48, HalfZ = 0.36, Height = 0.13, Solid = false };
                case "crop_row": return new Footprint { HalfX = 1.2, HalfZ = 0.78, Height = 0.58, Solid = false };
                case "wheel_ruts": return new Footprint { HalfX = 1.6, HalfZ = 0.63, Height = 0.02, Solid = false };
                case "tentacle_tree": return new Footprint { HalfX = 1.4, HalfZ = 1.62, Height = 4.85, Solid = true };
                case "tentacle_sapling": return new Footprint { HalfX = 0.6, HalfZ = 0.75, Height = 2.4, Solid = false };
                case "fungus_tall": return new Footprint { HalfX = 0.97, HalfZ = 0.78, Height = 2.64, Solid = false };
                case "fungus_cluster": return new Footprint { HalfX = 0.58, HalfZ = 0.47, Height = 0.58, Solid = false };
                case "fungus_shelf": return new Footprint { HalfX = 0.74, HalfZ = 0.61, Height = 0.87, Solid = false };
                case "spire_horn": return new Footprint { HalfX = 1.01, HalfZ = 0.48, Height = 4.85, Solid = true };
                case "spire_ribbed": return new Footprint { HalfX = 0.97, HalfZ = 0.7, Height = 5.95, Solid = true };
                case "cliff_rock": return new Footprint { HalfX = 5.0, HalfZ = 4.48, Height = 8.0, Solid = true };
                case "shipwreck": return new Footprint { HalfX = 5.13, HalfZ = 1.6, Height = 5.5, Solid = true };
                case "abbey_arch": return new Footprint { HalfX = 2.49, HalfZ = 1.085, Height = 5.6, Solid = false };
                case "abbey_wall": return new Footprint { HalfX = 2.6, HalfZ = 0.715, Height = 3.6, Solid = true };
                case "abbey_pillar": return new Footprint { HalfX = 1.025, HalfZ = 0.825, Height = 3.25, Solid = true };
                case "marsh_pool": return new Footprint { HalfX = 3.0, HalfZ = 2.85, Height = 0.09, Solid = false };
                case "path_stone": return new Footprint { HalfX = 0.48, HalfZ = 0.36, Height = 0.09, Solid = false };
                case "church_nave": return new Footprint { HalfX = 3.0, HalfZ = 5.9, Height = 7.4, Solid = true };
                case "church_tower": return new Footprint { HalfX = 1.9, HalfZ = 1.9, Height = 18.0, Solid = true };
                default: return new Footprint { HalfX = 0.5, HalfZ = 0.26, Height = 3.45, Solid = false }; // lamps
            }
        }

        /// <summary>Half extents (x, z) of the walking collision box of a solid item: its footprint swept by yaw and scale (a lamp post: only its pole), plus <see cref="WorldScale.OverhangClearance"/> on each side. Non-solid kinds return false.</summary>
        public static bool TryCollisionHalfExtents(DressingItem item, out double halfX, out double halfZ)
        {
            if (Array.IndexOf(LampKinds, item.Kind) >= 0)
            {
                halfX = halfZ = LampPoleHalf * item.Scale + WorldScale.OverhangClearance;
                return true;
            }
            double trunk;
            if (TryTrunkRadius(item.Kind, out trunk))
            {
                halfX = halfZ = trunk * item.Scale + WorldScale.OverhangClearance;
                return true;
            }
            var f = FootprintOf(item.Kind);
            double c = Math.Abs(Math.Cos(item.Yaw)), s = Math.Abs(Math.Sin(item.Yaw));
            halfX = (c * f.HalfX + s * f.HalfZ) * item.Scale + WorldScale.OverhangClearance;
            halfZ = (s * f.HalfX + c * f.HalfZ) * item.Scale + WorldScale.OverhangClearance;
            return f.Solid;
        }

        /// <summary>
        /// Trunk radius in metres of a tree kind, or false for kinds whose collision is their whole footprint. A tree's footprint is its canopy
        /// (about 1 m half width), but only the trunk is solid: using the canopy made a 2.5 m wide invisible wall that the explorer could not walk around.
        /// </summary>
        public static bool TryTrunkRadius(string kind, out double radius)
        {
            switch (kind)
            {
                case "tree": radius = 0.35; return true;
                case "tentacle_tree": radius = 0.7; return true;
                default: radius = 0; return false;
            }
        }

        public static readonly string[] LampKinds = { "lamp", "lamp_tall", "lamp_double" };

        /// <summary>Metres of the dock root along the shore. The first draw of the harbour roll, so it matches the web coastFeatures dock.</summary>
        public static double DockU(int seed, int gridW, int gridD)
        {
            double lo = 0, hi = HiOf(seed, gridW, gridD), span = hi - lo;
            return lo + span * (0.3 + new SeededRandom(seed ^ 0x51ed).Next(40) / 100.0);
        }

        /// <summary>Metres of the lighthouse along the shore: the end of the shore farther from the dock.</summary>
        public static double LightU(int seed, int gridW, int gridD)
        {
            double hi = HiOf(seed, gridW, gridD), dockU = DockU(seed, gridW, gridD);
            return dockU > hi - dockU ? 6 : hi - 6;
        }

        public static double ShoreLength(int seed, int gridW, int gridD) { return HiOf(seed, gridW, gridD); }

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

        /// <summary>
        /// Where the player may stand (metres): the grid plus <see cref="VillageLandmarks.WorldMargin"/> on every side (out to the landmarks), and on the coast side out to the shore
        /// (ShoreInset from the grid edge, less <see cref="ShoreStandOff"/>), so the coast road along the harbour quarter is walkable.
        /// </summary>
        public static void WalkBounds(int seed, int gridW, int gridD, out double minX, out double maxX, out double minZ, out double maxZ)
        {
            double m = VillageLandmarks.WorldMargin;
            minX = -m; minZ = -m; maxX = gridW * Cell + m; maxZ = gridD * Cell + m;
            double shore = ShoreInset - ShoreStandOff;
            int side = VillagerRules.CoastSide(seed);
            if (side == 0) minX = -shore;
            else if (side == 1) maxX = gridW * Cell + shore;
            else minZ = -shore;
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
            double lightU = LightU(seed, gridW, gridD);
            AddShore(items, seed, gridW, gridD, "lighthouse", lightU, -4.2, seaward, 1.0);
            // A small seamen's chapel stands a little inland of the light, toward the middle of the shore.
            double chapelU = lightU < (lo + hi) / 2 ? lightU + ChapelOffset : lightU - ChapelOffset;
            AddShore(items, seed, gridW, gridD, "chapel", chapelU, -4.2, seaward, ChapelScale);

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
                if (innSlot >= 0 && i != innSlot && Math.Abs(u - slots[innSlot][0]) < InnClearance) continue;
                string kind = i == innSlot ? "inn" : slots[i][1] == 0 ? "cottage_tall" : "cottage_thatch";
                double v = i == innSlot ? -4.4 : CottageV + slots[i][2];
                AddShore(items, seed, gridW, gridD, kind, u, v, seaward + slots[i][3], i == innSlot ? InnScale : 1.0);
            }
            // The inn's barrel stands at one gable end, outside the inn's own footprint: the first side that is free.
            if (innSlot >= 0)
                foreach (int side in new[] { -1, 1 })
                {
                    CoastToWorld(seed, gridW, gridD, slots[innSlot][0] + side * InnBarrelOffset, -3.4, out double bx, out double bz);
                    var barrel = new DressingItem { Kind = "barrel", X = bx, Z = bz, Yaw = along + 0.2, Scale = 1.0 };
                    if (!OverlapsItems(barrel, items, 0.3)) { items.Add(barrel); break; }
                }

            // Harbour yard at the dock root, inside the fence runs that flank the dock.
            AddShore(items, seed, gridW, gridD, "crate_stack", dockU - 2.7, -3.0 + Cm(rng, 30) - 0.15, along, 1.0);
            AddShore(items, seed, gridW, gridD, "barrel", dockU + 2.6, -2.8, along + 0.4, 1.0);
            AddShore(items, seed, gridW, gridD, "barrel", dockU + 3.3, -4.0, along - 0.3, 1.0);
            AddShore(items, seed, gridW, gridD, "crate_stack", dockU - 3.9, -4.4, along + 0.15, 1.0);

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

            // The square: with streets it is the cobbled crossing (a well, a stall and two benches); without streets a stall stands in the first free spot of the grid centre.
            bool streets = VillageStreets.Enabled(gridW, gridD);
            double midX = streets ? (gridW / 2 + 0.5) * Cell : gridW * Cell / 2, midZ = streets ? (gridD / 2 + 0.5) * Cell : gridD * Cell / 2;
            double stallYaw = Cm(rng, 60) - 0.3;
            if (streets)
            {
                items.Add(new DressingItem { Kind = "well", X = midX, Z = midZ, Yaw = 0, Scale = 1.0 });
                items.Add(new DressingItem { Kind = "market_stall", X = midX + SquareStall, Z = midZ + SquareStall, Yaw = stallYaw, Scale = 1.0 });
                items.Add(new DressingItem { Kind = "bench", X = midX - SquareBench, Z = midZ, Yaw = Math.PI / 2, Scale = 1.0 });
                items.Add(new DressingItem { Kind = "bench", X = midX, Z = midZ - SquareBench, Yaw = 0, Scale = 1.0 });
                items.Add(new DressingItem { Kind = "sign", X = midX - SquareStall - 1.0, Z = midZ + SquareStall + 1.0, Yaw = Math.PI * 0.75, Scale = 1.0 });
            }
            else
            {
                double[][] squareSpots = { new[] { 0.0, 0.0 }, new[] { 2.5, 0.0 }, new[] { -2.5, 0.0 }, new[] { 0.0, 2.5 }, new[] { 0.0, -2.5 }, new[] { 4.0, 4.0 }, new[] { -4.0, 4.0 } };
                foreach (var spot in squareSpots)
                {
                    var stall = new DressingItem { Kind = "market_stall", X = midX + spot[0], Z = midZ + spot[1], Yaw = stallYaw, Scale = 1.0 };
                    if (!OverlapsLayout(stall, layout, 0.8)) { items.Add(stall); break; }
                }
            }

            // The churchyard lies behind the church (opposite its door), where the village keeps its dead out of the lane.
            int church = -1;
            if (layout != null) for (int i = 0; i < layout.Count; i++) if (layout[i].Id == "church") { church = i; break; }
            if (church >= 0)
            {
                var p = layout[church];
                double facingYaw = VillageStreets.FacingYaw(p.Facing), dirX = Math.Sin(facingYaw), dirZ = Math.Cos(facingYaw);
                double half = (p.Facing % 2 == 0 ? p.SizeZ : p.SizeX) * Cell / 2.0;
                double bx = (p.X + p.SizeX / 2.0) * Cell - dirX * (half + 2.6), bz = (p.Z + p.SizeZ / 2.0) * Cell - dirZ * (half + 2.6);
                double sideX = Math.Cos(facingYaw), sideZ = -Math.Sin(facingYaw);
                foreach (double dx in new[] { -1.6, 1.6 })
                    TryAdd(items, new DressingItem { Kind = "fence_iron", X = bx + sideX * dx, Z = bz + sideZ * dx, Yaw = facingYaw, Scale = 1.0 }, layout, gridW, gridD, false);
                double[] stones = { -2.2, -0.5, 1.2, 2.9 };
                for (int i = 0; i < stones.Length; i++)
                {
                    bool cross = rng.Next(4) == 0;
                    double tilt = (rng.Next(20) - 10) / 100.0;
                    TryAdd(items, new DressingItem { Kind = cross ? "gravestone_cross" : "gravestone", X = bx + dirX * 1.4 + sideX * stones[i], Z = bz + dirZ * 1.4 + sideZ * stones[i], Yaw = facingYaw + tilt, Scale = 1.0 }, layout, gridW, gridD, false);
                }
            }

            // Streets: every building gets its rolls first (lantern, door step, back yard, offset) so the stream never depends on what is skipped.
            if (layout != null)
                foreach (var p in layout)
                {
                    if (!VillageStreets.IsBuilding(p.SizeX, p.SizeZ)) continue;
                    int lantern = rng.Next(100), doorRoll = rng.Next(8), sideRoll = rng.Next(100), yardRoll = rng.Next(100);
                    if (!streets) continue;
                    ComposeFrontage(items, p, layout, gridW, gridD, lantern, doorRoll, sideRoll, yardRoll);
                }

            // Scatter of trees, bushes and rocks in the yards between the lanes; never on a street, a building or another prop.
            for (int i = 0; i < gridW * gridD / ScatterPerCells; i++)
            {
                int kindRoll = rng.Next(100);
                double sx = rng.Next((int)(gridW * Cell * 10)) / 10.0, sz = rng.Next((int)(gridD * Cell * 10)) / 10.0, yaw = rng.Next(628) / 100.0;
                string kind = kindRoll < 30 ? "tree" : kindRoll < 70 ? "bush" : kindRoll < 85 ? "rock" : "";
                if (kind.Length == 0) continue;
                TryAdd(items, new DressingItem { Kind = kind, X = sx, Z = sz, Yaw = yaw, Scale = 1.0 }, layout, gridW, gridD, false);
            }

            // The shore: a drying net or two on the inland side of the road, rowboats pulled up in the shallows, reeds and rocks at the water's edge.
            for (int i = 0; i < 2; i++)
            {
                double nu = lo + 6 + rng.Next((int)Math.Max(1, hi - lo - 12)), roll = rng.Next(100) / 100.0;
                if (Math.Abs(nu - dockU) > DockClearance && Math.Abs(nu - lightU) > LighthouseClearance && Math.Abs(nu - chapelU) > ChapelClearance && !NearCottage(items, seed, gridW, gridD, nu))
                    AddShore(items, seed, gridW, gridD, "net", nu, -0.8, along + roll * 0.1, 1.0);
            }
            for (int i = 0; i < 2; i++)
            {
                double bu = lo + 8 + rng.Next((int)Math.Max(1, hi - lo - 16)), tilt = (rng.Next(40) - 20) / 100.0;
                if (Math.Abs(bu - dockU) > DockClearance) AddShore(items, seed, gridW, gridD, "boat", bu, 1.6, along + tilt, 0.8);
            }
            for (int i = 0; i < 6; i++)
            {
                double ru = lo + rng.Next((int)Math.Max(1, hi - lo)), rv = 0.6 + rng.Next(80) / 100.0, rr = rng.Next(100);
                if (Math.Abs(ru - dockU) > 3.0) AddShore(items, seed, gridW, gridD, rr < 70 ? "reeds" : "rock", ru, rr < 70 ? rv : Math.Max(rv, RockMinV), rr / 10.0, 1.0);
            }
            ComposeDistricts(items, seed, gridW, gridD, layout);
            ComposeForeground(items, seed, gridW, gridD, layout, streets, dockU, lightU, chapelU);
            return items;
        }

        /// <summary>Seed salt of the district palette's own roll stream.</summary>
        public const int DistrictRollStream = 0x4453;

        /// <summary>
        /// District palettes: every free yard cell may hold one prop from the palette of its district (<see cref="VillageDistricts.Palette"/>): crates and rope at the harbour,
        /// stalls and carts in the market, nets and laundry on Fishers' Row, gravestones on Chapel Hill, benches and hedges in the old town. Runs before the foreground fill
        /// (so the quarter's own props get the free yards first) with its own roll stream. Every cell rolls first, so the stream never depends on what is skipped.
        /// </summary>
        private static void ComposeDistricts(List<DressingItem> items, int seed, int gridW, int gridD, IList<PlacedPiece> layout)
        {
            var rng = new SeededRandom(seed ^ DistrictRollStream);
            for (int cx = 0; cx < gridW; cx++)
                for (int cz = 0; cz < gridD; cz++)
                {
                    int chance = rng.Next(100), pick = rng.Next(100), yawRoll = rng.Next(628);
                    double ox = 0.8 + rng.Next(240) / 100.0, oz = 0.8 + rng.Next(240) / 100.0;
                    if (VillageStreets.IsStreetCell(gridW, gridD, cx, cz)) continue;
                    int district = VillageDistricts.At(seed, gridW, gridD, cx, cz);
                    if (chance >= VillageDistricts.PaletteDensity(district)) continue;
                    var palette = VillageDistricts.Palette(district);
                    string kind = palette[pick * palette.Length / 100];
                    var f = FootprintOf(kind);
                    double yaw = f.HalfX > 1.2 && f.HalfZ < 0.4 ? (yawRoll % 2) * Math.PI / 2 : yawRoll / 100.0;
                    TryAdd(items, new DressingItem { Kind = kind, X = cx * Cell + ox, Z = cz * Cell + oz, Yaw = yaw, Scale = 1.0 }, layout, gridW, gridD, false);
                }
        }

        /// <summary>Metres above the ground at which wheel ruts lie: just over the cobbled street surface so they never fight with it.</summary>
        public const double RutLift = 0.07;
        /// <summary>Metres between the lamp posts along a lane, in cells, and the spacing of the harbour bollards in metres.</summary>
        public const int LanePostCells = 7;
        public const double BollardSpacing = 8.0;
        public const double BollardV = -0.2;
        /// <summary>Seed salt of the foreground fill's own roll stream.</summary>
        public const int ForegroundRollStream = 0x6f1c;

        /// <summary>
        /// Foreground fill: everything a walker sees within a few metres. Grass tufts, rocks, stumps, logs and bushes in every yard cell, weeds along the lane edges,
        /// wheel ruts and lamp posts on the lanes, wood piles, crates and gardens (crop rows, hedges, picket fences) against the buildings, and the harbour edge
        /// (bollards, rope coils, nets, moored rowboats, reeds). It has its own roll stream and runs last, so the items above never change.
        /// Every cell, lane segment and building rolls first, so the stream never depends on what is skipped.
        /// </summary>
        private static void ComposeForeground(List<DressingItem> items, int seed, int gridW, int gridD, IList<PlacedPiece> layout, bool streets, double dockU, double lightU, double chapelU)
        {
            var rng = new SeededRandom(seed ^ ForegroundRollStream);
            double along = AlongShoreYaw(seed), hi = HiOf(seed, gridW, gridD);
            var cols = streets ? VillageStreets.LaneLines(gridW) : new List<int>();
            var rows = streets ? VillageStreets.LaneLines(gridD) : new List<int>();

            // Yard cells, and a weed tuft at one edge of every lane cell, so no stretch of lane is bare.
            for (int cx = 0; cx < gridW; cx++)
                for (int cz = 0; cz < gridD; cz++)
                {
                    int roll = rng.Next(100), roll2 = rng.Next(100);
                    double ox = 0.5 + rng.Next(300) / 100.0, oz = 0.5 + rng.Next(300) / 100.0, yaw = rng.Next(628) / 100.0;
                    if (streets && VillageStreets.IsStreetCell(gridW, gridD, cx, cz))
                    {
                        if (VillageStreets.IsSquareCell(gridW, gridD, cx, cz)) continue;
                        double edge = roll2 < 50 ? 0.55 : 3.45;
                        bool column = cols.Contains(cx);
                        TryAdd(items, new DressingItem { Kind = "grass_tuft", X = column ? cx * Cell + edge : cx * Cell + ox, Z = column ? cz * Cell + oz : cz * Cell + edge, Yaw = yaw, Scale = 1.0 }, layout, gridW, gridD, true);
                        continue;
                    }
                    string kind = roll < 24 ? "grass_tuft" : roll < 30 ? "rock" : roll < 37 ? "stump" : roll < 43 ? "log" : roll < 50 ? "bush" : "";
                    if (kind.Length > 0) TryAdd(items, new DressingItem { Kind = kind, X = cx * Cell + ox, Z = cz * Cell + oz, Yaw = yaw, Scale = 1.0 }, layout, gridW, gridD, false);
                }

            // Lanes: wheel ruts on every second cell and a lamp post every few cells, alternating sides.
            if (streets)
            {
                int post = 0;
                for (int axis = 0; axis < 2; axis++)
                {
                    int extent = axis == 0 ? gridD : gridW;
                    foreach (int line in axis == 0 ? cols : rows)
                        for (int c = 0; c < extent; c++)
                        {
                            int cx = axis == 0 ? line : c, cz = axis == 0 ? c : line;
                            double jitter = rng.Next(40) / 100.0 - 0.2;
                            if (VillageStreets.IsSquareCell(gridW, gridD, cx, cz) || (axis == 0 ? rows.Contains(cz) : cols.Contains(cx))) continue;
                            double mx = (cx + 0.5) * Cell, mz = (cz + 0.5) * Cell;
                            if (c % 6 == 0)
                                items.Add(new DressingItem { Kind = "wheel_ruts", X = axis == 0 ? mx + jitter : mx, Y = RutLift, Z = axis == 0 ? mz : mz + jitter, Yaw = axis == 0 ? Math.PI / 2 : 0.0, Scale = 1.0 });
                            if (c % LanePostCells == 3)
                            {
                                double side = (post % 2 == 0 ? -1 : 1) * (Cell / 2 - LanePostInset);
                                TryAdd(items, new DressingItem { Kind = LampKinds[post % 2], X = axis == 0 ? mx + side : mx, Z = axis == 0 ? mz : mz + side, Yaw = axis == 0 ? 0.0 : Math.PI / 2, Scale = 1.0 }, layout, gridW, gridD, true);
                                post++;
                            }
                        }
                }
            }

            // Buildings: a stack against one side wall, and a garden behind.
            if (layout != null)
                foreach (var p in layout)
                {
                    if (!VillageStreets.IsBuilding(p.SizeX, p.SizeZ)) continue;
                    int gardenRoll = rng.Next(100), wallRoll = rng.Next(100), wallKind = rng.Next(100), flip = rng.Next(2);
                    if (!streets) continue;
                    double yaw = VillageStreets.FacingYaw(p.Facing), dirX = Math.Sin(yaw), dirZ = Math.Cos(yaw), sideX = Math.Cos(yaw), sideZ = -Math.Sin(yaw);
                    double half = (p.Facing % 2 == 0 ? p.SizeZ : p.SizeX) * Cell / 2.0, halfWide = (p.Facing % 2 == 0 ? p.SizeX : p.SizeZ) * Cell / 2.0;
                    double cx = (p.X + p.SizeX / 2.0) * Cell, cz = (p.Z + p.SizeZ / 2.0) * Cell, sgn = flip == 0 ? -1.0 : 1.0;
                    if (wallRoll < 70)
                    {
                        string kind = wallKind < 30 ? "woodpile" : wallKind < 55 ? "crate_stack" : wallKind < 75 ? "sack" : wallKind < 90 ? "cart" : "log";
                        var f = FootprintOf(kind);
                        double lateral = halfWide + 0.35 + f.HalfZ, slide = (wallKind % 7 - 3) * 0.3;
                        TryAdd(items, new DressingItem { Kind = kind, X = cx + sideX * sgn * lateral + dirX * slide, Z = cz + sideZ * sgn * lateral + dirZ * slide, Yaw = yaw + Math.PI / 2, Scale = 1.0 }, layout, gridW, gridD, false);
                    }
                    if (gardenRoll < 60)
                    {
                        double slideG = sgn * 0.8;
                        string first = gardenRoll < 20 ? "crop_row" : gardenRoll < 40 ? "hedge" : "picket_fence";
                        double back1 = half + 0.4 + FootprintOf(first).HalfZ + 1.2;
                        TryAdd(items, new DressingItem { Kind = first, X = cx - dirX * back1 + sideX * slideG, Z = cz - dirZ * back1 + sideZ * slideG, Yaw = yaw, Scale = 1.0 }, layout, gridW, gridD, false);
                        string second = gardenRoll < 20 ? "picket_fence" : gardenRoll < 40 ? "grass_tuft" : "bush";
                        double back2 = back1 + 1.8;
                        TryAdd(items, new DressingItem { Kind = second, X = cx - dirX * back2 + sideX * slideG, Z = cz - dirZ * back2 + sideZ * slideG, Yaw = yaw, Scale = 1.0 }, layout, gridW, gridD, false);
                    }
                }

            // Coast cottages: a wood pile, barrel or crates at one gable end.
            int cottageCount = items.Count;
            for (int i = 0; i < cottageCount; i++)
            {
                var c = items[i];
                if (c.Kind != "cottage_thatch" && c.Kind != "cottage_tall") continue;
                int sideRoll = rng.Next(2), kindRoll = rng.Next(100);
                string kind = kindRoll < 40 ? "woodpile" : kindRoll < 70 ? "sack" : "crate_stack";
                var cf = FootprintOf(c.Kind); var kf = FootprintOf(kind);
                double dx = along == 0.0 ? 1.0 : 0.0, dz = along == 0.0 ? 0.0 : 1.0, off = (sideRoll == 0 ? -1.0 : 1.0) * (cf.HalfX * c.Scale + 0.15 + kf.HalfX);
                var item = new DressingItem { Kind = kind, X = c.X + dx * off, Z = c.Z + dz * off, Yaw = along, Scale = 1.0 };
                if (!OverlapsItems(item, items, 0.1)) items.Add(item);
            }

            // Harbour edge: bollards along the shore, rope coils and nets by the dock, moored rowboats, more reeds in the shallows.
            for (double u = 3.0; u < hi - 2.0; u += BollardSpacing)
                if (Math.Abs(u - dockU) > 2.6) AddShore(items, seed, gridW, gridD, "bollard", u, BollardV, along, 1.0);
            AddShore(items, seed, gridW, gridD, "rope_coil", dockU - 1.6, -1.5, along + 0.5, 1.0);
            AddShore(items, seed, gridW, gridD, "rope_coil", dockU + 1.7, -1.4, along - 0.3, 1.0);
            foreach (double du in new[] { -6.0, 6.0 })
                if (dockU + du > 4 && dockU + du < hi - 4 && Math.Abs(dockU + du - lightU) > LighthouseClearance && Math.Abs(dockU + du - chapelU) > ChapelClearance)
                    AddShore(items, seed, gridW, gridD, "net", dockU + du, -0.8, along + 0.05, 1.0);
            AddShore(items, seed, gridW, gridD, "boat", dockU + 5.5, 2.6, along + 0.15, 0.7);
            AddShore(items, seed, gridW, gridD, "boat", dockU - 6.0, 3.2, along - 0.2, 0.7);
            for (int i = 0; i < 5; i++)
            {
                double ru = rng.Next((int)Math.Max(1, hi)), rv = 0.4 + rng.Next(100) / 100.0, ry = rng.Next(628) / 100.0;
                if (Math.Abs(ru - dockU) > 3.0) AddShore(items, seed, gridW, gridD, "reeds", ru, rv, ry, 1.0);
            }
        }

        private static void AddShore(List<DressingItem> items, int seed, int gridW, int gridD, string kind, double u, double v, double yaw, double scale)
        {
            CoastToWorld(seed, gridW, gridD, u, v, out double x, out double z);
            items.Add(new DressingItem { Kind = kind, X = x, Z = z, Yaw = yaw, Scale = scale });
        }

        /// <summary>Adds the item when it is inside the grid and clear of the layout, of other props on the ground and (unless allowStreet) of every street cell.</summary>
        private static bool TryAdd(List<DressingItem> items, DressingItem item, IList<PlacedPiece> layout, int gridW, int gridD, bool allowStreet)
        {
            if (item.X < 0.5 || item.Z < 0.5 || item.X > gridW * Cell - 0.5 || item.Z > gridD * Cell - 0.5) return false;
            if (OverlapsLayout(item, layout, 0.3)) return false;
            if (!allowStreet && TouchesStreet(item, gridW, gridD)) return false;
            if (OverlapsItems(item, items, 0.15)) return false;
            items.Add(item);
            return true;
        }

        private static void SweptHalf(DressingItem item, out double hx, out double hz)
        {
            var f = FootprintOf(item.Kind);
            double c = Math.Abs(Math.Cos(item.Yaw)), s = Math.Abs(Math.Sin(item.Yaw));
            hx = (c * f.HalfX + s * f.HalfZ) * item.Scale;
            hz = (s * f.HalfX + c * f.HalfZ) * item.Scale;
        }

        /// <summary>True when the item's swept footprint touches a street cell.</summary>
        public static bool TouchesStreet(DressingItem item, int gridW, int gridD)
        {
            SweptHalf(item, out double hx, out double hz);
            int x0 = (int)Math.Floor((item.X - hx) / Cell), x1 = (int)Math.Floor((item.X + hx) / Cell), z0 = (int)Math.Floor((item.Z - hz) / Cell), z1 = (int)Math.Floor((item.Z + hz) / Cell);
            for (int cx = x0; cx <= x1; cx++)
                for (int cz = z0; cz <= z1; cz++)
                    if (VillageStreets.IsStreetCell(gridW, gridD, cx, cz)) return true;
            return false;
        }

        /// <summary>True when the item overlaps any ground level prop already placed (wall lanterns and the church rise are not on the ground plane).</summary>
        public static bool OverlapsItems(DressingItem item, IList<DressingItem> items, double clearance)
        {
            if (item.Y > 0.01) return false;
            SweptHalf(item, out double hx, out double hz);
            foreach (var o in items)
            {
                if (o.Y > 0.01) continue;
                SweptHalf(o, out double ox, out double oz);
                if (Math.Abs(item.X - o.X) < hx + ox + clearance && Math.Abs(item.Z - o.Z) < hz + oz + clearance) return true;
            }
            return false;
        }

        private static bool NearCottage(List<DressingItem> items, int seed, int gridW, int gridD, double u)
        {
            CoastToWorld(seed, gridW, gridD, u, CottageV, out double x, out double z);
            foreach (var o in items)
                if ((o.Kind == "cottage_thatch" || o.Kind == "cottage_tall" || o.Kind == "inn") && Math.Abs(o.X - x) < 3.5 && Math.Abs(o.Z - z) < 3.5) return true;
            return false;
        }

        /// <summary>The street face of one building: a wall lantern beside the door, door step clutter and a back yard item.</summary>
        private static void ComposeFrontage(List<DressingItem> items, PlacedPiece p, IList<PlacedPiece> layout, int gridW, int gridD, int lantern, int doorRoll, int sideRoll, int yardRoll)
        {
            double yaw = VillageStreets.FacingYaw(p.Facing), dirX = Math.Sin(yaw), dirZ = Math.Cos(yaw), sideX = Math.Cos(yaw), sideZ = -Math.Sin(yaw);
            double half = (p.Facing % 2 == 0 ? p.SizeZ : p.SizeX) * Cell / 2.0;
            double cx = (p.X + p.SizeX / 2.0) * Cell, cz = (p.Z + p.SizeZ / 2.0) * Cell;
            double wall = half - HouseSetback;
            double side = sideRoll < 50 ? -2.2 : 2.2;
            if (lantern < 70)
            {
                var lf = FootprintOf("wall_lantern");
                items.Add(new DressingItem { Kind = "wall_lantern", X = cx + dirX * (wall + lf.HalfZ) - sideX * side * 0.75, Y = WallLanternLift, Z = cz + dirZ * (wall + lf.HalfZ) - sideZ * side * 0.75, Yaw = yaw, Scale = 1.0 });
            }
            string door = DoorKinds[doorRoll];
            if (door.Length > 0)
            {
                var df = FootprintOf(door);
                double depth = wall + DoorWallClearance + df.HalfZ;
                TryAdd(items, new DressingItem { Kind = door, X = cx + dirX * depth + sideX * side, Z = cz + dirZ * depth + sideZ * side, Yaw = yaw, Scale = 1.0 }, OtherPieces(layout, p), gridW, gridD, true); // the bench stands inside its own cell, so only the other pieces are obstacles
            }
            string yard = yardRoll < 25 ? "fence" : yardRoll < 45 ? "wall_low" : yardRoll < 60 ? "laundry_line" : yardRoll < 75 ? "bush" : yardRoll < 90 ? "tree" : "";
            if (yard.Length > 0)
            {
                var yf = FootprintOf(yard);
                double back = half + 0.4 + yf.HalfZ + (yard == "tree" ? 0.6 : 0.0);
                TryAdd(items, new DressingItem { Kind = yard, X = cx - dirX * back, Z = cz - dirZ * back, Yaw = yaw, Scale = 1.0 }, layout, gridW, gridD, false);
            }
        }

        private static List<PlacedPiece> OtherPieces(IList<PlacedPiece> layout, PlacedPiece self)
        {
            var others = new List<PlacedPiece>(layout.Count);
            foreach (var q in layout) if (q.X != self.X || q.Z != self.Z) others.Add(q);
            return others;
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
