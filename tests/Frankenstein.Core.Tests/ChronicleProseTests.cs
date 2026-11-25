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


        /// <summary>
        /// Round 36 (spec 182): a sixty night run (the leadership schedule) with everything heard and met, a scripted reputation log with nights, the rumor chains and one ambient beat on every third night.
        /// Scenario "learned" false hears and meets nothing and experiences no beat, so only what the simulation itself shows could leak.
        /// </summary>
        public static ChronicleContext EvolutionContext(int seed, bool learned, bool evolution = true)
        {
            var mythos = MythosSimulationTests.Library();
            var state = MythosSimulationTests.Run(seed, MythosInputs.Schedule(MythosSimulationTests.LeaderNights), MythosSimulationTests.LeaderNights, out var soc, out var story);
            var outcomeLib = MissingOutcomesTests.Library();
            var ctx = new ChronicleContext
            {
                Prose = Library(), Story = story, Mythos = mythos, State = state, Nights = MythosSimulationTests.LeaderNights,
                Outcomes = Enumerable.Range(0, story.Missing.Count).Select(k => MissingOutcomes.Resolve(soc, story, state, outcomeLib, k, 0)).ToArray(),
                Leads = new int[story.Missing.Count],
            };
            if (evolution) ctx.Evolution = new ChronicleEvolution { Mutations = RumorMutationTests.Library() };
            if (!learned) return ctx;
            var feed = new MythosFeed { Library = mythos, State = state, Night = MythosSimulationTests.LeaderNights };
            foreach (var s in MythosRules.Statements(feed)) ctx.Heard.Add(s.Id);
            for (int v = 0; v < story.Roster.Count; v++) ctx.Met.Add(v);
            if (!evolution) return ctx;
            var log = new List<SocietyAction>();
            var nights = new List<int>();
            for (int night = 1; night <= MythosSimulationTests.LeaderNights; night++)
            {
                log.Add(new SocietyAction { Kind = night % 2 == 0 ? SocietyActionKind.SeenAtRitualSite : SocietyActionKind.ReturnItem, Subject = (night * 7) % story.Roster.Count });
                nights.Add(night);
                if (night % 3 == 0) ctx.Evolution.Beats.Add(new ChronicleBeat { Night = night, Id = HorrorDirector.BeatIds[(night / 3) % HorrorDirector.BeatIds.Length] });
            }
            foreach (var fx in soc.ReputationEffectsAfter(log, nights)) ctx.Evolution.Reputation.Add(fx);
            return ctx;
        }

        private static string WholeNights(ChronicleContext ctx, string lang)
        {
            return string.Join("\n", ChronicleProse.Chronicle(ctx, MythosSimulationTests.LeaderNights, lang));
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
            var known = new HashSet<string> { "village", "who", "missing", "home", "cult", "count", "other" };
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

        private static readonly int[] EvolutionSeeds = { 1, 42, 1818 };

        /// <summary>The line id whose variant (slots read as any text) matches the sentence, or "".</summary>
        private static string LineOf(ChronicleLibrary lib, string sentence, string lang)
        {
            foreach (var id in ChronicleLibrary.LineIds)
                foreach (var v in lib.Group(id))
                {
                    string pattern = "^" + System.Text.RegularExpressions.Regex.Escape(v.Get(lang)).Replace("\\{", "{") ;
                    pattern = System.Text.RegularExpressions.Regex.Replace(pattern, "\\{[a-z]+\\}", ".+") + "$";
                    if (System.Text.RegularExpressions.Regex.IsMatch(sentence, pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return id;
                }
            return "";
        }

        /// <summary>The sentences evolution adds to a night: those of the evolved night that the plain night does not have.</summary>
        private static List<string> Extras(ChronicleContext evolved, ChronicleContext plain, int night, string lang)
        {
            var before = ChronicleProse.NightSentences(plain, night, lang);
            return ChronicleProse.NightSentences(evolved, night, lang).Where(t => !before.Contains(t)).ToList();
        }

        [Fact]
        public void WithoutEvolutionTheChronicleIsTheOldOne()
        {
            foreach (var seed in EvolutionSeeds)
            {
                var plain = EvolutionContext(seed, true, false);
                var leadersOnly = EvolutionContext(seed, true, false);
                leadersOnly.Evolution = new ChronicleEvolution();
                Assert.Null(plain.Evolution);
                for (int night = 1; night <= MythosSimulationTests.LeaderNights; night++)
                    foreach (var extra in Extras(leadersOnly, plain, night, "en")) Assert.StartsWith("leader_", LineOf(plain.Prose, extra, "en"));
            }
        }

        [Fact]
        public void EvolutionIsDeterministicAndTellsEveryNewEventKindInBothLanguages()
        {
            var kinds = new HashSet<string>();
            foreach (var seed in EvolutionSeeds)
                foreach (var lang in Languages)
                {
                    var ctx = EvolutionContext(seed, true);
                    var plain = EvolutionContext(seed, true, false);
                    Assert.Equal(WholeNights(ctx, lang), WholeNights(EvolutionContext(seed, true), lang));
                    for (int night = 1; night <= MythosSimulationTests.LeaderNights; night++)
                        foreach (var extra in Extras(ctx, plain, night, lang))
                        {
                            string id = LineOf(ctx.Prose, extra, lang);
                            Assert.NotEqual("", id);
                            kinds.Add(lang + ":" + id.Split('_')[0]);
                        }
                }
            foreach (var lang in Languages)
                foreach (var kind in new[] { "leader", "reputation", "beat" }) Assert.Contains(lang + ":" + kind, kinds);
        }

        [Fact]
        public void RumorDriftIsToldWhenAHeardRumorChangesStage()
        {
            int drift = 0;
            foreach (var seed in EvolutionSeeds)
            {
                var ctx = EvolutionContext(seed, true);
                var plain = EvolutionContext(seed, true, false);
                for (int night = 2; night <= MythosSimulationTests.LeaderNights; night++)
                    foreach (var extra in Extras(ctx, plain, night, "en"))
                        if (LineOf(ctx.Prose, extra, "en").StartsWith("rumor_d")) drift++;
            }
            Assert.True(drift > 0);
        }

        [Fact]
        public void NoSentenceRepeatsWithinANight()
        {
            foreach (var seed in EvolutionSeeds)
                foreach (var lang in Languages)
                {
                    var ctx = EvolutionContext(seed, true);
                    for (int night = 1; night <= MythosSimulationTests.LeaderNights; night++)
                    {
                        var list = ChronicleProse.NightSentences(ctx, night, lang);
                        Assert.Equal(list.Count, list.Distinct().Count());
                        Assert.All(list, t => { Assert.DoesNotContain("{", t); Assert.DoesNotContain("\u2014", t); });
                    }
                }
        }

        [Fact]
        public void OnlyLearnedFactsAppearInTheNewSentences()
        {
            foreach (var seed in EvolutionSeeds)
                foreach (var lang in Languages)
                {
                    var nothing = EvolutionContext(seed, false);
                    string all = WholeNights(nothing, lang);
                    foreach (var v in nothing.Story.Roster) Assert.DoesNotContain(v.Name, all);
                    Assert.Equal(WholeNights(EvolutionContext(seed, false, false), lang), all);

                    var heardNone = EvolutionContext(seed, true);
                    heardNone.Heard.Clear();
                    heardNone.Evolution.Beats.Clear();
                    heardNone.Evolution.Reputation.Clear();
                    var base0 = EvolutionContext(seed, true, false);
                    base0.Heard.Clear();
                    Assert.Equal(WholeNights(base0, lang), WholeNights(heardNone, lang));

                    var unmet = EvolutionContext(seed, true);
                    unmet.Met.Clear();
                    var plain = EvolutionContext(seed, true, false);
                    for (int night = 1; night <= MythosSimulationTests.LeaderNights; night++)
                        foreach (var extra in Extras(unmet, plain, night, lang))
                            Assert.False(LineOf(unmet.Prose, extra, lang).StartsWith("reputation_", StringComparison.Ordinal), "a villager the player never met was named");
                }
        }

        [Fact]
        public void EveryLeaderEventHasAStatedCauseAndALine()
        {
            var seen = new HashSet<string>();
            foreach (var seed in MythosSimulationTests.LeaderSeeds)
            {
                var state = MythosSimulationTests.Run(seed, MythosInputs.Schedule(MythosSimulationTests.LeaderNights), MythosSimulationTests.LeaderNights, out _, out _);
                foreach (var night in state.Nights)
                    foreach (var e in night.LeaderEvents)
                    {
                        string id = e.Kind == CultLeaderEventKind.Exposed ? "leader_exposed" : e.Kind == CultLeaderEventKind.BecameVessel ? "leader_vessel"
                            : (e.Kind == CultLeaderEventKind.Replaced ? "leader_replaced_" : "leader_disappeared_") + e.Cause;
                        Assert.True(ChronicleLibrary.IndexOf(id) >= 0, id);
                        seen.Add(id);
                    }
            }
            Assert.True(seen.Count >= 4);
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
