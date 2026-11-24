using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Creature upgrade path (spec 166): stage order, unlock conditions, seed determinism, bounded tier 4 exposure, reduced motion, a cause for every appearance, place avoidance.</summary>
    public class CreatureTierTests
    {
        public static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        public static CreatureCatalog Catalog() => CreatureCatalog.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "creatures.json")));

        /// <summary>The five named states shared with the golden file: a calm village, a corrupted villager, forbidden knowledge, the cosmic late game and a place with reduced motion.</summary>
        public static readonly string[] ScenarioNames = { "calm", "corrupted", "knowing", "cosmic", "place_reduced" };

        public static TierContext Scenario(int index, int seed, int tick)
        {
            var c = new TierContext { Seed = seed, GridW = 24, GridD = 24, Tick = tick, DreadPercent = 80, CorruptedVillager = -1, PlaceId = "", LastGlimpseTick = -1 };
            if (index >= 1) { c.SocietyStage = 2; c.CorruptedVillager = 3; }
            if (index >= 2) c.KnowledgeTier = 3;
            if (index >= 3) { c.KnowledgeTier = 5; c.CosmicOmens = 1; }
            if (index == 4) { c.KnowledgeTier = 3; c.CosmicOmens = 0; c.PlaceId = "manor"; c.ReducedMotion = true; }
            return c;
        }

        public static int Tick(int day, DayPhase phase) { return day * GameClock.MinutesPerDay + GameClock.PhaseStart(phase) + 5; }

        private static List<Appearance> Over(int scenario, int seed, int days, CreatureCatalog cat, IList<PlacePlacement> places = null)
        {
            var all = new List<Appearance>();
            for (int d = 0; d < days; d++)
                foreach (DayPhase p in new[] { DayPhase.Dawn, DayPhase.Day, DayPhase.Dusk, DayPhase.Night })
                    all.AddRange(CreatureTiers.Select(Scenario(scenario, seed, Tick(d, p)), cat, places));
            return all;
        }

        [Fact]
        public void Data_has_four_tiers_with_both_languages_and_valid_causes()
        {
            var cat = Catalog();
            Assert.Equal(new[] { 1, 2, 3, 4 }, cat.Manifestations.Select(m => m.Tier).Distinct().OrderBy(t => t).ToArray());
            foreach (var m in cat.Manifestations)
            {
                Assert.Contains(m.Cause, HorrorDirector.CauseIds);
                foreach (var lang in CreatureRules.Languages)
                {
                    Assert.False(string.IsNullOrWhiteSpace(m.Names[lang]) || string.IsNullOrWhiteSpace(m.Texts[lang]) || string.IsNullOrWhiteSpace(m.Witness[lang]), m.Id);
                    Assert.DoesNotContain("\u2014", m.Names[lang] + m.Texts[lang] + m.Witness[lang]);
                }
                Assert.Equal(m.Tier == 1 ? "warded" : m.Tier == 2 ? "avoided" : "witnessed", m.Ward);
            }
        }

        [Fact]
        public void Malformed_manifestation_data_names_the_entry()
        {
            string good = File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "creatures.json"));
            var ex = Assert.Throws<FormatException>(() => CreatureCatalog.Parse(good.Replace("\"cause\": \"nightfall\"", "\"cause\": \"boredom\"")));
            Assert.Contains("watcher_at_wall", ex.Message);
        }

        [Fact]
        public void No_tier_unlocks_before_its_condition()
        {
            var cat = Catalog();
            for (int seed = 1; seed <= 40; seed++)
            {
                foreach (var a in Over(0, seed, 6, cat)) Assert.Equal(1, a.Tier);
                foreach (var a in Over(1, seed, 6, cat)) Assert.True(a.Tier <= 2, a.DefId);
                foreach (var a in Over(2, seed, 6, cat)) Assert.True(a.Tier <= 3, a.DefId);
            }
        }

        [Fact]
        public void Every_tier_can_appear_once_its_condition_holds()
        {
            var cat = Catalog();
            var seen = new HashSet<int>();
            for (int seed = 1; seed <= 60; seed++) foreach (var a in Over(3, seed, 6, cat)) seen.Add(a.Tier);
            Assert.Equal(new[] { 1, 2, 3, 4 }, seen.OrderBy(t => t).ToArray());
        }

        [Fact]
        public void Appearances_come_in_tier_order_one_per_tier_per_phase()
        {
            var cat = Catalog();
            for (int seed = 1; seed <= 40; seed++)
                foreach (var p in new[] { DayPhase.Dusk, DayPhase.Night })
                {
                    var list = CreatureTiers.Select(Scenario(3, seed, Tick(1, p)), cat, null);
                    Assert.Equal(list.Select(a => a.Tier).OrderBy(t => t).ToList(), list.Select(a => a.Tier).ToList());
                    Assert.Equal(list.Count, list.Select(a => a.Tier).Distinct().Count());
                }
        }

        [Fact]
        public void Same_seed_gives_same_appearances_and_seeds_vary()
        {
            var cat = Catalog();
            string Key(int seed) => string.Join("|", Over(3, seed, 5, cat).Select(a => a.DefId + "@" + a.X + "," + a.Z));
            Assert.Equal(Key(7), Key(7));
            Assert.True(Enumerable.Range(1, 12).Select(Key).Distinct().Count() > 6);
        }

        [Fact]
        public void Tier_four_exposure_is_bounded_and_rests()
        {
            var cat = Catalog();
            var glimpses = new List<Appearance>();
            for (int seed = 1; seed <= 80; seed++) glimpses.AddRange(Over(3, seed, 4, cat).Where(a => a.Tier == 4));
            Assert.NotEmpty(glimpses);
            foreach (var g in glimpses)
            {
                Assert.InRange(g.Seconds, 0.1, CreatureTiers.MaxGlimpseSeconds);
                Assert.True(CreatureTiers.Visible(g, 0.0));
                Assert.False(CreatureTiers.Visible(g, CreatureTiers.MaxGlimpseSeconds));
                Assert.False(CreatureTiers.Visible(g, 60.0));
            }
            var c = Scenario(3, 1, Tick(2, DayPhase.Night));
            var def = cat.Manifestations.First(m => m.Tier == 4);
            Assert.True(CreatureTiers.Unlocked(def, c));
            c.LastGlimpseTick = c.Tick - 10;
            Assert.False(CreatureTiers.Unlocked(def, c));
            c.LastGlimpseTick = c.Tick - CreatureTiers.GlimpseCooldownTicks;
            Assert.True(CreatureTiers.Unlocked(def, c));
        }

        [Fact]
        public void Reduced_motion_is_still_and_shorter()
        {
            var cat = Catalog();
            for (int seed = 1; seed <= 60; seed++)
            {
                var normal = Over(3, seed, 4, cat);
                foreach (var a in normal) Assert.False(a.Still);
                var c = Scenario(3, seed, Tick(1, DayPhase.Night)); c.ReducedMotion = true;
                foreach (var a in CreatureTiers.Select(c, cat, null)) { Assert.True(a.Still); if (a.Tier == 4) Assert.Equal(CreatureTiers.GlimpseReducedSeconds, a.Seconds); }
            }
            Assert.True(CreatureTiers.GlimpseReducedSeconds < CreatureTiers.GlimpseSeconds);
        }

        [Fact]
        public void Every_appearance_has_a_cause_the_director_accepts()
        {
            var cat = Catalog();
            for (int seed = 1; seed <= 30; seed++)
                for (int sc = 0; sc < ScenarioNames.Length; sc++)
                    foreach (var a in Over(sc, seed, 4, cat))
                    {
                        Assert.False(string.IsNullOrEmpty(a.Cause));
                        Assert.True(HorrorDirector.CauseHolds(a.Cause, CreatureTiers.DirectorInputFor(Scenario(sc, seed, Tick(0, DayPhase.Night)))), a.DefId);
                    }
        }

        [Fact]
        public void Director_rejects_empty_unknown_idle_and_relief_causes()
        {
            var x = new DirectorInput { Tick = Tick(0, DayPhase.Night), Sanity = 1000 };
            Assert.False(HorrorDirector.CauseHolds("", x));
            Assert.False(HorrorDirector.CauseHolds("boredom", x));
            Assert.False(HorrorDirector.CauseHolds("omen_passed", x));
            Assert.False(HorrorDirector.CauseHolds("cult_exposure", x));
            Assert.False(HorrorDirector.CauseHolds("forbidden_knowledge", x));
            Assert.True(HorrorDirector.CauseHolds("nightfall", x));
            x.CultExposure = 250; x.Knowledge = 200;
            Assert.True(HorrorDirector.CauseHolds("cult_exposure", x));
            Assert.True(HorrorDirector.CauseHolds("forbidden_knowledge", x));
        }

        [Fact]
        public void A_cause_that_does_not_hold_drops_the_appearance_and_is_reported()
        {
            var cat = Catalog();
            var broken = new CreatureCatalog { Defs = cat.Defs, Manifestations = cat.Manifestations.Select(m => m.Tier != 1 ? m : Clone(m, "forbidden_knowledge")).ToList() };
            var rejected = new List<string>();
            int shown = 0;
            for (int seed = 1; seed <= 60; seed++) shown += CreatureTiers.Select(Scenario(0, seed, Tick(1, DayPhase.Night)), broken, null, rejected).Count;
            Assert.Equal(0, shown);
            Assert.NotEmpty(rejected);
            Assert.Contains("does not hold", rejected[0]);
        }

        private static ManifestationDef Clone(ManifestationDef m, string cause)
        {
            return new ManifestationDef { Id = m.Id, Tier = m.Tier, MinDread = m.MinDread, Phase = m.Phase, Society = m.Society, Knowledge = m.Knowledge, Omens = m.Omens, Context = m.Context, Chance = m.Chance, Cause = cause, Ward = m.Ward, Names = m.Names, Texts = m.Texts, Witness = m.Witness };
        }

        [Fact]
        public void Village_appearances_stay_out_of_places()
        {
            var cat = Catalog();
            var lib = VillagePlacesTests.Library();
            foreach (int seed in new[] { 1, 42, 1818 })
            {
                var places = VillagePlaces.PlaceAll(lib, seed, 24, 24);
                Assert.NotEmpty(places);
                foreach (var a in Over(3, seed, 8, cat, places).Where(a => a.PlaceId == "")) Assert.False(VillagePlaces.InsideAnyPlace(places, a.X, a.Z), a.DefId);
            }
        }

        [Fact]
        public void Place_appearances_need_a_place_and_village_ones_do_not_appear_in_one()
        {
            var cat = Catalog();
            foreach (var m in cat.Manifestations)
            {
                var village = Scenario(3, 1, Tick(1, DayPhase.Night));
                var inside = village; inside.PlaceId = "manor";
                if (m.Context == "place") { Assert.False(CreatureTiers.Unlocked(m, village)); Assert.True(CreatureTiers.Unlocked(m, inside)); }
                if (m.Context == "village") { Assert.True(CreatureTiers.Unlocked(m, village)); Assert.False(CreatureTiers.Unlocked(m, inside)); }
            }
        }

        [Fact]
        public void Warding_covers_tier_one_only_and_tiers_say_so_honestly()
        {
            foreach (int tier in new[] { 1, 2, 3, 4 })
            {
                var a = new Appearance { Tier = tier, Ward = tier == 1 ? "warded" : tier == 2 ? "avoided" : "witnessed" };
                foreach (var action in CreatureTiers.WardActions) Assert.Equal(tier == 1, CreatureTiers.WardTurns(a, action));
                Assert.False(CreatureTiers.WardTurns(a, "prayer"));
            }
        }

        [Fact]
        public void Witness_clues_add_a_board_card_but_no_knowledge()
        {
            var e = new InvestigationEvidence();
            e.ClueIds.Add(CreatureTiers.WitnessClueId("familiar_face"));
            Assert.Empty(InvestigationRules.KnowledgeSources(e));
            e.ClueIds.Add("book@b39");
            Assert.Single(InvestigationRules.KnowledgeSources(e));
        }

        [Fact]
        public void DoubledVillagerNeverCarriesANegativeSubjectOtherThanMinusOne()
        {
            var cat = Catalog();
            int doubled = 0;
            for (int seed = 1; seed <= 20; seed++)
                for (int day = 0; day < 8; day++)
                    foreach (DayPhase phase in new[] { DayPhase.Dawn, DayPhase.Day, DayPhase.Dusk, DayPhase.Night })
                    {
                        var c = Scenario(2, seed, Tick(day, phase));
                        c.CorruptedVillager = -5;
                        foreach (var a in CreatureTiers.Select(c, cat, null))
                        {
                            Assert.NotEqual(2, a.Tier);
                            if (a.DefId == "doubled_villager") { doubled++; Assert.Equal(-1, a.Subject); }
                        }
                    }
            Assert.True(doubled > 0, "the doubled villager must still appear without a corrupted villager");
        }

        [Fact]
        public void OnlyTierTwoRequiresACorruptedVillager()
        {
            var cat = Catalog();
            var c = Scenario(2, 1, Tick(0, DayPhase.Night));
            c.CorruptedVillager = -1;
            Assert.True(CreatureTiers.Unlocked(cat.Manifestations.First(d => d.Id == "doubled_villager"), c));
            foreach (var d in cat.Manifestations) if (d.Tier == 2) Assert.False(CreatureTiers.Unlocked(d, c), d.Id);
        }

        [Fact]
        public void HomesFallBackToAnOpenLatticePointWhenEveryRedrawIsBlocked()
        {
            var cat = Catalog();
            double w = 24 * VillageDressing.Cell;
            Func<double, double, bool> blocked = (x, z) => x >= w / 8.0;
            int checkedHomes = 0;
            for (int seed = 1; seed <= 40; seed++)
            {
                var enc = CreatureEncounter.Spawn(seed, 24, 24, GameClock.PhaseStart(DayPhase.Night) + 60, 1.0, "fog", cat, blocked);
                var again = CreatureEncounter.Spawn(seed, 24, 24, GameClock.PhaseStart(DayPhase.Night) + 60, 1.0, "fog", cat, blocked);
                for (int k = 0; k < enc.Creatures.Count; k++)
                {
                    Assert.Equal(enc.Creatures[k].HomeX, again.Creatures[k].HomeX);
                    Assert.Equal(enc.Creatures[k].HomeZ, again.Creatures[k].HomeZ);
                    var def = cat.Defs.First(d => d.Id == enc.Creatures[k].DefId);
                    if (def.Habitat != "fog") continue;
                    checkedHomes++;
                    Assert.False(blocked(enc.Creatures[k].HomeX, enc.Creatures[k].HomeZ), "seed " + seed + " " + def.Id);
                }
            }
            Assert.True(checkedHomes > 0);
        }
    }
}
