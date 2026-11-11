using System;
using System.Globalization;

namespace Frankenstein.Core
{
    /// <summary>
    /// Plain serializable ritual progress, engine-free so the Unity save bridge and tests share one implementation.
    /// Text form: "ritual1;seed;night;stage" with integers. Stage is the effective 0-based stage, -1 for none.
    /// </summary>
    [Serializable]
    public sealed class RitualSaveState
    {
        public const string Prefix = "ritual1";
        public int Seed;
        public int NightNumber = 1;
        public int Stage = -1;

        /// <summary>Clamps night to 1..stageCount and stage to -1..stageCount-1. A zero stage count means no ritual: night 1, stage -1.</summary>
        public RitualSaveState Clamped(int stageCount)
        {
            int count = Math.Max(0, stageCount);
            return new RitualSaveState
            {
                Seed = Seed,
                NightNumber = count == 0 ? 1 : Math.Max(1, Math.Min(count, NightNumber)),
                Stage = Math.Max(-1, Math.Min(count - 1, Stage)),
            };
        }

        public static RitualSaveState From(Ritual ritual, int nightNumber, int dreadPercent)
        {
            int count = ritual == null ? 0 : ritual.Stages.Count;
            var p = RitualChain.Progress(ritual, nightNumber, dreadPercent);
            return new RitualSaveState { Seed = ritual == null ? 0 : ritual.Seed, NightNumber = nightNumber, Stage = p.Effective }.Clamped(count);
        }

        public string Serialize()
        {
            var inv = CultureInfo.InvariantCulture;
            return Prefix + ";" + Seed.ToString(inv) + ";" + NightNumber.ToString(inv) + ";" + Stage.ToString(inv);
        }

        /// <summary>Returns null for malformed text. Values are not range-checked here, call <see cref="Clamped"/> with the ritual's stage count.</summary>
        public static RitualSaveState Parse(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            var parts = text.Split(';');
            if (parts.Length != 4 || parts[0] != Prefix) return null;
            var inv = CultureInfo.InvariantCulture;
            if (!int.TryParse(parts[1], NumberStyles.AllowLeadingSign, inv, out int seed)) return null;
            if (!int.TryParse(parts[2], NumberStyles.AllowLeadingSign, inv, out int night)) return null;
            if (!int.TryParse(parts[3], NumberStyles.AllowLeadingSign, inv, out int stage)) return null;
            return new RitualSaveState { Seed = seed, NightNumber = night, Stage = stage };
        }
    }
}
