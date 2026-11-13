namespace Frankenstein.Core
{
    /// <summary>Phases of one village day, in order. The day starts at dawn (tick 0).</summary>
    public enum DayPhase { Dawn = 0, Day = 1, Dusk = 2, Night = 3 }

    /// <summary>
    /// Engine-free, integer-only time of day. One tick is one village minute. The phase lengths below are the single source
    /// for schedules, lanterns and light; the JS port (web/src/clock.js) mirrors them and is golden-checked.
    /// Ticks wrap: tick MinutesPerDay is tick 0 of the next day, and negative ticks count back from midnight of dawn.
    /// </summary>
    public static class GameClock
    {
        public const int DawnMinutes = 240;
        public const int DayMinutes = 600;
        public const int DuskMinutes = 240;
        public const int NightMinutes = 360;
        public const int MinutesPerDay = DawnMinutes + DayMinutes + DuskMinutes + NightMinutes;
        public const int PhaseCount = 4;
        public const int FullDaylightPercent = 100;
        /// <summary>Where a play session's clock starts: the heart of dusk, so the first look at the village is the moody hour and the first watch is near.</summary>
        public const int SessionStartTick = DawnMinutes + DayMinutes + DuskMinutes / 2;

        public static readonly string[] PhaseNames = { "dawn", "day", "dusk", "night" };
        public static readonly int[] PhaseLengths = { DawnMinutes, DayMinutes, DuskMinutes, NightMinutes };

        /// <summary>Tick folded into [0, MinutesPerDay), also for negative ticks.</summary>
        public static int Wrap(int tick)
        {
            int t = tick % MinutesPerDay;
            return t < 0 ? t + MinutesPerDay : t;
        }

        /// <summary>Whole days elapsed (floor), so negative ticks belong to day -1.</summary>
        public static int DayNumber(int tick)
        {
            return (tick - Wrap(tick)) / MinutesPerDay;
        }

        /// <summary>First wrapped tick of a phase.</summary>
        public static int PhaseStart(DayPhase phase)
        {
            int start = 0;
            for (int i = 0; i < (int)phase; i++) start += PhaseLengths[i];
            return start;
        }

        public static DayPhase PhaseAt(int tick)
        {
            int t = Wrap(tick);
            for (int i = 0; i < PhaseCount; i++)
            {
                if (t < PhaseLengths[i]) return (DayPhase)i;
                t -= PhaseLengths[i];
            }
            return DayPhase.Night;
        }

        /// <summary>Dawn and day are daylight; dusk and night are dark.</summary>
        public static bool IsDaylight(DayPhase phase) { return phase == DayPhase.Dawn || phase == DayPhase.Day; }

        /// <summary>Light 0..100 as a whole percent: dawn rises, day is full, dusk falls, night is 0.</summary>
        public static int DaylightPercent(int tick)
        {
            int t = Wrap(tick) - PhaseStart(PhaseAt(tick));
            switch (PhaseAt(tick))
            {
                case DayPhase.Dawn: return FullDaylightPercent * t / DawnMinutes;
                case DayPhase.Day: return FullDaylightPercent;
                case DayPhase.Dusk: return FullDaylightPercent - FullDaylightPercent * t / DuskMinutes;
                default: return 0;
            }
        }

        /// <summary>Lanterns burn from dusk until dawn.</summary>
        public static bool LanternsLit(int tick) { return !IsDaylight(PhaseAt(tick)); }
    }
}
