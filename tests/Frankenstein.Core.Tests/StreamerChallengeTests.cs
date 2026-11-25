using System;
using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 36 (spec 184): the weekly seed is the same across an ISO week and new the next, the leaderboard export round trips and holds no free text, the accuracy score is deterministic.</summary>
    public class StreamerChallengeTests
    {
        /// <summary>Instants as "yyyy-MM-dd HH:mm" UTC, chosen around week and year boundaries (2020-12-31 is ISO week 53, 2021-01-03 still 2020-W53, 2024-12-30 is 2025-W01).</summary>
        public static readonly string[] Instants =
        {
            "2026-11-09 00:00", "2026-11-12 13:30", "2026-11-15 23:59", "2026-11-16 00:00", "2020-12-31 12:00", "2021-01-03 23:59", "2021-01-04 00:00",
            "2024-12-29 10:00", "2024-12-30 00:00", "2026-01-01 00:00", "2027-01-01 00:00", "0001-01-01 00:00",
        };

        /// <summary>(true, partial, false, beliefTotal) accuracy cases.</summary>
        public static readonly int[][] AccuracyCases =
        {
            new[] { 0, 0, 0, 0 }, new[] { 1, 0, 0, 100 }, new[] { 1, 0, 0, 0 }, new[] { 0, 1, 0, 50 }, new[] { 0, 0, 3, 300 }, new[] { 2, 1, 1, 230 }, new[] { 4, 0, 0, 999 }, new[] { -1, 2, 0, -5 },
        };

        public static DateTime At(string text) { return DateTime.SpecifyKind(DateTime.ParseExact(text, "yyyy-MM-dd HH:mm", System.Globalization.CultureInfo.InvariantCulture), DateTimeKind.Utc); }

        public static List<ChallengeResult> SampleResults()
        {
            return new List<ChallengeResult>
            {
                new ChallengeResult { Seed = 1818, Score = 61, Theories = 4, Endings = 2 },
                new ChallengeResult { Seed = -7, Score = 88, Theories = 5, Endings = 3 },
                new ChallengeResult { Seed = 42, Score = 61, Theories = 2, Endings = 1 },
            };
        }

        [Fact]
        public void Weekly_key_is_identical_across_a_week_and_changes_the_next()
        {
            var monday = WeeklySeed.KeyFor(At("2026-11-09 00:00"));
            foreach (var t in new[] { "2026-11-09 00:00", "2026-11-12 13:30", "2026-11-15 23:59" }) Assert.Equal(monday, WeeklySeed.KeyFor(At(t)));
            Assert.NotEqual(monday, WeeklySeed.KeyFor(At("2026-11-16 00:00")));
            Assert.NotEqual(WeeklySeed.SeedFromKey(monday), WeeklySeed.SeedFromKey(WeeklySeed.KeyFor(At("2026-11-16 00:00"))));
            Assert.Equal("2026-W46", monday);
        }

        [Fact]
        public void Weekly_key_follows_ISO_8601_at_year_boundaries()
        {
            Assert.Equal("2020-W53", WeeklySeed.KeyFor(At("2020-12-31 12:00")));
            Assert.Equal("2020-W53", WeeklySeed.KeyFor(At("2021-01-03 23:59")));
            Assert.Equal("2021-W01", WeeklySeed.KeyFor(At("2021-01-04 00:00")));
            Assert.Equal("2025-W01", WeeklySeed.KeyFor(At("2024-12-30 00:00")));
        }

        [Fact]
        public void Weekly_seed_is_positive_and_never_equals_a_daily_seed_key()
        {
            foreach (var t in Instants) Assert.True(WeeklySeed.SeedFromKey(WeeklySeed.KeyFor(At(t))) > 0, t);
            Assert.NotEqual(WeeklySeed.SeedFromKey("2026-W46"), DailySeed.SeedFromKey("2026-11-09"));
        }

        [Fact]
        public void Accuracy_is_deterministic_bounded_and_ordered()
        {
            foreach (var c in AccuracyCases)
            {
                var a = InvestigationAccuracy.Score(c[0], c[1], c[2], c[3]);
                Assert.Equal(a, InvestigationAccuracy.Score(c[0], c[1], c[2], c[3]));
                Assert.InRange(a, 0, InvestigationAccuracy.Maximum);
            }
            Assert.Equal(0, InvestigationAccuracy.Score(0, 0, 0, 0));
            Assert.Equal(100, InvestigationAccuracy.Score(1, 0, 0, 100));
            Assert.Equal(70, InvestigationAccuracy.Score(1, 0, 0, 0));
            Assert.True(InvestigationAccuracy.Score(2, 0, 0, 100) > InvestigationAccuracy.Score(1, 1, 0, 100));
            Assert.True(InvestigationAccuracy.Score(1, 1, 0, 100) > InvestigationAccuracy.Score(0, 2, 0, 100));
            Assert.True(InvestigationAccuracy.Score(1, 0, 0, 100) > InvestigationAccuracy.Score(1, 0, 0, 40));
        }

        [Fact]
        public void Accuracy_from_a_theory_state_matches_the_counts()
        {
            var state = new TheoryState();
            state.Conclusions[0] = new TheoryConclusion { Instance = 0, Grade = TheoryGrade.True, AverageBelief = 80 };
            state.Conclusions[1] = new TheoryConclusion { Instance = 1, Grade = TheoryGrade.Partial, AverageBelief = 40 };
            Assert.Equal(InvestigationAccuracy.Score(1, 1, 0, 120), InvestigationAccuracy.Score(state));
        }

        [Fact]
        public void Leaderboard_export_round_trips_and_ranks_by_score_then_seed()
        {
            var lib = SeedShareTests.Library();
            var json = LeaderboardExport.ToJson(lib, "2026-W46", SampleResults());
            Assert.Equal(json, LeaderboardExport.ToJson(lib, "2026-W46", SampleResults().AsEnumerable().Reverse()));
            var back = LeaderboardExport.Parse(lib, json, out var week);
            Assert.Equal("2026-W46", week);
            Assert.Equal(new[] { -7, 42, 1818 }, back.Select(r => r.Seed).ToArray());
            Assert.Equal(json, LeaderboardExport.ToJson(lib, week, back));
        }

        [Fact]
        public void Leaderboard_export_holds_no_free_text_and_is_capped()
        {
            var lib = SeedShareTests.Library();
            var many = Enumerable.Range(0, LeaderboardExport.MaxEntries + 10).Select(i => new ChallengeResult { Seed = i, Score = i % 100 }).ToList();
            var json = LeaderboardExport.ToJson(lib, "2026-W46", many);
            Assert.Equal(LeaderboardExport.MaxEntries, LeaderboardExport.Parse(lib, json, out _).Count);
            var root = (Dictionary<string, object>)MiniJson.Parse(json);
            Assert.Equal(new[] { "entries", "format", "week" }, root.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
            foreach (Dictionary<string, object> e in (List<object>)root["entries"])
                Assert.Equal(new[] { "code", "endings", "rank", "score", "seed", "theories" }, e.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
        }

        [Theory]
        [InlineData("[]")]
        [InlineData("{\"format\":\"other\",\"week\":\"w\",\"entries\":[]}")]
        [InlineData("{\"format\":\"flv-challenge-1\",\"week\":\"w\"}")]
        [InlineData("{\"format\":\"flv-challenge-1\",\"week\":\"w\",\"entries\":[{\"seed\":1,\"code\":\"1-WRONG-WORDS\",\"score\":1,\"theories\":1,\"endings\":1}]}")]
        [InlineData("{\"format\":\"flv-challenge-1\",\"week\":\"w\",\"entries\":[{\"seed\":-1,\"code\":\"x\",\"score\":1,\"theories\":1,\"endings\":1}]}")]
        [InlineData("{\"format\":\"flv-challenge-1\",\"week\":\"w\",\"entries\":[{\"seed\":1,\"code\":\"x\",\"score\":101,\"theories\":1,\"endings\":1}]}")]
        public void Leaderboard_parse_rejects_malformed_input(string json)
        {
            Assert.Throws<FormatException>(() => LeaderboardExport.Parse(SeedShareTests.Library(), json, out _));
        }
    }
}
