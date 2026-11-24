using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 34 (spec 168): the generated chronicle is deterministic, differs per seed, says only what the player learned and has no unfilled slots.</summary>
    public class ChronicleProseTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };
        public static readonly string[] Languages = { "en", "fr" };

        public static ChronicleLibrary Library()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return ChronicleLibrary.Parse(File.ReadAllText(Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "chronicle.json")));
        }

        /// <summary>Scenario 0: the player learned nothing. Scenario 1: every mythos statement was heard, the leads are 0, 1 and 4 for the three missing persons, villagers 0 to 5 were met and the scripted memory log applies.</summary>
        public static ChronicleContext Context(int seed, int scenario)
        {
            var soc = VillageSocietyTests.SocietyOf(seed, out var story, out var roster);
            var mythos = MythosSimulationTests.Library();
            var state = MythosSimulation.Run(soc, story, mythos, MythosSimulationTests.GridInputs(), MythosSimulationTests.Nights);
            var outcomeLib = MissingOutcomesTests.Library();
            var ctx = new ChronicleContext
            {
                Prose = Library(), Story = story, Mythos = mythos, State = state, Nights = 5,
                Outcomes = Enumerable.Range(0, story.Missing.Count).Select(k => MissingOutcomes.Resolve(soc, story, state, outcomeLib, k, 0)).ToArray(),
                Leads = new int[story.Missing.Count],
            };
            if (scenario == 0) return ctx;
            var feed = new MythosFeed { Library = mythos, State = state, Night = MythosSimulationTests.Nights };
            foreach (var s in MythosRules.Statements(feed)) ctx.Heard.Add(s.Id);
            int[] leads = { 0, 1, 4 };
            for (int k = 0; k < ctx.Leads.Length; k++) ctx.Leads[k] = leads[k % 3];
            for (int v = 0; v < 6; v++) ctx.Met.Add(v);
            ctx.MemoryLog = VillagerMemoryTests.ScriptedLog(VillagerMemoryModel.BaselineEvents(story));
            return ctx;
        }

        private static string Whole(ChronicleContext ctx, string lang)
        {
            return string.Join("\n", ChronicleProse.Chronicle(ctx, MythosSimulationTests.Nights, lang)) + "\n" + ChronicleProse.Summary(ctx, MythosSimulationTests.Nights, lang);
        }

        [Fact]
        public void SameSeedGivesTheSameText()
        {
            foreach (var seed in Seeds)
                foreach (var lang in Languages)
                    Assert.Equal(Whole(Context(seed, 1), lang), Whole(Context(seed, 1), lang));
        }

        [Fact]
        public void DifferentSeedsGiveDifferentChronicles()
        {
            foreach (var lang in Languages)
            {
                var texts = new HashSet<string>(Seeds.Select(s => Whole(Context(s, 1), lang)));
                Assert.Equal(Seeds.Length, texts.Count);
                var quiet = new HashSet<string>(Seeds.Select(s => Whole(Context(s, 0), lang)));
                Assert.True(quiet.Count > 1);
            }
        }

        [Fact]
        public void NoUnfilledSlotsNoEmDashesAndEveryNightHasText()
        {
            foreach (var seed in Seeds)
                foreach (var scenario in new[] { 0, 1 })
                    foreach (var lang in Languages)
                    {
                        var ctx = Context(seed, scenario);
                        var nights = ChronicleProse.Chronicle(ctx, 99, lang);
                        Assert.Equal(MythosSimulationTests.Nights, nights.Count);
                        foreach (var text in nights.Concat(new[] { ChronicleProse.Summary(ctx, 99, lang) }))
                        {
                            Assert.False(string.IsNullOrWhiteSpace(text));
                            Assert.DoesNotContain("{", text);
                            Assert.DoesNotContain("}", text);
                            Assert.DoesNotContain("\u2014", text);
                        }
                    }
        }

        [Fact]
        public void EveryLibraryVariantUsesOnlyKnownSlotsAndNoEmDash()
        {
            var lib = Library();
            var known = new HashSet<string> { "village", "who", "missing", "home", "cult", "count" };
            var groups = lib.Variants.SelectMany(g => g).Concat(lib.Roles);
            foreach (var v in groups)
                foreach (var lang in Languages)
                {
                    string t = v.Get(lang);
                    Assert.DoesNotContain("\u2014", t);
                    int i = 0;
                    while ((i = t.IndexOf('{', i)) >= 0)
                    {
                        int close = t.IndexOf('}', i);
                        Assert.True(close > i, "unclosed slot in " + t);
                        Assert.Contains(t.Substring(i + 1, close - i - 1), known);
                        i = close;
                    }
                }
        }

        [Fact]
        public void WhenNothingWasLearnedNoSecretNameOrOutcomeAppears()
        {
            foreach (var seed in Seeds)
            {
                var ctx = Context(seed, 0);
                foreach (var lang in Languages)
                {
                    string all = Whole(ctx, lang);
                    foreach (var v in ctx.Story.Roster) Assert.DoesNotContain(v.Name, all);
                    foreach (var m in ctx.Story.Missing) Assert.DoesNotContain(ctx.Story.MissingVars(m, lang)["missing"], all);
                }
            }
        }

        [Fact]
        public void OutcomeIsToldOnlyWhenLeadsReachIt()
        {
            foreach (var seed in Seeds)
            {
                var ctx = Context(seed, 1);
                var vars = ctx.Story.MissingVars(ctx.Story.Missing[0], "en");
                ctx.Leads[0] = 0;
                foreach (var id in ctx.Heard.Where(i => i.StartsWith(MythosRules.RumorPrefix, StringComparison.Ordinal)).ToList()) ctx.Heard.Remove(id);
                Assert.DoesNotContain(vars["missing"], Whole(ctx, "en"));
                ctx.Leads[0] = 1;
                var group = ctx.Prose.Variants[ChronicleLibrary.IndexOf("taken")];
                Assert.Contains(vars["missing"], ChronicleProse.Summary(ctx, 99, "en"));
                Assert.Equal(RevealLevel.Taken, MissingOutcomes.LevelFor(1));
                Assert.True(group.Count >= ChronicleLibrary.MinVariants);
            }
        }

        [Fact]
        public void ARevealedNightIsTheSameAcrossRunsAndNightsAreIndependentOfLaterOnes()
        {
            var ctx = Context(42, 1);
            var short5 = ChronicleProse.Chronicle(ctx, 5, "en");
            var all = ChronicleProse.Chronicle(ctx, MythosSimulationTests.Nights, "en");
            Assert.Equal(short5, all.Take(5).ToList());
            Assert.Empty(ChronicleProse.NightSentences(ctx, 0, "en"));
            Assert.Empty(ChronicleProse.NightSentences(ctx, MythosSimulationTests.Nights + 1, "en"));
        }

        [Fact]
        public void ParseErrorsNameTheField()
        {
            string good = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "Packages", "com.michaelinzo.frankenstein-village", "Data", "chronicle.json"));
            Assert.Throws<FormatException>(() => ChronicleLibrary.Parse("[]"));
            var ex = Assert.Throws<FormatException>(() => ChronicleLibrary.Parse("{\"roles\": [], \"lines\": []}"));
            Assert.Contains("roles", ex.Message);
            Assert.NotEmpty(good);
            ex = Assert.Throws<FormatException>(() => ChronicleLibrary.Parse(good.Replace("\"id\": \"quiet_mid\"", "\"id\": \"quiet_nope\"")));
            Assert.Contains("quiet_nope", ex.Message);
            ex = Assert.Throws<FormatException>(() => ChronicleLibrary.Parse(good.Replace("\"id\": \"taken\"", "\"id\": \"cult\"")));
            Assert.Contains("duplicate line id cult", ex.Message);
        }
    }
}
