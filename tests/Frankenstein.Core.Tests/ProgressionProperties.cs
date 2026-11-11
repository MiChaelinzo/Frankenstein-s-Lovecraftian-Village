using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Codex, achievement, daily seed and Runtime helper rules (moved to Core in round 13).</summary>
    public class ProgressionProperties
    {
        private static Ritual RandomRitual(SeededRandom r) => RitualChain.Generate(CampaignGenerator.Generate(r.Next(100000), 1 + r.Next(9)));

        [Fact]
        public void Creature_order_is_a_deterministic_permutation()
        {
            Property.ForAll((r, seed) =>
            {
                int s = r.Next(2000000) - 1000000;
                var order = CodexModel.CreatureOrder(s);
                Assert.Equal(order, CodexModel.CreatureOrder(s));
                Assert.Equal(Enumerable.Range(0, CodexModel.CreatureCount), order.OrderBy(x => x));
            });
        }

        [Fact]
        public void Codex_entries_cover_every_stage_and_tier_with_unique_stable_ids()
        {
            Property.ForAll((r, seed) =>
            {
                var ritual = RandomRitual(r);
                var entries = CodexModel.Entries(ritual);
                Assert.Equal(ritual.Stages.Count + CodexModel.OmenTiers, entries.Count);
                Assert.Equal(entries.Count, entries.Select(e => e.Id).Distinct().Count());
                Assert.All(entries.Where(e => e.Kind == "stage"), e => Assert.InRange(e.Creature, 0, CodexModel.CreatureCount - 1));
            });
            Assert.Empty(CodexModel.Entries(null));
            Assert.Empty(CodexModel.UnlockedIds(null, 5, 3));
        }

        [Fact]
        public void Unlocked_ids_are_monotonic_in_stage_and_tier_and_are_always_entries()
        {
            Property.ForAll((r, seed) =>
            {
                var ritual = RandomRitual(r);
                var valid = new HashSet<string>(CodexModel.Entries(ritual).Select(e => e.Id));
                Assert.Empty(CodexModel.UnlockedIds(ritual, -1, 0));
                int stage = r.Next(ritual.Stages.Count + 3) - 1, tier = r.Next(6);
                var ids = CodexModel.UnlockedIds(ritual, stage, tier);
                Assert.All(ids, id => Assert.Contains(id, valid));
                Assert.True(CodexModel.UnlockedIds(ritual, stage + 1, tier).Count >= ids.Count);
                Assert.True(CodexModel.UnlockedIds(ritual, stage, tier + 1).Count >= ids.Count);
            });
        }

        [Fact]
        public void Unlock_into_adds_each_valid_id_once_and_ignores_foreign_ids()
        {
            var ritual = RitualChain.Generate(CampaignGenerator.Generate(1818, 5));
            var set = new HashSet<string>();
            Assert.Equal(new[] { "s0", "o1" }, CodexModel.UnlockInto(set, ritual, new[] { "s0", "zz", "o1" }));
            Assert.Equal(new[] { "o2" }, CodexModel.UnlockInto(set, ritual, new[] { "s0", "o2" }));
        }

        private static AchievementStats RandomStats(SeededRandom r)
        {
            var s = new AchievementStats
            {
                Whispers = r.Next(3), Listens = r.Next(6), Doors = r.Next(6), NightsTotal = r.Next(10), Tier = r.Next(5),
                StageCount = r.Next(10), InvestigatorDone = r.Next(2) == 1,
            };
            s.NightsVisited = r.Next(s.NightsTotal + 2);
            s.Stage = r.Next(s.StageCount + 2) - 1;
            s.CodexTotal = r.Next(14);
            s.CodexCount = r.Next(s.CodexTotal + 2);
            foreach (var k in AchievementRules.JournalKinds) if (r.Next(2) == 1) s.Kinds.Add(k);
            return s;
        }

        [Fact]
        public void Earned_ids_are_known_ordered_and_never_shrink_when_stats_only_grow()
        {
            Property.ForAll((r, seed) =>
            {
                var s = RandomStats(r);
                var earned = AchievementRules.EarnedIds(s);
                Assert.All(earned, id => Assert.Contains(id, AchievementRules.Ids));
                Assert.Equal(earned.OrderBy(id => System.Array.IndexOf(AchievementRules.Ids, id)), earned);
                s.Whispers++; s.Listens++; s.Doors++; s.Tier = System.Math.Min(3, s.Tier + 1); s.CodexCount++;
                s.NightsVisited++; s.InvestigatorDone = true;
                if (s.Stage < s.StageCount - 1) s.Stage++;
                foreach (var k in AchievementRules.JournalKinds) s.Kinds.Add(k);
                Assert.All(earned, id => Assert.True(AchievementRules.IsEarned(id, s), id));
            });
        }

        [Fact]
        public void Award_is_sticky_and_reports_only_new_ids()
        {
            var s = new AchievementStats { Whispers = 1, Tier = 3 };
            var earned = new HashSet<string>();
            Assert.Equal(new[] { "whisper", "abyss" }, AchievementRules.Award(earned, s));
            Assert.Empty(AchievementRules.Award(earned, s));
            s.Whispers = 0;
            Assert.Empty(AchievementRules.Award(earned, s));
            Assert.Contains("whisper", earned);
            Assert.False(AchievementRules.IsEarned("nope", s));
        }

        [Fact]
        public void Zero_totals_never_award_completion_achievements()
        {
            var s = new AchievementStats { NightsTotal = 0, NightsVisited = 5, StageCount = 0, Stage = 3, CodexTotal = 0, CodexCount = 9 };
            Assert.Empty(AchievementRules.EarnedIds(s));
        }

        [Fact]
        public void Journal_completion_counts_only_tracked_kinds()
        {
            var c = AchievementRules.Completion(new HashSet<string> { "narration", "door", "other" });
            Assert.Equal((2, 4, 50), (c.Seen, c.Total, c.Percent));
            Assert.Equal(100, AchievementRules.Completion(new HashSet<string>(AchievementRules.JournalKinds)).Percent);
        }

        [Fact]
        public void Daily_seed_is_deterministic_positive_and_pinned()
        {
            Property.ForAll((r, seed) =>
            {
                string key = DailySeed.KeyFor(new System.DateTime(2000 + r.Next(100), 1 + r.Next(12), 1 + r.Next(28), 0, 0, 0, System.DateTimeKind.Utc));
                int a = DailySeed.SeedFromKey(key);
                Assert.Equal(a, DailySeed.SeedFromKey(key));
                Assert.InRange(a, 1, int.MaxValue);
            });
            Assert.Equal(1880875346, DailySeed.SeedFromKey("2026-11-14"));
            Assert.Equal(1897652965, DailySeed.SeedFromKey("2026-11-15"));
            Assert.Equal("2026-11-14", DailySeed.KeyFor(new System.DateTime(2026, 11, 14, 23, 59, 59, System.DateTimeKind.Utc)));
            Assert.Equal("0999-01-02", DailySeed.KeyFor(new System.DateTime(999, 1, 2, 0, 0, 0, System.DateTimeKind.Utc)));
            Assert.True(DailySeed.SeedFromKey(null) >= 1);
        }

        [Fact]
        public void Floor_counts_stay_in_range_per_building_kind()
        {
            Property.ForAll((r, seed) =>
            {
                double a = r.Next(100) / 100.0, b = r.Next(100) / 100.0;
                Assert.InRange(DreadBuildingPolicy.FloorCountFor("house_a", a, b), 1, 2);
                Assert.InRange(DreadBuildingPolicy.FloorCountFor("house_b", a, b), 2, 3);
                Assert.Equal(2, DreadBuildingPolicy.FloorCountFor("church", a, b));
                Assert.Equal(1, DreadBuildingPolicy.FloorCountFor("well", a, b));
                Assert.Equal(1, DreadBuildingPolicy.FloorCountFor(null, a, b));
            });
        }

        [Fact]
        public void Detail_summary_counts_every_building_once_and_clamps()
        {
            Property.ForAll((r, seed) =>
            {
                var levels = Enumerable.Range(0, r.Next(12)).Select(_ => r.Next(9) - 2).ToList();
                var s = DreadBuildingPolicy.Summarize(levels);
                Assert.Equal(levels.Count, s.Count);
                Assert.Equal(levels.Count, s.LevelCounts.Sum());
                if (levels.Count == 0) { Assert.Equal(0f, s.Mean); Assert.Equal(0, s.Best); }
                else
                {
                    Assert.Equal(levels.Max(l => DreadBuildingPolicy.ClampDetail(l)), s.Best);
                    Assert.InRange(s.Mean, 0f, 3f);
                }
            });
        }

        [Fact]
        public void Camera_from_int_clamps_into_the_three_modes()
        {
            Assert.Equal(CameraMode.FirstPerson, DreadBuildingPolicy.CameraFromInt(-5));
            Assert.Equal(CameraMode.ThirdPerson, DreadBuildingPolicy.CameraFromInt(1));
            Assert.Equal(CameraMode.TopDown, DreadBuildingPolicy.CameraFromInt(99));
        }

        [Fact]
        public void Ambience_volume_is_monotonic_bounded_and_sanitizes_dread()
        {
            Assert.Equal(0.2f, DreadCurve.AmbienceVolume(0f));
            Assert.Equal(1f, DreadCurve.AmbienceVolume(1f), 5);
            Assert.Equal(0.2f, DreadCurve.AmbienceVolume(float.NaN));
            Assert.Equal(1f, DreadCurve.AmbienceVolume(7f), 5);
            float prev = 0f;
            for (int i = 0; i <= 100; i++) { float v = DreadCurve.AmbienceVolume(i / 100f); Assert.True(v >= prev); prev = v; }
        }

        [Fact]
        public void Dread_percent_rounds_halves_up_and_matches_the_report()
        {
            Assert.Equal(13, DreadThresholds.Percent(0.125f));
            Assert.Equal(0, DreadThresholds.Percent(float.NaN));
            Assert.Equal(100, DreadThresholds.Percent(3f));
            Property.ForAll((r, seed) =>
            {
                float d = r.Next(1001) / 1000f;
                int p = DreadThresholds.Percent(d);
                Assert.InRange(p, 0, 100);
                Assert.True(System.Math.Abs(p - d * 100f) <= 0.5001f);
            });
        }

        [Fact]
        public void Sanity_action_rules_keep_sanity_in_range_and_candle_outweighs_a_focus()
        {
            Assert.True(SanityModel.CandleRestore > SanityModel.FocusCost);
            Assert.True(SanityModel.ChurchCost > SanityModel.WhisperCost && SanityModel.WhisperCost > SanityModel.FocusCost);
            Assert.True(SanityModel.DrainPerSecond > 0f);
            Property.ForAll((r, seed) =>
            {
                var m = new SanityModel(r.Next(101));
                for (int i = 0; i < 40; i++)
                {
                    switch (r.Next(4))
                    {
                        case 0: m.Apply(-SanityModel.FocusCost); break;
                        case 1: m.Apply(-SanityModel.WhisperCost); break;
                        case 2: m.Apply(-SanityModel.ChurchCost); break;
                        default: m.Apply(SanityModel.CandleRestore); break;
                    }
                    Assert.InRange(m.Value, 0f, SanityModel.Max);
                }
            });
        }

        [Fact]
        public void Safe_narration_provider_records_why_it_fell_back()
        {
            var safe = new SafeNarrationProvider(new ThrowingProvider(), null);
            Assert.False(string.IsNullOrWhiteSpace(safe.Narrate("church", 0.5f)));
            Assert.Contains("boom", safe.LastError);
            var blank = new SafeNarrationProvider(new BlankProvider(), null);
            Assert.False(string.IsNullOrWhiteSpace(blank.Narrate("church", 0.5f)));
            Assert.Contains("blank", blank.LastError);
            var ok = new SafeNarrationProvider(new StaticNarrationProvider(), null);
            ok.Narrate("church", 0.5f);
            Assert.Null(ok.LastError);
        }

        private sealed class ThrowingProvider : INarrationProvider { public string Narrate(string l, float d) => throw new System.InvalidOperationException("boom"); }
        private sealed class BlankProvider : INarrationProvider { public string Narrate(string l, float d) => "  "; }
    }
}
