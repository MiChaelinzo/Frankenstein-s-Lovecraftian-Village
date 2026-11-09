using System;

namespace Frankenstein.Core
{
    /// <summary>Player sanity (0..100) and the ambience intensity (0..1) derived from it.</summary>
    public sealed class SanityModel
    {
        public const float Max = 100f;
        public float Value { get; private set; }

        public SanityModel(float start = Max) { Value = Clamp(start); }

        public void Apply(float delta) { Value = Clamp(Value + delta); }

        /// <summary>Lower sanity means higher dread. Monotonic non-increasing in sanity.</summary>
        public static float DreadFor(float sanity) { return 1f - Clamp(sanity) / Max; }

        public float Dread => DreadFor(Value);

        private static float Clamp(float v)
        {
            if (float.IsNaN(v)) return 0f;
            return Math.Max(0f, Math.Min(Max, v));
        }
    }
}
