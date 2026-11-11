using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>Beat timeline result: which beat, how far through it, and the 2D cinematic camera (web canvas pan and zoom).</summary>
    public struct CinematicFrame
    {
        public bool Done;
        public int Beat;
        public double BeatT;
        public double CamX, CamY, Zoom;
    }

    /// <summary>A 3D camera in metres and radians. Yaw 0 looks down -Z, matching the web 3D view.</summary>
    public struct FlyCamera
    {
        public double X, Y, Z, Yaw, Pitch;
    }

    /// <summary>
    /// Deterministic cinematic timeline and 3D fly-through camera. Numeric mirror of web/src/cinematic.js
    /// (cinematicFrame, flyStop, flythroughCamera): same constants, same doubles, same seed hash. Parity is checked
    /// through the "flythrough" section of web/test/golden.json. No clocks, no randomness beyond the seed.
    /// </summary>
    public static class FlythroughPath
    {
        public const double TailMs = 2000;
        public const double AngleStep = 0.95;
        public const double DefaultCell = 4;
        private const double MinHeight = 4.6;

        private static readonly double[][] Waypoints =
        {
            new[] { -0.10, -0.04, 1.18 },
            new[] { 0.10, -0.02, 1.12 },
            new[] { 0.08, 0.07, 1.22 },
            new[] { -0.08, 0.06, 1.10 },
            new[] { 0.0, 0.0, 1.0 },
        };

        private static bool Finite(double n) { return !double.IsNaN(n) && !double.IsInfinity(n) && n > 0; }
        private static double Smooth(double u) { return u * u * (3 - 2 * u); }
        private static double Clamp01(double v) { return Math.Max(0, Math.Min(1, v)); }

        private static double[] Waypoint(int i)
        {
            int n = Waypoints.Length;
            return Waypoints[((i % n) + n) % n];
        }

        /// <summary>Total length of a take in ms: valid beat durations plus the tail.</summary>
        public static double TotalMs(IReadOnlyList<double> durations)
        {
            double sum = 0;
            for (int i = 0; i < durations.Count; i++) sum += Finite(durations[i]) ? durations[i] : 0;
            return sum + TailMs;
        }

        /// <summary>Where the take is at elapsed ms t. Reduced motion keeps the camera still while beats still advance.</summary>
        public static CinematicFrame Frame(double t, IReadOnlyList<double> durations, bool reduced = false)
        {
            var ds = new double[durations == null ? 0 : durations.Count];
            for (int i = 0; i < ds.Length; i++) ds[i] = Finite(durations[i]) ? durations[i] : 0;
            var still = new CinematicFrame { Zoom = 1 };
            if (ds.Length == 0) { still.Done = true; return still; }
            double time = !double.IsNaN(t) && !double.IsInfinity(t) && t > 0 ? t : 0;
            double sum = 0;
            for (int i = 0; i < ds.Length; i++) sum += ds[i];
            if (time >= sum + TailMs)
            {
                var end = new CinematicFrame { Done = true, Beat = ds.Length - 1, BeatT = 1, Zoom = 1 };
                if (!reduced) { var w = Waypoint(ds.Length); end.CamX = w[0]; end.CamY = w[1]; end.Zoom = w[2]; }
                return end;
            }
            int beat = ds.Length - 1;
            double local = 1, acc = 0;
            if (time < sum)
            {
                for (int i = 0; i < ds.Length; i++)
                {
                    if (time < acc + ds[i]) { beat = i; local = ds[i] != 0 ? (time - acc) / ds[i] : 1; break; }
                    acc += ds[i];
                }
            }
            if (reduced) { still.Beat = beat; still.BeatT = local; return still; }
            var a = Waypoint(beat);
            var b = Waypoint(beat + 1);
            double u = Smooth(Clamp01(local));
            return new CinematicFrame
            {
                Beat = beat, BeatT = local,
                CamX = a[0] + (b[0] - a[0]) * u, CamY = a[1] + (b[1] - a[1]) * u, Zoom = a[2] + (b[2] - a[2]) * u,
            };
        }

        /// <summary>Camera stop for beat index i (any integer): position and look-at target as { x, y, z }.</summary>
        public static void Stop(int i, int gridW, int gridD, int seed, double cell, out double[] pos, out double[] look)
        {
            double cx = gridW * cell / 2, cz = gridD * cell / 2, half = Math.Sqrt(cx * cx + cz * cz);
            // Same as Math.imul(seed | 0, 2654435761) >>> 0: wrapping 32-bit multiply read as unsigned.
            uint product = unchecked((uint)(seed * unchecked((int)2654435761u)));
            double start = (product % 6283) / 1000.0;
            double angle = start + i * AngleStep;
            double radius = half * (i % 2 == 0 ? 0.78 : 0.58);
            double height = MinHeight + 1.6 + Math.Sin(i * 1.7) * 1.4;
            pos = new[] { cx + Math.Sin(angle) * radius, height, cz - Math.Cos(angle) * radius };
            look = new[] { cx + Math.Sin(i * 2.1) * 6, 1.6, cz + Math.Cos(i * 2.3) * 6 };
        }

        /// <summary>The camera for elapsed ms t. Moves stop to stop beat by beat (eased); reduced motion holds one still viewpoint.</summary>
        public static FlyCamera Camera(double t, IReadOnlyList<double> durations, int gridW, int gridD, int seed, bool reduced = false, double cell = DefaultCell)
        {
            var f = Frame(t, durations, reduced);
            double[] aPos, aLook, bPos, bLook;
            Stop(reduced ? 0 : f.Beat, gridW, gridD, seed, cell, out aPos, out aLook);
            Stop(reduced ? 0 : f.Beat + 1, gridW, gridD, seed, cell, out bPos, out bLook);
            double u = reduced ? 0 : f.Done ? 1 : Smooth(Clamp01(f.BeatT));
            var pos = new double[3];
            var look = new double[3];
            for (int k = 0; k < 3; k++)
            {
                pos[k] = aPos[k] + (bPos[k] - aPos[k]) * u;
                look[k] = aLook[k] + (bLook[k] - aLook[k]) * u;
            }
            double dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
            return new FlyCamera
            {
                X = pos[0], Y = pos[1], Z = pos[2],
                Yaw = Math.Atan2(dx, -dz), Pitch = Math.Atan2(dy, Math.Sqrt(dx * dx + dz * dz)),
            };
        }
    }
}
