using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>A named place of the wider world: its id, the centre on the ground plane (metres) and the radius within which the explorer counts as being there.</summary>
    public struct Landmark
    {
        public string Id;
        public double X;
        public double Z;
        public double Radius;
    }

    /// <summary>A lit path from the city (or the coast road) to one landmark: waypoints on the ground plane (x, z), from the city end to the landmark end.</summary>
    public sealed class LandmarkPath
    {
        public string Target;
        public List<double[]> Points = new List<double[]>();
    }

    /// <summary>
    /// The wider world around the 36 by 36 city: six landmarks (the lighthouse cliffs, a shipwreck on the shore, the abbey ruins, the cemetery on the church rise,
    /// the marsh and the cursed grove), the lit paths that join them to the city, the props that stand at them and the lore book spots. Seeded only by the village seed
    /// and the grid, so the same seed always gives the same world. The anchors are the single source for <see cref="CorruptionGrowth"/>, which grows its tentacle trees,
    /// fungi and spires around the same cliffs, marsh, churchyard and grove. Engine-free; the web renderer mirrors it (web/src/landmarks.js, golden checked).
    /// </summary>
    public static class VillageLandmarks
    {
        public const string Cliffs = "cliffs", Shipwreck = "shipwreck", Abbey = "abbey", Cemetery = "cemetery", Marsh = "marsh", Grove = "grove";
        /// <summary>Round 24 places further out: a ring of standing stones, a cove hidden beyond the cliffs, a ritual site and the catacomb entrance below the churchyard.</summary>
        public const string StandingStones = "standing_stones", HiddenCove = "hidden_cove", RitualSite = "ritual_site", Catacombs = "catacombs";
        public static readonly string[] Ids = { Cliffs, Shipwreck, Abbey, Cemetery, Marsh, Grove, StandingStones, HiddenCove, RitualSite, Catacombs };
        private static readonly string[] NamesEn = { "Lighthouse Cliffs", "Wreck of the Marguerite", "Abbey Ruins", "The Cemetery", "The Black Marsh", "The Cursed Grove", "The Standing Stones", "The Hidden Cove", "The Ritual Site", "The Catacombs" };
        private static readonly string[] NamesFr = { "Falaises du phare", "Epave de la Marguerite", "Ruines de l'abbaye", "Le cimetiere", "Le marais noir", "Le bosquet maudit", "Les pierres dressees", "La crique cachee", "Le lieu du rituel", "Les catacombes" };
        private static readonly double[] Radii = { 14.0, 9.0, 12.0, 22.0, 12.0, 11.0, 9.0, 9.0, 8.0, 8.0 };

        /// <summary>Metres the explorer may walk beyond the city grid on the inland sides and along the shore. The sea side stays at the shore.</summary>
        public const double WorldMargin = 60.0;
        /// <summary>Metres from the grid edge to the grove centre.</summary>
        public const double GroveSetback = 13.0;
        /// <summary>Metres from the grid edge to the abbey centre.</summary>
        public const double AbbeySetback = 36.0;
        /// <summary>Metres along the shore from the end of the cliffs side of the shore to the cliff headland, from the marsh side end to the marsh and to the wreck.</summary>
        public const double CliffAnchorU = 10.5, MarshAnchorU = 11.5, WreckAnchorU = 34.0;
        public const double CliffAnchorV = -0.3, MarshAnchorV = -2.3, WreckAnchorV = 1.3;
        /// <summary>Local v of the lit coast path beyond the village and of the sea stacks off the cliffs.</summary>
        public const double CoastPathV = -0.8, SeaStackV = 4.4;
        public const double GateInset = 1.5;
        /// <summary>Metres from the grove centre at which its path stops, outside the ring of tentacle trees.</summary>
        public const double GroveGateStop = 9.5;
        /// <summary>Round 24 sites. The stones and the ritual site lie this many metres beyond the inland edge of the grid (and this fraction of the way along it); the cove lies this far along the shore past the cliff end; the catacombs lie this many metres along z from the church.</summary>
        public const double StonesDepth = 52.0, StonesAlong = 0.65, RitualDepth = 52.0, RitualAlong = 0.1, CoveAnchorU = 44.0, CoveAnchorV = -2.0, CatacombOffset = 33.0;
        /// <summary>Standing stones: ring radius, first angle (radians), and the seven stone scales.</summary>
        public const double StoneRingRadius = 4.8, StoneRingStart = 0.3;
        private static readonly double[] StoneScale = { 1.0, 0.85, 1.1, 0.9, 1.15, 0.8, 1.0 };
        /// <summary>Ritual site: radius of the ring of stumps, of the fungus clusters and of the two saplings; their angles in radians.</summary>
        public const double RitualStumpRadius = 4.3, RitualFungusRadius = 5.6, RitualSaplingRadius = 5.0;
        private static readonly double[] RitualSaplingAngle = { 1.9 };
        /// <summary>Catacombs: metres from the gate to the book on the steps side, and to each flanking grave along z.</summary>
        public const double CatacombLandmarkOffset = 3.0, CatacombBookOffset = 3.6, CatacombGraveOffset = 4.4;
        public const double StoneSpacing = 2.2, LampSpacing = 14.0, LampSide = 1.7, StoneLift = 0.04;

        /// <summary>The church rise: radii of its ellipse, the flat summit share and the foot height. The renderer draws the hill with the same function.</summary>
        public const double HillRx = 25.0, HillRz = 23.0, HillPlateau = 0.4, HillFoot = -0.5;
        public const double ChurchTowerOffset = 7.1;

        public static string Name(string id, string lang)
        {
            int i = Array.IndexOf(Ids, id);
            if (i < 0) return "";
            return lang == "fr" ? NamesFr[i] : NamesEn[i];
        }

        /// <summary>The side of the shore on which the cliffs lie: -1 toward u = 0, +1 toward the far end. The marsh and the wreck lie on the other side.</summary>
        public static int CliffDir(int seed, int gridW, int gridD)
        {
            return VillageDressing.LightU(seed, gridW, gridD) < VillageDressing.ShoreLength(seed, gridW, gridD) / 2 ? -1 : 1;
        }

        public static double CliffEndU(int seed, int gridW, int gridD) { return CliffDir(seed, gridW, gridD) < 0 ? 0.0 : VillageDressing.ShoreLength(seed, gridW, gridD); }
        public static double MarshEndU(int seed, int gridW, int gridD) { return CliffDir(seed, gridW, gridD) < 0 ? VillageDressing.ShoreLength(seed, gridW, gridD) : 0.0; }

        /// <summary>The centre of the cursed grove: behind the village, on the side away from the sea.</summary>
        public static void GroveCentre(int seed, int gridW, int gridD, out double x, out double z)
        {
            int side = VillagerRules.CoastSide(seed);
            if (side == 0) { x = gridW * VillageDressing.Cell + GroveSetback; z = gridD * VillageDressing.Cell * 0.85; }
            else if (side == 1) { x = -GroveSetback; z = gridD * VillageDressing.Cell * 0.85; }
            else { x = gridW * VillageDressing.Cell * 0.6; z = gridD * VillageDressing.Cell + GroveSetback; }
        }

        /// <summary>A point beyond the inland edge of the grid: <paramref name="depth"/> metres out and <paramref name="along"/> (0 to 1) of the way along the edge. The inland side is +x, -x or +z by the coast side of the seed.</summary>
        public static void InlandToWorld(int seed, int gridW, int gridD, double depth, double along, out double x, out double z)
        {
            int side = VillagerRules.CoastSide(seed);
            double w = gridW * VillageDressing.Cell, d = gridD * VillageDressing.Cell;
            if (side == 0) { x = w + depth; z = along * d; }
            else if (side == 1) { x = -depth; z = along * d; }
            else { x = along * w; z = d + depth; }
        }

        /// <summary>The shore position along u of the hidden cove: past the cliff end, on the cliffs side.</summary>
        public static double CoveU(int seed, int gridW, int gridD) { return CliffEndU(seed, gridW, gridD) + CliffDir(seed, gridW, gridD) * CoveAnchorU; }

        /// <summary>The catacomb gate centre and the direction (along x) its steps face: toward the city, like the church.</summary>
        public static void CatacombSite(int seed, int gridW, int gridD, out double x, out double z, out int face)
        {
            VillageDressing.ChurchSite(seed, gridW, gridD, out double cx, out double cz, out face, out double hill);
            x = cx; z = cz + CatacombOffset;
        }

        /// <summary>The abbey centre and the unit direction from it toward the city side, which its entrance arch faces.</summary>
        public static void AbbeySite(int seed, int gridW, int gridD, out double x, out double z, out double faceX, out double faceZ)
        {
            int side = VillagerRules.CoastSide(seed);
            double w = gridW * VillageDressing.Cell, d = gridD * VillageDressing.Cell;
            if (side == 2)
            {
                VillageDressing.ChurchSite(seed, gridW, gridD, out double cx, out double cz, out int churchFace, out double hill);
                bool churchEast = churchFace < 0;
                x = churchEast ? -AbbeySetback : w + AbbeySetback; z = d * 0.72; faceX = churchEast ? 1.0 : -1.0; faceZ = 0.0;
            }
            else { x = w * (side == 0 ? 0.4 : 0.6); z = d + AbbeySetback; faceX = 0.0; faceZ = -1.0; }
        }

        /// <summary>The six landmarks in <see cref="Ids"/> order.</summary>
        public static List<Landmark> All(int seed, int gridW, int gridD)
        {
            int dir = CliffDir(seed, gridW, gridD);
            double cliffEnd = CliffEndU(seed, gridW, gridD), marshEnd = MarshEndU(seed, gridW, gridD);
            var list = new List<Landmark>();
            double x, z;
            VillageDressing.CoastToWorld(seed, gridW, gridD, cliffEnd + dir * CliffAnchorU, CliffAnchorV, out x, out z);
            list.Add(new Landmark { Id = Cliffs, X = x, Z = z, Radius = Radii[0] });
            VillageDressing.CoastToWorld(seed, gridW, gridD, marshEnd - dir * WreckAnchorU, WreckAnchorV, out x, out z);
            list.Add(new Landmark { Id = Shipwreck, X = x, Z = z, Radius = Radii[1] });
            AbbeySite(seed, gridW, gridD, out x, out z, out double fx, out double fz);
            list.Add(new Landmark { Id = Abbey, X = x, Z = z, Radius = Radii[2] });
            VillageDressing.ChurchSite(seed, gridW, gridD, out x, out z, out int face, out double hill);
            list.Add(new Landmark { Id = Cemetery, X = x, Z = z, Radius = Radii[3] });
            VillageDressing.CoastToWorld(seed, gridW, gridD, marshEnd - dir * MarshAnchorU, MarshAnchorV, out x, out z);
            list.Add(new Landmark { Id = Marsh, X = x, Z = z, Radius = Radii[4] });
            GroveCentre(seed, gridW, gridD, out x, out z);
            list.Add(new Landmark { Id = Grove, X = x, Z = z, Radius = Radii[5] });
            InlandToWorld(seed, gridW, gridD, StonesDepth, StonesAlong, out x, out z);
            list.Add(new Landmark { Id = StandingStones, X = x, Z = z, Radius = Radii[6] });
            VillageDressing.CoastToWorld(seed, gridW, gridD, CoveU(seed, gridW, gridD), CoveAnchorV, out x, out z);
            list.Add(new Landmark { Id = HiddenCove, X = x, Z = z, Radius = Radii[7] });
            InlandToWorld(seed, gridW, gridD, RitualDepth, RitualAlong, out x, out z);
            list.Add(new Landmark { Id = RitualSite, X = x, Z = z, Radius = Radii[8] });
            CatacombSite(seed, gridW, gridD, out x, out z, out face);
            list.Add(new Landmark { Id = Catacombs, X = x + face * CatacombLandmarkOffset, Z = z, Radius = Radii[9] }); // the landmark centre is the open ground at the foot of the steps, not the solid gate
            return list;
        }

        /// <summary>The id of the landmark whose radius holds (x, z), the one the point is deepest inside; null elsewhere.</summary>
        public static string At(int seed, int gridW, int gridD, double x, double z)
        {
            string best = null;
            double bestRatio = 1.0;
            foreach (var l in All(seed, gridW, gridD))
            {
                double ratio = Math.Sqrt((x - l.X) * (x - l.X) + (z - l.Z) * (z - l.Z)) / l.Radius;
                if (ratio < bestRatio) { bestRatio = ratio; best = l.Id; }
            }
            return best;
        }

        // ---------- the church rise ----------

        private static double Step(double t) { return t * t * (3 - 2 * t); }

        /// <summary>Height of the church rise at an offset (metres) from its centre: a flat summit, a smooth shoulder and gentle lumps, never below the foot.</summary>
        public static double HillHeight(double hill, double dx, double dz)
        {
            double rho = Math.Sqrt((dx / HillRx) * (dx / HillRx) + (dz / HillRz) * (dz / HillRz));
            double t = Math.Max(0.0, Math.Min(1.0, (rho - HillPlateau) / (1.0 - HillPlateau)));
            double lumps = 0.9 * Math.Sin(dx * 0.55 + dz * 0.2) * Math.Cos(dz * 0.43) * t * (1 - t) * 4;
            return Math.Max(HillFoot, hill * (1 - Step(t)) + lumps + HillFoot * Step(t));
        }

        /// <summary>The height the explorer stands on at (x, z): the rise inside its ellipse (never below the flat ground), flat 0 elsewhere.</summary>
        public static double GroundHeight(int seed, int gridW, int gridD, double x, double z)
        {
            VillageDressing.ChurchSite(seed, gridW, gridD, out double cx, out double cz, out int face, out double hill);
            double dx = x - cx, dz = z - cz;
            if (Math.Abs(dx) > HillRx || Math.Abs(dz) > HillRz) return 0.0;
            return Math.Max(0.0, HillHeight(hill, dx, dz));
        }

        // ---------- props ----------

        private static readonly double[] StackU = { 17, 21, 25, 29 };
        private static readonly double[] StackV = { 0.0, 0.2, -0.2, 0.4 };
        private static readonly double[] StackScale = { 0.5, 0.6, 0.5, 0.45 };
        private static readonly double[] StackYaw = { 0.0, 2.1, 4.2, 6.3 };
        private static readonly double[][] MarshPools = { new[] { 5.5, -4.6, 1.0 }, new[] { 11.5, -5.4, 1.1 }, new[] { 17.0, -4.4, 0.9 } };
        private static readonly double[][] MarshReeds = { new[] { 4.0, -3.6 }, new[] { 7.2, -3.8 }, new[] { 9.0, -2.4 }, new[] { 13.6, -3.0 }, new[] { 15.2, -3.6 }, new[] { 19.0, -2.8 } };
        /// <summary>Abbey props in the local frame (right, forward) with a yaw offset: kind, x, z, yaw. Forward is toward the city, so the arch is the entrance.</summary>
        private static readonly object[][] AbbeyProps =
        {
            new object[] { "abbey_wall", -3.0, -7.3, 0.0 }, new object[] { "abbey_wall", 3.0, -7.3, 0.0 },
            new object[] { "abbey_wall", -5.8, -2.9, Math.PI / 2 }, new object[] { "abbey_wall", 5.8, -2.9, Math.PI / 2 },
            new object[] { "abbey_arch", 0.0, 3.0, 0.0 },
            new object[] { "abbey_pillar", -2.7, -0.4, 0.0 }, new object[] { "abbey_pillar", 2.7, -0.4, Math.PI }, new object[] { "abbey_pillar", -2.7, -4.1, Math.PI }, new object[] { "abbey_pillar", 2.7, -4.1, 0.0 },
        };

        /// <summary>
        /// The props standing at the landmarks (not the paths): sea stacks off the cliffs, the wreck, the marsh pools and reeds, the abbey ruins, and the invisible
        /// collision boxes of the church on its rise (kinds church_nave and church_tower, which have no mesh because the renderer draws the church itself).
        /// </summary>
        public static List<DressingItem> Dressing(int seed, int gridW, int gridD)
        {
            var items = new List<DressingItem>();
            int dir = CliffDir(seed, gridW, gridD);
            double cliffEnd = CliffEndU(seed, gridW, gridD), marshEnd = MarshEndU(seed, gridW, gridD), x, z;
            for (int i = 0; i < StackU.Length; i++)
            {
                VillageDressing.CoastToWorld(seed, gridW, gridD, cliffEnd + dir * StackU[i], SeaStackV + StackV[i], out x, out z);
                items.Add(new DressingItem { Kind = "cliff_rock", X = x, Z = z, Yaw = StackYaw[i], Scale = StackScale[i] });
            }
            VillageDressing.CoastToWorld(seed, gridW, gridD, marshEnd - dir * WreckAnchorU, WreckAnchorV, out x, out z);
            items.Add(new DressingItem { Kind = "shipwreck", X = x, Z = z, Yaw = VillageDressing.AlongShoreYaw(seed), Scale = 1.0 });
            foreach (var p in MarshPools)
            {
                VillageDressing.CoastToWorld(seed, gridW, gridD, marshEnd - dir * p[0], p[1], out x, out z);
                items.Add(new DressingItem { Kind = "marsh_pool", X = x, Y = 0.0, Z = z, Yaw = p[0] * 0.7, Scale = p[2] });
            }
            for (int i = 0; i < MarshReeds.Length; i++)
            {
                VillageDressing.CoastToWorld(seed, gridW, gridD, marshEnd - dir * MarshReeds[i][0], MarshReeds[i][1], out x, out z);
                items.Add(new DressingItem { Kind = "reeds", X = x, Z = z, Yaw = i * 1.3, Scale = 1.0 });
            }
            AbbeySite(seed, gridW, gridD, out double ax, out double az, out double fx, out double fz);
            double abbeyYaw = Math.Atan2(fx, fz);
            foreach (var p in AbbeyProps)
            {
                double lx = (double)p[1], lz = (double)p[2];
                items.Add(new DressingItem { Kind = (string)p[0], X = ax + fz * lx + fx * lz, Z = az - fx * lx + fz * lz, Yaw = abbeyYaw + (double)p[3], Scale = 1.0 });
            }
            VillageDressing.ChurchSite(seed, gridW, gridD, out double cx, out double cz, out int face, out double hill);
            items.Add(new DressingItem { Kind = "church_nave", X = cx, Y = hill, Z = cz, Scale = 1.0 });
            items.Add(new DressingItem { Kind = "church_tower", X = cx, Y = hill, Z = cz + ChurchTowerOffset, Scale = 1.0 });
            AddWildDressing(items, seed, gridW, gridD);
            return items;
        }

        /// <summary>The props of the round 24 places: the ring of standing stones, the cove's boat and cargo between two rocks, the ritual circle with its stumps, fungi and a sapling, and the catacomb gate with two graves.</summary>
        private static void AddWildDressing(List<DressingItem> items, int seed, int gridW, int gridD)
        {
            InlandToWorld(seed, gridW, gridD, StonesDepth, StonesAlong, out double sx, out double sz);
            for (int i = 0; i < StoneScale.Length; i++)
            {
                double a = StoneRingStart + i * 2.0 * Math.PI / StoneScale.Length;
                items.Add(new DressingItem { Kind = "standing_stone", X = sx + Math.Cos(a) * StoneRingRadius, Z = sz + Math.Sin(a) * StoneRingRadius, Yaw = a, Scale = StoneScale[i] });
            }

            int dir = CliffDir(seed, gridW, gridD);
            double u0 = CoveU(seed, gridW, gridD), x, z, along = VillageDressing.AlongShoreYaw(seed);
            VillageDressing.CoastToWorld(seed, gridW, gridD, u0, -3.6, out x, out z);
            items.Add(new DressingItem { Kind = "boat", X = x, Z = z, Yaw = along, Scale = 1.0 });
            VillageDressing.CoastToWorld(seed, gridW, gridD, u0 + dir * 3.8, -3.0, out x, out z);
            items.Add(new DressingItem { Kind = "barrel", X = x, Z = z, Yaw = 0.0, Scale = 1.0 });
            VillageDressing.CoastToWorld(seed, gridW, gridD, u0 - dir * 3.8, -3.4, out x, out z);
            items.Add(new DressingItem { Kind = "crate_stack", X = x, Z = z, Yaw = along, Scale = 1.0 });
            VillageDressing.CoastToWorld(seed, gridW, gridD, u0 + dir * 1.6, -2.0, out x, out z);
            items.Add(new DressingItem { Kind = "rope_coil", X = x, Z = z, Yaw = 0.7, Scale = 1.0 });
            VillageDressing.CoastToWorld(seed, gridW, gridD, u0 + dir * 7.4, -1.6, out x, out z);
            items.Add(new DressingItem { Kind = "cliff_rock", X = x, Z = z, Yaw = 1.1, Scale = 0.4 });
            VillageDressing.CoastToWorld(seed, gridW, gridD, u0 - dir * 7.4, -1.6, out x, out z);
            items.Add(new DressingItem { Kind = "cliff_rock", X = x, Z = z, Yaw = 3.0, Scale = 0.4 });

            InlandToWorld(seed, gridW, gridD, RitualDepth, RitualAlong, out double rx, out double rz);
            items.Add(new DressingItem { Kind = "ritual_circle", X = rx, Z = rz, Scale = 1.0 });
            for (int j = 0; j < 5; j++)
            {
                double a = 0.4 + j * 2.0 * Math.PI / 5;
                items.Add(new DressingItem { Kind = "stump", X = rx + Math.Cos(a) * RitualStumpRadius, Z = rz + Math.Sin(a) * RitualStumpRadius, Yaw = a, Scale = 1.0 });
            }
            for (int j = 0; j < 2; j++)
            {
                double a = 0.9 + j * 2.1;
                items.Add(new DressingItem { Kind = "fungus_cluster", X = rx + Math.Cos(a) * RitualFungusRadius, Z = rz + Math.Sin(a) * RitualFungusRadius, Yaw = a, Scale = 1.0 });
            }
            foreach (double a in RitualSaplingAngle)
                items.Add(new DressingItem { Kind = "tentacle_sapling", X = rx + Math.Cos(a) * RitualSaplingRadius, Z = rz + Math.Sin(a) * RitualSaplingRadius, Yaw = a, Scale = 1.0 });

            CatacombSite(seed, gridW, gridD, out double kx, out double kz, out int face);
            items.Add(new DressingItem { Kind = "catacomb_gate", X = kx, Z = kz, Yaw = face * Math.PI / 2, Scale = 1.0 });
            items.Add(new DressingItem { Kind = "gravestone_cross", X = kx, Z = kz - CatacombGraveOffset, Yaw = face * Math.PI / 2, Scale = 1.0 });
            items.Add(new DressingItem { Kind = "gravestone", X = kx, Z = kz + CatacombGraveOffset, Yaw = face * Math.PI / 2, Scale = 1.0 });
        }

        // ---------- paths ----------

        private static LandmarkPath CoastPath(int seed, int gridW, int gridD, string target, double fromU, int toward, double length)
        {
            var path = new LandmarkPath { Target = target };
            double[] along = { 0.0, length * 0.7, length };
            double[] v = { CoastPathV, CoastPathV, CoastPathV - 0.3 };
            for (int i = 0; i < along.Length; i++)
            {
                VillageDressing.CoastToWorld(seed, gridW, gridD, fromU + toward * along[i], v[i], out double x, out double z);
                path.Points.Add(new[] { x, z });
            }
            return path;
        }

        private static LandmarkPath Line(string target, double x0, double z0, double x1, double z1)
        {
            var path = new LandmarkPath { Target = target };
            path.Points.Add(new[] { x0, z0 });
            path.Points.Add(new[] { x1, z1 });
            return path;
        }

        /// <summary>The offset of the pale winding path along the face of the rise at an x offset from the church. Matches the path the renderer paints into the hill.</summary>
        public static double HillPathZ(double dx) { return Math.Sin(dx * 0.22) * 2.6; }

        /// <summary>The lit paths in landmark order: the coast road on to the cliffs and to the marsh and the wreck, and a path from the city edge to the abbey, the cemetery and the grove.</summary>
        public static List<LandmarkPath> Paths(int seed, int gridW, int gridD)
        {
            int dir = CliffDir(seed, gridW, gridD);
            double w = gridW * VillageDressing.Cell, d = gridD * VillageDressing.Cell;
            var list = new List<LandmarkPath>();
            list.Add(CoastPath(seed, gridW, gridD, Cliffs, CliffEndU(seed, gridW, gridD), dir, CliffAnchorU + 6.0));
            list.Add(CoastPath(seed, gridW, gridD, Shipwreck, MarshEndU(seed, gridW, gridD), -dir, WreckAnchorU - 4.0));

            AbbeySite(seed, gridW, gridD, out double ax, out double az, out double fx, out double fz);
            double ex = ax + fx * 6.5, ez = az + fz * 6.5; // the end of the path stands in front of the entrance arch
            double gx = fx != 0.0 ? (fx > 0 ? -GateInset : w + GateInset) : ax, gz = fx != 0.0 ? az : d + GateInset;
            list.Add(Line(Abbey, gx, gz, ex, ez));

            VillageDressing.ChurchSite(seed, gridW, gridD, out double cx, out double cz, out int face, out double hill);
            var up = new LandmarkPath { Target = Cemetery };
            double gateX = face < 0 ? w + GateInset : -GateInset, summitX = cx + face * 5.0;
            int steps = (int)Math.Ceiling(Math.Abs(summitX - gateX) / 2.0);
            for (int i = 0; i <= steps; i++)
            {
                double x = gateX + (summitX - gateX) * i / steps, off = Math.Abs(x - cx);
                double weight = Math.Max(0.0, Math.Min(1.0, (HillRx - off) / 6.0));
                up.Points.Add(new[] { x, cz + HillPathZ(x - cx) * weight });
            }
            list.Add(up);

            GroveCentre(seed, gridW, gridD, out double grx, out double grz);
            int side = VillagerRules.CoastSide(seed);
            if (side == 0) list.Add(Line(Grove, w + GateInset, grz, grx - GroveGateStop, grz));
            else if (side == 1) list.Add(Line(Grove, -GateInset, grz, grx + GroveGateStop, grz));
            else list.Add(Line(Grove, grx, d + GateInset, grx, grz - GroveGateStop));
            return list;
        }

        /// <summary>The path stones (flat slabs every <see cref="StoneSpacing"/> m along each path) and a lamp post every <see cref="LampSpacing"/> m, alternating sides: the lit path network.</summary>
        public static List<DressingItem> PathDressing(int seed, int gridW, int gridD)
        {
            var items = new List<DressingItem>();
            foreach (var path in Paths(seed, gridW, gridD))
            {
                double travelled = 0.0, nextStone = 0.0, nextLamp = LampSpacing / 2;
                int lampCount = 0;
                for (int i = 0; i + 1 < path.Points.Count; i++)
                {
                    double x0 = path.Points[i][0], z0 = path.Points[i][1], x1 = path.Points[i + 1][0], z1 = path.Points[i + 1][1];
                    double len = Math.Sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
                    if (len < 1e-9) continue;
                    double dx = (x1 - x0) / len, dz = (z1 - z0) / len, yaw = Math.Atan2(-dz, dx) + 0.0; // + 0.0 turns -0 into 0 so the golden file never holds a negative zero
                    while (nextStone <= travelled + len)
                    {
                        double t = nextStone - travelled, x = x0 + dx * t, z = z0 + dz * t;
                        items.Add(new DressingItem { Kind = "path_stone", X = x, Y = GroundHeight(seed, gridW, gridD, x, z) + StoneLift, Z = z, Yaw = yaw, Scale = 1.0 });
                        nextStone += StoneSpacing;
                    }
                    while (nextLamp <= travelled + len)
                    {
                        double t = nextLamp - travelled, side = (lampCount++ % 2 == 0 ? 1.0 : -1.0) * LampSide, x = x0 + dx * t - dz * side, z = z0 + dz * t + dx * side;
                        items.Add(new DressingItem { Kind = "lamp", X = x, Y = GroundHeight(seed, gridW, gridD, x, z), Z = z, Yaw = 0.0, Scale = 1.0 });
                        nextLamp += LampSpacing;
                    }
                    travelled += len;
                }
            }
            return items;
        }

        // ---------- lore ----------

        /// <summary>Candidate spots (each with lean alternatives) of the lore book of a landmark place; empty for places that are not landmarks.</summary>
        public static List<List<double[]>> BookSpots(string place, int seed, int gridW, int gridD)
        {
            var spots = new List<List<double[]>>();
            int dir = CliffDir(seed, gridW, gridD);
            double cliffEnd = CliffEndU(seed, gridW, gridD), marshEnd = MarshEndU(seed, gridW, gridD);
            if (place == "cliffs") spots.Add(OnCoast(seed, gridW, gridD, cliffEnd + dir * CliffAnchorU, -1.2));
            else if (place == "shipwreck") spots.Add(OnCoast(seed, gridW, gridD, marshEnd - dir * WreckAnchorU, -1.2));
            else if (place == "marsh") spots.Add(OnCoast(seed, gridW, gridD, marshEnd - dir * 6.0, -0.9));
            else if (place == "abbey")
            {
                AbbeySite(seed, gridW, gridD, out double ax, out double az, out double fx, out double fz);
                var alts = new List<double[]>();
                foreach (var lx in LoreBookRules.Lateral) alts.Add(new[] { ax + fz * lx + fx * -2.8, az - fx * lx + fz * -2.8 });
                spots.Add(alts);
            }
            else if (place == StandingStones)
            {
                InlandToWorld(seed, gridW, gridD, StonesDepth, StonesAlong, out double sx, out double sz);
                spots.Add(Inland(sx, sz + 1.0));
            }
            else if (place == RitualSite)
            {
                InlandToWorld(seed, gridW, gridD, RitualDepth, RitualAlong, out double rx, out double rz);
                spots.Add(Inland(rx, rz + 0.6));
            }
            else if (place == HiddenCove) spots.Add(OnCoast(seed, gridW, gridD, CoveU(seed, gridW, gridD), -1.2));
            else if (place == Catacombs)
            {
                CatacombSite(seed, gridW, gridD, out double kx, out double kz, out int face);
                var alts = new List<double[]>();
                foreach (var lat in LoreBookRules.Lateral) alts.Add(new[] { kx + face * CatacombBookOffset, kz + lat });
                spots.Add(alts);
            }
            return spots;
        }

        private static List<double[]> Inland(double x, double z)
        {
            var alts = new List<double[]>();
            foreach (var lat in LoreBookRules.Lateral) alts.Add(new[] { x + lat, z });
            return alts;
        }

        private static List<double[]> OnCoast(int seed, int gridW, int gridD, double u, double v)
        {
            var alts = new List<double[]>();
            foreach (var lat in LoreBookRules.Lateral)
            {
                VillageDressing.CoastToWorld(seed, gridW, gridD, u + lat, v, out double x, out double z);
                alts.Add(new[] { x, z });
            }
            return alts;
        }
    }
}
