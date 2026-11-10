using System;

namespace Frankenstein.Core
{
    /// <summary>Pure math for blending calm and dread looks (HDRP volume weights, fog, vignette).</summary>
    public static class DreadCurve
    {
        /// <summary>Smoothstep of dread clamped to [0,1]. NaN is treated as 0. Monotonic non-decreasing.</summary>
        public static float Weight(float dread)
        {
            if (float.IsNaN(dread)) return 0f;
            float t = Math.Max(0f, Math.Min(1f, dread));
            return t * t * (3f - 2f * t);
        }

        /// <summary>Linear blend from calm to dread by <see cref="Weight"/>.</summary>
        public static float Blend(float calm, float dreadValue, float dread)
        {
            float w = Weight(dread);
            return calm + (dreadValue - calm) * w;
        }
    }
}
