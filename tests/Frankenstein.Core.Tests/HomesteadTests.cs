using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Homestead data, plot search, crop growth by village day, needs and mood, harvest and produce into the inventory, save round trip.</summary>
    public class HomesteadTests
    {
        private static readonly int[] Seeds = { 1, 42, -7, 1818, 123456789 };

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string Data(string name) => Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", name);
        private static ItemCatalog Items() => ItemCatalog.Parse(File.ReadAllText(Data("items.json")));
        private static HomesteadCatalog Catalog() => HomesteadCatalog.Parse(File.ReadAllText(Data("homestead.json")), Items());

        private static Homestead Village(int seed, int grid, out Inventory player)
        {
            var cat = GoldenParity.LoadCatalog(Root());
            var layout = VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
            var world = ItemWorld.Create(seed, grid, grid, layout, Items());
            player = new Inventory(ItemRules.PlayerSlots);
            return new Homestead(Catalog(), HomesteadPlot.Create(seed, grid, grid, layout, world));
        }

        private static Homestead Ready(out Inventory player, int tick = 0)
        {
            var h = Village(1818, 24, out player);
            Assert.True(h.Available);
            Assert.True(h.Claim(tick, player, Items()).Ok);
            return h;
        }

        [Fact]
        public void Data_file_is_complete_in_both_languages_with_no_em_dash_and_matches_the_web_copy()
        {
            var cat = Catalog();
            foreach (var id in new[] { "turnip", "cabbage", "glowcap", "kelp", "eyeroot" }) Assert.NotNull(cat.FindCrop(id));
            foreach (var id in new[] { "fence", "trough", "scarecrow", "coop" }) Assert.NotNull(cat.FindStructure(id));
            foreach (var id in new[] { "chicken", "goat", "cat", "lantern_moth", "tide_hound", "jar_tentacle" }) Assert.NotNull(cat.FindResident(id));
            Assert.Contains(cat.Crops, c => c.Kind == "normal");
            Assert.Equal(3, cat.Crops.Count(c => c.Kind == "eldritch"));
            Assert.Equal(3, cat.Residents.Count(r => r.Group == "pet"));
            var texts = cat.Crops.SelectMany(c => c.Texts.Values).Concat(cat.Structures.SelectMany(s => s.Texts.Values)).Concat(cat.Residents.SelectMany(r => r.Texts.Values));
            foreach (var t in texts) { Assert.InRange(t.Length, 30, 240); Assert.DoesNotContain('\u2014', t); }
            Assert.Equal(File.ReadAllText(Data("homestead.json")), File.ReadAllText(Path.Combine(Root(), "web", "data", "homestead.json")));
        }

        [Fact]
        public void Malformed_data_names_the_offending_entry()
        {
            var items = Items();
            Assert.Throws<FormatException>(() => HomesteadCatalog.Parse("{}", items));
            var good = File.ReadAllText(Data("homestead.json"));
            var ex = Assert.Throws<FormatException>(() => HomesteadCatalog.Parse(good.Replace("\"seed\": \"seed_kelp\"", "\"seed\": \"nope\""), items));
            Assert.Contains("kelp", ex.Message);
            ex = Assert.Throws<FormatException>(() => HomesteadCatalog.Parse(good.Replace("\"shelter\": \"trough\"", "\"shelter\": \"moat\""), items));
            Assert.Contains("jar_tentacle", ex.Message);
        }

        [Fact]
        public void Every_golden_village_has_a_free_plot_beside_the_lodging_house_and_it_is_repeatable()
        {
            foreach (var seed in Seeds)
                foreach (var grid in new[] { 24, 16 })
                {
                    var a = Village(seed, grid, out _);
                    var b = Village(seed, grid, out _);
                    Assert.True(a.Plot.Exists, $"{seed}/{grid}");
                    Assert.Equal(HomesteadRules.BedCount, a.Plot.Beds.Count);
                    Assert.Equal(HomesteadRules.StructureSlots, a.Plot.Slots.Count);
                    Assert.Equal(a.Plot.Beds.Select(p => p[0] + "," + p[1]), b.Plot.Beds.Select(p => p[0] + "," + p[1]));
                }
        }

        [Fact]
        public void Nothing_works_before_the_plot_is_claimed_and_claim_needs_room()
        {
            var h = Village(1818, 24, out var player);
            Assert.Equal("unclaimed", h.Plant(0, "turnip", 0, player).Reason);
            Assert.Equal("unclaimed", h.Build("fence", player).Reason);
            Assert.Equal("unclaimed", h.Feed("cat", 0, player).Reason);
            var crowded = new Inventory(1);
            Assert.Equal("full", h.Claim(0, crowded, Items()).Reason);
            Assert.False(h.Claimed);
            Assert.Empty(crowded.Slots.Where(s => s.Id == "timber"));
            Assert.True(h.Claim(0, player, Items()).Ok);
            Assert.Equal("claimed", h.Claim(0, player, Items()).Reason);
            Assert.Equal(4, player.Count("timber"));
        }

        [Fact]
        public void Crops_grow_by_village_day_and_not_by_the_clock_inside_a_day()
        {
            var h = Ready(out var player);
            int start = GameClock.SessionStartTick;
            Assert.True(h.Plant(0, "turnip", start, player).Ok);
            Assert.Equal(HomesteadRules.StagePlanted, h.StageOf(0, start));
            Assert.Equal(HomesteadRules.StagePlanted, h.StageOf(0, start + 100));
            int dayLater = start + GameClock.MinutesPerDay;
            Assert.Equal(HomesteadRules.StageSprout, h.StageOf(0, dayLater));
            Assert.Equal(HomesteadRules.StageRipe, h.StageOf(0, start + 2 * GameClock.MinutesPerDay));
            Assert.Equal(-1, h.StageOf(1, start));
            Assert.Equal("occupied", h.Plant(0, "cabbage", start, player).Reason);
            Assert.Equal("bed", h.Plant(99, "cabbage", start, player).Reason);
            Assert.Equal("unknown", h.Plant(1, "weed", start, player).Reason);
            Assert.Equal("noseed", h.Plant(1, "eyeroot", start, player).Reason);
        }

        [Fact]
        public void Harvest_adds_the_crop_and_a_seed_to_the_inventory_and_empties_the_bed()
        {
            var items = Items();
            var h = Ready(out var player);
            int start = GameClock.SessionStartTick;
            h.Plant(0, "turnip", start, player);
            Assert.Equal("growing", h.Harvest(0, start, 0, player, items).Reason);
            Assert.Equal("empty", h.Harvest(1, start, 0, player, items).Reason);
            int seedsBefore = player.Count("seed_turnip"), ripe = start + 2 * GameClock.MinutesPerDay;
            var r = h.Harvest(0, ripe, 0, player, items);
            Assert.True(r.Ok);
            Assert.Equal(2, r.Count);
            Assert.Equal(2, player.Count("turnip"));
            Assert.Equal(seedsBefore + 1, player.Count("seed_turnip"));
            Assert.Equal(-1, h.StageOf(0, ripe));
        }

        [Fact]
        public void Harvest_refuses_without_room_and_changes_nothing()
        {
            var items = Items();
            var h = Ready(out var player);
            int start = GameClock.SessionStartTick;
            h.Plant(0, "turnip", start, player);
            int i = 0;
            while (player.Slots.Count < player.Capacity) player.Add(items, i++ % 2 == 0 ? "bread" : "tea", 1 + 99);
            player.Slots.RemoveAll(s => s.Id == "seed_turnip");
            var before = player.SlotsText();
            var r = h.Harvest(0, start + 2 * GameClock.MinutesPerDay, 0, player, items);
            Assert.Equal("full", r.Reason);
            Assert.Equal(before, player.SlotsText());
            Assert.Equal("turnip", h.Beds[0].CropId);
        }

        [Fact]
        public void Dread_thins_plain_crops_unless_a_scarecrow_stands_and_feeds_eldritch_crops()
        {
            var h = Ready(out var player);
            var turnip = h.Catalog.FindCrop("turnip");
            var kelp = h.Catalog.FindCrop("kelp");
            Assert.Equal(2, h.YieldAt(turnip, HomesteadRules.BlightLevel - 1));
            Assert.Equal(1, h.YieldAt(turnip, HomesteadRules.BlightLevel));
            Assert.Equal(2, h.YieldAt(kelp, HomesteadRules.BlightLevel - 1));
            Assert.Equal(3, h.YieldAt(kelp, HomesteadRules.BlightLevel));
            Assert.True(h.Build("scarecrow", player).Ok);
            Assert.Equal(2, h.YieldAt(turnip, CorruptionGrowth.Levels));
        }

        [Fact]
        public void Structures_cost_timber_once_each()
        {
            var h = Ready(out var player);
            Assert.True(h.Build("fence", player).Ok);
            Assert.Equal("built", h.Build("fence", player).Reason);
            Assert.True(h.Build("coop", player).Ok);
            Assert.Equal(1, player.Count("timber"));
            Assert.Equal("notimber", h.Build("scarecrow", player).Reason);
            Assert.Equal("unknown", h.Build("tower", player).Reason);
        }

        [Fact]
        public void Feeding_adopts_then_needs_fall_with_village_time_and_a_trough_adds_a_day()
        {
            var items = Items();
            var h = Ready(out var player);
            player.Add(items, "turnip", 3);
            int t = GameClock.SessionStartTick;
            var chicken = h.Catalog.FindResident("chicken");
            Assert.Equal("notowned", h.Collect("chicken", t, player, items).Reason);
            var adopt = h.Feed("chicken", t, player);
            Assert.True(adopt.Ok);
            Assert.Equal(1, adopt.Count);
            Assert.Equal("full", h.Feed("chicken", t, player).Reason);
            Assert.Equal(100, h.FedPercent(chicken, t, t));
            Assert.Equal(50, h.FedPercent(chicken, t, t + GameClock.MinutesPerDay));
            Assert.Equal(0, h.FedPercent(chicken, t, t + 5 * GameClock.MinutesPerDay));
            h.Build("trough", player);
            Assert.Equal(67, h.FedPercent(chicken, t, t + GameClock.MinutesPerDay));
            Assert.Equal("nofood", h.Feed("goat", t, player).Reason);
            Assert.Equal("unknown", h.Feed("dragon", t, player).Reason);
        }

        [Fact]
        public void Mood_follows_food_shelter_and_the_blight_and_is_deterministic()
        {
            var items = Items();
            var h = Ready(out var player);
            player.Add(items, "glowcap", 1);
            int t = GameClock.SessionStartTick;
            var moth = h.Catalog.FindResident("lantern_moth");
            h.Feed("lantern_moth", t, player);
            Assert.Equal("uneasy", h.Mood(moth, t, t, 0));      // fed, no coop
            Assert.Equal("distressed", h.Mood(moth, t, t, HomesteadRules.BlightLevel)); // fed, no coop, village afraid
            h.Build("coop", player);
            Assert.Equal("content", h.Mood(moth, t, t, HomesteadRules.BlightLevel));
            Assert.Equal("uneasy", h.Mood(moth, t, t + 5 * GameClock.MinutesPerDay, 0)); // starving but housed
            Assert.Equal(h.Mood(moth, t, t + 77, 2), h.Mood(moth, t, t + 77, 2));
        }

        [Fact]
        public void Daily_sanity_applies_once_per_day_with_a_cap_and_follows_mood()
        {
            var items = Items();
            var h = Ready(out var player, GameClock.SessionStartTick);
            player.Add(items, "kelp", 1);
            player.Add(items, "glowcap", 1);
            player.Add(items, "dried_fish", 2);
            int t = GameClock.SessionStartTick;
            Assert.Equal(0, h.DailySanity(t, 0));
            h.Feed("jar_tentacle", t, player); h.Feed("lantern_moth", t, player); h.Feed("tide_hound", t, player);
            int next = t + GameClock.MinutesPerDay - 60;
            Assert.Equal(-HomesteadRules.DailySanityCap, h.DailySanity(next, HomesteadRules.BlightLevel)); // 3 unhoused pets, all distressed, capped
            Assert.Equal(0, h.DailySanity(next, HomesteadRules.BlightLevel));
            h.Build("coop", player); h.Build("fence", player);
            int later = next + GameClock.MinutesPerDay;
            Assert.Equal(2 + 2 - 3, h.DailySanity(later, 0)); // moth and hound content (housed), tentacle starving and without its trough distressed
        }

        [Fact]
        public void Produce_needs_shelter_and_food_and_goes_to_the_inventory()
        {
            var items = Items();
            var h = Ready(out var player);
            player.Add(items, "turnip", 2);
            int t = GameClock.SessionStartTick, day = GameClock.MinutesPerDay;
            h.Feed("chicken", t, player);
            Assert.Equal("notready", h.Collect("chicken", t + day, player, items).Reason);
            h.Build("coop", player);
            Assert.Equal("notready", h.Collect("chicken", t, player, items).Reason);
            var r = h.Collect("chicken", t + day, player, items);
            Assert.True(r.Ok);
            Assert.Equal(1, r.Count);
            Assert.Equal(1, player.Count("egg"));
            Assert.Equal("notready", h.Collect("chicken", t + day, player, items).Reason);
            Assert.Equal(3, h.ProduceReady(h.Catalog.FindResident("chicken"), new ResidentState { DefId = "chicken", FedTick = t + 9 * day, CollectDay = 0 }, t + 9 * day));
            Assert.Equal("noproduce", AdoptCat(h, player, items, t).Reason);
        }

        private static HomesteadResult AdoptCat(Homestead h, Inventory player, ItemCatalog items, int t)
        {
            player.Add(items, "dried_fish", 1);
            h.Feed("cat", t, player);
            return h.Collect("cat", t, player, items);
        }

        [Fact]
        public void Save_string_round_trips_and_rejects_bad_input_without_changing_anything()
        {
            var items = Items();
            var h = Ready(out var player);
            player.Add(items, "turnip", 1);
            int t = GameClock.SessionStartTick;
            h.Plant(2, "glowcap", t, player);
            h.Build("coop", player);
            h.Feed("chicken", t, player);
            var text = h.Serialize();
            Assert.StartsWith("hs1;1;", text);
            var other = Village(1818, 24, out _);
            Assert.True(other.TryRestore(text));
            Assert.Equal(text, other.Serialize());
            var before = other.Serialize();
            foreach (var bad in new[] { "", "hs2;1;0;-,-,-,-,-,-;;", "hs1;1;0;-,-;;", "hs1;1;0;nope.1,-,-,-,-,-;;", "hs1;1;0;-,-,-,-,-,-;moat;", "hs1;1;0;-,-,-,-,-,-;;dragon.1.1", "hs1;1;-3;-,-,-,-,-,-;;", "hs1;1;999999999999;-,-,-,-,-,-;;", "hs1;1;0;-,-,-,-,-,-;coop.coop;", "hs1;1;0;-,-,-,-,-,-;;cat.1.1,cat.2.2" })
                Assert.False(other.TryRestore(bad), bad);
            Assert.Equal(before, other.Serialize());
        }

        [Fact]
        public void Plot_edge_corruption_grows_with_the_level_and_never_exceeds_full_size()
        {
            int prev = 0;
            for (int level = 0; level <= CorruptionGrowth.Levels; level++)
            {
                var g = CorruptionGrowth.GrowPlotEdge(10, 20, 1, 0, 0, 1, level);
                Assert.True(g.Count >= prev);
                prev = g.Count;
                foreach (var it in g) Assert.InRange(it.Scale, CorruptionGrowth.FirstScale, 1.0);
            }
            Assert.False(CorruptionGrowth.GrowPlotEdge(10, 20, 1, 0, 0, 1, 0).Any());
            Assert.Equal(CorruptionGrowth.PlotEdgeOffsets().Length, CorruptionGrowth.GrowPlotEdge(10, 20, 1, 0, 0, 1, CorruptionGrowth.Levels).Count);
        }
    }
}
