using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>PromptStrings parity with web/src/i18n.js and ProgressionSession rules (Runtime tracker is Unverified in Unity).</summary>
    public class PromptAndProgressionTests
    {
        private static string RepoRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return dir.FullName;
        }

        /// <summary>Reads 'key': 'value' pairs of one language block of i18n.js. JS escapes are not used by the prompt keys.</summary>
        private static Dictionary<string, string> WebStrings(string language)
        {
            var text = File.ReadAllText(Path.Combine(RepoRoot(), "web", "src", "i18n.js"));
            var start = Regex.Match(text, "^  " + language + ": \\{", RegexOptions.Multiline);
            Assert.True(start.Success, "language block missing in i18n.js: " + language);
            var end = Regex.Match(text.Substring(start.Index + start.Length), "^  \\},?\\s*$", RegexOptions.Multiline);
            var block = text.Substring(start.Index, start.Length + end.Index);
            var map = new Dictionary<string, string>();
            foreach (Match m in Regex.Matches(block, "'(view3d\\.prompt\\.[a-z]+)': ['\"](.*?)['\"],\\s*$", RegexOptions.Multiline))
                map[m.Groups[1].Value] = m.Groups[2].Value;
            return map;
        }

        [Fact]
        public void Prompt_table_matches_the_web_i18n_wording_for_every_language()
        {
            foreach (var language in PromptStrings.Languages)
            {
                var web = WebStrings(language);
                foreach (var key in PromptStrings.Keys)
                {
                    Assert.True(web.ContainsKey(key), language + " is missing " + key + " in i18n.js");
                    Assert.Equal(web[key], PromptStrings.Template(language, key));
                }
            }
            Assert.Equal(PromptStrings.Keys.Length, WebStrings("en").Count);
        }

        [Fact]
        public void Place_names_match_the_web_i18n_loc_entries_for_every_language()
        {
            var text = File.ReadAllText(Path.Combine(RepoRoot(), "web", "src", "i18n.js"));
            foreach (var language in PromptStrings.Languages)
            {
                var start = Regex.Match(text, "^  " + language + ": \\{", RegexOptions.Multiline);
                var end = Regex.Match(text.Substring(start.Index + start.Length), "^  \\},?\\s*$", RegexOptions.Multiline);
                var block = text.Substring(start.Index, start.Length + end.Index);
                var web = new Dictionary<string, string>();
                foreach (Match m in Regex.Matches(block, "'(loc\\.[a-z_]+)': (?:'((?:[^'\\\\]|\\\\.)*)'|\"(.*?)\"),\\s*$", RegexOptions.Multiline))
                    web[m.Groups[1].Value] = (m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value).Replace("\\'", "'");
                Assert.Equal(PromptStrings.PlaceKeys.Length, web.Count);
                foreach (var key in PromptStrings.PlaceKeys)
                {
                    Assert.True(web.ContainsKey(key), language + " is missing " + key + " in i18n.js");
                    Assert.Equal(web[key], PromptStrings.PlaceName(language, key.Substring(4).Replace('_', ' ')));
                }
            }
        }

        [Fact]
        public void Place_names_fall_back_to_the_village_the_raw_id_and_english()
        {
            Assert.Equal("the village", PromptStrings.PlaceName("en", null));
            Assert.Equal("le village", PromptStrings.PlaceName("fr", ""));
            Assert.Equal("house_a", PromptStrings.PlaceName("en", "house_a"));
            Assert.Equal("church", PromptStrings.PlaceName("xx", "church"));
            Assert.Equal("Listen to the walls", PromptStrings.PromptFor("en", InteractionKind.Whisper, "the walls"));
            Assert.Equal("Ecouter le puits", PromptStrings.PromptFor("fr", InteractionKind.Whisper, "well"));
        }

        [Fact]
        public void Prompts_substitute_the_name_and_fall_back_to_english()
        {
            Assert.Equal("Listen to the chapel", PromptStrings.Prompt("en", InteractionKind.Whisper, "the chapel"));
            Assert.Equal("Listen to the chapel", PromptStrings.Prompt("xx", InteractionKind.Whisper, "the chapel"));
            Assert.Equal("Listen to the chapel", PromptStrings.Prompt(null, InteractionKind.Whisper, "the chapel"));
            Assert.Equal("Etudier the chapel", PromptStrings.Prompt("fr", InteractionKind.Landmark, "the chapel"));
            Assert.Equal("Study ", PromptStrings.Prompt("en", InteractionKind.Landmark, null));
            Assert.Null(PromptStrings.Template("en", "no.such.key"));
            foreach (InteractionKind kind in Enum.GetValues(typeof(InteractionKind)))
                Assert.DoesNotContain(PromptStrings.NamePlaceholder, PromptStrings.Prompt("fr", kind, "x"));
        }

        private static Ritual Ritual(int seed, int nights) => RitualChain.Generate(CampaignGenerator.Generate(seed, nights));

        [Fact]
        public void Session_counts_interactions_like_the_web_client()
        {
            var s = new ProgressionSession();
            s.SetRitual(Ritual(1818, 5));
            var first = s.RecordInteraction(InteractionKind.Whisper);
            Assert.Contains("whisper", first.AchievementIds);
            s.RecordInteraction(InteractionKind.Landmark);
            var third = s.RecordInteraction(InteractionKind.Whisper);
            Assert.Contains("listener", third.AchievementIds);
            Assert.Equal(2, s.Stats.Whispers);
            Assert.Equal(3, s.Stats.Listens);
            s.RecordInteraction(InteractionKind.Door);
            s.RecordInteraction(InteractionKind.Door);
            Assert.Contains("doors", s.RecordInteraction(InteractionKind.Door).AchievementIds);
            Assert.Equal(50, s.Journal.Percent);
        }

        [Fact]
        public void Session_awards_each_id_once_and_keeps_highest_tier_and_stage()
        {
            var ritual = Ritual(77, 5);
            var s = new ProgressionSession();
            s.SetRitual(ritual);
            var up = s.RecordOmenTier(3);
            Assert.Contains("o3", up.CodexIds);
            Assert.Contains("abyss", up.AchievementIds);
            Assert.False(s.RecordOmenTier(1).Any);
            Assert.Equal(3, s.Stats.Tier);
            s.RecordRitualStage(2);
            s.RecordRitualStage(0);
            Assert.Equal(2, s.Stats.Stage);
            Assert.Equal(new[] { "s0", "s1", "s2", "o1", "o2", "o3" }.OrderBy(x => x), s.UnlockedCodexIds.OrderBy(x => x));
            s.RecordRitualStage(ritual.Stages.Count - 1);
            Assert.Contains("ritual", s.EarnedAchievementIds);
            Assert.Contains("codexfull", s.EarnedAchievementIds);
        }

        [Fact]
        public void Session_resets_codex_for_a_new_ritual_but_keeps_earned_ids()
        {
            var s = new ProgressionSession();
            s.SetRitual(Ritual(5, 4));
            s.RecordOmenTier(3);
            s.RecordInteraction(InteractionKind.Whisper);
            s.SetRitual(Ritual(6, 4));
            Assert.Empty(s.UnlockedCodexIds);
            Assert.Equal(0, s.Stats.Tier);
            Assert.Contains("whisper", s.EarnedAchievementIds);
        }

        [Fact]
        public void A_new_ritual_seed_drops_the_vigil_and_the_same_seed_keeps_it()
        {
            var s = new ProgressionSession();
            var camp = CampaignGenerator.Generate(5, 4);
            s.SetRitual(RitualChain.Generate(camp));
            s.StartVigil(camp);
            s.Vigil.Begin();
            s.SetRitual(RitualChain.Generate(camp));
            Assert.NotNull(s.Vigil);
            Assert.True(s.Vigil.IsLocked);
            s.SetRitual(Ritual(6, 4));
            Assert.Null(s.Vigil);
        }

        [Fact]
        public void Session_restore_drops_foreign_ids_and_roundtrips_text()
        {
            var ritual = Ritual(9, 4);
            var a = new ProgressionSession();
            a.SetRitual(ritual);
            a.RecordOmenTier(2);
            a.RecordInteraction(InteractionKind.Whisper);
            var codex = ProgressionSession.SerializeIds(a.UnlockedCodexIds);
            var earned = ProgressionSession.SerializeIds(a.EarnedAchievementIds);

            var b = new ProgressionSession();
            b.SetRitual(ritual);
            b.Restore(ProgressionSession.ParseIds(codex + ",s99,bogus"), ProgressionSession.ParseIds(earned + ",nope"));
            Assert.Equal(a.UnlockedCodexIds.OrderBy(x => x), b.UnlockedCodexIds.OrderBy(x => x));
            Assert.Equal(a.EarnedAchievementIds.OrderBy(x => x), b.EarnedAchievementIds.OrderBy(x => x));
            Assert.Empty(ProgressionSession.ParseIds(null));
            Assert.Empty(ProgressionSession.ParseIds(""));
        }

        [Fact]
        public void Session_without_a_ritual_never_throws_and_unlocks_no_codex()
        {
            var s = new ProgressionSession();
            Assert.Empty(s.RecordOmenTier(3).CodexIds);
            s.SetRitual(null);
            Assert.Empty(s.UnlockedCodexIds);
        }
    }
}
