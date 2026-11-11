using System;
using System.Globalization;

namespace Frankenstein.Core
{
    /// <summary>
    /// Opt-in daily village: the seed is derived from the UTC date, so everyone who opts in on the same day gets
    /// the same village. The clock is the caller's concern; nothing here reads the time.
    /// </summary>
    public static class DailySeed
    {
        /// <summary>"YYYY-MM-DD" for the UTC date of the given instant (converted to UTC when it is not already).</summary>
        public static string KeyFor(DateTime instant)
        {
            var utc = instant.Kind == DateTimeKind.Local ? instant.ToUniversalTime() : instant;
            return utc.Year.ToString("D4", CultureInfo.InvariantCulture) + "-" + utc.Month.ToString("D2", CultureInfo.InvariantCulture) + "-" + utc.Day.ToString("D2", CultureInfo.InvariantCulture);
        }

        /// <summary>FNV-1a over the key's UTF-16 code units, folded to a positive 31-bit seed (never 0).</summary>
        public static int SeedFromKey(string key)
        {
            uint h = 0x811c9dc5u;
            if (key != null)
                for (int i = 0; i < key.Length; i++) { h ^= key[i]; h = unchecked(h * 0x01000193u); }
            int seed = (int)(h & 0x7fffffffu);
            return seed == 0 ? 1 : seed;
        }
    }
}
