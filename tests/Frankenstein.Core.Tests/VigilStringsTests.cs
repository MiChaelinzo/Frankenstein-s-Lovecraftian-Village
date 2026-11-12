using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>VigilStrings parity with the vigil.* entries of web/src/i18n.js (the web table is the wording source).</summary>
    public class VigilStringsTests
    {
        private static string RepoRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return dir.FullName;
        }

        private static Dictionary<string, string> WebVigilStrings(string language)
        {
            var text = File.ReadAllText(Path.Combine(RepoRoot(), "web", "src", "i18n.js"));
            var start = Regex.Match(text, "^  " + language + ": \\{", RegexOptions.Multiline);
            Assert.True(start.Success, "language block missing in i18n.js: " + language);
            var end = Regex.Match(text.Substring(start.Index + start.Length), "^  \\},?\\s*$", RegexOptions.Multiline);
            var block = text.Substring(start.Index, start.Length + end.Index);
            var map = new Dictionary<string, string>();
            foreach (Match m in Regex.Matches(block, "^\\s*\"(vigil\\.[a-z_0-9.]+)\": \"(.*)\",\\s*$", RegexOptions.Multiline))
                map[m.Groups[1].Value] = m.Groups[2].Value;
            return map;
        }

        [Fact]
        public void Vigil_table_matches_the_web_i18n_wording_for_every_language()
        {
            foreach (var language in VigilStrings.Languages)
            {
                var web = WebVigilStrings(language);
                foreach (var key in VigilStrings.Keys)
                {
                    Assert.True(web.ContainsKey(key), language + " is missing " + key + " in i18n.js");
                    Assert.Equal(web[key], VigilStrings.Template(language, key));
                }
            }
        }

        [Fact]
        public void Every_core_ending_and_rank_has_a_title_epitaph_and_rank_name()
        {
            foreach (var language in VigilStrings.Languages)
            {
                foreach (var id in VigilRules.EndingIds)
                {
                    Assert.NotEqual(id, VigilStrings.Title(language, id));
                    Assert.False(string.IsNullOrEmpty(VigilStrings.Epitaph(language, id)));
                }
                for (int rank = 0; rank < VigilRules.RankNames.Length; rank++)
                    Assert.False(string.IsNullOrEmpty(VigilStrings.Rank(language, rank)));
            }
            for (int rank = 0; rank < VigilRules.RankNames.Length; rank++)
                Assert.Equal(VigilRules.RankNames[rank], VigilStrings.Rank("en", rank));
            foreach (var id in VigilRules.EndingIds)
                Assert.Equal(VigilRules.EpitaphFor(id), VigilStrings.Epitaph("en", id));
        }

        [Fact]
        public void Unknown_language_falls_back_to_english_and_unknown_key_is_null()
        {
            Assert.Equal(VigilStrings.Template("en", "vigil.endure"), VigilStrings.Template("xx", "vigil.endure"));
            Assert.Null(VigilStrings.Template("en", "vigil.nope"));
        }

        [Fact]
        public void Format_fills_every_placeholder_and_ScoreLine_uses_the_localised_rank()
        {
            Assert.Equal("a 1 b 2", VigilStrings.Format("a {x} b {y}", "x", 1, "y", 2));
            var outcome = new VigilOutcome { Score = 700, Rank = 1 };
            Assert.Equal("Score 700, rank Watcher", VigilStrings.ScoreLine("en", outcome));
            Assert.Equal("Score 700, rang Guetteur", VigilStrings.ScoreLine("fr", outcome));
        }
    }
}
