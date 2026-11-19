using System;

namespace Frankenstein.Core
{
    /// <summary>
    /// The lighthouse beam (round 24). The lamp room at the end of the shore turns once every <see cref="PeriodSeconds"/> seconds; where the beam points
    /// depends only on the village seed and the time, so every client sees the same sweep. The renderer only draws it (web/src/landmarks.js mirrors this,
    /// golden key "lighthouseBeam"). Yaw is the compass direction of the beam on the ground plane: the direction vector is (sin yaw, -cos yaw), the same
    /// convention as the explorer camera. Engine-free and deterministic.
    /// </summary>
    public static class LighthouseBeam
    {
        /// <summary>Seconds for one full turn of the lamp.</summary>
        public const double PeriodSeconds = 16.0;
        /// <summary>Half the opening angle of the beam, radians (about 6 degrees).</summary>
        public const double HalfAngle = 0.105;
        /// <summary>Height of the lamp room above the ground, metres (lamp room of the lighthouse mesh).</summary>
        public const double LampHeight = 8.7;
        /// <summary>How far the beam reaches, metres.</summary>
        public const double Length = 140.0;
        /// <summary>Metres out to sea from the shore line at which the lighthouse stands (the local v of its dressing slot).</summary>
        public const double SiteV = -4.2;

        /// <summary>Where the beam points at time zero: a fixed turn derived from the seed (0 up to 2 pi).</summary>
        public static double Phase(int seed)
        {
            uint h = unchecked((uint)seed * 2654435761u);
            return h / 4294967296.0 * 2.0 * Math.PI;
        }

        /// <summary>Yaw of the beam in radians (0 up to 2 pi) at <paramref name="timeSec"/> seconds. The lamp turns clockwise seen from above.</summary>
        public static double Yaw(int seed, double timeSec)
        {
            double turn = 2.0 * Math.PI * (timeSec / PeriodSeconds);
            double yaw = (Phase(seed) + turn) % (2.0 * Math.PI);
            return yaw < 0 ? yaw + 2.0 * Math.PI : yaw;
        }

        /// <summary>Ground plane position of the lighthouse (the same slot VillageDressing uses for its mesh).</summary>
        public static void Site(int seed, int gridW, int gridD, out double x, out double z)
        {
            VillageDressing.CoastToWorld(seed, gridW, gridD, VillageDressing.LightU(seed, gridW, gridD), SiteV, out x, out z);
        }
    }
}
