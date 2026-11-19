using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Item data, inventory slots and stacking, use effects, seeded spawns and chests, save round trip.</summary>
    public class ItemTests
    {
        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string PackagePath() => Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "items.json");
        private static ItemCatalog Catalog() => ItemCatalog.Parse(File.ReadAllText(PackagePath()));

        private static List<PlacedPiece> Layout(int seed, int grid)
        {
            var cat = GoldenParity.LoadCatalog(Root());
            return VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
        }

        [Fact]
        public void Data_file_has_the_required_items_in_both_languages_and_no_em_dash()
        {
            var cat = Catalog();
            foreach (var id in new[] { "lantern_oil", "salt", "candles", "bread", "dried_fish", "tea", "herbs", "sigil_chalk" }) Assert.NotNull(cat.Find(id));
            foreach (var kind in new[] { "key", "letter", "trinket" }) Assert.Contains(cat.Items, d => d.Kind == kind);
            foreach (var d in cat.Items)
                foreach (var lang in ItemRules.Languages)
                {
                    Assert.False(string.IsNullOrWhiteSpace(d.Names[lang]), d.Id);
                    Assert.InRange(d.Texts[lang].Length, 30, 240);
                    Assert.DoesNotContain("\u2014", d.Texts[lang]);
                }
            foreach (var id in ItemRules.LodgingStock) Assert.NotNull(cat.Find(id));
        }

        [Fact]
        public void Web_copy_of_the_data_file_is_identical()
        {
            Assert.Equal(File.ReadAllText(PackagePath()), File.ReadAllText(Path.Combine(Root(), "web", "data", "items.json")));
        }

        [Fact]
        public void Malformed_data_is_rejected_with_the_item_named()
        {
            Assert.Throws<FormatException>(() => ItemCatalog.Parse("{}"));
            var ex = Assert.Throws<FormatException>(() => ItemCatalog.Parse("{\"items\":[{\"id\":\"x1\",\"kind\":\"moon\"}]}"));
            Assert.Contains("x1", ex.Message);
        }

        [Fact]
        public void Add_stacks_then_fills_slots_and_reports_what_fit()
        {
            var cat = Catalog();
            var inv = new Inventory(2);
            Assert.Equal(5, inv.Add(cat, "bread", 5));
            Assert.Single(inv.Slots);
            Assert.Equal(5, inv.Add(cat, "bread", 5)); // stack of 5: the second slot takes it
            Assert.Equal(0, inv.Add(cat, "tea", 1)); // both slots full
            Assert.Equal(10, inv.Count("bread"));
            Assert.Equal(0, inv.Add(cat, "nothing", 1));
            Assert.Equal(0, inv.Add(cat, "bread", -2));
        }

        [Fact]
        public void Remove_takes_last_stacks_first_and_never_goes_negative()
        {
            var cat = Catalog();
            var inv = new Inventory(4);
            inv.Add(cat, "bread", 7);
            Assert.Equal(3, inv.Remove("bread", 3));
            Assert.Equal(4, inv.Count("bread"));
            Assert.Equal(4, inv.Remove("bread", 99));
            Assert.Empty(inv.Slots);
            Assert.Equal(0, inv.Remove("bread", 1));
        }

        [Fact]
        public void Move_is_limited_by_stock_and_room()
        {
            var cat = Catalog();
            var a = new Inventory(4); var b = new Inventory(1);
            a.Add(cat, "bread", 8);
            Assert.Equal(5, Inventory.Move(cat, a, b, "bread", 8));
            Assert.Equal(3, a.Count("bread"));
            Assert.Equal(0, Inventory.Move(cat, a, b, "bread", 1));
        }

        [Fact]
        public void Food_restores_sanity_through_the_sanity_model_and_is_consumed()
        {
            var cat = Catalog();
            var inv = new Inventory(4);
            inv.Add(cat, "bread", 2);
            var sanity = new SanityModel(50f);
            var r = inv.Use(cat, "bread", sanity);
            Assert.True(r.Used);
            Assert.Equal(cat.Find("bread").Amount, r.SanityDelta);
            Assert.Equal(50f + cat.Find("bread").Amount, sanity.Value);
            Assert.Equal(1, inv.Count("bread"));
        }

        [Fact]
        public void Use_is_refused_with_a_reason_and_keeps_the_item()
        {
            var cat = Catalog();
            var inv = new Inventory(4);
            inv.Add(cat, "bread", 1); inv.Add(cat, "salt", 1); inv.Add(cat, "gull_charm", 1);
            Assert.Equal("full", inv.Use(cat, "bread", new SanityModel(100f)).Reason);
            Assert.Equal("ward", inv.Use(cat, "salt", new SanityModel(10f)).Reason);
            Assert.Equal("none", inv.Use(cat, "gull_charm", new SanityModel(10f)).Reason);
            Assert.Equal("missing", inv.Use(cat, "tea", new SanityModel(10f)).Reason);
            Assert.Equal("unknown", inv.Use(cat, "zzz", new SanityModel(10f)).Reason);
            Assert.Equal(1, inv.Count("bread")); Assert.Equal(1, inv.Count("salt"));
        }

        [Fact]
        public void Oil_refills_the_lantern_up_to_the_maximum_and_candles_burn_fuel()
        {
            var cat = Catalog();
            var inv = new Inventory(4);
            inv.Add(cat, "lantern_oil", 3);
            inv.Fuel = 50;
            var r = inv.Use(cat, "lantern_oil", null);
            Assert.True(r.Used);
            Assert.Equal(90, inv.Fuel);
            Assert.Equal(40, r.FuelDelta);
            inv.Use(cat, "lantern_oil", null);
            Assert.Equal(ItemRules.FuelMax, inv.Fuel);
            Assert.Equal("full", inv.Use(cat, "lantern_oil", null).Reason);
            Assert.Equal(1, inv.Count("lantern_oil"));
            inv.BurnFuel(ItemRules.CandleFuelCost);
            Assert.Equal(ItemRules.FuelMax - ItemRules.CandleFuelCost, inv.Fuel);
            inv.BurnFuel(1000);
            Assert.Equal(0, inv.Fuel);
        }

        [Fact]
        public void Sleep_is_for_dusk_and_night_and_ends_at_the_next_dawn()
        {
            Assert.False(ItemWorld.CanSleep(GameClock.PhaseStart(DayPhase.Day) + 5));
            Assert.False(ItemWorld.CanSleep(GameClock.PhaseStart(DayPhase.Dawn)));
            Assert.True(ItemWorld.CanSleep(GameClock.SessionStartTick));
            Assert.True(ItemWorld.CanSleep(GameClock.PhaseStart(DayPhase.Night) + 100));
            int night = GameClock.PhaseStart(DayPhase.Night) + 100;
            Assert.Equal(DayPhase.Dawn, GameClock.PhaseAt(night + ItemWorld.MinutesToMorning(night)));
            Assert.Equal(0, GameClock.Wrap(night + ItemWorld.MinutesToMorning(night)));
        }

        [Fact]
        public void Same_seed_gives_identical_items_and_chests_and_they_stay_on_free_ground()
        {
            var cat = Catalog();
            foreach (var seed in new[] { 1, 42, -7, 1818 })
            {
                var layout = Layout(seed, 24);
                var a = ItemWorld.Create(seed, 24, 24, layout, cat);
                var b = ItemWorld.Create(seed, 24, 24, layout, cat);
                Assert.Equal(a.Serialize(new Inventory(ItemRules.PlayerSlots)), b.Serialize(new Inventory(ItemRules.PlayerSlots)));
                Assert.Equal(a.Ground.Select(g => g.ItemId + "@" + g.X + "," + g.Z), b.Ground.Select(g => g.ItemId + "@" + g.X + "," + g.Z));
                Assert.NotNull(a.Lodging);
                Assert.InRange(a.Ground.Count, 1, ItemRules.GroundCount);
                Assert.InRange(a.Chests.Count, 1, 1 + ItemRules.FoundChests);
                var solids = LoreBookRules.SolidProps(LoreBookRules.AllDressing(seed, 24, 24, layout));
                foreach (var g in a.Ground) Assert.False(LoreBookRules.IsBlocked(g.X, g.Z, layout, solids, seed, 24, 24));
                foreach (var c in a.Chests) Assert.False(LoreBookRules.IsBlocked(c.X, c.Z, layout, solids, seed, 24, 24));
                foreach (var g in a.Ground) Assert.True(cat.Find(g.ItemId).Stack > 1 || a.Ground.Count(o => o.ItemId == g.ItemId) == 1);
                foreach (var id in ItemRules.LodgingStock) Assert.True(a.Lodging.Contents.Count(id) >= 1);
            }
        }

        [Fact]
        public void Different_seeds_give_different_placements()
        {
            var cat = Catalog();
            var a = ItemWorld.Create(1, 24, 24, Layout(1, 24), cat);
            var b = ItemWorld.Create(42, 24, 24, Layout(42, 24), cat);
            Assert.NotEqual(string.Join("|", a.Ground.Select(g => g.ItemId + g.X)), string.Join("|", b.Ground.Select(g => g.ItemId + g.X)));
        }

        [Fact]
        public void Pickup_moves_the_item_once_and_refuses_when_full()
        {
            var cat = Catalog();
            var world = ItemWorld.Create(1818, 24, 24, Layout(1818, 24), cat);
            var player = new Inventory(ItemRules.PlayerSlots);
            var s = world.Ground[0];
            Assert.Equal(s.Count, world.PickUp(0, player, cat));
            Assert.Equal(s.Count, player.Count(s.ItemId));
            Assert.Equal(0, world.PickUp(0, player, cat));
            Assert.Equal(0, world.PickUp(-1, player, cat));
            Assert.Equal(0, world.PickUp(999, player, cat));
            var tiny = new Inventory(0);
            Assert.Equal(0, world.PickUp(1, tiny, cat));
            Assert.DoesNotContain(1, world.Picked);
        }

        [Fact]
        public void Save_round_trips_and_rejects_foreign_state()
        {
            var cat = Catalog();
            var layout = Layout(1818, 24);
            var world = ItemWorld.Create(1818, 24, 24, layout, cat);
            var player = new Inventory(ItemRules.PlayerSlots);
            world.PickUp(0, player, cat);
            Inventory.Move(cat, world.Lodging.Contents, player, "tea", 1);
            player.Fuel = 33;
            string text = world.Serialize(player);
            var fresh = ItemWorld.Create(1818, 24, 24, layout, cat);
            var player2 = new Inventory(ItemRules.PlayerSlots);
            Assert.True(fresh.TryRestore(text, player2, cat));
            Assert.Equal(text, fresh.Serialize(player2));
            Assert.Equal(33, player2.Fuel);
            Assert.False(fresh.TryRestore("inv1;50;zzz:1;;", player2, cat));
            Assert.False(fresh.TryRestore("inv1;500;;;", player2, cat));
            Assert.False(fresh.TryRestore("", player2, cat));
            Assert.False(fresh.TryRestore("inv1;50;bread:99;;" + string.Join("/", fresh.Chests.Select(c => "")), player2, cat));
            Assert.Equal(text, fresh.Serialize(player2)); // a refused restore changes nothing
        }
    }
}
