using System;
using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;
using Xunit.Abstractions;

namespace Frankenstein.Core.Tests
{
    /// <summary>One recorded vigil event for golden replay: kind is "c" clue, "l" lantern, "s" sanity or "e" endure.</summary>
    internal struct VigilEvent
    {
        public string Kind;
        public string Id;
        public int Value;
    }

    /// <summary>Scripted players used by the balance tests and by the golden replay.</summary>
    internal static class VigilPlayer
    {
        public const int RelightBelow = 55;
        public const int NightsForBalance = 5;

        public static VigilState Play(int seed, int nights, bool careful, List<VigilEvent> log)
        {
            var campaign = CampaignGenerator.Generate(seed, nights);
            var ritual = RitualChain.Generate(campaign);
            var vigil = new VigilState(campaign, ritual);
            var sanity = new SanityModel(vigil.Sanity);
            var rng = new SeededRandom(seed ^ 0x51ed);
            for (int night = 1; night <= campaign.Nights.Count && !vigil.IsFinished; night++)
            {
                int lamp = 0;
                Action<int> report = delegate (int value)
                {
                    vigil.RecordSanity(value);
                    if (log != null) log.Add(new VigilEvent { Kind = "s", Value = value });
                };
                // The dark creeps in over the night.
                sanity.Apply(-VigilRules.NightCreep(night));
                report(VigilRules.SanityPoints(sanity.Value));
                for (int source = 0; source < VigilRules.ClueTarget(night) && !vigil.IsFinished; source++)
                {
                    if (careful)
                        while (!vigil.IsFinished && vigil.Sanity < RelightBelow && lamp < VigilRules.LampsPerNight)
                        {
                            string id = "lamp" + night + "_" + lamp++;
                            if (vigil.LightLantern(id))
                            {
                                if (log != null) log.Add(new VigilEvent { Kind = "l", Id = id });
                                sanity.Apply(InteractionRules.SanityDelta(InteractionKind.Candle));
                                report(VigilRules.SanityPoints(sanity.Value));
                            }
                        }
                    var kind = careful && rng.Next(3) == 0 ? InteractionKind.Landmark : InteractionKind.Whisper;
                    string clue = "src" + night + "_" + source;
                    if (vigil.RecordClue(clue) && log != null) log.Add(new VigilEvent { Kind = "c", Id = clue });
                    sanity.Apply(InteractionRules.SanityDelta(kind));
                    report(VigilRules.SanityPoints(sanity.Value));
                }
                if (vigil.IsFinished) break;
                int next = vigil.EndureNight(VigilRules.SanityPoints(sanity.Value));
                if (log != null) log.Add(new VigilEvent { Kind = "e", Value = VigilRules.SanityPoints(sanity.Value) });
                if (next >= 0) sanity = new SanityModel(next);
            }
            return vigil;
        }
    }

    public class VillageVigilTests
    {
        private readonly ITestOutputHelper _out;
        public VillageVigilTests(ITestOutputHelper output) { _out = output; }

        private static Ritual MakeRitual(int seed, int nights) { return RitualChain.Generate(CampaignGenerator.Generate(seed, nights)); }

        [Fact]
        public void Clue_targets_rise_and_stay_in_bounds()
        {
            int prev = 0;
            for (int n = -3; n <= 30; n++)
            {
                int t = VigilRules.ClueTarget(n);
                Assert.InRange(t, VigilRules.MinClueTarget, VigilRules.MaxClueTarget);
                if (n >= 1) { Assert.True(t >= prev, "night " + n); prev = t; }
            }
            Assert.Equal(VigilRules.ClueTarget(1), VigilRules.ClueTarget(-3));
            Assert.Equal(VigilRules.ClueTarget(4) + VigilRules.SpareSources, VigilRules.SourcesOffered(4));
        }

        [Fact]
        public void Playthrough_is_deterministic_per_seed()
        {
            Property.ForAll((r, seed) =>
            {
                int s = r.Next(2000000) - 1000000;
                var a = VigilPlayer.Play(s, 5, true, null);
                var b = VigilPlayer.Play(s, 5, true, null);
                Assert.Equal(a.Serialize(), b.Serialize());
                Assert.Equal(a.Outcome(3).Code, b.Outcome(3).Code);
                Assert.Equal(a.RevealedName, b.RevealedName);
            });
        }

        [Fact]
        public void Every_end_state_maps_to_exactly_one_known_ending()
        {
            foreach (var collapsed in new[] { false, true })
                foreach (var named in new[] { false, true })
                    foreach (var complete in new[] { false, true })
                        for (int sanity = 0; sanity <= 100; sanity++)
                        {
                            string id = VigilRules.EndingFor(sanity, collapsed, named, complete);
                            Assert.Equal(1, VigilRules.EndingIds.Count(e => e == id));
                            bool hollow = collapsed || sanity == 0;
                            Assert.Equal(hollow, id == VigilRules.Hollowing);
                            if (!hollow && named && !complete && sanity >= 50) Assert.Equal(VigilRules.NameSpoken, id);
                            else if (!hollow && !complete) Assert.Equal(sanity >= 50 ? VigilRules.Dawn : VigilRules.Fever, id);
                            else if (!hollow) Assert.Equal(sanity >= 50 ? VigilRules.Witness : VigilRules.Vessel, id);
                        }
            Assert.Equal(6, VigilRules.EndingIds.Length);
            Assert.Equal(VigilRules.EndingIds.Length, VigilRules.Epitaphs.Length);
            Assert.All(VigilRules.Epitaphs, e => Assert.DoesNotContain('\u2014', e));
        }

