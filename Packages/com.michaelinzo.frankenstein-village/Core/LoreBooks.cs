using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One lore book from Data/lore_books.json: where it may be found, what reading it costs or gives, and its texts per language.</summary>
    public sealed class LoreBook
    {
        public string Id;
        public string Place;
        /// <summary>Sanity change on the first reading: 0 or negative.</summary>
        public int Sanity;
        /// <summary>True when the first reading counts as a vigil clue.</summary>
        public bool Clue;
        public Dictionary<string, string> Titles = new Dictionary<string, string>();
        public Dictionary<string, string> Texts = new Dictionary<string, string>();
    }

    /// <summary>A book standing in one village: which book, in what kind of place, and where (world metres on the ground plane).</summary>
    public struct LoreBookPlacement
    {
        public string BookId;
        public string Place;
        public double X;
        public double Z;
    }

    /// <summary>What reading a book does. Only the first reading of a book has effects; reading it again is free.</summary>
    public struct LoreReadResult
    {
        public bool FirstRead;
        public int SanityDelta;
        public bool YieldsClue;
        public string ClueId;
    }

    /// <summary>The parsed lore book data file. The same file is read by web/src/lore.js; a drift test compares the two copies.</summary>
    public sealed class LoreLibrary
    {
        public List<LoreBook> Books = new List<LoreBook>();

        public LoreBook Find(string id)
        {
            foreach (var b in Books) if (b.Id == id) return b;
            return null;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending book when the data is malformed.</summary>
        public static LoreLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            var list = root != null && root.ContainsKey("books") ? root["books"] as List<object> : null;
            if (list == null) throw new FormatException("lore: missing books array");
            var lib = new LoreLibrary();
            var seen = new HashSet<string>();
            foreach (var item in list)
            {
                var o = item as Dictionary<string, object>;
                if (o == null) throw new FormatException("lore: book is not an object");
                var book = new LoreBook { Id = Str(o, "id", "?"), Place = Str(o, "place", "?") };
                if (!seen.Add(book.Id)) throw new FormatException("lore: duplicate book id " + book.Id);
                if (Array.IndexOf(LoreBookRules.Places, book.Place) < 0) throw new FormatException("lore: " + book.Id + " has unknown place " + book.Place);
                book.Sanity = o.ContainsKey("sanity") && o["sanity"] is double ? (int)(double)o["sanity"] : 0;
                if (book.Sanity > 0) throw new FormatException("lore: " + book.Id + " has a positive sanity change");
                book.Clue = o.ContainsKey("clue") && o["clue"] is bool && (bool)o["clue"];
                foreach (var lang in LoreBookRules.Languages)
                {
                    var t = o.ContainsKey(lang) ? o[lang] as Dictionary<string, object> : null;
                    if (t == null) throw new FormatException("lore: " + book.Id + " lacks language " + lang);
                    book.Titles[lang] = Str(t, "title", book.Id);
                    book.Texts[lang] = Str(t, "text", book.Id);
                }
                lib.Books.Add(book);
            }
            return lib;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("lore: " + owner + " lacks " + key);
            return s;
        }
    }

    /// <summary>
    /// Engine-free lore book rules. Each village holds a seeded handful of books from the data file: some lie on the street in front of houses, the rest
    /// by the chapel, the inn, the lighthouse, the dock and the churchyard graves. Same seed, grid, layout and library always give the same books and places.
    /// Reading is free of randomness: the first reading applies the data file's sanity cost and clue flag, later readings change nothing.
    /// </summary>
    public static class LoreBookRules
    {
        public static readonly string[] Places = { "house", "chapel", "inn", "lighthouse", "harbour", "grave" };
        /// <summary>Books placed per place, in <see cref="Places"/> order.</summary>
        public static readonly int[] PerPlace = { 3, 1, 1, 1, 1, 1 };
        public static readonly string[] Languages = { "en", "fr" };
        public const int PlaceSaltBase = 0x10b0c;
        public const int PlaceSaltStep = 4099;
        /// <summary>Metres between a house's cell edge and its book, on the street side.</summary>
        public const double HouseBookOffset = 0.6;
        /// <summary>Coast local v of coast books: on the walkable coast road, seaward of the cottage fronts.</summary>
        public const double CoastBookV = -1.2;
        /// <summary>Metres along the shore from the dock root to the harbour book.</summary>
        public const double DockBookU = 1.3;
        /// <summary>Metres behind a gravestone (away from the church it faces) to its book.</summary>
        public const double GraveBookOffset = 0.6;
        /// <summary>Metres a book may lean away from its first spot (along the wall) when that spot is blocked.</summary>
        public static readonly double[] Lateral = { 0.0, 1.5, -1.5 };
        public const string ClueIdPrefix = "book@";

        /// <summary>The books of one village in place order, each with its world position. Places with no free spot give no book.</summary>
        public static List<LoreBookPlacement> Place(int seed, int gridW, int gridD, IList<PlacedPiece> layout, LoreLibrary library)
        {
            var result = new List<LoreBookPlacement>();
            if (library == null || gridW <= 0 || gridD <= 0) return result;
            var items = VillageDressing.Compose(seed, gridW, gridD, layout);
            var blockers = new List<DressingItem>();
            foreach (var it in items) { double hx, hz; if (VillageDressing.TryCollisionHalfExtents(it, out hx, out hz)) blockers.Add(it); }
            var buildings = new List<PlacedPiece>();
            if (layout != null) foreach (var p in layout) if (VillageStreets.IsBuilding(p.SizeX, p.SizeZ)) buildings.Add(p);
            for (int place = 0; place < Places.Length; place++)
            {
                var rng = new SeededRandom(seed ^ (PlaceSaltBase + place * PlaceSaltStep));
                var books = new List<LoreBook>();
                foreach (var b in library.Books) if (b.Place == Places[place]) books.Add(b);
                Shuffle(books, rng);
                var spots = Spots(Places[place], seed, gridW, gridD, layout, buildings, items, rng);
                int taken = 0;
                foreach (var candidates in spots)
                {
                    if (taken >= PerPlace[place] || taken >= books.Count) break;
                    foreach (var c in candidates)
                    {
                        if (IsBlocked(c[0], c[1], layout, blockers, seed, gridW, gridD)) continue;
                        result.Add(new LoreBookPlacement { BookId = books[taken].Id, Place = Places[place], X = c[0], Z = c[1] });
                        taken++;
                        break;
                    }
                }
            }
            return result;
        }

        /// <summary>The effect of reading <paramref name="book"/>; <paramref name="alreadyRead"/> is true when this player read it before.</summary>
        public static LoreReadResult Read(LoreBook book, bool alreadyRead)
        {
            if (book == null || alreadyRead) return new LoreReadResult { FirstRead = false, ClueId = "" };
            return new LoreReadResult { FirstRead = true, SanityDelta = book.Sanity, YieldsClue = book.Clue, ClueId = book.Clue ? ClueIdPrefix + book.Id : "" };
        }

        /// <summary>Candidate spot lists in preference order; each spot has alternatives (x, z) tried in order.</summary>
        private static List<List<double[]>> Spots(string place, int seed, int gridW, int gridD, IList<PlacedPiece> layout, List<PlacedPiece> buildings, List<DressingItem> items, SeededRandom rng)
        {
            var spots = new List<List<double[]>>();
            int side = VillagerRules.CoastSide(seed);
            Func<double, List<double[]>> onCoast = u =>
            {
                var alts = new List<double[]>();
                foreach (var lat in Lateral) { double x, z; VillageDressing.CoastToWorld(seed, gridW, gridD, u + lat, CoastBookV, out x, out z); alts.Add(new[] { x, z }); }
                return alts;
            };
            if (place == "house")
            {
                var order = new List<PlacedPiece>(buildings);
                Shuffle(order, rng);
                foreach (var p in order)
                {
                    double yaw = VillageStreets.FacingYaw(p.Facing), dirX = Math.Sin(yaw), dirZ = Math.Cos(yaw), sideX = Math.Cos(yaw), sideZ = -Math.Sin(yaw);
                    double half = (p.Facing % 2 == 0 ? p.SizeZ : p.SizeX) * VillageDressing.Cell / 2, cx = (p.X + p.SizeX / 2.0) * VillageDressing.Cell, cz = (p.Z + p.SizeZ / 2.0) * VillageDressing.Cell;
                    double d = half + HouseBookOffset;
                    var alts = new List<double[]>();
                    foreach (var lat in Lateral) alts.Add(new[] { cx + dirX * d + sideX * lat, cz + dirZ * d + sideZ * lat });
                    spots.Add(alts);
                }
            }
            else if (place == "chapel" || place == "inn" || place == "lighthouse")
            {
                string kind = place;
                foreach (var it in items)
                    if (it.Kind == kind) { spots.Add(onCoast(side == 2 ? it.X : it.Z)); break; }
            }
            else if (place == "harbour")
            {
                spots.Add(onCoast(VillageDressing.DockU(seed, gridW, gridD) + DockBookU));
            }
            else
            {
                var stones = new List<DressingItem>();
                foreach (var it in items) if ((it.Kind == "gravestone" || it.Kind == "gravestone_cross") && it.Y < 0.01) stones.Add(it);
                Shuffle(stones, rng);
                foreach (var s in stones)
                {
                    double d = VillageDressing.FootprintOf(s.Kind).HalfZ + GraveBookOffset;
                    spots.Add(new List<double[]> { new[] { s.X - Math.Sin(s.Yaw) * d, s.Z - Math.Cos(s.Yaw) * d } });
                }
            }
            return spots;
        }

        /// <summary>True when a book at (x, z) would sit outside the walkable area, inside a layout cell rectangle (0.3 m clearance) or inside a solid prop's walking box.</summary>
        public static bool IsBlocked(double x, double z, IList<PlacedPiece> layout, List<DressingItem> solids, int seed, int gridW, int gridD)
        {
            double minX, maxX, minZ, maxZ;
            VillageDressing.WalkBounds(seed, gridW, gridD, out minX, out maxX, out minZ, out maxZ);
            if (x < minX || x > maxX || z < minZ || z > maxZ) return true;
            const double clearance = 0.3;
            if (layout != null)
                foreach (var p in layout)
                    if (x > p.X * VillageDressing.Cell - clearance && x < (p.X + p.SizeX) * VillageDressing.Cell + clearance && z > p.Z * VillageDressing.Cell - clearance && z < (p.Z + p.SizeZ) * VillageDressing.Cell + clearance) return true;
            foreach (var it in solids)
            {
                double hx, hz;
                VillageDressing.TryCollisionHalfExtents(it, out hx, out hz);
                if (Math.Abs(x - it.X) < hx && Math.Abs(z - it.Z) < hz) return true;
            }
            return false;
        }

        private static void Shuffle<T>(IList<T> list, SeededRandom rng)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                T tmp = list[i]; list[i] = list[j]; list[j] = tmp;
            }
        }
    }
}
