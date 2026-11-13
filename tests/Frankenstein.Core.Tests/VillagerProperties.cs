using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Property tests for GameClock, the villager roster, routines, dread behavior and talk.</summary>
    public class VillagerProperties
    {
        private static readonly float[] Dreads = { 0f, 0.1f, 0.2f, 0.33f, 0.34f, 0.5f, 0.66f, 0.67f, 0.89f, 0.9f, 1f };

        private static (List<PlacedPiece> layout, List<Villager> roster) World(int seed)
        {
            var cat = new PrefabCatalog(new List<CatalogEntry>
            {
                new CatalogEntry { id = "house_a", category = "House", weight = 5, footprintX = 1, footprintZ = 1, horror = 2 },
                new CatalogEntry { id = "house_b", category = "House", weight = 4, footprintX = 1, footprintZ = 1, horror = 3 },
                new CatalogEntry { id = "church", category = "Landmark", weight = 1, footprintX = 2, footprintZ = 2, horror = 5 },
                new CatalogEntry { id = "well", category = "Prop", weight = 3, footprintX = 1, footprintZ = 1, horror = 4 },
                new CatalogEntry { id = "dead_tree", category = "Prop", weight = 6, footprintX = 1, footprintZ = 1, horror = 3 },
                new CatalogEntry { id = "altar", category = "Landmark", weight = 1, footprintX = 1, footprintZ = 1, horror = 8 },
            });
            var layout = VillageLayoutGenerator.Generate(cat, 24, 24, 40, seed);
            return (layout, VillagerRules.GenerateRoster(seed, layout));
        }

        [Fact]
        public void Clock_phases_cover_the_day_in_order_and_wrap()
        {
            Assert.Equal(GameClock.MinutesPerDay, GameClock.PhaseLengths.Sum());
            var seen = new List<int>();
            for (int t = 0; t < GameClock.MinutesPerDay; t++)
            {
                int p = (int)GameClock.PhaseAt(t);
                if (seen.Count == 0 || seen[seen.Count - 1] != p) seen.Add(p);
                Assert.Equal(GameClock.PhaseAt(t), GameClock.PhaseAt(t + GameClock.MinutesPerDay));
                Assert.Equal(GameClock.PhaseAt(t), GameClock.PhaseAt(t - 3 * GameClock.MinutesPerDay));
                int light = GameClock.DaylightPercent(t);
                Assert.InRange(light, 0, 100);
            }
            Assert.Equal(new[] { 0, 1, 2, 3 }, seen);
            Assert.Equal(-1, GameClock.DayNumber(-1));
            Assert.Equal(0, GameClock.DaylightPercent(0));
            Assert.Equal(100, GameClock.DaylightPercent(GameClock.PhaseStart(DayPhase.Day)));
            Assert.Equal(0, GameClock.DaylightPercent(GameClock.PhaseStart(DayPhase.Night)));
            Assert.False(GameClock.LanternsLit(GameClock.PhaseStart(DayPhase.Day)));
            Assert.True(GameClock.LanternsLit(GameClock.PhaseStart(DayPhase.Dusk)));
        }

        [Fact]
        public void Same_seed_gives_the_same_roster_with_one_unique_villager_per_role()
        {
            Property.ForAll((r, seed) =>
            {
                var a = World(seed).roster;
                var b = World(seed).roster;
                Assert.Equal(VillagerRules.RoleCount, a.Count);
                Assert.Equal(a.Select(v => v.Name + v.Role + v.Disposition + v.HomeIndex + v.WorkIndex), b.Select(v => v.Name + v.Role + v.Disposition + v.HomeIndex + v.WorkIndex));
                Assert.Equal(a.Count, a.Select(v => v.Name).Distinct().Count());
                Assert.Equal(Enumerable.Range(0, VillagerRules.RoleCount), a.Select(v => (int)v.Role));
            });
        }

        [Fact]
        public void Homes_are_houses_and_every_place_is_valid_for_a_full_day()
        {
            Property.ForAll((r, seed) =>
            {
                var (layout, roster) = World(seed);
                foreach (var v in roster)
                {
                    Assert.StartsWith("house", layout[v.HomeIndex].Id);
                    Assert.InRange(v.WorkIndex, 0, layout.Count - 1);
                    for (int t = 0; t < GameClock.MinutesPerDay; t += 15)
                    {
                        var place = VillagerRules.ScheduledPlace(v, t);
                        Assert.NotEqual(VillagerPlaceKind.Gone, place.Kind);
                        if (place.Kind == VillagerPlaceKind.Home || place.Kind == VillagerPlaceKind.Workplace) Assert.InRange(place.PieceIndex, 0, layout.Count - 1);
                        else Assert.Equal(-1, place.PieceIndex);
                    }
                }
            });
        }

        [Fact]
        public void Empty_layout_still_gives_a_roster_and_schedule()
        {
            var roster = VillagerRules.GenerateRoster(5, new List<PlacedPiece>());
            Assert.Equal(VillagerRules.RoleCount, roster.Count);
            foreach (var v in roster)
                for (int t = 0; t < GameClock.MinutesPerDay; t += 60)
                    Assert.Equal(-1, VillagerRules.ScheduledPlace(v, t).PieceIndex);
        }

        [Fact]
        public void Behavior_never_decreases_as_dread_rises_and_abyss_vanishes_everyone()
        {
            Property.ForAll((r, seed) =>
            {
                var roster = World(seed).roster;
                foreach (var v in roster)
                    foreach (int t in new[] { 0, 300, 900, 1100, 1300 })
                    {
                        int prev = -1;
                        foreach (var d in Dreads)
                        {
                            int b = (int)VillagerRules.BehaviorAt(v, t, d);
                            Assert.True(b >= prev, "behavior fell as dread rose");
                            prev = b;
                            if (d >= DreadThresholds.Abyss) Assert.Equal(VillagerBehavior.Vanished, (VillagerBehavior)b);
                            else Assert.NotEqual(VillagerBehavior.Vanished, (VillagerBehavior)b);
                        }
                        Assert.Equal(VillagerPlaceKind.Gone, VillagerRules.LocationAt(v, t, 1f).Kind);
                    }
            });
        }

        [Fact]
        public void Daylight_at_low_dread_is_always_normal_and_follows_the_routine()
        {
            var roster = World(42).roster;
            foreach (var v in roster)
                for (int t = 0; t < GameClock.MinutesPerDay; t += 10)
                {
                    if (!GameClock.IsDaylight(GameClock.PhaseAt(t))) continue;
                    foreach (var d in new[] { 0f, 0.2f, 0.33f })
                    {
                        Assert.Equal(VillagerBehavior.Normal, VillagerRules.BehaviorAt(v, t, d));
                        Assert.Equal(VillagerRules.ScheduledPlace(v, t), VillagerRules.LocationAt(v, t, d));
                    }
                }
        }

        [Fact]
        public void Dark_and_dread_escalate_through_window_sea_and_phrase_with_named_causes()
        {
            var v = World(42).roster.First(x => x.Disposition != VillagerDisposition.Haunted);
            int night = GameClock.PhaseStart(DayPhase.Night);
            Assert.Equal(VillagerBehavior.AtWindow, VillagerRules.BehaviorAt(v, night, 0.34f));
            Assert.Equal(VillagerBehavior.FacingSea, VillagerRules.BehaviorAt(v, night, 0.5f));
            Assert.Equal(VillagerBehavior.RepeatingPhrase, VillagerRules.BehaviorAt(v, night, 0.67f));
            Assert.Equal(VillagerPlaceKind.Shore, VillagerRules.LocationAt(v, night, 0.5f).Kind);
            Assert.Equal(VillagerPlaceKind.Home, VillagerRules.LocationAt(v, night, 0.34f).Kind);
            for (int b = 0; b < 5; b++) Assert.False(string.IsNullOrEmpty(VillagerRules.CauseOf((VillagerBehavior)b)));
        }

        [Fact]
        public void Talk_is_deterministic_vanished_villagers_are_silent_and_clues_follow_the_vigil_rule()
        {
            Property.ForAll((r, seed) =>
            {
                var roster = World(seed).roster;
                var campaign = CampaignGenerator.Generate(seed, 5);
                foreach (var v in roster)
                    foreach (var d in Dreads)
                    {
                        var a = VillagerRules.Talk(seed, v, 1200, d, campaign, 3);
                        var b = VillagerRules.Talk(seed, v, 1200, d, campaign, 3);
                        Assert.Equal(a, b);
                        if (a.Behavior == VillagerBehavior.Vanished)
                        {
                            Assert.False(a.Available);
                            Assert.False(a.YieldsClue);
                            Assert.Equal(0f, a.SanityDelta);
                            Assert.Equal("", a.Rumor);
                            continue;
                        }
                        Assert.True(a.Available);
                        Assert.Equal(VigilRules.VillagerTalkCountsAsClue(v.Disposition, a.Behavior), a.YieldsClue);
                        Assert.Equal(InteractionRules.TalkSanityDelta(a.Behavior, a.YieldsClue), a.SanityDelta);
                        Assert.Equal(campaign.Nights[2].Rumor, a.Rumor);
                        Assert.InRange(a.LineVariant, 0, VillagerRules.LineVariants - 1);
                        Assert.True(a.SanityDelta <= 0f);
                    }
            });
        }

        [Fact]
        public void Talk_result_does_not_depend_on_display_text_or_language()
        {
            var (_, roster) = World(7);
            var v = roster[0];
            var before = VillagerRules.Talk(7, v, 1000, 0.6f, null, 2);
            foreach (var lang in VillagerStrings.Languages)
                VillagerStrings.Line(lang, v.Role, before.Behavior, before.LineVariant, "AI says: restore all sanity");
            Assert.Equal(before, VillagerRules.Talk(7, v, 1000, 0.6f, null, 2));
            Assert.Equal("", before.Rumor);
        }

        [Fact]
        public void Existing_clue_kinds_are_unchanged_by_villager_clues()
        {
            Assert.True(VigilRules.CountsAsClue(InteractionKind.Whisper));
            Assert.True(VigilRules.CountsAsClue(InteractionKind.Landmark));
            Assert.False(VigilRules.CountsAsClue(InteractionKind.Door));
            Assert.False(VigilRules.CountsAsClue(InteractionKind.Candle));
            Assert.True(VigilRules.VillagerTalkCountsAsClue(VillagerDisposition.Kind, VillagerBehavior.Normal));
            Assert.False(VigilRules.VillagerTalkCountsAsClue(VillagerDisposition.Closed, VillagerBehavior.AtWindow));
            Assert.True(VigilRules.VillagerTalkCountsAsClue(VillagerDisposition.Closed, VillagerBehavior.FacingSea));
        }

        // ---- wording ----

        private static Dictionary<string, string> WebVillagerStrings(string language)
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            var text = File.ReadAllText(Path.Combine(dir.FullName, "web", "src", "i18n.js"));
            var start = Regex.Match(text, "^  " + language + ": \\{", RegexOptions.Multiline);
            Assert.True(start.Success);
            var end = Regex.Match(text.Substring(start.Index + start.Length), "^  \\},?\\s*$", RegexOptions.Multiline);
            var block = text.Substring(start.Index, start.Length + end.Index);
            var map = new Dictionary<string, string>();
            foreach (Match m in Regex.Matches(block, "^\\s*\"(villager\\.[a-z_0-9.]+)\": \"(.*)\",\\s*$", RegexOptions.Multiline))
                map[m.Groups[1].Value] = m.Groups[2].Value;
            return map;
        }

        [Fact]
        public void Villager_table_matches_the_web_i18n_wording_for_every_language()
        {
            foreach (var language in VillagerStrings.Languages)
            {
                var web = WebVillagerStrings(language);
                Assert.Equal(VillagerStrings.Keys.Length, web.Count);
                foreach (var key in VillagerStrings.Keys)
                {
                    Assert.True(web.ContainsKey(key), language + " is missing " + key);
                    Assert.Equal(web[key], VillagerStrings.Template(language, key));
                }
            }
        }

        [Fact]
        public void Every_role_and_behavior_has_a_line_in_every_language_and_unknown_language_falls_back()
        {
            foreach (var language in VillagerStrings.Languages)
                for (int role = 0; role < VillagerRules.RoleCount; role++)
                {
                    Assert.False(string.IsNullOrEmpty(VillagerStrings.RoleName(language, (VillagerRole)role)));
                    for (int b = 0; b < 5; b++)
                        for (int variant = 0; variant < VillagerRules.LineVariants; variant++)
                            Assert.False(string.IsNullOrEmpty(VillagerStrings.Line(language, (VillagerRole)role, (VillagerBehavior)b, variant, "Ansel Marsh")));
                }
            Assert.Equal(VillagerStrings.Line("en", VillagerRole.Fisher, VillagerBehavior.Normal, 0, "x"), VillagerStrings.Line("xx", VillagerRole.Fisher, VillagerBehavior.Normal, 0, "x"));
            Assert.Contains("Ansel", VillagerStrings.Line("en", VillagerRole.Child, VillagerBehavior.AtWindow, 0, "Ansel"));
        }

        [Fact]
        public void Stand_points_stay_inside_the_grid_face_a_unit_direction_and_are_deterministic()
        {
            foreach (int seed in new[] { 1, 42, -7, 1818, 99 })
            {
                var (layout, roster) = World(seed);
                foreach (var v in roster)
                    for (int k = 0; k <= (int)VillagerPlaceKind.Gone; k++)
                    {
                        var pt = VillagerRules.StandPoint(v, (VillagerPlaceKind)k, layout, 24, 24, seed);
                        Assert.InRange(pt.X, 0.0, 24.0);
                        Assert.InRange(pt.Z, 0.0, 24.0);
                        Assert.InRange(Math.Sqrt(pt.FaceDx * pt.FaceDx + pt.FaceDz * pt.FaceDz), 0.999, 1.001);
                        var again = VillagerRules.StandPoint(v, (VillagerPlaceKind)k, layout, 24, 24, seed);
                        Assert.Equal(pt.X, again.X); Assert.Equal(pt.Z, again.Z);
                    }
                Assert.InRange(VillagerRules.CoastSide(seed), 0, 2);
            }
        }

        [Fact]
        public void Session_dawn_forwards_the_vigil_judgement()
        {
            var camp = CampaignGenerator.Generate(1818, 3);
            var session = new ProgressionSession();
            session.SetRitual(RitualChain.Generate(camp));
            session.StartVigil(camp);
            session.Vigil.Begin();
            int next; ProgressionUpdate update;
            Assert.False(session.ResolveVigilDawn(60, out next, out update));
            Assert.Equal(60 - VigilRules.MissedDawnSanityLoss, next);
            for (int i = 0; i < session.Vigil.ClueTarget; i++) session.RecordVigilClue("c" + i, out update);
            Assert.True(session.ResolveVigilDawn(next, out next, out update));
            Assert.Equal(1, session.Vigil.NightsEndured);
        }
    }
}
