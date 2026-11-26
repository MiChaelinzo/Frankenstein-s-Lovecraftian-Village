using System;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 36 (spec 181): rumor mutation is a pure, monotonic function of seed, nights and exposure, never exceeds the chain, gates the true account by knowledge tier and changes no state.</summary>
    public class RumorMutationTests
    {
        public const int MaxNights = 12;
        public static readonly int[] RumorNights = { 1, 5 };
        public static readonly int[] Exposures = { 0, 500, 1000 };
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };

        public static string DataText()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return File.ReadAllText(Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "rumor-mutations.json"));
        }

        public static RumorMutationLibrary Library() { return RumorMutationLibrary.Parse(DataText()); }

        private static int LighthouseIndex(RumorMutationLibrary lib) { return lib.Chains.FindIndex(c => c.Id == "lighthouse"); }

        [Fact]
        public void Lighthouse_chain_has_the_four_authored_stages_in_en_and_fr()
        {
            var lib = Library();
            var chain = lib.Chains[LighthouseIndex(lib)];
            Assert.Equal(4, chain.Stages.Count);
            Assert.Contains("haunted", chain.Stages[0].Get("en"));
            Assert.Contains("signals ships", chain.Stages[1].Get("en"));
            Assert.Contains("signals the dead", chain.Stages[2].Get("en"));
            Assert.Contains("beneath the sea", chain.Stages[3].Get("en"));
            Assert.True(lib.Chains.Count >= 5);
        }

        [Fact]
        public void Every_stage_and_original_has_en_and_fr_text()
        {
            var lib = Library();
            foreach (var c in lib.Chains)
            {
                Assert.True(c.Stages.Count >= RumorMutationLibrary.MinStages);
                foreach (var name in c.Stages.Concat(new[] { c.Original }).Concat(new[] { lib.TrueLabel }))
                    foreach (var lang in VillageNames.Languages) Assert.False(string.IsNullOrWhiteSpace(name.Get(lang)));
            }
        }

        [Fact]
        public void Stage_is_deterministic_bounded_and_never_falls_as_nights_pass()
        {
            var lib = Library();
            for (int c = 0; c < lib.Chains.Count; c++)
                foreach (int seed in Seeds)
                    foreach (int rn in RumorNights)
                        foreach (int ex in Exposures)
                        {
                            int previous = 0;
                            for (int n = 0; n <= MaxNights; n++)
                            {
                                int stage = RumorMutation.Stage(lib, c, seed, rn, n, ex);
                                Assert.Equal(stage, RumorMutation.Stage(lib, c, seed, rn, n, ex));
                                Assert.InRange(stage, 0, lib.Chains[c].Stages.Count - 1);
                                Assert.True(stage >= previous);
                                previous = stage;
                            }
                        }
        }

        [Fact]
        public void More_exposure_never_lowers_the_stage()
        {
            var lib = Library();
            foreach (int seed in Seeds)
                for (int n = 0; n <= MaxNights; n++)
                {
                    int previous = 0;
                    for (int ex = 0; ex <= RumorMutation.ExposureScale; ex += 100)
                    {
                        int stage = RumorMutation.Stage(lib, 0, seed, 1, n, ex);
                        Assert.True(stage >= previous);
                        previous = stage;
                    }
                }
        }

        [Fact]
        public void Twelve_nights_reach_the_deepest_lighthouse_stage_under_high_exposure_and_not_under_none()
        {
            var lib = Library();
            int c = LighthouseIndex(lib), last = lib.Chains[c].Stages.Count - 1;
            foreach (int seed in Seeds)
                foreach (int rn in RumorNights)
                {
                    Assert.Equal(last, RumorMutation.Stage(lib, c, seed, rn, MaxNights, RumorMutation.ExposureScale));
                    Assert.True(RumorMutation.Stage(lib, c, seed, rn, MaxNights, 0) < last);
                }
        }

        [Fact]
        public void Negative_nights_and_wild_exposure_are_clamped()
        {
            var lib = Library();
            Assert.Equal(RumorMutation.Stage(lib, 0, 1, 1, 0, 0), RumorMutation.Stage(lib, 0, 1, 1, -5, -50));
            Assert.Equal(RumorMutation.Stage(lib, 0, 1, 1, 3, RumorMutation.ExposureScale), RumorMutation.Stage(lib, 0, 1, 1, 3, 99999));
        }

        [Fact]
        public void True_account_shows_alongside_only_from_the_gate_tier()
        {
            var lib = Library();
            var chain = lib.Chains[LighthouseIndex(lib)];
            var rumor = new MythosRumor { Source = chain.Source, Night = 1 };
            foreach (var lang in VillageNames.Languages)
                for (int tier = 0; tier <= KnowledgeLibrary.MaxTier; tier++)
                {
                    string text = RumorMutation.Text(lib, rumor, chain.Ref, 1, MaxNights, RumorMutation.ExposureScale, tier, lang);
                    Assert.Contains(chain.Stages[chain.Stages.Count - 1].Get(lang), text);
                    Assert.Equal(tier >= lib.TrueTier, text.Contains(chain.Original.Get(lang)));
                    Assert.Equal(tier >= lib.TrueTier, text.Contains(lib.TrueLabel.Get(lang)));
                }
        }

        [Fact]
        public void A_rumor_without_a_chain_is_left_alone()
        {
            var lib = Library();
            Assert.Equal("", RumorMutation.Text(lib, new MythosRumor { Source = RumorSource.Secret, Night = 1 }, "debt", 1, 5, 500, 5, "en"));
        }

        [Fact]
        public void Chat_mutates_cosmic_and_missing_rumors_by_night_and_changes_no_state()
        {
            var lib = Library();
            int mutated = 0, gated = 0;
            foreach (int seed in new[] { 1, 42, 1818 })
            {
                var state = MythosSimulationTests.Run(seed, MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights, out var soc, out var story);
                string before = string.Join("|", state.Nights.SelectMany(n => n.Events.Select(e => e.Key)));
                var feed = new MythosFeed { Library = MythosSimulationTests.Library(), State = state, Night = MythosSimulationTests.Nights };
                var chat = new VillagerChatResult { Available = true, Behavior = VillagerBehavior.Normal, HintId = "village" };
                for (int i = 0; i < soc.Roster.Count; i++)
                {
                    var plain = MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, MythosSimulationTests.Nights, chat, "en");
                    var low = MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, MythosSimulationTests.Nights, chat, "en", lib, 0);
                    var high = MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, MythosSimulationTests.Nights, chat, "en", lib, lib.TrueTier);
                    Assert.Equal(plain.Select(l => l.Id), low.Select(l => l.Id));
                    Assert.Equal(plain.Select(l => l.Id), high.Select(l => l.Id));
                    for (int k = 0; k < plain.Count; k++)
                    {
                        if (plain[k].Text != low[k].Text) mutated++;
                        if (high[k].Text.Length > low[k].Text.Length) { gated++; Assert.StartsWith(low[k].Text, high[k].Text); }
                    }
                }
                Assert.Equal(before, string.Join("|", state.Nights.SelectMany(n => n.Events.Select(e => e.Key))));
            }
            Assert.True(mutated > 0);
            Assert.True(gated > 0);
        }

        [Fact]
        public void Round37_board_card_chat_and_current_text_tell_the_same_rumor_and_the_true_account_starts_at_tier_3()
        {
            var lib = Library();
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(DataFile())), "Data", "lore_books.json")));
            var statements = StatementLibrary.Parse(File.ReadAllText(Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(DataFile())), "Data", "statements.json")));
            int compared = 0, withTrue = 0;
            foreach (int seed in new[] { 1, 42, 1818 })
            {
                var state = MythosSimulationTests.Run(seed, MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights, out var soc, out var story);
                var feed = new MythosFeed { Library = MythosSimulationTests.Library(), State = state, Night = MythosSimulationTests.Nights };
                var chat = new VillagerChatResult { Available = true, Behavior = VillagerBehavior.Normal, HintId = "village" };
                foreach (int tier in new[] { 0, lib.TrueTier - 1, lib.TrueTier, KnowledgeLibrary.MaxTier })
                {
                    var telling = new RumorTelling { Library = lib, Night = MythosSimulationTests.Nights, KnowledgeTier = tier };
                    for (int i = 0; i < soc.Roster.Count; i++)
                        foreach (var line in MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, MythosSimulationTests.Nights, chat, "en", lib, tier))
                        {
                            var ms = MythosRules.Statements(feed).Find(m => m.Id == line.Id);
                            if (ms == null || ms.Rumor == null || lib.ChainIndex(ms.Rumor.Source, MythosRules.RumorRef(feed, ms.Rumor)) < 0) continue;
                            var card = new BoardCard { Kind = BoardCardKind.Event, Id = "event:" + ms.Id, Key = ms.Id, Revealed = true };
                            string title = InvestigationRules.CardTitle(card, story, lore, statements, null, "en", feed, null, telling);
                            Assert.Equal(line.Text, title);
                            Assert.Equal(title, MythosRules.CurrentText(feed, story, ms, false, "en", telling));
                            bool hasTrue = title.Contains(lib.TrueLabel.Get("en"));
                            Assert.Equal(tier >= lib.TrueTier, hasTrue);
                            compared++;
                            if (hasTrue) withTrue++;
                        }
                }
                var first = MythosRules.Statements(feed).Find(m => m.Rumor != null);
                if (first != null) Assert.Equal(MythosRules.Text(feed, story, first, false, "en"), MythosRules.CurrentText(feed, story, first, false, "en", null));
            }
            Assert.True(compared > 0);
            Assert.True(withTrue > 0);
        }

        private static string DataFile()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "rumor-mutations.json");
        }

        [Fact]
        public void Parse_rejects_malformed_data()
        {
            var good = DataText();
            Assert.Throws<FormatException>(() => RumorMutationLibrary.Parse("[]"));
            Assert.Throws<FormatException>(() => RumorMutationLibrary.Parse(good.Replace("\"trueTier\": 3", "\"trueTier\": 9")));
            Assert.Throws<FormatException>(() => RumorMutationLibrary.Parse(good.Replace("\"source\": \"cosmic\"", "\"source\": \"nowhere\"")));
            Assert.Throws<FormatException>(() => RumorMutationLibrary.Parse("{\"trueTier\":3,\"trueLabel\":{\"en\":\"a\",\"fr\":\"b\"},\"chains\":[]}"));
        }
    }
}