        [Fact]
        public void Clues_and_lanterns_count_once_per_night_and_bad_ids_are_refused()
        {
            var camp = CampaignGenerator.Generate(7, 3);
            var v = new VigilState(camp, RitualChain.Generate(camp));
            Assert.True(v.RecordClue("well"));
            Assert.False(v.RecordClue("well"));
            Assert.True(v.LightLantern("lamp"));
            Assert.False(v.LightLantern("lamp"));
            foreach (var bad in new string[] { null, "", "a;b", "a,b" })
            {
                Assert.False(v.RecordClue(bad));
                Assert.False(v.LightLantern(bad));
            }
            Assert.Equal(1, v.TotalClues);
            Assert.Equal(1, v.TotalLanterns);
        }

        [Fact]
        public void Endure_night_is_gated_by_the_clue_target()
        {
            var camp = CampaignGenerator.Generate(11, 3);
            var v = new VigilState(camp, RitualChain.Generate(camp));
            Assert.False(v.CanEndureNight);
            Assert.Equal(-1, v.EndureNight(80));
            for (int i = 0; i < v.ClueTarget; i++) v.RecordClue("s" + i);
            Assert.True(v.CanEndureNight);
            Assert.Equal(VigilRules.NextNightSanity(80), v.EndureNight(80));
            Assert.Equal(2, v.Night);
            Assert.Equal(0, v.NightClues);
            Assert.Equal(100, VigilRules.NextNightSanity(99));
        }

        [Fact]
        public void Sanity_zero_collapses_into_hollowing_and_ends_the_vigil()
        {
            var camp = CampaignGenerator.Generate(5, 3);
            var v = new VigilState(camp, RitualChain.Generate(camp));
            Assert.Null(v.Outcome(0));
            v.RecordSanity(0);
            Assert.True(v.IsFinished);
            Assert.Equal(VigilRules.Hollowing, v.Outcome(0).EndingId);
            Assert.False(v.RecordClue("late"));
            v.RecordSanity(90);
            Assert.Equal(0, v.Sanity);
        }

        [Fact]
        public void Score_grows_with_clues_and_lanterns()
        {
            Property.ForAll((r, seed) =>
            {
                int c = r.Next(30), l = r.Next(20), s = r.Next(101), n = r.Next(10), x = r.Next(14);
                int baseScore = VigilRules.Score(c, l, s, n, x, VigilRules.Dawn);
                Assert.True(VigilRules.Score(c + 1, l, s, n, x, VigilRules.Dawn) > baseScore);
                Assert.True(VigilRules.Score(c, l + 1, s, n, x, VigilRules.Dawn) > baseScore);
                Assert.True(VigilRules.Score(c, l, s, n, x, VigilRules.NameSpoken) > baseScore);
                Assert.True(VigilRules.RankFor(baseScore + 1) >= VigilRules.RankFor(baseScore));
            });
            Assert.Equal(0, VigilRules.RankFor(0));
            Assert.Equal(VigilRules.RankNames.Length - 1, VigilRules.RankFor(int.MaxValue));
            Assert.Equal(VigilRules.RankNames.Length, VigilRules.RankThresholds.Length);
        }

        [Fact]
        public void Result_code_round_trips_and_malformed_codes_are_rejected()
        {
            Property.ForAll((r, seed) =>
            {
                int s = r.Next(int.MaxValue) - r.Next(int.MaxValue);
                string ending = VigilRules.EndingIds[r.Next(VigilRules.EndingIds.Length)];
                int score = r.Next(100000);
                VigilResultCode parsed;
                Assert.True(VigilRules.TryParseResultCode(VigilRules.ResultCode(s, ending, score), out parsed));
                Assert.Equal(s, parsed.Seed);
                Assert.Equal(ending, parsed.EndingId);
                Assert.Equal(score, parsed.Score);
            });
            foreach (var bad in new string[]
            {
                null, "", "V1", "V1-", "V1--", "V1-5-dawn", "V2-5-dawn-10", "V1-5-nobody-10", "V1-5-dawn--10", "V1-5-dawn-+10",
                "V1-05-dawn-10", "V1--0-dawn-10", "V1-5-dawn-010", "V1-5-dawn-1x", "V1-abc-dawn-10", "V1-99999999999-dawn-10", "v1-5-dawn-10", "V1-5-dawn-10-",
            })
            {
                VigilResultCode parsed;
                Assert.False(VigilRules.TryParseResultCode(bad, out parsed), "accepted: " + bad);
            }
        }

