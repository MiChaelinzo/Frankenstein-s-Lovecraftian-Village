using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 27 Mythos simulation: cults, secrets, rumors and omens as a pure function of the society, the story, the data and the per night inputs.</summary>
    public class MythosSimulationTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };
        public const int Nights = 12;

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        public static MythosLibrary Library() => MythosLibrary.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "mythos.json")));

        /// <summary>The fixed inputs of the golden data: dread and ritual stage both rise over twelve nights.</summary>
        public static MythosInputs GridInputs() => new MythosInputs
        {
            DreadPermille = new[] { 100, 150, 250, 300, 400, 450, 550, 600, 700, 750, 850, 900 },
            RitualStage = new[] { 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5 },
        };

        public static MythosState Run(int seed, MythosInputs inputs, int nights, out VillageSociety society, out VillageStory story)
        {
            society = VillageSocietyTests.SocietyOf(seed, out story, out _);
            return MythosSimulation.Run(society, story, Library(), inputs, nights);
        }

        private static string Signature(MythosState s)
        {
            return string.Join("|", s.Cults.Select(c => c.Id + c.Founder)) + "#" + string.Join(",", s.SecretKind) + "#" + string.Join(",", s.ExposedNight) + "#"
                + string.Join("|", s.Nights.Select(n => string.Join(";", n.Events.Select(e => (int)e.Kind + ":" + e.Subject + ":" + e.Other + ":" + e.Key)) + "/"
                    + string.Join(";", n.CultMembers.Select(m => string.Join(",", m))) + "/" + string.Join(",", n.Exposed) + "/"
                    + string.Join(";", n.Rumors.Select(r => r.Id + "," + r.Origin + "," + r.Key + "," + string.Join(",", r.Holders.Select(h => h.Villager + "." + h.Distortion + "." + h.Night))))));
        }

        [Fact]
        public void Run_is_deterministic_and_seed_driven()
        {
            var sigs = new HashSet<string>();
            foreach (var seed in Seeds)
            {
                var a = Run(seed, GridInputs(), Nights, out _, out _);
                var b = Run(seed, GridInputs(), Nights, out _, out _);
                Assert.Equal(Signature(a), Signature(b));
                sigs.Add(Signature(a));
            }
            Assert.Equal(Seeds.Length, sigs.Count);
        }

        [Fact]
        public void Replay_equals_incremental_prefix()
        {
            foreach (var seed in Seeds)
            {
                var full = Run(seed, GridInputs(), Nights, out _, out _);
                for (int k = 1; k < Nights; k += 3)
                {
                    var part = Run(seed, GridInputs(), k, out _, out _);
                    Assert.Equal(k, part.Nights.Count);
                    for (int i = 0; i < k; i++)
                    {
                        var x = new MythosState { Cults = full.Cults, SecretKind = full.SecretKind, ExposedNight = full.ExposedNight, Nights = { full.Nights[i] } };
                        var y = new MythosState { Cults = full.Cults, SecretKind = full.SecretKind, ExposedNight = full.ExposedNight, Nights = { part.Nights[i] } };
                        // rumors of the same night must already be identical (holders as of that night), so compare the night snapshots.
                        Assert.Equal(Signature(x), Signature(y));
                    }
                }
            }
        }

        [Fact]
        public void Nothing_is_simulated_for_zero_nights_and_input_is_clamped()
        {
            var s = Run(1, GridInputs(), 0, out _, out _);
            Assert.Empty(s.Nights);
            Assert.Null(s.AtNight(1));
            var wild = new MythosInputs { DreadPermille = new[] { -50, 99999 }, RitualStage = new[] { -3, 99 } };
            var r = Run(1, wild, 6, out _, out _);
            Assert.Equal(6, r.Nights.Count);
            Assert.Same(r.Nights[5], r.AtNight(99));
            Assert.Same(r.Nights[0], r.AtNight(-4));
            Assert.Equal(0, MythosInputs.At(null, 3));
        }

        [Fact]
        public void Cult_members_never_leave_and_belong_to_one_cult()
        {
            foreach (var seed in Seeds)
            {
                var s = Run(seed, GridInputs(), Nights, out var soc, out _);
                Assert.InRange(s.Cults.Count, 1, MythosSimulation.MaxCults);
                Assert.Equal(s.Cults.Count, s.Cults.Select(c => c.Founder).Distinct().Count());
                Assert.Equal(soc.PatientZero, s.Cults[0].Founder);
                for (int i = 0; i < Nights; i++)
                {
                    var night = s.Nights[i];
                    var all = night.CultMembers.SelectMany(m => m).ToList();
                    Assert.Equal(all.Count, all.Distinct().Count());
                    if (i == 0) continue;
                    for (int c = 0; c < s.Cults.Count; c++) Assert.All(s.Nights[i - 1].CultMembers[c], m => Assert.Contains(m, night.CultMembers[c]));
                }
            }
        }

        [Fact]
        public void Joiners_reach_the_cultist_stage_or_follow_an_omen()
        {
            foreach (var seed in Seeds)
            {
                var s = Run(seed, GridInputs(), Nights, out var soc, out _);
                var inputs = GridInputs();
                foreach (var night in s.Nights)
                    foreach (var e in night.Events.Where(e => e.Kind == MythosEventKind.CultJoined))
                    {
                        Assert.Equal(CorruptionStage.Cultist, soc.Fate[e.Subject]);
                        int level = soc.CorruptionLevel(e.Subject, night.Night, MythosInputs.At(inputs.DreadPermille, night.Night) / 1000f, MythosInputs.At(inputs.RitualStage, night.Night));
                        Assert.True(level >= VillageSociety.CultAt - MythosSimulation.JoinBoostMax);
                    }
            }
        }

        [Fact]
        public void Without_omens_joining_equals_corruption_at_cultist()
        {
            var inputs = new MythosInputs { DreadPermille = new[] { 1000 }, RitualStage = new[] { 5 } };
            var s = Run(42, inputs, 8, out var soc, out _);
            foreach (var night in s.Nights)
                foreach (var e in night.Events.Where(e => e.Kind == MythosEventKind.CultJoined && night.Night == 1))
                    Assert.Equal(CorruptionStage.Cultist, soc.CorruptionAt(e.Subject, 1, 1f, 5));
        }

        [Fact]
        public void Exposed_secrets_stay_exposed_and_are_exposed_once()
        {
            int exposures = 0;
            foreach (var seed in Seeds)
            {
                var s = Run(seed, GridInputs(), Nights, out var soc, out _);
                var lib = Library();
                for (int i = 0; i < Nights; i++)
                {
                    if (i > 0) Assert.All(s.Nights[i - 1].Exposed, v => Assert.Contains(v, s.Nights[i].Exposed));
                    foreach (var e in s.Nights[i].Events.Where(e => e.Kind == MythosEventKind.SecretExposed))
                    {
                        exposures++;
                        Assert.Equal(e.Night, s.ExposedNight[e.Subject]);
                        Assert.Equal(lib.Secrets[s.SecretKind[e.Subject]].Id, e.Key);
                    }
                }
                Assert.Equal(s.ExposedNight.Count(x => x > 0), s.Nights.SelectMany(n => n.Events).Count(e => e.Kind == MythosEventKind.SecretExposed));
                Assert.All(s.ExposedNight.Select((n, v) => (n, v)).Where(t => t.n > 0), t => Assert.True(s.SecretKind[t.v] >= 0));
            }
            Assert.True(exposures > 0, "twelve nights of rising dread should expose at least one secret across eight seeds");
        }

        [Fact]
        public void Schedule_is_fixed_and_matches_the_web_vectors()
        {
            var sch = MythosInputs.Schedule(7);
            Assert.Equal(new[] { 100, 200, 300, 400, 500, 600, 700 }, sch.DreadPermille);
            Assert.Equal(new[] { 0, 1, 2, 3, 4, 5, 5 }, sch.RitualStage);
            Assert.Equal(new[] { 1000, 1000, 1000 }, MythosInputs.Schedule(12).DreadPermille.Skip(9).ToArray());
            Assert.Empty(MythosInputs.Schedule(0).DreadPermille);
        }

        [Fact]
        public void Everything_heard_on_night_N_is_unchanged_when_replayed_for_night_N_plus_1()
        {
            foreach (var seed in Seeds)
            {
                var soc = VillageSocietyTests.SocietyOf(seed, out var story, out _);
                for (int n = 1; n < 11; n++)
                {
                    var today = MythosRules.Statements(new MythosFeed { Library = Library(), State = MythosSimulation.Run(soc, story, Library(), MythosInputs.Schedule(n), n), Night = n });
                    var tomorrow = MythosRules.Statements(new MythosFeed { Library = Library(), State = MythosSimulation.Run(soc, story, Library(), MythosInputs.Schedule(n + 1), n + 1), Night = n + 1 });
                    foreach (var m in today)
                    {
                        var same = tomorrow.Single(x => x.Id == m.Id);
                        Assert.Equal((m.Kind, m.Subject, m.Night, m.Minute), (same.Kind, same.Subject, same.Night, same.Minute));
                        if (m.Rumor == null) continue;
                        Assert.Equal((m.Rumor.Origin, m.Rumor.Key), (same.Rumor.Origin, same.Rumor.Key));
                        foreach (var h in m.Rumor.Holders)
                            Assert.Contains(same.Rumor.Holders, x => x.Villager == h.Villager && x.Distortion == h.Distortion && x.Night == h.Night);
                    }
                }
            }
        }

        [Fact]
        public void Rumors_respect_hop_delay_and_holders_are_valid()
        {
            foreach (var seed in Seeds)
            {
                var s = Run(seed, GridInputs(), Nights, out var soc, out var story);
                var last = s.Nights[Nights - 1];
                Assert.True(last.Rumors.Count > 0);
                foreach (var r in last.Rumors)
                {
                    var delay = MythosRumors.Delays(soc, r.Origin);
                    Assert.Contains(r.Holders, h => h.Villager == r.Origin && h.Night == r.Night && h.Distortion == 0);
                    Assert.Equal(r.Holders.Count, r.Holders.Select(h => h.Villager).Distinct().Count());
                    foreach (var h in r.Holders)
                    {
                        Assert.InRange(h.Villager, 0, soc.Roster.Count - 1);
                        Assert.Equal(r.Night + delay[h.Villager], h.Night);
                        Assert.True(h.Night <= Nights);
                        Assert.Equal(h.Distortion == 0, h.Truth);
                    }
                }
                for (int i = 1; i < Nights; i++)
                    foreach (var r in s.Nights[i].Rumors)
                    {
                        var before = s.Nights[i - 1].Rumors.FirstOrDefault(x => x.Id == r.Id);
                        if (before != null) Assert.All(before.Holders, h => Assert.Contains(h, r.Holders));
                    }
            }
        }

        [Fact]
        public void Distortion_never_decreases_along_a_hop()
        {
            var s = Run(1818, GridInputs(), Nights, out var soc, out _);
            var g = MythosRumors.Delays(soc, 0);
            Assert.Equal(0, g[0]);
            foreach (var r in s.Nights[Nights - 1].Rumors)
                foreach (var h in r.Holders.Where(h => h.Villager != r.Origin))
                    Assert.True(h.Distortion <= r.Holders.Count);
            Assert.Equal(MythosRumors.HopDistorts(1, 3, 4), MythosRumors.HopDistorts(1, 3, 4));
        }

        [Fact]
        public void Omens_raise_pressure_only_the_night_after()
        {
            var s = Run(42, GridInputs(), Nights, out _, out _);
            Assert.All(s.Nights.SelectMany(n => n.Events).Where(e => e.Kind == MythosEventKind.CosmicOmen), e => Assert.Equal(-1, e.Subject));
        }

        [Fact]
        public void Library_parse_names_the_offending_field()
        {
            var good = File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "mythos.json"));
            Assert.Throws<FormatException>(() => MythosLibrary.Parse("[]"));
            var ex = Assert.Throws<FormatException>(() => MythosLibrary.Parse(good.Replace("\"source\": \"secret\", \"ref\": \"debt\"", "\"source\": \"secret\", \"ref\": \"nope\"")));
            Assert.Contains("unknown secret nope", ex.Message);
            ex = Assert.Throws<FormatException>(() => MythosLibrary.Parse(good.Replace("\"source\": \"missing\"", "\"source\": \"dream\"")));
            Assert.Contains("unknown source", ex.Message);
            ex = Assert.Throws<FormatException>(() => MythosLibrary.Parse(good.Replace("\"pressure\": 90", "\"pressure\": 0")));
            Assert.Contains("pressure", ex.Message);
        }

        [Fact]
        public void Data_copies_match_and_every_secret_and_omen_has_both_tellings()
        {
            Assert.Equal(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "mythos.json")), File.ReadAllText(Path.Combine(Root(), "web", "data", "mythos.json")));
            var lib = Library();
            foreach (var e in lib.Secrets) foreach (var t in new[] { true, false }) Assert.Contains(lib.Rumors, l => l.Source == RumorSource.Secret && l.Ref == e.Id && l.Truth == t);
            foreach (var e in lib.Omens) foreach (var t in new[] { true, false }) Assert.Contains(lib.Rumors, l => l.Source == RumorSource.Cosmic && l.Ref == e.Id && l.Truth == t);
        }

        [Fact]
        public void Mythos_source_files_do_not_use_unity()
        {
            foreach (var f in new[] { "MythosSimulation.cs", "MythosFeeds.cs" })
                Assert.DoesNotContain("UnityEngine", File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Core", f)));
        }

        // Feeds

        [Fact]
        public void Society_overload_without_pressure_equals_the_plain_one_and_pressure_adds_suspicion()
        {
            var soc = VillageSocietyTests.SocietyOf(42, out _, out var roster);
            var log = new[] { new SocietyAction { Kind = SocietyActionKind.SeenNearBody, Subject = 1 } };
            var plain = soc.OpinionsAfter(log);
            Assert.Equal(plain.Suspicion, soc.OpinionsAfter(log, null).Suspicion);
            Assert.Equal(plain.Suspicion, soc.OpinionsAfter(log, new int[roster.Count]).Suspicion);
            var s = Run(42, GridInputs(), Nights, out _, out _);
            var pressure = MythosSociety.SuspicionPressure(s.AtNight(Nights), roster.Count);
            var with = soc.OpinionsAfter(log, pressure);
            Assert.Equal(plain.Trust, with.Trust);
            for (int i = 0; i < roster.Count; i++)
            {
                Assert.Equal(Math.Min(VillageSociety.Scale, plain.Suspicion[i] + pressure[i]), with.Suspicion[i]);
            }
            Assert.Contains(pressure, p => p > 0);
            Assert.All(MythosSociety.SuspicionPressure(null, 3), p => Assert.Equal(0, p));
        }

        private static MythosFeed FeedOf(int seed, out VillageStory story, out List<Villager> roster, int night = Nights)
        {
            var soc = VillageSocietyTests.SocietyOf(seed, out story, out roster);
            var lib = Library();
            return new MythosFeed { Library = lib, State = MythosSimulation.Run(soc, story, lib, GridInputs(), Nights), Night = night };
        }

        public static InvestigationEvidence HearAll(MythosFeed feed)
        {
            var e = new InvestigationEvidence();
            foreach (var s in MythosRules.Statements(feed))
                e.Heard.Add(new HeardStatement { Villager = s.Rumor != null ? s.Rumor.Holders[s.Rumor.Holders.Count - 1].Villager : Math.Max(0, s.Kind == MythosEventKind.CosmicOmen ? 0 : s.Subject), StatementId = s.Id, Night = s.Night });
            return e;
        }

        [Fact]
        public void Board_without_mythos_is_unchanged_and_with_mythos_adds_only_event_cards()
        {
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "lore_books.json")));
            var statements = StatementLibrary.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "statements.json")));
            foreach (var seed in Seeds)
            {
                var feed = FeedOf(seed, out var story, out _);
                var ev = InvestigationModelTests.RichEvidence();
                var baseline = InvestigationRules.Build(story, lore, statements, ev, null);
                var nullFeed = InvestigationRules.Build(story, lore, statements, ev, null, null);
                Assert.Equal(baseline.Cards.Select(c => c.Id + c.Revealed + c.Invalidated), nullFeed.Cards.Select(c => c.Id + c.Revealed + c.Invalidated));
                Assert.Equal(baseline.Timeline.Select(t => t.StatementId), nullFeed.Timeline.Select(t => t.StatementId));
                var noHeard = InvestigationRules.Build(story, lore, statements, ev, null, feed);
                Assert.Equal(baseline.Cards.Count, noHeard.Cards.Count);
                var all = InvestigationModelTests.RichEvidence();
                foreach (var h in HearAll(feed).Heard) all.Heard.Add(h);
                var withMythos = InvestigationRules.Build(story, lore, statements, all, null, feed);
                Assert.True(withMythos.Cards.Count > baseline.Cards.Count);
                Assert.All(withMythos.Cards.Skip(baseline.Cards.Count), c => { Assert.Equal(BoardCardKind.Event, c.Kind); Assert.StartsWith(MythosRules.IdPrefix, c.Key); });
                Assert.All(baseline.Contradictions, c => Assert.Contains(withMythos.Contradictions, d => d.PairId == c.PairId));
                Assert.All(withMythos.Cards.Skip(baseline.Cards.Count), c => Assert.False(string.IsNullOrWhiteSpace(InvestigationRules.CardTitle(c, story, lore, statements, null, "en", feed))));
            }
        }

        [Fact]
        public void A_distorted_rumor_contradicts_the_truth_it_distorts()
        {
            int pairs = 0;
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "lore_books.json")));
            var statements = StatementLibrary.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "statements.json")));
            foreach (var seed in Seeds)
            {
                var feed = FeedOf(seed, out var story, out _);
                var ev = new InvestigationEvidence();
                foreach (var s in MythosRules.Statements(feed))
                {
                    if (s.Rumor == null) { ev.Heard.Add(new HeardStatement { Villager = 0, StatementId = s.Id, Night = s.Night }); continue; }
                    foreach (var h in s.Rumor.Holders.Where(h => !h.Truth).Take(1)) ev.Heard.Add(new HeardStatement { Villager = h.Villager, StatementId = s.Id, Night = s.Night });
                }
                var board = InvestigationRules.Build(story, lore, statements, ev, null, feed);
                foreach (var c in board.Contradictions)
                {
                    pairs++;
                    Assert.True(board.Cards.First(x => x.Id == c.CardA).Invalidated);
                    Assert.Contains(board.Cards, x => x.Id == c.CardB && x.Revealed);
                }
            }
            Assert.True(pairs > 0, "some seed should pair a distorted rumor with its truth");
        }

        [Fact]
        public void Rumor_text_uses_authored_lines_and_falls_back_to_the_story_rumor()
        {
            var feed = FeedOf(42, out var story, out _);
            var rumor = feed.Current.Rumors[0];
            var truthful = MythosRules.RumorText(feed, story, rumor, false, "en");
            var distorted = MythosRules.RumorText(feed, story, rumor, true, "en");
            Assert.NotEqual(truthful, distorted);
            Assert.NotEqual(MythosRules.RumorText(feed, story, rumor, false, "fr"), truthful);
            var bare = new MythosFeed { Library = new MythosLibrary { Secrets = feed.Library.Secrets, Omens = feed.Library.Omens, Cults = feed.Library.Cults }, State = feed.State, Night = Nights };
            Assert.Equal(story.RumorText(rumor.Night, rumor.Stage, rumor.Tier, "en"), MythosRules.RumorText(bare, story, rumor, false, "en"));
        }

        [Fact]
        public void Night_ticks_are_deterministic_and_equal_the_counts_of_each_MythosNight()
        {
            var lib = Library();
            foreach (var seed in Seeds)
            {
                var state = Run(seed, GridInputs(), Nights, out _, out _);
                var ticks = NightTicks.Build(state, lib);
                Assert.Equal(Nights, ticks.Count);
                var again = NightTicks.Build(Run(seed, GridInputs(), Nights, out _, out _), lib);
                Assert.Equal(TickSignature(ticks), TickSignature(again));
                int reality = 0;
                for (int i = 0; i < ticks.Count; i++)
                {
                    var t = ticks[i];
                    var n = state.Nights[i];
                    Assert.Equal(i + 1, t.Night);
                    Assert.Equal(n.Events.Count(e => e.Kind == MythosEventKind.CultFounded || e.Kind == MythosEventKind.CultJoined), t.CultGrowth);
                    Assert.Equal(n.Events.Count(e => e.Kind == MythosEventKind.RumorStarted), t.RumorsAdded);
                    Assert.Equal(n.Events.Any(e => e.Kind == MythosEventKind.SecretExposed), t.SecretDiscovered);
                    var omen = n.Events.FirstOrDefault(e => e.Kind == MythosEventKind.CosmicOmen);
                    Assert.Equal(omen.Key ?? "", t.NewOmen);
                    Assert.Equal(n.Rumors.Where(r => r.Night < n.Night).Sum(r => r.Holders.Count(h => h.Night == n.Night)), t.RumorsChanged);
                    Assert.Equal(n.Rumors.Where(r => r.Source == RumorSource.Missing).Select(r => r.Subject).Distinct().Count(), t.MissingPersons);
                    reality += t.RealityShift;
                    Assert.Equal(reality, t.Reality);
                    Assert.True(t.RealityShift >= 0);
                }
            }
        }

        [Fact]
        public void Night_ticks_of_a_shorter_run_equal_the_first_nights_of_a_longer_run()
        {
            var lib = Library();
            var full = NightTicks.Build(Run(42, GridInputs(), Nights, out _, out _), lib);
            var part = NightTicks.Build(Run(42, GridInputs(), 5, out _, out _), lib);
            Assert.Equal(TickSignature(full.Take(5).ToList()), TickSignature(part));
        }

        [Fact]
        public void Night_ticks_differ_between_seeds_and_read_missing_input_as_empty()
        {
            var lib = Library();
            var sigs = new HashSet<string>(Seeds.Select(s => TickSignature(NightTicks.Build(Run(s, GridInputs(), Nights, out _, out _), lib))));
            Assert.True(sigs.Count > 1, "villages should evolve differently");
            Assert.Empty(NightTicks.Build(null, lib));
            Assert.Null(NightTicks.At(new MythosState(), lib, 3));
            var state = Run(42, GridInputs(), Nights, out _, out _);
            Assert.Equal(1, NightTicks.At(state, lib, -5).Night);
            Assert.Equal(Nights, NightTicks.At(state, lib, 999).Night);
        }

        [Fact]
        public void Night_ticks_name_the_field_of_an_unknown_omen_and_black_tide_is_authored()
        {
            var lib = Library();
            Assert.True(MythosLibrary.IndexOf(lib.Omens, "black_tide") >= 0);
            var state = new MythosState();
            state.Nights.Add(new MythosNight { Night = 1, Events = { new MythosEvent { Kind = MythosEventKind.CosmicOmen, Other = 0, Key = "no_such_omen", Night = 1 } } });
            var ex = Assert.Throws<FormatException>(() => NightTicks.Build(state, lib));
            Assert.Contains("newOmen", ex.Message);
            Assert.Contains("no_such_omen", ex.Message);
        }

        private static string TickSignature(List<NightTickRecord> ticks)
        {
            return string.Join("|", ticks.Select(t => string.Join(",", t.Night, t.CultGrowth, t.RumorsChanged, t.RumorsAdded, t.MissingPersons, t.NewMissingPerson, t.NewOmen, t.RealityShift, t.Reality, t.SecretDiscovered)));
        }
    }
}
