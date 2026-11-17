using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Lore book data, seeded placement and reading rules.</summary>
    public class LoreBookTests
    {
        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static string PackagePath() => Path.Combine(Root(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "lore_books.json");
        private static LoreLibrary Library() => LoreLibrary.Parse(File.ReadAllText(PackagePath()));

        private static List<PlacedPiece> Layout(int seed, int grid)
        {
            var cat = new PrefabCatalog(new List<CatalogEntry>
            {
                new CatalogEntry { id = "house_a", category = "House", weight = 5, footprintX = 1, footprintZ = 1, horror = 2 },
                new CatalogEntry { id = "house_b", category = "House", weight = 4, footprintX = 1, footprintZ = 1, horror = 3 },
                new CatalogEntry { id = "church", category = "Landmark", weight = 1, footprintX = 2, footprintZ = 2, horror = 5 },
                new CatalogEntry { id = "well", category = "Prop", weight = 3, footprintX = 1, footprintZ = 1, horror = 4 },
            });
            return VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
        }

        [Fact]
        public void Data_file_has_thirty_to_sixty_original_books_in_both_languages()
        {
            var lib = Library();
            Assert.InRange(lib.Books.Count, 30, 60);
            foreach (var b in lib.Books)
                foreach (var lang in LoreBookRules.Languages)
                {
                    Assert.False(string.IsNullOrWhiteSpace(b.Titles[lang]), b.Id + " title " + lang);
                    Assert.InRange(b.Texts[lang].Length, 80, 400);
                    Assert.DoesNotContain("\u2014", b.Texts[lang]);
                }
            foreach (var place in LoreBookRules.Places) Assert.Contains(lib.Books, b => b.Place == place);
        }

        [Fact]
        public void Web_copy_of_the_data_file_is_identical()
        {
            var web = Path.Combine(Root(), "web", "data", "lore_books.json");
            Assert.Equal(File.ReadAllText(PackagePath()), File.ReadAllText(web));
        }

        [Fact]
        public void Malformed_data_is_rejected_with_the_book_named()
        {
            var ex = Assert.Throws<FormatException>(() => LoreLibrary.Parse("{\"books\":[{\"id\":\"x1\",\"place\":\"moon\"}]}"));
            Assert.Contains("x1", ex.Message);
        }

        [Fact]
        public void Placement_is_deterministic_seeded_unique_and_walkable()
        {
            var lib = Library();
            foreach (var seed in new[] { 1, 42, -7, 1818, 123456789 })
                foreach (var grid in new[] { 24, 16 })
                {
                    var layout = Layout(seed, grid);
                    var a = LoreBookRules.Place(seed, grid, grid, layout, lib);
                    var b = LoreBookRules.Place(seed, grid, grid, layout, lib);
                    Assert.Equal(a.Select(p => (p.BookId, p.X, p.Z)), b.Select(p => (p.BookId, p.X, p.Z)));
                    Assert.True(a.Count >= 4, "seed " + seed + " grid " + grid + " placed " + a.Count);
                    Assert.Equal(a.Count, a.Select(p => p.BookId).Distinct().Count());
                    var solids = VillageDressing.Compose(seed, grid, grid, layout).Where(i => { double hx, hz; return VillageDressing.TryCollisionHalfExtents(i, out hx, out hz); }).ToList();
                    foreach (var p in a)
                    {
                        Assert.Equal(p.Place, lib.Find(p.BookId).Place);
                        Assert.False(LoreBookRules.IsBlocked(p.X, p.Z, layout, solids, seed, grid, grid), p.BookId + " is blocked");
                    }
                }
        }

        [Fact]
        public void Different_seeds_hold_different_books()
        {
            var lib = Library();
            var sets = new HashSet<string>();
            foreach (var seed in new[] { 1, 42, -7, 1818, 123456789 })
                sets.Add(string.Join(",", LoreBookRules.Place(seed, 24, 24, Layout(seed, 24), lib).Select(p => p.BookId)));
            Assert.True(sets.Count >= 3);
        }

        [Fact]
        public void Reading_applies_effects_once()
        {
            var lib = Library();
            var clueBook = lib.Books.First(b => b.Clue);
            var first = LoreBookRules.Read(clueBook, false);
            Assert.True(first.FirstRead);
            Assert.True(first.YieldsClue);
            Assert.Equal("book@" + clueBook.Id, first.ClueId);
            Assert.Equal(clueBook.Sanity, first.SanityDelta);
            var again = LoreBookRules.Read(clueBook, true);
            Assert.False(again.FirstRead);
            Assert.False(again.YieldsClue);
            Assert.Equal(0, again.SanityDelta);
            Assert.All(lib.Books, b => Assert.InRange(b.Sanity, -3, 0));
        }
    }
}
