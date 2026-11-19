using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>The name rule: seeded, unique per village, the same for every language, and the data file has no drift.</summary>
    public class VillageNamesTests
    {
        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string PackagePath() => Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "names.json");
        private static NameLibrary Library() => NameLibrary.Parse(File.ReadAllText(PackagePath()));

        private static PrefabCatalog Catalog() => GoldenParity.LoadCatalog(Root());

        private static List<PlacedPiece> City(int seed) =>
            VillageLayoutGenerator.GenerateCity(Catalog(), VillageDistricts.CityGrid, VillageDistricts.CityGrid, VillageDistricts.CityPieces, seed);

        [Fact]
        public void Web_copy_of_the_data_file_is_identical()
        {
            Assert.Equal(File.ReadAllText(PackagePath()), File.ReadAllText(Path.Combine(Root(), "web", "data", "names.json")));
        }

        [Fact]
        public void Data_file_covers_every_catalog_kind_and_landmark_with_original_text()
        {
            var lib = Library();
            foreach (var entry in Catalog().Entries) Assert.True(lib.Kinds.ContainsKey(entry.id), entry.id);
            foreach (var id in VillageLandmarks.Ids) Assert.True(lib.Landmarks.ContainsKey(id), id);
            var all = lib.Kinds.Values.SelectMany(k => k.Districts.Values.SelectMany(v => v).Concat(k.Any).Concat(k.Prefixes).Concat(k.Forms))
                .Concat(lib.Landmarks.Values.SelectMany(v => v));
            foreach (var n in all)
                foreach (var lang in VillageNames.Languages)
                {
                    Assert.DoesNotContain("\u2014", n.Text[lang]);
                    Assert.DoesNotContain("house_", n.Text[lang]);
                }
        }

        [Fact]
        public void Every_kind_has_a_curated_name_for_every_district()
        {
            foreach (var kv in Library().Kinds)
                foreach (var d in VillageDistricts.Ids) Assert.True(kv.Value.Districts.ContainsKey(d) && kv.Value.Districts[d].Count > 0, kv.Key + " " + d);
        }

        [Fact]
        public void Curated_names_are_unique_per_language_inside_a_kind_group()
        {
            var lib = Library();
            foreach (var lang in VillageNames.Languages)
            {
                var seen = new HashSet<string>();
                foreach (var kv in lib.Kinds)
                    foreach (var n in kv.Value.Districts.Values.SelectMany(v => v).Concat(kv.Value.Any))
                        Assert.True(seen.Add(n.Text[lang]), kv.Key + " repeats " + n.Text[lang] + " in " + lang);
            }
        }

        [Fact]
        public void The_sample_names_exist_in_the_data()
        {
            var en = Library().Kinds.Values.SelectMany(k => k.Districts.Values.SelectMany(v => v).Concat(k.Any)).Select(n => n.Text["en"]).ToList();
            foreach (var want in new[] { "Widow's Rest", "Blackwater Cottage", "Saltwind Cottage", "Crowmere Hall", "The Lantern's End", "St. Velor Chapel", "Hollowmere Well", "Fisherman's Watch", "The Drowned Gull Inn" })
                Assert.Contains(want, en);
        }

        [Theory]
        [InlineData(1)]
        [InlineData(42)]
        [InlineData(1818)]
        [InlineData(-7)]
        public void Names_are_unique_in_a_village_and_stable_between_runs(int seed)
        {
            var lib = Library();
            var layout = City(seed);
            var a = VillageNames.Assign(lib, seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, layout);
            var b = VillageNames.Assign(lib, seed, VillageDistricts.CityGrid, VillageDistricts.CityGrid, layout);
            Assert.Equal(layout.Count, a.Count);
            foreach (var lang in VillageNames.Languages)
            {
                Assert.Equal(a.Select(n => n.Get(lang)), b.Select(n => n.Get(lang)));
                Assert.Equal(a.Count, a.Select(n => n.Get(lang)).Distinct().Count());
            }
            foreach (var n in a) Assert.False(string.IsNullOrWhiteSpace(n.Get("en")));
        }

        [Fact]
        public void A_name_does_not_depend_on_the_pieces_after_it()
        {
            var lib = Library();
            var layout = City(1818);
            var full = VillageNames.Assign(lib, 1818, VillageDistricts.CityGrid, VillageDistricts.CityGrid, layout);
            var head = VillageNames.Assign(lib, 1818, VillageDistricts.CityGrid, VillageDistricts.CityGrid, layout.Take(20).ToList());
            for (int i = 0; i < head.Count; i++) Assert.Equal(full[i].Get("en"), head[i].Get("en"));
        }

        [Fact]
        public void Different_seeds_give_different_villages_of_names()
        {
            var lib = Library();
            var a = VillageNames.Assign(lib, 1, 36, 36, City(1)).Select(n => n.Get("en")).ToList();
            var b = VillageNames.Assign(lib, 42, 36, 36, City(42)).Select(n => n.Get("en")).ToList();
            Assert.NotEqual(a, b);
        }

        [Fact]
        public void An_exhausted_kind_numbers_its_names_and_stays_unique()
        {
            var lib = Library();
            var layout = new List<PlacedPiece>();
            for (int i = 0; i < 400; i++) layout.Add(new PlacedPiece { Id = "well", X = i % 36, Z = (i / 36) % 36, SizeX = 1, SizeZ = 1 });
            var names = VillageNames.Assign(lib, 5, 36, 36, layout);
            Assert.Equal(400, names.Select(n => n.Get("en")).Distinct().Count());
            Assert.Contains(names, n => n.Get("en").EndsWith(" 2"));
        }

        [Fact]
        public void A_piece_of_an_unknown_kind_gets_no_name()
        {
            var names = VillageNames.Assign(Library(), 1, 36, 36, new List<PlacedPiece> { new PlacedPiece { Id = "mystery", X = 1, Z = 1, SizeX = 1, SizeZ = 1 } });
            Assert.Null(names[0]);
        }

        [Fact]
        public void Landmarks_are_named_by_seed_and_unknown_ids_are_refused()
        {
            var lib = Library();
            foreach (var id in VillageLandmarks.Ids)
            {
                Assert.Equal(VillageNames.Landmark(lib, 1818, id).Get("en"), VillageNames.Landmark(lib, 1818, id).Get("en"));
                Assert.Contains(VillageNames.Landmark(lib, 7, id), lib.Landmarks[id]);
            }
            Assert.Contains("Wreck of the", VillageNames.Landmark(lib, 3, "shipwreck").Get("en"));
            Assert.Null(VillageNames.Landmark(lib, 1, "nowhere"));
        }

        [Fact]
        public void Malformed_data_is_rejected_with_the_part_named()
        {
            Assert.Throws<FormatException>(() => NameLibrary.Parse("{}"));
            var bad = "{\"kinds\":{\"well\":{\"districts\":{},\"any\":[],\"prefixes\":[{\"en\":\"A\",\"fr\":\"A\"}],\"forms\":[{\"en\":\"{p} Well\",\"fr\":\"Puits\"}]}},\"landmarks\":{}}";
            var ex = Assert.Throws<FormatException>(() => NameLibrary.Parse(bad));
            Assert.Contains("well", ex.Message);
        }
    }
}
