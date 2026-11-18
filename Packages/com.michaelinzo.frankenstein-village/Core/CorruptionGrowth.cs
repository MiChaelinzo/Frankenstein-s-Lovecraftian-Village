using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// The creeping corruption of the village edges: tentacle trees, fungi and organic spires that stand at fixed Core ruled sites and grow with dread and the night.
    /// Four sites: the cliffs beyond the lighthouse (spires, a sapling), the marsh at the far end of the shore (fungi), the edges of the churchyard on the rise,
    /// and a cursed grove behind the village. The sites and their candidate order depend on the seed only; dread and night only decide how many candidates stand
    /// and how large they are (never above scale 1). Engine-free and deterministic; the web renderer mirrors it (web/src/dressing.js, golden checked).
    /// </summary>
    public static class CorruptionGrowth
    {
        /// <summary>Growth levels above the bare village (level 0). Level <see cref="Levels"/> shows every candidate at full size.</summary>
        public const int Levels = 6;
        public const double DreadWeight = 0.75;
        public const double NightWeight = 0.25;
        /// <summary>The night at which the night share of the growth is complete.</summary>
        public const int FullNight = 10;
        public const double FirstScale = 0.55;
        public const double ScaleStep = 0.15;
        /// <summary>Seed salt of the roll stream of the candidates.</summary>
        public const int RollStream = 0x7c0d;

        /// <summary>Growth level 0..<see cref="Levels"/> from dread (0..1, NaN counts as 0) and the night number (1 and below count as the first night). Monotonic in both.</summary>
        public static int Level(double dread, int night)
        {
            double d = double.IsNaN(dread) ? 0.0 : Math.Max(0.0, Math.Min(1.0, dread));
            double n = Math.Max(0.0, Math.Min(1.0, (night - 1) / (double)(FullNight - 1)));
            int level = (int)Math.Floor((DreadWeight * d + NightWeight * n) * Levels);
            return Math.Min(Levels, level);
        }

        /// <summary>The level at which the candidate of this rank (0 is first) appears: ranks spread evenly over levels 1..<see cref="Levels"/>.</summary>
        public static int AppearLevel(int rank, int total)
        {
            return 1 + rank * Levels / total;
        }

        /// <summary>Scale of a candidate at a level: 0 while it has not appeared, then <see cref="FirstScale"/> growing by <see cref="ScaleStep"/> per level up to 1.</summary>
        public static double ScaleAt(int rank, int total, int level)
        {
            int appear = AppearLevel(rank, total);
            if (level < appear) return 0.0;
            return Math.Min(1.0, FirstScale + ScaleStep * (level - appear));
        }

        private struct Candidate
        {
            public string Kind;
            public double A;
            public double B;
        }

        private static Candidate C(string kind, double a, double b) { return new Candidate { Kind = kind, A = a, B = b }; }

        private static readonly Candidate[] Cliffs = { C("spire_horn", 5, 0.3), C("spire_ribbed", 9, -0.4), C("spire_horn", 13, 0.9), C("tentacle_sapling", 7, -1.2), C("spire_ribbed", 16, 0.1) };
        private static readonly Candidate[] Marsh = { C("fungus_cluster", 4, -2.0), C("fungus_tall", 7, -3.2), C("fungus_cluster", 10, -1.0), C("tentacle_sapling", 13, -2.6), C("fungus_tall", 16, -1.4), C("fungus_cluster", 19, -3.5) };
        /// <summary>Churchyard edges: metres toward the village from the church centre, and along z. All lie on the flat summit of the rise.</summary>
        private static readonly Candidate[] Churchyard = { C("fungus_shelf", 3.8, -6.6), C("tentacle_sapling", 5.2, 3.2), C("fungus_cluster", 6.6, -6.4), C("spire_horn", 7.0, 3.6), C("fungus_shelf", 7.4, -1.8), C("tentacle_sapling", 4.8, -7.2) };
        /// <summary>Grove: degrees about the grove centre and radius in metres.</summary>
        private static readonly Candidate[] Grove = { C("tentacle_tree", 0, 4.5), C("tentacle_tree", 72, 5.5), C("tentacle_tree", 144, 4.8), C("tentacle_tree", 216, 5.8), C("tentacle_tree", 288, 5.0), C("fungus_shelf", 36, 3.0), C("fungus_shelf", 180, 3.4), C("fungus_tall", 108, 2.6) };
        /// <summary>Every candidate at full size, ranked: the first of each site, then the second of each, and so on. Always rolls three values per candidate in table order.</summary>
        public static List<DressingItem> Sites(int seed, int gridW, int gridD)
        {
            var rng = new SeededRandom(seed ^ RollStream);
            int cliffDir = VillageLandmarks.CliffDir(seed, gridW, gridD); // the anchors of the cliffs, marsh, churchyard and grove are the landmarks of VillageLandmarks
            double cliffEnd = VillageLandmarks.CliffEndU(seed, gridW, gridD), marshEnd = VillageLandmarks.MarshEndU(seed, gridW, gridD);
            VillageDressing.ChurchSite(seed, gridW, gridD, out double chX, out double chZ, out int faceX, out double hill);
            VillageLandmarks.GroveCentre(seed, gridW, gridD, out double gx, out double gz);

            var sites = new List<DressingItem>[4];
            for (int s = 0; s < sites.Length; s++) sites[s] = new List<DressingItem>();
            foreach (var c in Cliffs)
            {
                Roll(rng, out double jx, out double jz, out double yaw);
                VillageDressing.CoastToWorld(seed, gridW, gridD, cliffEnd + cliffDir * c.A + jx, c.B + jz, out double x, out double z);
                sites[0].Add(new DressingItem { Kind = c.Kind, X = x, Z = z, Yaw = yaw, Scale = 1.0 });
            }
            foreach (var c in Marsh)
            {
                Roll(rng, out double jx, out double jz, out double yaw);
                VillageDressing.CoastToWorld(seed, gridW, gridD, marshEnd - cliffDir * c.A + jx, c.B + jz, out double x, out double z);
                sites[1].Add(new DressingItem { Kind = c.Kind, X = x, Z = z, Yaw = yaw, Scale = 1.0 });
            }
            foreach (var c in Churchyard)
            {
                Roll(rng, out double jx, out double jz, out double yaw);
                sites[2].Add(new DressingItem { Kind = c.Kind, X = chX + faceX * c.A + jx * 0.5, Y = hill, Z = chZ + c.B + jz * 0.5, Yaw = yaw, Scale = 1.0 });
            }
            foreach (var c in Grove)
            {
                Roll(rng, out double jx, out double jz, out double yaw);
                double a = c.A * Math.PI / 180.0;
                sites[3].Add(new DressingItem { Kind = c.Kind, X = gx + Math.Cos(a) * c.B + jx, Z = gz + Math.Sin(a) * c.B + jz, Yaw = yaw, Scale = 1.0 });
            }

            var ranked = new List<DressingItem>();
            for (int i = 0; ; i++)
            {
                bool any = false;
                foreach (var list in sites)
                    if (i < list.Count) { ranked.Add(list[i]); any = true; }
                if (!any) break;
            }
            return ranked;
        }

        private static void Roll(SeededRandom rng, out double jx, out double jz, out double yaw)
        {
            jx = (rng.Next(100) - 50) / 100.0;
            jz = (rng.Next(100) - 50) / 100.0;
            yaw = rng.Next(628) / 100.0;
        }

        /// <summary>The corruption standing at a growth level: the ranked candidates that have appeared, each scaled by <see cref="ScaleAt"/>.</summary>
        public static List<DressingItem> Grow(int seed, int gridW, int gridD, int level)
        {
            var all = Sites(seed, gridW, gridD);
            var grown = new List<DressingItem>();
            for (int rank = 0; rank < all.Count; rank++)
            {
                double scale = ScaleAt(rank, all.Count, level);
                if (scale <= 0.0) continue;
                var item = all[rank];
                item.Scale = scale;
                grown.Add(item);
            }
            return grown;
        }

        /// <summary>The corruption for the current dread and night.</summary>
        public static List<DressingItem> Grow(int seed, int gridW, int gridD, double dread, int night)
        {
            return Grow(seed, gridW, gridD, Level(dread, night));
        }
    }
}
