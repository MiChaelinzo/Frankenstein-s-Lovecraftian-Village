using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 34 (spec 172): the Village Seed Share code round trips for every seed, rejects broken codes with a readable error and the daily challenge shows today's code.</summary>
    public class SeedShareTests
    {
        public static readonly int[] Seeds = { 0, 1, 42, 1818, -1, -7, 123456789, int.MaxValue, int.MinValue };
        public static readonly string[] Inputs =
        {
            "1818", " 1818 ", "0001818", "4294967295", "4294967296", "99999999999", "", "   ", "-5", "abc", "1818-BLACK", "1818-BLACK-TIDE-X", "1818-BL4CK-TIDE", "x-BLACK-TIDE",
            "1818--TIDE", "1818-black-tide", "18.5", "1818-STRAY-WORD", "\u00df-A-B",
        };
        public static readonly string[] DailyKeys = { "2026-11-14", "2026-11-15", "2026-11-16", "0001-01-01" };

        private static string DataPath()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "seedshare.json");
        }

        public static SeedShareLibrary Library() { return SeedShareLibrary.Parse(File.ReadAllText(DataPath())); }

        [Fact]
        public void EverySeedRoundTripsThroughItsCode()
        {
            var lib = Library();
            var rng = new Random(34);
            var seeds = Seeds.Concat(Enumerable.Range(0, 5000).Select(_ => rng.Next(int.MinValue, int.MaxValue))).ToList();
            foreach (var seed in seeds)
            {
                var code = SeedShare.Encode(lib, seed);
                var back = SeedShare.Decode(lib, code);
                Assert.True(back.Ok, code);
                Assert.Equal(seed, back.Seed);
                Assert.Equal(code, SeedShare.Encode(lib, seed));
                Assert.Equal(seed, SeedShare.Decode(lib, code.ToLowerInvariant()).Seed);
            }
        }

        [Fact]
        public void BareNumberIsAccepted()
        {
            var lib = Library();
            Assert.Equal(1818, SeedShare.Decode(lib, "1818").Seed);
            Assert.Equal(-1, SeedShare.Decode(lib, "4294967295").Seed);
        }

        [Fact]
        public void BrokenCodesGiveAReadableError()
        {
            var lib = Library();
            foreach (var input in Inputs)
            {
                var r = SeedShare.Decode(lib, input);
                if (r.Ok) continue;
                Assert.Contains(r.Error, new[] { "empty", "format", "range", "mismatch" });
                Assert.True(r.Message.Length > 20, input);
                Assert.DoesNotContain("\u2014", r.Message);
            }
            Assert.Equal("empty", SeedShare.Decode(lib, null).Error);
            Assert.Equal("range", SeedShare.Decode(lib, "4294967296").Error);
            Assert.Equal("format", SeedShare.Decode(lib, "1818-BLACK").Error);
            var mismatch = SeedShare.Decode(lib, "1818-STRAY-WORD");
            Assert.Equal("mismatch", mismatch.Error);
            Assert.Equal(SeedShare.Encode(lib, 1818), mismatch.Expected);
            Assert.Contains(mismatch.Expected, mismatch.Message);
        }

        [Fact]
        public void DailyChallengeShowsTodaysCode()
        {
            var lib = Library();
            foreach (var key in DailyKeys)
            {
                var code = DailySeed.ChallengeCode(lib, key);
                Assert.Equal(DailySeed.SeedFromKey(key), SeedShare.Decode(lib, code).Seed);
            }
        }

        [Fact]
        public void WordListsRejectBadData()
        {
            Assert.Throws<FormatException>(() => SeedShareLibrary.Parse("[]"));
            Assert.Throws<FormatException>(() => SeedShareLibrary.Parse("{\"first\": [\"A\"], \"second\": []}"));
            var good = string.Join(",", Enumerable.Range(0, 16).Select(i => "\"" + new string((char)('A' + i), 3) + "\""));
            Assert.Throws<FormatException>(() => SeedShareLibrary.Parse("{\"first\": [" + good.Replace("AAA", "aaa") + "], \"second\": [" + good + "]}"));
            Assert.Throws<FormatException>(() => SeedShareLibrary.Parse("{\"first\": [" + good.Replace("BBB", "AAA") + "], \"second\": [" + good + "]}"));
            Assert.NotNull(SeedShareLibrary.Parse("{\"first\": [" + good + "], \"second\": [" + good + "]}"));
        }
    }
}
