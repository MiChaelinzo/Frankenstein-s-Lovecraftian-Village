using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 26 society model: trust and suspicion from an ordered action log, corruption spread along family and neighbour links, and trust gated chat.</summary>
    public class VillageSocietyTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string DataPath(string file) => Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", file);

        public static VillageSociety SocietyOf(int seed, out VillageStory story, out List<Villager> roster)
        {
            var layout = VillageLayoutGenerator.GenerateCity(GoldenParity.LoadCatalog(Root()), VillageDistricts.CityGrid, VillageDistricts.CityGrid, VillageDistricts.CityPieces, seed);
            roster = VillagerRules.GenerateRoster(seed, layout);
            var names = VillageNames.Assign(NameLibrary.Parse(File.ReadAllText(DataPath("names.json"))), seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, layout);
            story = VillageStory.Build(StoryLibrary.Parse(File.ReadAllText(DataPath("story.json"))), seed, layout, roster, names, CampaignGenerator.Generate(seed, 5).VillageName);
            return VillageSociety.Build(story, layout);
        }

        private static SocietyAction A(SocietyActionKind k, int subject) => new SocietyAction { Kind = k, Subject = subject };

        [Fact]
        public void Constants_are_consistent()
        {
            Assert.Equal(Enum.GetValues(typeof(SocietyActionKind)).Length, VillageSociety.ActionTrust.Length);
            Assert.Equal(VillageSociety.ActionTrust.Length, VillageSociety.ActionSuspicion.Length);
            Assert.Equal(Enum.GetValues(typeof(VillagerDisposition)).Length, VillageSociety.StartTrust.Length);
            Assert.True(VillageSociety.UneasyAt < VillageSociety.CorruptedAt && VillageSociety.CorruptedAt < VillageSociety.CultAt && VillageSociety.CultAt <= VillageSociety.Scale);
            Assert.True(VillageSociety.SuspiciousAt < VillageSociety.Scale && VillageSociety.TrustingAt < VillageSociety.Scale);
            Assert.Equal(TrustTier.Neutral, default(SocialStanding).Tier);
            Assert.Equal(CorruptionStage.None, default(SocialStanding).Corruption);
            Assert.All(VillageSociety.LieStatementIds, id => Assert.StartsWith("lie_", id));
        }

        [Fact]
        public void Society_is_deterministic_for_eight_seeds()
        {
            foreach (var seed in Seeds)
            {
                var a = SocietyOf(seed, out _, out var roster);
                var b = SocietyOf(seed, out _, out _);
                Assert.Equal(a.PatientZero, b.PatientZero);
                Assert.Equal(a.SpreadDelay, b.SpreadDelay);
                Assert.Equal(a.Fate, b.Fate);
                var log = new[] { A(SocietyActionKind.ChatPolite, 1), A(SocietyActionKind.SeenNearBody, VillageSociety.AllVillagers), A(SocietyActionKind.ReturnItem, 2) };
                Assert.Equal(a.OpinionsAfter(log).Trust, b.OpinionsAfter(log).Trust);
                Assert.Equal(a.OpinionsAfter(log).Suspicion, b.OpinionsAfter(log).Suspicion);
                for (int i = 0; i < roster.Count; i++) Assert.Equal(a.CorruptionAt(i, 4, 0.5f, 2), b.CorruptionAt(i, 4, 0.5f, 2));
            }
        }

        [Fact]
        public void Opinions_are_clamped_and_respond_to_actions()
        {
            var soc = SocietyOf(42, out _, out var roster);
            var none = soc.OpinionsAfter(new List<SocietyAction>());
            var spam = Enumerable.Repeat(A(SocietyActionKind.SeenAtRitualSite, VillageSociety.AllVillagers), 50).ToList();
            var bad = soc.OpinionsAfter(spam);
            for (int i = 0; i < roster.Count; i++)
            {
                Assert.InRange(none.Trust[i], 0, VillageSociety.Scale);
                Assert.Equal(0, none.Suspicion[i]);
                Assert.InRange(bad.Trust[i], 0, VillageSociety.Scale);
                Assert.InRange(bad.Suspicion[i], 0, VillageSociety.Scale);
                Assert.True(bad.Suspicion[i] > none.Suspicion[i]);
                Assert.Equal(TrustTier.Suspicious, VillageSociety.TierOf(bad.Trust[i], bad.Suspicion[i]));
            }
            var good = soc.OpinionsAfter(new[] { A(SocietyActionKind.ReturnJournal, 3), A(SocietyActionKind.ReturnItem, 3) });
            Assert.True(good.Trust[3] > none.Trust[3]);
        }

        [Fact]
        public void Log_order_matters_through_the_suspicious_gain_penalty()
        {
            var soc = SocietyOf(1, out _, out _);
            var kind = A(SocietyActionKind.ReturnItem, 0);
            var scare = A(SocietyActionKind.SeenAtRitualSite, 0);
            var scareThenGift = soc.OpinionsAfter(new[] { scare, scare, scare, kind });
            var giftThenScare = soc.OpinionsAfter(new[] { kind, scare, scare, scare });
            Assert.NotEqual(scareThenGift.Trust[0], giftThenScare.Trust[0]);
        }

        [Fact]
        public void Repeating_an_action_counts_less()
        {
            var soc = SocietyOf(1, out _, out _);
            var one = soc.OpinionsAfter(new[] { A(SocietyActionKind.ChatPolite, 0) });
            var two = soc.OpinionsAfter(new[] { A(SocietyActionKind.ChatPolite, 0), A(SocietyActionKind.ChatPolite, 0) });
            var zero = soc.OpinionsAfter(new List<SocietyAction>());
            Assert.True(two.Trust[0] - one.Trust[0] < one.Trust[0] - zero.Trust[0]);
        }

        [Fact]
        public void Opinion_ripples_reach_only_linked_villagers()
        {
            foreach (var seed in Seeds)
            {
                var soc = SocietyOf(seed, out _, out var roster);
                var zero = soc.OpinionsAfter(new List<SocietyAction>());
                var o = soc.OpinionsAfter(new[] { A(SocietyActionKind.SeenNearBody, 0) });
                for (int i = 1; i < roster.Count; i++)
                {
                    bool linked = soc.FamilyLinks[0].Contains(i) || soc.Neighbour[0] == i;
                    if (!linked) Assert.Equal(zero.Suspicion[i], o.Suspicion[i]);
                }
            }
        }

        [Fact]
        public void Corruption_spread_follows_the_graph_only()
        {
            foreach (var seed in Seeds)
            {
                var soc = SocietyOf(seed, out _, out var roster);
                Assert.Equal(0, soc.SpreadDelay[soc.PatientZero]);
                for (int i = 0; i < roster.Count; i++)
                {
                    if (i == soc.PatientZero) continue;
                    if (soc.SpreadDelay[i] == VillageSociety.Unreachable) { Assert.Equal(CorruptionStage.None, soc.CorruptionAt(i, 9, 1f, VillageSociety.MaxRitualStage)); continue; }
                    // a villager is reached through a link to someone reached earlier
                    bool chained = false;
                    for (int j = 0; j < roster.Count; j++)
                    {
                        if (soc.SpreadDelay[j] == VillageSociety.Unreachable || j == i) continue;
                        if (soc.FamilyLinks[j].Contains(i) && soc.SpreadDelay[j] + VillageSociety.FamilyDelay == soc.SpreadDelay[i]) chained = true;
                        if ((soc.Neighbour[j] == i || soc.Neighbour[i] == j) && soc.SpreadDelay[j] + VillageSociety.NeighbourDelay == soc.SpreadDelay[i]) chained = true;
                    }
                    Assert.True(chained, "villager " + i + " seed " + seed);
                }
            }
        }

        [Fact]
        public void Corruption_is_monotone_in_dread_night_and_ritual_stage()
        {
            foreach (var seed in Seeds)
            {
                var soc = SocietyOf(seed, out _, out var roster);
                for (int i = 0; i < roster.Count; i++)
                {
                    int prev = 0;
                    for (int night = 1; night <= 9; night++) { int l = soc.CorruptionLevel(i, night, 0.5f, 1); Assert.True(l >= prev); prev = l; }
                    prev = 0;
                    for (int d = 0; d <= 4; d++) { int l = soc.CorruptionLevel(i, 5, d / 4f, 1); Assert.True(l >= prev); prev = l; }
                    prev = 0;
                    for (int r = 0; r <= 6; r++) { int l = soc.CorruptionLevel(i, 5, 0.5f, r); Assert.True(l >= prev); prev = l; }
                    Assert.InRange(soc.CorruptionLevel(i, 99, 5f, 99), 0, VillageSociety.Scale);
                }
            }
        }

        [Fact]
        public void Late_stage_is_the_fixed_fate_and_maps_to_behavior()
        {
            var soc = SocietyOf(42, out _, out var roster);
            for (int i = 0; i < roster.Count; i++)
                if (soc.SpreadDelay[i] != VillageSociety.Unreachable && soc.CorruptionLevel(i, 9, 1f, VillageSociety.MaxRitualStage) >= VillageSociety.CultAt)
                    Assert.Equal(soc.Fate[i], soc.CorruptionAt(i, 9, 1f, VillageSociety.MaxRitualStage));
            Assert.Equal(VillagerBehavior.Normal, VillageSociety.BehaviorOf(CorruptionStage.None));
            Assert.Equal(VillagerBehavior.AtWindow, VillageSociety.BehaviorOf(CorruptionStage.Uneasy));
            Assert.Equal(VillagerBehavior.FacingSea, VillageSociety.BehaviorOf(CorruptionStage.Corrupted));
            Assert.Equal(VillagerBehavior.Vanished, VillageSociety.BehaviorOf(CorruptionStage.Missing));
            Assert.Equal(VillagerBehavior.FacingSea, VillageSociety.CombinedBehavior(VillagerBehavior.FacingSea, CorruptionStage.Uneasy));
            Assert.Equal(VillagerBehavior.RepeatingPhrase, VillageSociety.CombinedBehavior(VillagerBehavior.AtWindow, CorruptionStage.Cultist));
            Assert.False(VillageSociety.ColdLine(CorruptionStage.Uneasy));
            Assert.True(VillageSociety.ColdLine(CorruptionStage.Corrupted));
        }

        [Fact]
        public void Chat_without_standing_is_unchanged_and_standing_gates_the_hint()
        {
            var soc = SocietyOf(42, out _, out var roster);
            var v = roster[0];
            const int tick = 600;
            var plain = VillagerRules.Chat(42, v, tick, 0f, 1, 0, 2, 1, 80);
            Assert.Equal(VillagerBehavior.Normal, plain.Behavior);
            Assert.Equal("clues_seek", plain.HintId);
            Assert.Equal("", plain.LieStatementId);
            var neutral = VillagerRules.Chat(42, v, tick, 0f, 1, 0, 2, 1, 80, new SocialStanding { Tier = TrustTier.Neutral, Corruption = CorruptionStage.None });
            Assert.Equal(plain.HintId, neutral.HintId);
            var byDefault = VillagerRules.Chat(42, v, tick, 0f, 1, 0, 2, 1, 80, default(SocialStanding));
            Assert.Equal(plain.HintId, byDefault.HintId);
            Assert.Equal(plain.Behavior, byDefault.Behavior);
            Assert.Equal(plain.LineVariant, neutral.LineVariant);
            Assert.False(neutral.StrongHint);
            var trusting = VillagerRules.Chat(42, v, tick, 0f, 1, 0, 2, 1, 80, new SocialStanding { Tier = TrustTier.Trusting });
            Assert.True(trusting.StrongHint);
            Assert.Equal("clues_seek", trusting.HintId);
            bool sawLie = false, sawWithhold = false;
            for (int night = 1; night <= 40; night++)
            {
                var r = VillagerRules.Chat(42, v, tick, 0f, night, 0, 2, 1, 80, new SocialStanding { Tier = TrustTier.Suspicious });
                Assert.Equal("", r.HintId);
                if (r.LieStatementId.Length > 0) { sawLie = true; Assert.Contains(r.LieStatementId, VillageSociety.LieStatementIds); Assert.False(r.Withheld); }
                else { sawWithhold = true; Assert.True(r.Withheld); }
            }
            Assert.True(sawLie && sawWithhold);
            var cold = VillagerRules.Chat(42, v, tick, 0f, 1, 0, 2, 1, 80, new SocialStanding { Tier = TrustTier.Trusting, Corruption = CorruptionStage.Corrupted });
            Assert.True(cold.ColdLine);
            Assert.Equal(VillagerBehavior.FacingSea, cold.Behavior);
            Assert.Equal("", cold.HintId);
            var gone = VillagerRules.Chat(42, v, tick, 0f, 1, 0, 2, 1, 80, new SocialStanding { Corruption = CorruptionStage.Missing });
            Assert.False(gone.Available);
        }

        [Fact]
        public void Axes_are_bounded_deterministic_and_leave_opinions_alone()
        {
            foreach (int seed in Seeds)
            {
                var soc = SocietyOf(seed, out _, out var roster);
                var log = new[] { A(SocietyActionKind.ChatPolite, 1), A(SocietyActionKind.SeenNearBody, VillageSociety.AllVillagers) };
                var op = soc.OpinionsAfter(log);
                int trustBefore = op.Trust.Sum(), suspicionBefore = op.Suspicion.Sum();
                foreach (int night in new[] { -3, 0, 1, 5, 99 })
                    foreach (float dread in new[] { float.NaN, -1f, 0f, 0.5f, 1f, 7f })
                        foreach (int ritual in new[] { -2, 0, 3, 99 })
                        {
                            var a = soc.AxesAfter(op, night, dread, ritual);
                            var b = soc.AxesAfter(op, night, dread, ritual);
                            foreach (var axis in new[] { a.Fear, a.Faith, a.Loyalty, a.Obsession })
                            {
                                Assert.Equal(roster.Count, axis.Length);
                                Assert.All(axis, v => Assert.InRange(v, 0, VillageSociety.Scale));
                            }
                            Assert.Equal(a.Fear, b.Fear); Assert.Equal(a.Faith, b.Faith); Assert.Equal(a.Loyalty, b.Loyalty); Assert.Equal(a.Obsession, b.Obsession);
                        }
                Assert.Equal(trustBefore, op.Trust.Sum());
                Assert.Equal(suspicionBefore, op.Suspicion.Sum());
            }
        }

        [Fact]
        public void Fear_rises_with_dread_and_ritual_stage()
        {
            var soc = SocietyOf(42, out _, out _);
            var op = soc.OpinionsAfter(null);
            var calm = soc.AxesAfter(op, 1, 0f, 0);
            var dire = soc.AxesAfter(op, 1, 1f, 5);
            for (int i = 0; i < calm.Fear.Length; i++) Assert.True(dire.Fear[i] >= calm.Fear[i]);
        }

        [Fact]
        public void Fear_above_trust_withholds_the_chat_while_trust_still_shows()
        {
            SocietyOf(42, out _, out var roster);
            var v = roster[0];
            var st = new SocialStanding { Tier = TrustTier.Trusting, Trust = 900, Fear = 950 };
            var r = VillagerRules.Chat(42, v, 600, 0f, 1, 0, 2, 1, 80, st);
            Assert.True(r.Available);
            Assert.True(r.Withheld);
            Assert.True(r.FearWithheld);
            Assert.False(r.StrongHint);
            Assert.Equal("", r.HintId);
            Assert.Equal(TrustTier.Trusting, st.Tier);
            var calm = VillagerRules.Chat(42, v, 600, 0f, 1, 0, 2, 1, 80, new SocialStanding { Tier = TrustTier.Trusting, Trust = 900, Fear = 700 });
            Assert.False(calm.Withheld);
            Assert.True(calm.StrongHint);
            var low = VillagerRules.Chat(42, v, 600, 0f, 1, 0, 2, 1, 80, new SocialStanding { Tier = TrustTier.Neutral, Trust = 1000, Fear = 1000 });
            Assert.False(low.Withheld);
            Assert.True(VillageSociety.FearWithholds(500, 800));
            Assert.False(VillageSociety.FearWithholds(800, 800));
            Assert.False(VillageSociety.FearWithholds(0, 799));
        }

        private static List<SocietyAction> Crowd(int roster)
        {
            var log = new List<SocietyAction>();
            for (int i = 0; i < 40; i++) log.Add(A(i % 2 == 0 ? SocietyActionKind.SeenAtRitualSite : SocietyActionKind.NightIntrusion, i % roster));
            return log;
        }

        [Fact]
        public void Reputation_empty_log_has_no_effects_and_leaves_opinions_alone()
        {
            var soc = SocietyOf(42, out _, out _);
            Assert.Empty(soc.ReputationEffectsAfter(null, null));
            Assert.Empty(soc.ReputationEffectsAfter(new List<SocietyAction>(), null));
            var log = new[] { A(SocietyActionKind.SeenNearBody, 1) };
            soc.ReputationEffectsAfter(log, null);
            Assert.Equal(soc.OpinionsAfter(log).Trust, soc.OpinionsAfter(log).Trust);
        }

        [Fact]
        public void Reputation_decays_by_hop_and_records_origin_and_direction()
        {
            foreach (int seed in Seeds)
            {
                var soc = SocietyOf(seed, out _, out var roster);
                var fx = soc.ReputationEffectsAfter(new[] { A(SocietyActionKind.SeenAtRitualSite, 0) }, null);
                var origin = Assert.Single(fx, e => e.Hop == 0);
                Assert.Equal(0, origin.Target);
                Assert.Equal(ReputationEffectKind.Accused, origin.Effect);
                Assert.Equal(400, origin.Strength);
                foreach (var e in fx.Where(e => e.Hop > 0))
                {
                    Assert.Equal(0, e.Source);
                    Assert.True(e.Hop <= VillageSociety.MaxReputationHops);
                    Assert.True(e.Strength <= origin.Strength >> e.Hop);
                    Assert.Contains(e.Target, Enumerable.Range(0, roster.Count));
                }
                Assert.Equal(ReputationEffectKind.Trusted, soc.ReputationEffectsAfter(new[] { A(SocietyActionKind.ReturnJournal, 0) }, null)[0].Effect);
            }
        }

        [Fact]
        public void Reputation_each_villager_is_visited_once_per_origin_event()
        {
            foreach (int seed in Seeds)
            {
                var soc = SocietyOf(seed, out _, out var roster);
                for (int s = 0; s < roster.Count; s++)
                {
                    var fx = soc.ReputationEffectsAfter(new[] { A(SocietyActionKind.SeenNearBody, s) }, null);
                    Assert.Equal(fx.Count, fx.Select(e => e.Target).Distinct().Count());
                    Assert.All(fx, e => Assert.Equal(s, e.Source));
                }
            }
        }

        [Fact]
        public void Reputation_caps_hold_on_cyclic_links_with_a_crowded_log()
        {
            foreach (int seed in Seeds)
            {
                var soc = SocietyOf(seed, out _, out var roster);
                var fx = soc.ReputationEffectsAfter(Crowd(roster.Count), null);
                Assert.All(fx, e => Assert.InRange(e.Strength, 1, VillageSociety.MaxEffectStrength));
                foreach (var g in fx.Where(e => e.Hop > 0).GroupBy(e => e.Target)) Assert.True(g.Sum(e => e.Strength) <= VillageSociety.PropagatedCapPerVillager);
                Assert.True(fx.Where(e => e.Hop > 0).Sum(e => e.Strength) <= VillageSociety.PropagatedCapPerNight);
                var nights = Enumerable.Range(0, 40).Select(i => i / 10).ToList();
                var split = soc.ReputationEffectsAfter(Crowd(roster.Count), nights).Where(e => e.Hop > 0);
                foreach (var g in split.GroupBy(e => e.Night)) Assert.True(g.Sum(e => e.Strength) <= VillageSociety.PropagatedCapPerNight);
            }
        }

        [Fact]
        public void Reputation_all_villager_action_does_not_propagate_and_bad_entries_are_ignored()
        {
            var soc = SocietyOf(42, out _, out var roster);
            var fx = soc.ReputationEffectsAfter(new[] { A(SocietyActionKind.SeenNearBody, VillageSociety.AllVillagers), A((SocietyActionKind)99, 0), A(SocietyActionKind.ChatPolite, 999) }, null);
            Assert.Equal(roster.Count, fx.Count);
            Assert.All(fx, e => Assert.Equal(0, e.Hop));
        }

        [Fact]
        public void Reputation_is_deterministic_and_replay_equals_incremental()
        {
            var soc = SocietyOf(1818, out _, out var roster);
            var log = Crowd(roster.Count);
            var full = soc.ReputationEffectsAfter(log, null);
            Assert.Equal(full, soc.ReputationEffectsAfter(log, null));
            for (int cut = 1; cut <= log.Count; cut += 7)
            {
                var prefix = soc.ReputationEffectsAfter(log.Take(cut).ToList(), null);
                Assert.Equal(prefix, full.Take(prefix.Count).ToList());
            }
        }

        [Fact]
        public void Reputation_golden_file_is_the_same_data_the_web_checks()
        {
            Assert.Contains("\"reputation\"", File.ReadAllText(Path.Combine(Root(), "web", "test", "golden.json")));
        }
    }
}
