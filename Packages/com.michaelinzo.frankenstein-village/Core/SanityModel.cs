using System;

namespace Frankenstein.Core
{
    /// <summary>Player sanity (0..100) and the ambience intensity (0..1) derived from it.</summary>
    public sealed class SanityModel
    {
        public const float Max = 100f;

        /// <summary>Sanity lost by studying a landmark (click or focus).</summary>
        public const float FocusCost = 2f;
        /// <summary>Sanity lost by listening to the walls.</summary>
        public const float WhisperCost = 8f;
        /// <summary>Sanity lost by entering the church.</summary>
        public const float ChurchCost = 15f;
        /// <summary>Sanity regained by lighting a candle.</summary>
        public const float CandleRestore = 10f;
        /// <summary>Sanity lost per second while the dark creeps in (Runtime and web share this rate).</summary>
        public const float DrainPerSecond = 1f;
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
