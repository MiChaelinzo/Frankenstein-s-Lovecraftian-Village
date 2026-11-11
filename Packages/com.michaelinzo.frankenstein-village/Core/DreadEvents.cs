using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One omen threshold crossing. Tier is the tier after the crossing (0 Calm .. 3 Abyss).</summary>
    public struct DreadEvent
    {
        public string Name;
        public bool Rising;
        public int Tier;

        /// <summary>Stable text form used by golden parity tests, e.g. "Uneasy+1" or "Dire-2".</summary>
        public override string ToString() => Name + (Rising ? "+" : "-") + Tier;
    }

    /// <summary>Named omen thresholds shared with narration tiers (Uneasy and Dire match StaticNarrationProvider).</summary>
    public static class DreadThresholds
    {
        public const float Uneasy = 0.34f;
        public const float Dire = 0.67f;
        public const float Abyss = 0.9f;
        public const float Hysteresis = 0.05f;

        public static readonly string[] Names = { "Uneasy", "Dire", "Abyss" };
        public static readonly float[] Values = { Uneasy, Dire, Abyss };
        public static readonly string[] TierNames = { "Calm", "Uneasy", "Dire", "Abyss" };

        /// <summary>NaN and infinities become 0, everything else is clamped to [0,1].</summary>
        public static float Sanitize(float dread)
        {
            if (float.IsNaN(dread) || float.IsInfinity(dread)) return 0f;
            return Math.Max(0f, Math.Min(1f, dread));
        }

        /// <summary>Dread as a whole percent 0..100, rounding halves up (same as the web port and the village report).</summary>
        public static int Percent(float dread)
        {
            return (int)Math.Floor(Sanitize(dread) * 100f + 0.5f);
        }

        /// <summary>Stateless tier: how many thresholds the dread has reached (0..3).</summary>
        public static int TierFor(float dread)
        {
            float d = Sanitize(dread);
            int tier = 0;
            while (tier < Values.Length && d >= Values[tier]) tier++;
            return tier;
        }

        /// <summary>Dread must fall below this before the falling event for threshold index i fires.</summary>
        public static float FallingLevel(int index) => (float)(Values[index] - Hysteresis);
    }

    /// <summary>
    /// Reports omen threshold crossings. Rising fires at the threshold, falling only below
    /// threshold minus hysteresis, so jitter around a boundary cannot spam events.
    /// </summary>
    public sealed class DreadEventTracker
    {
        public int Tier { get; private set; }

        public List<DreadEvent> Update(float dread)
        {
            return Update(dread, new List<DreadEvent>());
        }

        /// <summary>Same as <see cref="Update(float)"/> but clears and fills a caller-owned buffer, so per-frame callers allocate nothing.</summary>
        public List<DreadEvent> Update(float dread, List<DreadEvent> events)
        {
            events.Clear();
            float d = DreadThresholds.Sanitize(dread);

            while (Tier < DreadThresholds.Values.Length && d >= DreadThresholds.Values[Tier])
            {
                Tier++;
                events.Add(new DreadEvent { Name = DreadThresholds.Names[Tier - 1], Rising = true, Tier = Tier });
            }
            while (Tier > 0 && d < DreadThresholds.FallingLevel(Tier - 1))
            {
                Tier--;
                events.Add(new DreadEvent { Name = DreadThresholds.Names[Tier], Rising = false, Tier = Tier });
            }
            return events;
        }
    }
}
