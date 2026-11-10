using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>Deterministic summary of a generated village. No timestamps; same inputs give identical text.</summary>
    public sealed class VillageReport
    {
        public sealed class Count { public string Key; public int Value; }
        public sealed class Landmark { public string Id; public int X; public int Z; }

        private static readonly string[] Omens =
        {
            "The bells ring, though no one has climbed the tower.",
            "Every window faces the well.",
            "Smoke rises from chimneys that were never lit.",
            "The crows have stopped leaving.",
            "Something counts the houses at night.",
            "The stitched streets remember their old shapes.",
        };

        public int Seed;
        public int Width;
        public int Depth;
        public int PieceCount;
        public int CellsUsed;
        public int DreadPercent;
        public string Tier;
        public int TotalHorror;
        /// <summary>Average horror times 100, rounded half up (integer math keeps JS parity exact).</summary>
        public int AverageHorrorX100;
        public List<Count> ById = new List<Count>();
        public List<Count> ByCategory = new List<Count>();
        public List<Landmark> Landmarks = new List<Landmark>();
        public string Omen;

        public static VillageReport Build(PrefabCatalog catalog, IReadOnlyList<PlacedPiece> pieces, int width, int depth, int seed, float dread)
        {
            var r = new VillageReport { Seed = seed, Width = width, Depth = depth };
            float d = DreadThresholds.Sanitize(dread);
            r.DreadPercent = (int)Math.Floor(d * 100f + 0.5f);
            r.Tier = DreadThresholds.TierNames[DreadThresholds.TierFor(d)];
            r.Omen = Omens[new SeededRandom(seed).Next(Omens.Length)];

            var idCounts = new Dictionary<string, int>();
            var catCounts = new Dictionary<string, int>();
            if (catalog != null && pieces != null)
            {
                foreach (var p in pieces)
                {
                    if (!catalog.TryGet(p.Id, out var entry)) continue;
                    r.PieceCount++;
                    r.CellsUsed += p.SizeX * p.SizeZ;
                    r.TotalHorror += entry.horror;
                    idCounts[entry.id] = (idCounts.TryGetValue(entry.id, out var a) ? a : 0) + 1;
                    string cat = entry.category ?? "";
                    catCounts[cat] = (catCounts.TryGetValue(cat, out var b) ? b : 0) + 1;
                    if (cat == "Landmark") r.Landmarks.Add(new Landmark { Id = entry.id, X = p.X, Z = p.Z });
                }
                var seenCats = new HashSet<string>();
                foreach (var e in catalog.Entries)
                {
                    if (idCounts.TryGetValue(e.id, out var n)) r.ById.Add(new Count { Key = e.id, Value = n });
                    string cat = e.category ?? "";
                    if (catCounts.TryGetValue(cat, out var m) && seenCats.Add(cat)) r.ByCategory.Add(new Count { Key = cat, Value = m });
                }
            }
            if (r.PieceCount > 0) r.AverageHorrorX100 = (r.TotalHorror * 100 + r.PieceCount / 2) / r.PieceCount;
            return r;
        }

        private static string Avg(int x100) => (x100 / 100).ToString(CultureInfo.InvariantCulture) + "." + (x100 % 100).ToString("00", CultureInfo.InvariantCulture);

        public string ToMarkdown()
        {
            var inv = CultureInfo.InvariantCulture;
            var sb = new StringBuilder();
            sb.Append("# Village Report\n\n");
            sb.Append("- Seed: ").Append(Seed.ToString(inv)).Append('\n');
            sb.Append("- Grid: ").Append(Width.ToString(inv)).Append(" x ").Append(Depth.ToString(inv)).Append('\n');
            sb.Append("- Pieces: ").Append(PieceCount.ToString(inv)).Append('\n');
            sb.Append("- Cells used: ").Append(CellsUsed.ToString(inv)).Append(" of ").Append((Width * Depth).ToString(inv)).Append('\n');
            sb.Append("- Dread: ").Append(DreadPercent.ToString(inv)).Append("% (").Append(Tier).Append(")\n");
            sb.Append("- Total horror: ").Append(TotalHorror.ToString(inv)).Append('\n');
            sb.Append("- Average horror: ").Append(Avg(AverageHorrorX100)).Append("\n\n");
            sb.Append("## Pieces by id\n\n");
            foreach (var c in ById) sb.Append("- ").Append(c.Key).Append(": ").Append(c.Value.ToString(inv)).Append('\n');
            if (ById.Count == 0) sb.Append("- none\n");
            sb.Append("\n## Pieces by category\n\n");
            foreach (var c in ByCategory) sb.Append("- ").Append(c.Key).Append(": ").Append(c.Value.ToString(inv)).Append('\n');
            if (ByCategory.Count == 0) sb.Append("- none\n");
            sb.Append("\n## Landmarks\n\n");
            foreach (var l in Landmarks) sb.Append("- ").Append(l.Id).Append(" at (").Append(l.X.ToString(inv)).Append(", ").Append(l.Z.ToString(inv)).Append(")\n");
            if (Landmarks.Count == 0) sb.Append("- none\n");
            sb.Append("\n> ").Append(Omen).Append('\n');
            return sb.ToString();
        }

        public string ToJson()
        {
            var inv = CultureInfo.InvariantCulture;
            var sb = new StringBuilder();
            sb.Append("{\n");
            sb.Append("  \"seed\": ").Append(Seed.ToString(inv)).Append(",\n");
            sb.Append("  \"width\": ").Append(Width.ToString(inv)).Append(",\n");
            sb.Append("  \"depth\": ").Append(Depth.ToString(inv)).Append(",\n");
            sb.Append("  \"pieces\": ").Append(PieceCount.ToString(inv)).Append(",\n");
            sb.Append("  \"cellsUsed\": ").Append(CellsUsed.ToString(inv)).Append(",\n");
            sb.Append("  \"dreadPercent\": ").Append(DreadPercent.ToString(inv)).Append(",\n");
            sb.Append("  \"tier\": ").Append(Quote(Tier)).Append(",\n");
            sb.Append("  \"totalHorror\": ").Append(TotalHorror.ToString(inv)).Append(",\n");
            sb.Append("  \"averageHorror\": ").Append(Avg(AverageHorrorX100)).Append(",\n");
            sb.Append("  \"byId\": ").Append(Object(ById)).Append(",\n");
            sb.Append("  \"byCategory\": ").Append(Object(ByCategory)).Append(",\n");
            sb.Append("  \"landmarks\": [");
            for (int i = 0; i < Landmarks.Count; i++)
                sb.Append(i > 0 ? ", " : "").Append("{ \"id\": ").Append(Quote(Landmarks[i].Id))
                  .Append(", \"x\": ").Append(Landmarks[i].X.ToString(inv)).Append(", \"z\": ").Append(Landmarks[i].Z.ToString(inv)).Append(" }");
            sb.Append("],\n");
            sb.Append("  \"omen\": ").Append(Quote(Omen)).Append("\n}\n");
            return sb.ToString();
        }

        private static string Object(List<Count> counts)
        {
            var sb = new StringBuilder("{");
            for (int i = 0; i < counts.Count; i++)
                sb.Append(i > 0 ? ", " : " ").Append(Quote(counts[i].Key)).Append(": ").Append(counts[i].Value.ToString(CultureInfo.InvariantCulture));
            sb.Append(counts.Count > 0 ? " }" : "}");
            return sb.ToString();
        }

        private static string Quote(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (char c in s ?? "")
            {
                if (c == '"') sb.Append("\\\"");
                else if (c == '\\') sb.Append("\\\\");
                else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }
    }
}
