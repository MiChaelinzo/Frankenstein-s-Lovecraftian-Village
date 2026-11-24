using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 28 Forbidden Knowledge (spec 158): tiers, gains, tiered rumors, reality distortion and the mythos chat moved into Core.</summary>
    public class KnowledgeTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string DataText() { return File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "knowledge.json")); }
        private static KnowledgeLibrary Lib() { return KnowledgeLibrary.Parse(DataText()); }

        [Fact]
        public void Tiers_are_ordered_and_thresholds_rise_from_zero()
        {
            var lib = Lib();
            Assert.Equal(new[] { "nothing", "village_folklore", "cult_secrets", "forbidden_texts", "eldritch_science", "outer_truth" }, lib.Tiers.Select(t => t.Id).ToArray());
            Assert.Equal(0, lib.Tiers[0].Threshold);
            for (int i = 1; i < lib.Tiers.Count; i++)
            {
                Assert.True(lib.Tiers[i].Threshold > lib.Tiers[i - 1].Threshold);
                Assert.Equal(i, lib.TierFor(lib.Tiers[i].Threshold));
                Assert.Equal(i - 1, lib.TierFor(lib.Tiers[i].Threshold - 1));
            }
            Assert.Equal(KnowledgeLibrary.MaxTier, lib.TierFor(int.MaxValue));
        }

        [Fact]
        public void No_tier_is_reached_without_a_gain_and_negative_points_read_as_zero()
        {
            var lib = Lib();
            var s = new KnowledgeState();
            Assert.Equal(0, s.Tier(lib));
            Assert.Equal(0, lib.TierFor(-50));
            s.Add(KnowledgeSource.Journal, -999);
            s.Add(KnowledgeSource.Ritual, 0);
            Assert.Equal(0, s.Points);
            Assert.Equal(0, s.Tier(lib));
            Assert.All(s.Log, g => Assert.True(g.Points >= 0));
        }

        [Fact]
        public void Every_source_has_points_and_every_source_can_raise_the_tier()
        {
            var lib = Lib();
            Assert.Equal(7, Enum.GetValues(typeof(KnowledgeSource)).Length);
            foreach (KnowledgeSource src in Enum.GetValues(typeof(KnowledgeSource)))
            {
                Assert.True(lib.SourcePoints[(int)src] > 0);
                var s = new KnowledgeState();
                for (int i = 0; i < 100; i++) s.Add(lib, src);
                Assert.Equal(KnowledgeLibrary.MaxTier, s.Tier(lib));
            }
        }

        [Fact]
        public void Replay_equals_adding_one_by_one_and_is_independent_of_sanity()
        {
            var lib = Lib();
            var ids = new[] { "journal", "ritual", "catacombs", "cult_discovery", "mythos_event", "ruins", "investigation", "journal" };
            var live = new KnowledgeState();
            for (int i = 0; i < ids.Length; i++)
            {
                live.Add(lib, (KnowledgeSource)KnowledgeLibrary.SourceIndex(ids[i]));
                var replayed = KnowledgeState.FromSourceIds(lib, ids.Take(i + 1).ToList());
                Assert.Equal(live.Points, replayed.Points);
                Assert.Equal(live.Tier(lib), replayed.Tier(lib));
                Assert.Equal(live.Points, KnowledgeState.Replay(live.Log).Points);
            }
            var sanity = new SanityModel();
            float before = sanity.Value;
            live.Add(KnowledgeSource.Catacombs, 50);
            Assert.Equal(before, sanity.Value);
        }

        [Fact]
        public void An_unknown_source_is_a_parse_error_naming_the_field()
        {
            var lib = Lib();
            var ex = Assert.Throws<FormatException>(() => KnowledgeState.FromSourceIds(lib, new[] { "journal", "tea_leaves" }));
            Assert.Contains("sources[1]", ex.Message);
            Assert.Contains("tea_leaves", ex.Message);
            var bad = DataText().Replace("\"id\": \"catacombs\"", "\"id\": \"sewers\"");
            Assert.Contains("sources", Assert.Throws<FormatException>(() => KnowledgeLibrary.Parse(bad)).Message);
            Assert.Contains("tiers", Assert.Throws<FormatException>(() => KnowledgeLibrary.Parse("{\"sources\":[]}")).Message);
            Assert.Throws<FormatException>(() => KnowledgeLibrary.Parse("[]"));
            Assert.Throws<FormatException>(() => KnowledgeRules.RumorText(lib, "nope", 0, "en"));
        }

        [Fact]
        public void Benefits_accumulate_and_cover_every_kind_the_design_names()
        {
            var lib = Lib();
            Assert.Empty(KnowledgeRules.Benefits(lib, 0));
            for (int t = 1; t <= KnowledgeLibrary.MaxTier; t++) Assert.True(KnowledgeRules.Benefits(lib, t).Count > KnowledgeRules.Benefits(lib, t - 1).Count);
            var all = KnowledgeRules.Benefits(lib, KnowledgeLibrary.MaxTier);
            foreach (var kind in new[] { "hidden_dialogue", "secret_paths", "hidden_cult_symbols", "true_rumor_versions", "dimensional_gateways", "new_deduction" })
                Assert.Contains(all, b => b.StartsWith(kind));
            Assert.Equal(all.Count, all.Distinct().Count());
            Assert.Equal(all, KnowledgeRules.Benefits(lib, 99));
        }

        [Fact]
        public void The_lighthouse_rumor_gets_truer_with_knowledge_in_both_languages()
        {
            var lib = Lib();
            Assert.Equal("The lighthouse is haunted.", KnowledgeRules.RumorText(lib, "lighthouse", 0, "en"));
            Assert.Equal("The lighthouse beam is signaling something offshore.", KnowledgeRules.RumorText(lib, "lighthouse", 4, "en"));
            Assert.Equal("The beam is synchronized with an entity beneath the bay.", KnowledgeRules.RumorText(lib, "lighthouse", 5, "en"));
            Assert.Equal(KnowledgeRules.RumorText(lib, "lighthouse", 4, "en"), KnowledgeRules.RumorText(lib, "lighthouse", 4, "en"));
            foreach (var r in lib.Rumors)
            {
                Assert.Single(lib.Rumors, x => x.Id == r.Id);
                var en = Enumerable.Range(0, 6).Select(t => KnowledgeRules.RumorText(lib, r.Id, t, "en")).ToList();
                var fr = Enumerable.Range(0, 6).Select(t => KnowledgeRules.RumorText(lib, r.Id, t, "fr")).ToList();
                Assert.True(en.Distinct().Count() >= 3);
                Assert.Equal(en.Select(e => en.IndexOf(e)), fr.Select(f => fr.IndexOf(f)));
                Assert.NotEqual(en, fr);
            }
            Assert.True(lib.Rumors.Count >= 4);
        }

        [Fact]
        public void Reality_distortion_is_empty_at_tier_zero_bounded_and_deterministic()
        {
            var lib = Lib();
            foreach (int seed in Seeds)
                for (int night = 1; night <= 12; night++)
                {
                    Assert.Empty(RealityDistortion.For(lib, seed, night, 0));
                    Assert.Empty(RealityDistortion.For(lib, seed, night, -3));
                    for (int tier = 1; tier <= 7; tier++)
                    {
                        var a = RealityDistortion.For(lib, seed, night, tier);
                        Assert.Equal(a, RealityDistortion.For(lib, seed, night, tier));
                        Assert.InRange(a.Count, 1, Math.Min(tier, KnowledgeLibrary.MaxTier));
                        Assert.Equal(a.Count, a.Distinct().Count());
                        Assert.All(a, id => Assert.True(lib.Effects.First(e => e.Id == id).MinTier <= Math.Min(tier, KnowledgeLibrary.MaxTier)));
                    }
                }
            Assert.Equal(5, RealityDistortion.For(lib, 1, 1, 5).Count);
        }

        [Fact]
        public void Reality_distortion_varies_with_seed_and_night()
        {
            var lib = Lib();
            var sigs = new HashSet<string>();
            foreach (int seed in Seeds) for (int night = 1; night <= 12; night++) sigs.Add(string.Join(",", RealityDistortion.For(lib, seed, night, 3)));
            Assert.True(sigs.Count > 3);
        }

        [Fact]
        public void Knowledge_does_not_touch_sanity_or_the_mythos_run()
        {
            var lib = Lib();
            var k = new KnowledgeState();
            var sanity = new SanityModel();
            float before = sanity.Value;
            var a = MythosSimulationTests.Run(42, MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights, out _, out _);
            for (int i = 0; i < 40; i++) k.Add(lib, KnowledgeSource.CultDiscovery);
            RealityDistortion.For(lib, 42, 3, k.Tier(lib));
            var b = MythosSimulationTests.Run(42, MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights, out _, out _);
            Assert.Equal(before, sanity.Value);
            Assert.Equal(a.Nights.Count, b.Nights.Count);
            Assert.Equal(string.Join("|", a.Nights.SelectMany(n => n.Events.Select(e => e.Key))), string.Join("|", b.Nights.SelectMany(n => n.Events.Select(e => e.Key))));
        }

        private static VillagerChatResult Chat(string hint, VillagerBehavior behavior = VillagerBehavior.Normal, bool available = true, bool withheld = false)
        {
            return new VillagerChatResult { Available = available, Behavior = behavior, HintId = hint, Withheld = withheld };
        }

        [Fact]
        public void Mythos_chat_tells_by_trust_tier_and_stays_silent_when_the_villager_cannot()
        {
            int told = 0, trustOnly = 0;
            foreach (int seed in new[] { 1, 42, 1818 })
            {
                var state = MythosSimulationTests.Run(seed, MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights, out var soc, out var story);
                var feed = new MythosFeed { Library = MythosSimulationTests.Library(), State = state, Night = MythosSimulationTests.Nights };
                var statementIds = new HashSet<string>(MythosRules.Statements(feed).Select(s => s.Id));
                for (int i = 0; i < soc.Roster.Count; i++)
                {
                    int n = MythosSimulationTests.Nights;
                    var about = MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, n, Chat("village"), "en");
                    var hintNeutral = MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, n, Chat("clues_seek"), "en");
                    var hintTrusting = MythosChat.Lines(soc, feed, story, i, TrustTier.Trusting, n, Chat("clues_seek"), "en");
                    Assert.Empty(hintNeutral);
                    Assert.Empty(MythosChat.Lines(soc, feed, story, i, TrustTier.Suspicious, n, Chat("village"), "en"));
                    Assert.Empty(MythosChat.Lines(soc, feed, story, i, TrustTier.Trusting, n, Chat("village", withheld: true), "en"));
                    Assert.Empty(MythosChat.Lines(soc, feed, story, i, TrustTier.Trusting, n, Chat("village", VillagerBehavior.AtWindow), "en"));
                    Assert.Empty(MythosChat.Lines(soc, feed, story, i, TrustTier.Trusting, n, Chat("village", available: false), "en"));
                    Assert.Empty(MythosChat.Lines(soc, feed, story, i, TrustTier.Trusting, n, Chat(""), "en"));
                    Assert.Equal(about.Select(l => l.Id), hintTrusting.Select(l => l.Id));
                    Assert.All(about, l => { Assert.Contains(l.Id, statementIds); Assert.False(string.IsNullOrWhiteSpace(l.Text)); });
                    Assert.Equal(about.Select(l => l.Text), MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, n, Chat("village"), "en").Select(l => l.Text));
                    told += about.Count;
                    if (about.Count > 0 && hintNeutral.Count == 0) trustOnly++;
                }
                Assert.Empty(MythosChat.Lines(soc, feed, story, -1, TrustTier.Trusting, 12, Chat("village"), "en"));
                Assert.Empty(MythosChat.Lines(soc, feed, story, soc.Roster.Count, TrustTier.Trusting, 12, Chat("village"), "en"));
                Assert.Empty(MythosChat.Lines(null, feed, story, 0, TrustTier.Trusting, 12, Chat("village"), "en"));
                Assert.Empty(MythosChat.Lines(soc, null, story, 0, TrustTier.Trusting, 12, Chat("village"), "en"));
            }
            Assert.True(told > 0);
            Assert.True(trustOnly > 0);
        }

        [Fact]
        public void Mythos_chat_only_tells_rumors_that_already_started()
        {
            var state = MythosSimulationTests.Run(42, MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights, out var soc, out var story);
            var feed = new MythosFeed { Library = MythosSimulationTests.Library(), State = state, Night = MythosSimulationTests.Nights };
            for (int i = 0; i < soc.Roster.Count; i++)
                foreach (var l in MythosChat.Lines(soc, feed, story, i, TrustTier.Trusting, 1, Chat("village"), "en"))
                    if (l.Id.StartsWith(MythosRules.RumorPrefix)) Assert.Equal("mythos:rumor:1", l.Id);
        }
    }
}
