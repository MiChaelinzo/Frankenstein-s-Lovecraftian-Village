using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>
    /// Round 36, spec 184: the weekly challenge. The seed derives from the ISO 8601 week of the UTC date, so everyone who opts in during the same week gets the same village
    /// and the next week brings a new one. Built on <see cref="DailySeed"/> and <see cref="SeedShare"/>. The clock is the caller's concern; nothing here reads the time.
    /// The ISO week is computed by hand (the Thursday rule) because Unity's .NET profile has no ISOWeek class.
    /// </summary>
    public static class WeeklySeed
    {
        /// <summary>"YYYY-Www" (ISO week-numbering year and week 01 to 53) for the UTC date of the given instant.</summary>
        public static string KeyFor(DateTime instant)
        {
            var utc = instant.Kind == DateTimeKind.Local ? instant.ToUniversalTime() : instant;
            int isoDay = utc.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)utc.DayOfWeek;
            var thursday = utc.Date.AddDays(4 - isoDay);
            int week = (thursday.DayOfYear - 1) / 7 + 1;
            return thursday.Year.ToString("D4", CultureInfo.InvariantCulture) + "-W" + week.ToString("D2", CultureInfo.InvariantCulture);
        }

        /// <summary>The village seed of a week key. The "W" in the key keeps it apart from every daily key.</summary>
        public static int SeedFromKey(string key) { return DailySeed.SeedFromKey(key); }

        /// <summary>The Weekly Village Challenge: the share code of this week's seed.</summary>
        public static string ChallengeCode(SeedShareLibrary library, string key) { return SeedShare.Encode(library, SeedFromKey(key)); }
    }

    /// <summary>
    /// Round 36, spec 184: the most accurate investigation score, whole points 0 to 100. It blends how right the player's theory conclusions were
    /// (<see cref="WeightTheory"/> percent: a True conclusion earns <see cref="PointsTrue"/>, a Partial one <see cref="PointsPartial"/>, a False one nothing, out of <see cref="PointsTrue"/> per conclusion)
    /// with how believable the evidence they attached was (<see cref="WeightBelief"/> percent: the mean of the conclusions' average belief, see <see cref="InvestigationRules"/>).
    /// No conclusions score 0. Integer arithmetic only, so Core and the browser agree to the point. It informs the player and gates nothing.
    /// </summary>
    public static class InvestigationAccuracy
    {
        public const int WeightTheory = 70, WeightBelief = 30, PointsTrue = 2, PointsPartial = 1, Maximum = 100;

        public static int Score(TheoryState state)
        {
            int belief = 0;
            foreach (var c in state.Conclusions.Values) belief += c.AverageBelief;
            return Score(state.Count(TheoryGrade.True), state.Count(TheoryGrade.Partial), state.Count(TheoryGrade.False), belief);
        }

        /// <summary>beliefTotal is the sum of the conclusions' average belief (each 0 to 100). Negative inputs count as 0.</summary>
        public static int Score(int trueCount, int partialCount, int falseCount, int beliefTotal)
        {
            trueCount = Math.Max(0, trueCount); partialCount = Math.Max(0, partialCount); falseCount = Math.Max(0, falseCount);
            int n = trueCount + partialCount + falseCount;
            if (n == 0) return 0;
            int theoryPercent = (trueCount * PointsTrue + partialCount * PointsPartial) * Maximum / (n * PointsTrue);
            int beliefPercent = Math.Min(Maximum, Math.Max(0, beliefTotal) / n);
            return (theoryPercent * WeightTheory + beliefPercent * WeightBelief) / Maximum;
        }
    }

    /// <summary>One finished run on the local challenge list. Only the seed and three counts: no name, no text, nothing that identifies a person.</summary>
    public sealed class ChallengeResult
    {
        public int Seed;
        public int Score;
        public int Theories;
        public int Endings;
    }

    /// <summary>
    /// Round 36, spec 184: the challenge leaderboard export. A local list of results becomes JSON that parses back to the same list. There is no network and no account: the player
    /// shares the file themselves. Entries hold the seed (and its share code, checked on import) plus counts, so the file cannot carry a name or any free text.
    /// Order is score descending, then seed, so equal inputs give equal bytes. The list is cut to <see cref="MaxEntries"/>.
    /// </summary>
    public static class LeaderboardExport
    {
        public const string FormatId = "flv-challenge-1";
        public const int MaxEntries = 25, MaxCount = 1000000;

        public static List<ChallengeResult> Ranked(IEnumerable<ChallengeResult> results)
        {
            var list = new List<ChallengeResult>(results);
            list.Sort((a, b) => a.Score != b.Score ? b.Score.CompareTo(a.Score) : ((uint)a.Seed).CompareTo((uint)b.Seed));
            if (list.Count > MaxEntries) list.RemoveRange(MaxEntries, list.Count - MaxEntries);
            return list;
        }

        public static string ToJson(SeedShareLibrary library, string weekKey, IEnumerable<ChallengeResult> results)
        {
            var inv = CultureInfo.InvariantCulture;
            var sb = new StringBuilder();
            sb.Append("{\"format\":\"").Append(FormatId).Append("\",\"week\":\"").Append(weekKey).Append("\",\"entries\":[");
            int rank = 0;
            foreach (var r in Ranked(results))
            {
                if (rank > 0) sb.Append(',');
                rank++;
                sb.Append("{\"rank\":").Append(rank.ToString(inv)).Append(",\"seed\":").Append(((uint)r.Seed).ToString(inv)).Append(",\"code\":\"").Append(SeedShare.Encode(library, r.Seed))
                  .Append("\",\"score\":").Append(r.Score.ToString(inv)).Append(",\"theories\":").Append(r.Theories.ToString(inv)).Append(",\"endings\":").Append(r.Endings.ToString(inv)).Append('}');
            }
            return sb.Append("]}").ToString();
        }

        /// <summary>Reads an export back. Throws FormatException naming the problem when the format id, a field or a share code is wrong. Returns the week key through <paramref name="weekKey"/>.</summary>
        public static List<ChallengeResult> Parse(SeedShareLibrary library, string json, out string weekKey)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("leaderboard: root is not an object");
            if (!(root.ContainsKey("format") && root["format"] as string == FormatId)) throw new FormatException("leaderboard: format is not " + FormatId);
            weekKey = root.ContainsKey("week") ? root["week"] as string : null;
            var entries = root.ContainsKey("entries") ? root["entries"] as List<object> : null;
            if (weekKey == null || entries == null) throw new FormatException("leaderboard: week and entries are required");
            if (entries.Count > MaxEntries) throw new FormatException("leaderboard: more than " + MaxEntries + " entries");
            var result = new List<ChallengeResult>();
            foreach (var item in entries)
            {
                var e = item as Dictionary<string, object>;
                if (e == null) throw new FormatException("leaderboard: an entry is not an object");
                long seed = Whole(e, "seed", uint.MaxValue), score = Whole(e, "score", InvestigationAccuracy.Maximum);
                var r = new ChallengeResult { Seed = unchecked((int)(uint)seed), Score = (int)score, Theories = (int)Whole(e, "theories", MaxCount), Endings = (int)Whole(e, "endings", MaxCount) };
                var code = e.ContainsKey("code") ? e["code"] as string : null;
                if (code != SeedShare.Encode(library, r.Seed)) throw new FormatException("leaderboard: share code does not belong to seed " + seed);
                result.Add(r);
            }
            return result;
        }

        private static long Whole(Dictionary<string, object> e, string field, long max)
        {
            if (!e.ContainsKey(field) || !(e[field] is double)) throw new FormatException("leaderboard: " + field + " must be a number");
            var d = (double)e[field];
            if (d != Math.Floor(d) || d < 0 || d > max) throw new FormatException("leaderboard: " + field + " must be a whole number from 0 to " + max);
            return (long)d;
        }
    }
}
