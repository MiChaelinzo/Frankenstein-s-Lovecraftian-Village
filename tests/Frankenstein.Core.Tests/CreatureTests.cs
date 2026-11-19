using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Creature data, seeded bounded spawns, exposure rules (range, line of sight) and the four counters: lantern, salt line, chalk sigil, flare.</summary>
    public class CreatureTests
    {
        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static CreatureCatalog Catalog() => CreatureCatalog.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "creatures.json")));
        private static ItemCatalog Items() => ItemCatalog.Parse(File.ReadAllText(Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "items.json")));
        private static readonly int Night = GameClock.PhaseStart(DayPhase.Night) + 60;

        private static CreatureEncounter One(string id, double x, double z)
        {
            var enc = CreatureEncounter.Spawn(1, 24, 24, Night, 1.0, "fog", Catalog(), null);
            enc.Creatures.RemoveAll(c => c.DefId != id);
            while (enc.Creatures.Count > 1) enc.Creatures.RemoveAt(1);
            var c0 = enc.Creatures[0];
            c0.HomeX = c0.X = x; c0.HomeZ = c0.Z = z;
            return enc;
        }

        [Fact]
        public void Data_file_is_complete_in_both_languages_without_em_dash()
        {
            var cat = Catalog();
            foreach (var id in new[] { "shore_crawler", "hollow_watcher", "deep_one", "cliff_flyer" }) Assert.NotNull(cat.Find(id));
            foreach (var d in cat.Defs)
                foreach (var lang in CreatureRules.Languages)
                {
                    Assert.InRange(d.Texts[lang].Length, 30, 240);
                    Assert.DoesNotContain("\u2014", d.Texts[lang]);
                    Assert.False(string.IsNullOrWhiteSpace(d.Names[lang]));
                }
            Assert.Throws<FormatException>(() => CreatureCatalog.Parse("{\"creatures\":[{\"id\":\"x1\",\"habitat\":\"moon\"}]}"));
            Assert.Throws<FormatException>(() => CreatureCatalog.Parse("{}"));
        }

        [Fact]
        public void Spawns_are_deterministic_bounded_and_follow_the_rules_of_each_kind()
        {
            var cat = Catalog();
            foreach (var seed in new[] { 1, 42, -7, 1818 })
            {
                var a = CreatureEncounter.Spawn(seed, 24, 24, Night, 1.0, "fog", cat, null);
                var b = CreatureEncounter.Spawn(seed, 24, 24, Night, 1.0, "fog", cat, null);
                Assert.Equal(a.Creatures.Select(a.Describe), b.Creatures.Select(b.Describe));
                Assert.InRange(a.Creatures.Count, 1, CreatureRules.MaxCreatures);
                foreach (var d in cat.Defs) Assert.True(a.Creatures.Count(c => c.DefId == d.Id) <= d.Max);
            }
            int day = GameClock.PhaseStart(DayPhase.Day) + 10;
            Assert.Empty(CreatureEncounter.Spawn(1, 24, 24, day, 1.0, "clear", cat, null).Creatures);
            var calmNight = CreatureEncounter.Spawn(1, 24, 24, Night, 0.0, "clear", cat, null);
            Assert.All(calmNight.Creatures, c => Assert.Equal("shore_crawler", c.DefId));
            Assert.DoesNotContain(CreatureEncounter.Spawn(1, 24, 24, Night, 0.5, "clear", cat, null).Creatures, c => c.DefId == "deep_one");
            Assert.Contains(CreatureEncounter.Spawn(1, 24, 24, Night, 0.8, "clear", cat, null).Creatures, c => c.DefId == "deep_one");
            Assert.Contains(CreatureEncounter.Spawn(1, 24, 24, day, 0.5, "fog", cat, null).Creatures, c => c.DefId == "hollow_watcher");
            Assert.DoesNotContain(CreatureEncounter.Spawn(1, 24, 24, day, 0.5, "clear", cat, null).Creatures, c => c.DefId == "hollow_watcher");
            var dusk = GameClock.PhaseStart(DayPhase.Dusk) + 5;
            Assert.Contains(CreatureEncounter.Spawn(1, 24, 24, dusk, 0.5, "clear", cat, null).Creatures, c => c.DefId == "cliff_flyer");
            Assert.NotEqual(string.Join("|", CreatureEncounter.Spawn(1, 24, 24, Night, 1.0, "fog", cat, null).Creatures.Select(c => c.HomeX)), string.Join("|", CreatureEncounter.Spawn(42, 24, 24, Night, 1.0, "fog", cat, null).Creatures.Select(c => c.HomeX)));
            Assert.Empty(CreatureEncounter.Spawn(1, 0, 0, Night, 1.0, "fog", cat, null).Creatures);
        }

        [Fact]
        public void More_dread_never_removes_a_creature_and_watchers_avoid_blocked_ground()
        {
            var cat = Catalog();
            var low = CreatureEncounter.Spawn(1, 24, 24, Night, 0.2, "fog", cat, null);
            var high = CreatureEncounter.Spawn(1, 24, 24, Night, 1.0, "fog", cat, null);
            foreach (var c in low.Creatures) Assert.Contains(high.Creatures, h => h.DefId == c.DefId && h.HomeX == c.HomeX && h.HomeZ == c.HomeZ);
            var layout = VillageLayoutGenerator.Generate(GoldenParity.LoadCatalog(Root()), 24, 24, 40, 1818);
            var solids = LoreBookRules.SolidProps(LoreBookRules.AllDressing(1818, 24, 24, layout));
            Func<double, double, bool> blocked = (x, z) => LoreBookRules.IsBlocked(x, z, layout, solids, 1818, 24, 24);
            foreach (var w in CreatureEncounter.Spawn(1818, 24, 24, Night, 1.0, "fog", cat, blocked).Creatures.Where(c => c.DefId == "hollow_watcher")) Assert.False(blocked(w.HomeX, w.HomeZ));
        }

        [Fact]
        public void Drain_needs_range_and_line_of_sight()
        {
            var enc = One("hollow_watcher", 50, 50);
            var def = Catalog().Find("hollow_watcher");
            var near = enc.Step(1.0, 50 + 8, 50, Night, 0, null);
            Assert.True(near.Drain > 0 && near.Drain <= def.Drain);
            enc = One("hollow_watcher", 50, 50);
            Assert.Equal(0.0, enc.Step(1.0, 50 + def.Hunt + def.Range + 5, 50, Night, 0, null).Drain);
            enc = One("hollow_watcher", 50, 50);
            Func<double, double, bool> wall = (x, z) => x > 53 && x < 55;
            Assert.Equal(0.0, enc.Step(1.0, 50 + 8, 50, Night, 0, wall).Drain);
            Assert.False(CreatureEncounter.HasLineOfSight(50, 50, 58, 50, wall));
            Assert.True(CreatureEncounter.HasLineOfSight(50, 50, 58, 50, null));
            Assert.True(CreatureEncounter.HasLineOfSight(50, 50, 58, 50, (x, z) => x > 57.5 && x < 60)); // ends are not sampled
            var flyer = One("cliff_flyer", 0, 0);
            Assert.True(flyer.Step(1.0, 10, 0, Night, 0, null).Drain > 0);
            Assert.Equal(0.0, One("cliff_flyer", 0, 0).Step(1.0, 10, 0, Night, 0, wall = (x, z) => x > 3 && x < 5).Drain);
            Assert.Equal(0.0, enc.Step(0.0, 0, 0, Night, 0, null).Drain);
        }

        [Fact]
        public void Drain_is_capped_and_never_takes_sanity_below_zero()
        {
            var enc = CreatureEncounter.Spawn(1, 24, 24, Night, 1.0, "fog", Catalog(), null);
            foreach (var c in enc.Creatures) { c.X = c.HomeX = 10; c.Z = c.HomeZ = 10; }
            var r = enc.Step(1.0, 10.5, 10, Night, 0, null);
            Assert.True(r.Drain <= CreatureRules.MaxDrainPerSecond + 1e-9);
            var s = new SanityModel(1f);
            s.Apply((float)-r.Drain);
            Assert.True(s.Value >= 0f);
        }

        [Fact]
        public void Lantern_pushes_a_creature_back_burns_fuel_and_stops_the_drain()
        {
            var enc = One("shore_crawler", 50, 50);
            var r = enc.Step(1.0, 54, 50, Night, 50, null);
            Assert.True(r.Pushed);
            Assert.Equal(0.0, r.Drain);
            Assert.True(enc.Creatures[0].X < 50.0);
            int burned = 0;
            for (int i = 0; i < 6; i++) burned += enc.Step(1.0, 54, 50, Night, 50, null).FuelBurn;
            Assert.InRange(burned, 1, 5);
            var dry = One("shore_crawler", 50, 50);
            var d = dry.Step(1.0, 54, 50, Night, 0, null);
            Assert.False(d.Pushed);
            Assert.True(d.Drain > 0);
            Assert.Equal(0, d.FuelBurn);
        }

        [Fact]
        public void Salt_line_blocks_the_path_and_the_gaze_and_costs_one_salt()
        {
            var items = Items();
            var inv = new Inventory(12);
            inv.Add(items, "salt", 2);
            var enc = One("shore_crawler", 50, 50);
            Assert.Equal("", enc.PlaceSalt(inv, 58, 50, -1, 0, Night));
            Assert.Equal(1, inv.Count("salt"));
            Assert.True(enc.SaltBetween(50, 50, 58, 50));
            for (int i = 0; i < 20; i++) Assert.Equal(0.0, enc.Step(0.5, 58, 50, Night, 0, null).Drain);
            Assert.True(enc.Creatures[0].X < 56.5, "the creature stays on its side of the salt");
            Assert.Equal(0, ItemCountAfterTwoMore(inv, enc));
            var open = One("shore_crawler", 50, 50);
            Assert.True(open.Step(0.5, 58, 50, Night, 0, null).Drain > 0);
        }

        private static int ItemCountAfterTwoMore(Inventory inv, CreatureEncounter enc)
        {
            Assert.Equal("", enc.PlaceSalt(inv, 0, 0, 0, 0, Night));
            Assert.Equal("missing", enc.PlaceSalt(inv, 0, 0, 0, 1, Night));
            return inv.Count("salt");
        }

        [Fact]
        public void Chalk_sigil_repels_creatures_and_shelters_the_player_until_it_fades()
        {
            var items = Items();
            var inv = new Inventory(12);
            inv.Add(items, "sigil_chalk", 1);
            var enc = One("shore_crawler", 50, 50);
            Assert.Equal("", enc.PlaceSigil(inv, 55, 50, Night));
            Assert.Equal("missing", enc.PlaceSigil(inv, 55, 50, Night));
            for (int i = 0; i < 30; i++) Assert.Equal(0.0, enc.Step(0.5, 55, 50, Night, 0, null).Drain);
            Assert.True(CreatureEncounter.Dist(enc.Creatures[0].X, enc.Creatures[0].Z, 55, 50) >= CreatureRules.SigilRadius - 1e-6);
            Assert.True(enc.Step(0.5, 55 + CreatureRules.SigilRadius + 6, 50, Night + CreatureRules.SigilMinutes, 0, null).Drain >= 0);
            Assert.Empty(enc.Wards);
        }

        [Fact]
        public void Flare_is_a_costly_last_resort_with_a_cooldown()
        {
            var inv = new Inventory(12);
            var enc = One("deep_one", 50, 50);
            Assert.Equal("", enc.UseFlare(inv, Night));
            Assert.Equal(ItemRules.FuelStart - CreatureRules.FlareFuelCost, inv.Fuel);
            Assert.Equal("cooldown", enc.UseFlare(inv, Night + 1));
            Assert.True(enc.FlareActive(Night + 1));
            Assert.False(enc.FlareActive(Night + CreatureRules.FlareMinutes));
            var r = enc.Step(1.0, 50 + 12, 50, Night + 1, 0, null);
            Assert.True(r.Pushed);
            Assert.Equal(0.0, r.Drain);
            inv.Fuel = 5;
            Assert.Equal("fuel", enc.UseFlare(inv, Night + CreatureRules.FlareCooldownMinutes));
            Assert.Equal(5, inv.Fuel);
        }

        [Fact]
        public void Telegraph_rises_as_a_creature_nears_and_creatures_stay_on_their_leash()
        {
            var enc = One("shore_crawler", 50, 50);
            double far = enc.Step(0.1, 50 + 29, 50, Night, 0, null).Telegraph;
            enc = One("shore_crawler", 50, 50);
            double near = enc.Step(0.1, 50 + 6, 50, Night, 0, null).Telegraph;
            Assert.InRange(far, 0.0, 0.2);
            Assert.True(near > far);
            for (int i = 0; i < 400; i++) enc.Step(0.5, 50 + 15, 50 + (i % 2), Night, 0, null);
            Assert.True(CreatureEncounter.Dist(enc.Creatures[0].X, enc.Creatures[0].Z, 50, 50) <= CreatureRules.Leash + 1e-6);
        }
    }
}