        [Fact]
        public void Name_reveal_is_monotonic_and_whole_at_the_total()
        {
            Property.ForAll((r, seed) =>
            {
                var ritual = MakeRitual(r.Next(2000000) - 1000000, 1 + r.Next(9));
                int total = VigilRules.TotalClues(ritual.Stages.Count);
                string prev = VigilRules.NameReveal(ritual, 0, total);
                Assert.Equal(ritual.Name.Length, prev.Length);
                for (int found = 1; found <= total + 2; found++)
                {
                    string cur = VigilRules.NameReveal(ritual, found, total);
                    for (int i = 0; i < cur.Length; i++)
                        Assert.True(prev[i] == cur[i] || prev[i] == VigilRules.HiddenLetter, "letter hid again at " + i);
                    prev = cur;
                }
                Assert.Equal(ritual.Name, prev);
                Assert.Equal(ritual.Name.Count(c => char.IsLetter(c)), VigilRules.NameReveal(ritual, 0, total).Count(c => c == VigilRules.HiddenLetter));
            });
            Assert.Equal("", VigilRules.NameReveal(null, 3, 5));
        }

        [Fact]
        public void Save_string_round_trips_and_bad_input_leaves_state_unchanged()
        {
            Property.ForAll((r, seed) =>
            {
                var camp = CampaignGenerator.Generate(r.Next(100000), 5);
                var ritual = RitualChain.Generate(camp);
                var a = VigilPlayer.Play(r.Next(100000), 5, true, null);
                var b = new VigilState(CampaignGenerator.Generate(0, 5), ritual);
                Assert.True(b.TryRestore(a.Serialize()));
                Assert.Equal(a.Serialize(), b.Serialize());
            });
            var camp2 = CampaignGenerator.Generate(3, 2);
            var v = new VigilState(camp2, RitualChain.Generate(camp2));
            v.RecordClue("x");
            string before = v.Serialize();
            foreach (var bad in new string[] { null, "", "vigil2;0;50;50;0;0;;", "vigil1;0;50;50;0;0;;;", "vigil1;9;50;50;0;0;;", "vigil1;0;101;50;0;0;;", "vigil1;0;50;60;0;0;;", "vigil1;0;50;50;0;0;a;", "vigil1;-1;50;50;0;0;;", "vigil1;0;50;50;1;0;a,a;" })
                Assert.False(v.TryRestore(bad), "accepted: " + bad);
            Assert.Equal(before, v.Serialize());
        }

        [Fact]
        public void Null_campaign_gives_an_empty_finished_vigil()
        {
            var v = new VigilState(null, null);
            Assert.True(v.IsFinished);
            Assert.False(v.IsNamed);
            Assert.NotNull(v.Outcome(0));
        }

        [Fact]
        public void Progression_session_awards_vigil_achievements_only_after_actions()
        {
            var camp = CampaignGenerator.Generate(21, 2);
            var ritual = RitualChain.Generate(camp);
            var session = new ProgressionSession();
            session.SetRitual(ritual);
            session.StartVigil(camp);
            Assert.Empty(session.EarnedAchievementIds);
            ProgressionUpdate u;
            session.RecordVigilSanity(0);
            Assert.Contains("vigil", session.EarnedAchievementIds);
            Assert.DoesNotContain("namer", session.EarnedAchievementIds);
            Assert.Equal(new[] { "whisper", "listener", "doors", "nights", "journal", "abyss", "ritual", "codexhalf", "codexfull", "wanderer", "vigil", "namer" }, AchievementRules.Ids);
            Assert.False(session.RecordVigilClue("late", out u));
        }

        [Fact]
        public void Balance_careful_players_finish_and_reckless_players_collapse()
        {
            const int seeds = 400;
            int carefulFinished = 0, carefulNamed = 0, recklessCollapsed = 0;
            var endings = new Dictionary<string, int>();
            for (int seed = 1; seed <= seeds; seed++)
            {
                var careful = VigilPlayer.Play(seed * 31, VigilPlayer.NightsForBalance, true, null);
                if (!careful.IsCollapsed && careful.IsFinished) carefulFinished++;
                string end = careful.Outcome(0).EndingId;
                endings[end] = (endings.ContainsKey(end) ? endings[end] : 0) + 1;
                if (end == VigilRules.NameSpoken) carefulNamed++;
                var reckless = VigilPlayer.Play(seed * 31, VigilPlayer.NightsForBalance, false, null);
                if (reckless.IsCollapsed) recklessCollapsed++;
            }
            _out.WriteLine("careful finished " + carefulFinished + "/" + seeds + " named " + carefulNamed + " reckless collapsed " + recklessCollapsed + " endings " + string.Join(",", endings.Select(kv => kv.Key + "=" + kv.Value)));
            Assert.True(carefulFinished * 100 >= seeds * 90, "careful finished " + carefulFinished + "/" + seeds);
            Assert.InRange(carefulNamed * 100, seeds * 30, seeds * 80);
            Assert.True(recklessCollapsed * 100 > seeds * 50, "reckless collapsed " + recklessCollapsed + "/" + seeds);
        }
    }
}
