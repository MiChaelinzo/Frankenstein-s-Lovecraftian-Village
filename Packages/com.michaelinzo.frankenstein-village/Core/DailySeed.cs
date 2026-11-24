using System;
using System.Collections.Generic;
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

        /// <summary>"1818-BLACK-TIDE" style share code for the village seed (round 34, spec 172). Words come from Data/seedshare.json, derived from the seed.</summary>
        public static string ShareCode(SeedShareLibrary library, int seed) { return SeedShare.Encode(library, seed); }

        /// <summary>The Daily Village Challenge: the share code of today's seed.</summary>
        public static string ChallengeCode(SeedShareLibrary library, string key) { return SeedShare.Encode(library, SeedFromKey(key)); }
    }

    /// <summary>The data file Data/seedshare.json: two word lists (omen words and theme words), canonical English upper case. Read by web/src/daily.js too (drift test).</summary>
    public sealed class SeedShareLibrary
    {
        public const int MinWords = 16;
        public List<string> First = new List<string>();
        public List<string> Second = new List<string>();

        /// <summary>Parses the data file. Throws FormatException naming the offending list when it is malformed, too short, has a duplicate or a word that is not A-Z.</summary>
        public static SeedShareLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("seedshare: root is not an object");
            return new SeedShareLibrary { First = Words(root, "first"), Second = Words(root, "second") };
        }

        private static List<string> Words(Dictionary<string, object> root, string field)
        {
            var list = root.ContainsKey(field) ? root[field] as List<object> : null;
            if (list == null || list.Count < MinWords) throw new FormatException("seedshare: " + field + " needs at least " + MinWords + " words");
            var seen = new HashSet<string>();
            var result = new List<string>();
            foreach (var item in list)
            {
                var w = item as string;
                if (string.IsNullOrEmpty(w)) throw new FormatException("seedshare: " + field + " holds a non-string");
                foreach (var c in w) if (c < 'A' || c > 'Z') throw new FormatException("seedshare: " + field + " word '" + w + "' must be A-Z upper case");
                if (!seen.Add(w)) throw new FormatException("seedshare: " + field + " repeats '" + w + "'");
                result.Add(w);
            }
            return result;
        }
    }

    /// <summary>Outcome of decoding a share code. Error is a stable id (empty, format, range, mismatch) and Message is readable English; the web UI translates by id.</summary>
    public sealed class SeedShareResult
    {
        public bool Ok;
        public int Seed;
        public string Error = "";
        public string Message = "";
        /// <summary>For a mismatch: the code the number really has.</summary>
        public string Expected = "";
    }

    /// <summary>Encode and decode of the share code. The seed prints as an unsigned 32-bit number so every int round trips.</summary>
    public static class SeedShare
    {
        public static string Encode(SeedShareLibrary library, int seed)
        {
            var number = ((uint)seed).ToString(CultureInfo.InvariantCulture);
            uint h = 0x811c9dc5u;
            foreach (var c in number) { h ^= c; h = unchecked(h * 0x01000193u); }
            uint firstCount = (uint)library.First.Count;
            return number + "-" + library.First[(int)(h % firstCount)] + "-" + library.Second[(int)((h / firstCount) % (uint)library.Second.Count)];
        }

        /// <summary>Accepts a bare number or number-WORD-WORD (any case, surrounding spaces). Words that do not belong to the number are an error, not a guess.</summary>
        public static SeedShareResult Decode(SeedShareLibrary library, string input)
        {
            var text = AsciiUpper((input ?? "").Trim());
            if (text.Length == 0) return Fail("empty", "Enter a seed number or a share code such as 1818-BLACK-TIDE.");
            var parts = text.Split('-');
            if ((parts.Length != 1 && parts.Length != 3) || !AllDigits(parts[0]) || (parts.Length == 3 && (!AllLetters(parts[1]) || !AllLetters(parts[2]))))
                return Fail("format", "A share code is a number, or a number and two words joined by hyphens, like 1818-BLACK-TIDE.");
            var digits = parts[0].TrimStart('0');
            ulong value = 0;
            if (digits.Length > 10) return Fail("range", "The seed number must be between 0 and 4294967295.");
            if (digits.Length > 0) value = ulong.Parse(digits, CultureInfo.InvariantCulture);
            if (value > uint.MaxValue) return Fail("range", "The seed number must be between 0 and 4294967295.");
            int seed = unchecked((int)(uint)value);
            var expected = Encode(library, seed);
            if (parts.Length == 3 && expected != (value.ToString(CultureInfo.InvariantCulture) + "-" + parts[1] + "-" + parts[2]))
                return new SeedShareResult { Error = "mismatch", Message = "The words do not belong to that number. The village " + value + " is " + expected + ".", Expected = expected };
            return new SeedShareResult { Ok = true, Seed = seed };
        }

        private static string AsciiUpper(string s) { var c = s.ToCharArray(); for (int i = 0; i < c.Length; i++) if (c[i] >= 'a' && c[i] <= 'z') c[i] = (char)(c[i] - 32); return new string(c); }
        private static SeedShareResult Fail(string error, string message) { return new SeedShareResult { Error = error, Message = message }; }
        private static bool AllDigits(string s) { if (s.Length == 0) return false; foreach (var c in s) if (c < '0' || c > '9') return false; return true; }
        private static bool AllLetters(string s) { if (s.Length == 0) return false; foreach (var c in s) if (c < 'A' || c > 'Z') return false; return true; }
    }
}
