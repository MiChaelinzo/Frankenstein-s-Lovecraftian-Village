using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.Json;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>
    /// Emits and verifies web/test/golden.json, the cross-language contract the JS port
    /// (web/src/core.js) must match. Regenerate with UPDATE_GOLDEN=1 dotnet test.
    /// </summary>
    public class GoldenParity
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };
        private static readonly (int w, int d, int n)[] Grids = { (24, 24, 40), (16, 12, 25), (8, 8, 100) };
        private static readonly float[] Dreads = { 0f, 0.2f, 0.34f, 0.5f, 0.67f, 0.9f, 1f };

        private static readonly int[] CampaignNightCounts = { 1, 3, 5, 9, 0, 40 };
        private static readonly int[] StoryNightCounts = { 1, 3, 5, 9, 0 };
        private static readonly float[] ReportDreads = { 0f, 0.5f, 1f };
        private static readonly float[][] EventSeqs =
        {
            new[] { 0f, 0.2f, 0.34f, 0.5f, 0.67f, 0.9f, 1f, 0.5f, 0.2f, 0f },
            new[] { 0.35f, 0.33f, 0.35f, 0.3f, 0.29f, 0.289f, 0.34f },
            new[] { 0.95f, 0.8f, 0.85f, 0.6f, 0.1f },
            new[] { float.NaN, 0.4f, float.PositiveInfinity, 0.7f, -1f },
        };

        private static readonly string[] MatchIds = { "house_a", "house_b", "church", "well", "dead_tree", "altar" };
        private static readonly string[] MatchNames =
        {
            "BigHouse00", "TallHouse00", "CoastalHouse00", "_Sp_TrunkDead00", "_Sp_TrunkPinus00", "CandleHolderWall00b Variant",
            "Barrel00b Variant", "WoodBucket00", "Pinnacle00c", "PillarStone00a", "Cottage_03", "StoneChapel", "Rock",
        };

        private static string DreadToken(float d, CultureInfo inv) =>
            float.IsNaN(d) ? "\"NaN\"" : float.IsPositiveInfinity(d) ? "\"Infinity\"" : float.IsNegativeInfinity(d) ? "\"-Infinity\"" : d.ToString("R", inv);

        private static string RepoRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        private static PrefabCatalog LoadCatalog(string root)
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Assets", "Data", "village_catalog.json")));
            var list = new List<CatalogEntry>();
            foreach (var e in doc.RootElement.GetProperty("entries").EnumerateArray())
                list.Add(new CatalogEntry
                {
                    id = e.GetProperty("id").GetString(),
                    category = e.GetProperty("category").GetString(),
                    weight = e.GetProperty("weight").GetInt32(),
                    footprintX = e.GetProperty("footprintX").GetInt32(),
                    footprintZ = e.GetProperty("footprintZ").GetInt32(),
                    horror = e.GetProperty("horror").GetInt32(),
                    prefabHint = e.TryGetProperty("prefabHint", out var ph) ? ph.GetString() : null,
                });
            return new PrefabCatalog(list);
        }

        private static string Build(PrefabCatalog cat)
        {
            var sb = new StringBuilder();
            var inv = CultureInfo.InvariantCulture;
            sb.Append("{\n  \"rng\": [\n");
            for (int i = 0; i < Seeds.Length; i++)
            {
                var r = new SeededRandom(Seeds[i]);
                sb.Append("    { \"seed\": ").Append(Seeds[i].ToString(inv)).Append(", \"uints\": [");
                for (int k = 0; k < 8; k++) sb.Append(k > 0 ? ", " : "").Append(r.NextUInt().ToString(inv));
                sb.Append("], \"next10\": [");
                var r2 = new SeededRandom(Seeds[i]);
                for (int k = 0; k < 6; k++) sb.Append(k > 0 ? ", " : "").Append(r2.Next(10).ToString(inv));
                sb.Append("] }").Append(i < Seeds.Length - 1 ? ",\n" : "\n");
            }
            sb.Append("  ],\n  \"layouts\": [\n");
            bool first = true;
            foreach (var g in Grids)
                foreach (var s in Seeds)
                {
                    var layout = VillageLayoutGenerator.Generate(cat, g.w, g.d, g.n, s);
                    if (!first) sb.Append(",\n");
                    first = false;
                    sb.Append("    { \"seed\": ").Append(s.ToString(inv)).Append(", \"width\": ").Append(g.w)
                      .Append(", \"depth\": ").Append(g.d).Append(", \"count\": ").Append(g.n).Append(", \"pieces\": [");
                    for (int i = 0; i < layout.Count; i++)
                    {
                        var p = layout[i];
                        sb.Append(i > 0 ? ", " : "").Append("[\"").Append(p.Id).Append("\", ").Append(p.X).Append(", ")
                          .Append(p.Z).Append(", ").Append(p.SizeX).Append(", ").Append(p.SizeZ).Append(']');
                    }
                    sb.Append("] }");
                }
            sb.Append("\n  ],\n  \"narration\": [\n");
            var st = new StaticNarrationProvider();
            string[] locs = { "house_a", "church" };
            first = true;
            foreach (var d in Dreads)
                foreach (var l in locs)
                {
                    if (!first) sb.Append(",\n");
                    first = false;
                    sb.Append("    { \"dread\": ").Append(d.ToString("R", inv)).Append(", \"location\": \"").Append(l)
                      .Append("\", \"text\": \"").Append(st.Narrate(l, d)).Append("\" }");
                }
            sb.Append("\n  ],\n  \"dread\": [");
            float[] sanities = { 0f, 25f, 50f, 100f };
            for (int i = 0; i < sanities.Length; i++)
                sb.Append(i > 0 ? ", " : "").Append("[").Append(sanities[i].ToString("R", inv)).Append(", ")
                  .Append(SanityModel.DreadFor(sanities[i]).ToString("R", inv)).Append("]");
            sb.Append("],\n  \"events\": [\n");
            for (int i = 0; i < EventSeqs.Length; i++)
            {
                var t = new DreadEventTracker();
                sb.Append("    { \"dreads\": [");
                for (int k = 0; k < EventSeqs[i].Length; k++) sb.Append(k > 0 ? ", " : "").Append(DreadToken(EventSeqs[i][k], inv));
                sb.Append("], \"events\": [");
                for (int k = 0; k < EventSeqs[i].Length; k++)
                {
                    sb.Append(k > 0 ? ", " : "").Append('[');
                    var evs = t.Update(EventSeqs[i][k]);
                    for (int j = 0; j < evs.Count; j++) sb.Append(j > 0 ? ", " : "").Append('"').Append(evs[j]).Append('"');
                    sb.Append(']');
                }
                sb.Append("] }").Append(i < EventSeqs.Length - 1 ? ",\n" : "\n");
            }
            sb.Append("  ],\n  \"reports\": [\n");
            first = true;
            foreach (var s in Seeds)
                foreach (var rd in ReportDreads)
                {
                    var layout = VillageLayoutGenerator.Generate(cat, 24, 24, 40, s);
                    var rep = VillageReport.Build(cat, layout, 24, 24, s, rd);
                    if (!first) sb.Append(",\n");
                    first = false;
                    sb.Append("    { \"seed\": ").Append(s.ToString(inv)).Append(", \"dread\": ").Append(rd.ToString("R", inv))
                      .Append(", \"markdown\": ").Append(JsonSerializer.Serialize(rep.ToMarkdown()))
                      .Append(", \"json\": ").Append(JsonSerializer.Serialize(rep.ToJson())).Append(" }");
                }
            sb.Append("\n  ],\n  \"campaigns\": [\n");
            first = true;
            foreach (var s in Seeds)
                foreach (var nights in CampaignNightCounts)
                {
                    var c = CampaignGenerator.Generate(s, nights);
                    if (!first) sb.Append(",\n");
                    first = false;
                    sb.Append("    { \"seed\": ").Append(s.ToString(inv)).Append(", \"requested\": ").Append(nights.ToString(inv))
                      .Append(", \"villageName\": ").Append(JsonSerializer.Serialize(c.VillageName)).Append(", \"nights\": [");
                    for (int i = 0; i < c.Nights.Count; i++)
                    {
                        var n = c.Nights[i];
                        sb.Append(i > 0 ? ", " : "").Append("[").Append(n.Number).Append(", ").Append(JsonSerializer.Serialize(n.Title)).Append(", ")
                          .Append(n.DreadTargetPercent).Append(", ").Append(n.SanityStart).Append(", ")
                          .Append(JsonSerializer.Serialize(n.Sky)).Append(", ").Append(JsonSerializer.Serialize(n.Weather)).Append(", ")
                          .Append(JsonSerializer.Serialize(n.Rumor)).Append(", ").Append(JsonSerializer.Serialize(n.Lore)).Append("]");
                    }
                    sb.Append("] }");
                }
            sb.Append("\n  ],\n  \"stories\": [\n");
            first = true;
            foreach (var s in Seeds)
                foreach (var nights in StoryNightCounts)
                {
                    var beats = StorySequencer.Build(CampaignGenerator.Generate(s, nights));
                    if (!first) sb.Append(",\n");
                    first = false;
                    sb.Append("    { \"seed\": ").Append(s.ToString(inv)).Append(", \"requested\": ").Append(nights.ToString(inv)).Append(", \"beats\": [");
                    for (int i = 0; i < beats.Count; i++)
                    {
                        var b = beats[i];
                        sb.Append(i > 0 ? ", " : "").Append('[').Append(b.Index).Append(", ").Append(b.NightNumber).Append(", ")
                          .Append(JsonSerializer.Serialize(b.Kind)).Append(", ").Append(JsonSerializer.Serialize(b.Text)).Append(", ")
                          .Append(b.DreadPercent).Append(", ").Append(JsonSerializer.Serialize(b.Sky)).Append(", ")
                          .Append(JsonSerializer.Serialize(b.Weather)).Append(", ").Append(b.DurationMs).Append(']');
                    }
                    sb.Append("] }");
                }
            sb.Append("\n  ],\n  \"rituals\": [\n");
            first = true;
            foreach (var s in Seeds)
                foreach (var nights in StoryNightCounts)
                {
                    var ritual = RitualChain.Generate(CampaignGenerator.Generate(s, nights));
                    if (!first) sb.Append(",\n");
                    first = false;
                    sb.Append("    { \"seed\": ").Append(s.ToString(inv)).Append(", \"requested\": ").Append(nights.ToString(inv))
                      .Append(", \"name\": ").Append(JsonSerializer.Serialize(ritual.Name)).Append(", \"stages\": [");
                    for (int i = 0; i < ritual.Stages.Count; i++)
                        sb.Append(i > 0 ? ", " : "").Append(JsonSerializer.Serialize(RitualChain.Describe(ritual.Stages[i])));
                    sb.Append("], \"progress\": [");
                    bool firstP = true;
                    for (int night = 0; night <= ritual.Stages.Count + 1; night++)
                        foreach (int dread in new[] { 0, 25, 50, 80, 100 })
                        {
                            sb.Append(firstP ? "" : ", ").Append(JsonSerializer.Serialize(RitualChain.Describe(RitualChain.Progress(ritual, night, dread))));
                            firstP = false;
                        }
                    sb.Append("] }");
                }
            sb.Append("\n  ],\n  \"investigators\": [\n");
            first = true;
            foreach (var s in Seeds)
            {
                var layout = VillageLayoutGenerator.Generate(cat, 24, 24, 40, s);
                var walker = new Investigator(layout, 24, 24, s);
                if (!first) sb.Append(",\n");
                first = false;
                sb.Append("    { \"seed\": ").Append(s.ToString(inv)).Append(", \"length\": ").Append(walker.Route.Count).Append(", \"cells\": [");
                for (int i = 0; i < walker.Route.Count; i++)
                    sb.Append(i > 0 ? ", " : "").Append('[').Append(walker.Route[i].X).Append(", ").Append(walker.Route[i].Z).Append(']');
                sb.Append("], \"hits\": [");
                var hits = Investigator.Simulate(layout, 24, 24, s);
                for (int i = 0; i < hits.Count; i++)
                    sb.Append(i > 0 ? ", " : "").Append(JsonSerializer.Serialize(Investigator.Describe(hits[i])));
                sb.Append("] }");
            }
            sb.Append("\n  ],\n  \"matcher\": {\n    \"scores\": [");
            for (int i = 0; i < MatchIds.Length; i++)
                for (int k = 0; k < MatchNames.Length; k++)
                    sb.Append(i + k > 0 ? ", " : "").Append('[').Append(JsonSerializer.Serialize(MatchIds[i])).Append(", ")
                      .Append(JsonSerializer.Serialize(MatchNames[k])).Append(", ").Append(PrefabNameMatcher.Score(MatchIds[i], MatchNames[k]).ToString(inv)).Append(']');
            sb.Append("],\n    \"resolves\": [");
            first = true;
            foreach (var e in cat.Entries)
                foreach (var hint in new[] { e.prefabHint, null, "Missing00" })
                {
                    if (!first) sb.Append(", ");
                    first = false;
                    var res = PrefabNameMatcher.Resolve(e.id, hint, MatchNames);
                    sb.Append('[').Append(JsonSerializer.Serialize(e.id)).Append(", ").Append(hint == null ? "null" : JsonSerializer.Serialize(hint))
                      .Append(", ").Append(res == null ? "null" : JsonSerializer.Serialize(res)).Append(']');
                }
            sb.Append("]\n  },\n  \"buildings\": {\n    \"hashes\": [");
            string[] hashIds = { "", "a", "house_a", "church", "Big House 00" };
            for (int i = 0; i < hashIds.Length; i++)
                sb.Append(i > 0 ? ", " : "").Append('[').Append(JsonSerializer.Serialize(hashIds[i])).Append(", ").Append(DreadBuildingPolicy.StableHash(hashIds[i]).ToString(inv)).Append(']');
            sb.Append("],\n    \"detail\": [");
            string[] bIds = { "house_a", "house_b", "church", "well" };
            float[] bDreads = { 0f, 0.34f, 0.5f, 0.67f, 0.9f, 1f };
            first = true;
            foreach (var s in Seeds)
                foreach (var id in bIds)
                    foreach (var d in bDreads)
                    {
                        if (!first) sb.Append(", ");
                        first = false;
                        sb.Append('[').Append(s.ToString(inv)).Append(", ").Append(JsonSerializer.Serialize(id)).Append(", ").Append(d.ToString("R", inv))
                          .Append(", ").Append(DreadBuildingPolicy.DetailLevel(d, id, s).ToString(inv)).Append(']');
                    }
            sb.Append("],\n    \"doors\": [");
            first = true;
            foreach (var s in Seeds)
                foreach (var d in new[] { 0.2f, 0.5f, 0.8f, 1f })
                    for (int door = 0; door < 2; door++)
                    {
                        if (!first) sb.Append(", ");
                        first = false;
                        sb.Append('[').Append(s.ToString(inv)).Append(", ").Append(d.ToString("R", inv)).Append(", ").Append(door).Append(", [");
                        for (int a = 0; a < 12; a++)
                            sb.Append(a > 0 ? ", " : "").Append((int)DreadBuildingPolicy.DoorOmen(d, "church", door, a, s));
                        sb.Append("]]");
                    }
            sb.Append("],\n    \"cameras\": [");
            first = true;
            foreach (var d in new[] { 0f, 0.34f, 0.67f, 0.9f, 1f })
            {
                if (!first) sb.Append(", ");
                first = false;
                sb.Append('[').Append(d.ToString("R", inv)).Append(", ").Append((int)DreadBuildingPolicy.SuggestedCamera(d));
                for (int m = 0; m < 3; m++) sb.Append(", ").Append((int)DreadBuildingPolicy.AllowedCamera((CameraMode)m, d));
                sb.Append(']');
            }
            sb.Append("],\n    \"floors\": [");
            first = true;
            for (int count = 1; count <= 4; count++)
                for (int active = -1; active <= 4; active++)
                {
                    if (!first) sb.Append(", ");
                    first = false;
                    sb.Append('[').Append(count).Append(", ").Append(active).Append(", ").Append(DreadBuildingPolicy.ClampFloor(active, count)).Append(", [");
                    for (int f = 0; f < count; f++) sb.Append(f > 0 ? ", " : "").Append(DreadBuildingPolicy.FloorVisible(f, active, count, true) ? 1 : 0);
                    sb.Append("]]");
                }
            sb.Append("]\n  }\n}\n");
            return sb.ToString();
        }

        [Fact]
        public void Golden_file_matches_core_output()
        {
            var root = RepoRoot();
            var path = Path.Combine(root, "web", "test", "golden.json");
            var actual = Build(LoadCatalog(root));
            if (Environment.GetEnvironmentVariable("UPDATE_GOLDEN") == "1")
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.WriteAllText(path, actual);
            }
            Assert.Equal(actual, File.ReadAllText(path).Replace("\r\n", "\n"));
        }
    }
}
