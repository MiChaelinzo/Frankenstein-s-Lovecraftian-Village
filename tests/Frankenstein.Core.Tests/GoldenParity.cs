using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
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
        private static readonly (int w, int d, int n)[] Grids = { (24, 24, 40), (16, 12, 25), (8, 8, 100), (20, 20, 60) };
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

        private static readonly double[] FloorRolls = { 0.0, 0.34, 0.35, 0.49, 0.5, 0.99 };
        private static readonly string[] DailyInstants =
        {
            "2026-11-14T23:59:59Z", "2026-11-15T00:00:00Z", "2026-01-02T00:00:00Z", "2024-02-29T12:00:00Z", "0999-12-31T00:00:00Z", "9999-12-31T23:59:59Z",
        };
        private static readonly string[] DailyKeys = { "", "2026-11-14", "2026-11-15", "0001-01-01", "caf\u00e9", "not-a-date" };
        private const int AchievementCases = 64;

        private static string DreadToken(float d, CultureInfo inv) =>
            float.IsNaN(d) ? "\"NaN\"" : float.IsPositiveInfinity(d) ? "\"Infinity\"" : float.IsNegativeInfinity(d) ? "\"-Infinity\"" : d.ToString("R", inv);

        private static string RepoRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("repo root not found");
            return dir.FullName;
        }

        internal static PrefabCatalog LoadCatalog(string root)
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_catalog.json")));
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
                          .Append(p.Z).Append(", ").Append(p.SizeX).Append(", ").Append(p.SizeZ).Append(", ").Append(p.Facing).Append(']');
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
            sb.Append("],\n    \"floorCounts\": [");
            first = true;
            foreach (var id in new[] { "house_a", "house_b", "church", "well", "dead_tree" })
                foreach (var roll in FloorRolls)
                    foreach (var roll2 in FloorRolls)
                    {
                        if (!first) sb.Append(", ");
                        first = false;
                        sb.Append('[').Append(JsonSerializer.Serialize(id)).Append(", ").Append(roll.ToString("R", inv)).Append(", ")
                          .Append(roll2.ToString("R", inv)).Append(", ").Append(DreadBuildingPolicy.FloorCountFor(id, roll, roll2)).Append(']');
                    }
            sb.Append("]\n  },\n");
            AppendInteraction(sb, inv);
            AppendProgression(sb, inv);
            AppendShowcase(sb, inv);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendVigil(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendVillagers(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendDressing(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendCorruption(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendLandmarks(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendCity(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendWalkers(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendLore(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendItems(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendCreatures(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendHomestead(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendNames(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendLighthouseBeam(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendCollision(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendCityPresence(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendStory(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendSociety(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendAxes(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendDirector(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendInvestigation(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendMythos(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendKnowledge(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendKnowledgeInvestigation(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendShapes(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendOutcomes(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendTheories(sb, cat);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendMemory(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendChronicleProse(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendReality(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendPlaces(sb);
            sb.Length -= 1;
            sb.Append(",\n");
            AppendCreatureTiers(sb);
            sb.Append("}\n");
            return sb.ToString();
        }

        /// <summary>Top level key "creatureTiers" (round 32, spec 166): the manifestation data digest and, per seed and named scenario, the appearances of three days at every phase (id, position, exposure seconds, still flag, cause, subject, place).</summary>
        private static void AppendCreatureTiers(StringBuilder sb)
        {
            var inv = CultureInfo.InvariantCulture;
            var cat = CreatureTierTests.Catalog();
            var lib = VillagePlacesTests.Library();
            sb.Append("  \"creatureTiers\": {\n    \"defs\": [");
            sb.Append(string.Join(", ", cat.Manifestations.Select(m => "[" + Q(m.Id) + ", " + m.Tier + ", " + m.MinDread + ", " + Q(m.Phase) + ", " + m.Society + ", " + m.Knowledge + ", " + m.Omens + ", " + Q(m.Context) + ", " + m.Chance + ", " + Q(m.Cause) + ", " + Q(m.Ward) + "]")));
            sb.Append("],\n    \"runs\": [");
            bool first = true;
            foreach (var seed in VigilSeeds)
            {
                var places = VillagePlaces.PlaceAll(lib, seed, 24, 24);
                for (int sc = 0; sc < CreatureTierTests.ScenarioNames.Length; sc++)
                {
                    var slots = new List<string>();
                    for (int day = 0; day < 3; day++)
                        foreach (DayPhase p in new[] { DayPhase.Dawn, DayPhase.Day, DayPhase.Dusk, DayPhase.Night })
                        {
                            var list = CreatureTiers.Select(CreatureTierTests.Scenario(sc, seed, CreatureTierTests.Tick(day, p)), cat, places);
                            slots.Add(Q(string.Join(";", list.Select(a => a.DefId + "@" + Math.Round(a.X, 3).ToString("0.###", inv) + "," + Math.Round(a.Z, 3).ToString("0.###", inv) + ",s" + a.Seconds.ToString("0.###", inv) + ",m" + (a.Still ? 1 : 0) + "," + a.Cause + ",v" + a.Subject + ",p" + a.PlaceId))));
                        }
                    sb.Append(first ? "\n      " : ",\n      ").Append("[").Append(seed).Append(", ").Append(Q(CreatureTierTests.ScenarioNames[sc])).Append(", [").Append(string.Join(", ", slots)).Append("]]");
                    first = false;
                }
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "villagePlaces" (round 31, spec 164): per seed and grid, the placement of each place (centre, facing, entrance, door, hatch, tunnel exit), its dressing, the triangle counts per tier, the tunnel gate and the trail of the lead.</summary>
        private static void AppendPlaces(StringBuilder sb)
        {
            var inv = CultureInfo.InvariantCulture;
            string R(double v) { return (v + 0.0).ToString("R", inv); }
            string Pt(double[] p) { return "[" + R(p[0]) + ", " + R(p[1]) + "]"; }
            var lib = VillagePlacesTests.Library();
            var know = KnowledgeLibrary.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "knowledge.json")));
            sb.Append("  \"villagePlaces\": {\n    \"tiers\": [");
            sb.Append(string.Join(", ", lib.Places.Select(d => "[" + Q(d.Id) + ", " + string.Join(", ", Enumerable.Range(0, VillagePlaces.Tiers).Select(t => VillagePlaces.Triangles(d, t) + ", " + d.Budget[t])) + "]")));
            sb.Append("],\n    \"tunnel\": [");
            sb.Append(string.Join(", ", Enumerable.Range(0, KnowledgeLibrary.MaxTier + 1).Select(t => VillagePlaces.TunnelOpen(lib.Find(VillagePlaces.Manor), know, t) ? "1" : "0")));
            sb.Append("],\n    \"trails\": [");
            sb.Append(string.Join(", ", lib.Places.SelectMany(d => new[] { 1, 42, 1818 }.SelectMany(seed => new[] { 1, 3, 7 }.Select(n => "[" + Q(d.Id) + ", " + seed + ", " + n + ", " + VillagePlaces.TrailMissing(seed, d.Id, n) + "]")))));
            sb.Append("],\n    \"tearGate\": [");
            var tear = lib.Find(VillagePlaces.Catacomb).Discoveries.First(d => d.RequiresEffect.Length > 0);
            sb.Append(string.Join(", ", new[] { 1, 42, 1818 }.SelectMany(seed => Enumerable.Range(1, 6).SelectMany(night => Enumerable.Range(0, KnowledgeLibrary.MaxTier + 1).Select(t => "[" + seed + ", " + night + ", " + t + ", " + (VillagePlaces.Revealed(tear, new string[0], know, seed, night, t) ? "1" : "0") + "]")))));
            sb.Append("],\n    \"veinGate\": [");
            var vein = lib.Find(VillagePlaces.Mine).Discoveries.First(d => d.RequiresEffect.Length > 0);
            sb.Append(string.Join(", ", new[] { 1, 42, 1818 }.SelectMany(seed => Enumerable.Range(1, 6).SelectMany(night => Enumerable.Range(0, KnowledgeLibrary.MaxTier + 1).Select(t => "[" + seed + ", " + night + ", " + t + ", " + (VillagePlaces.Revealed(vein, new[] { "place@mine_veins" }, know, seed, night, t) ? "1" : "0") + "]")))));
            sb.Append("],\n    \"worlds\": [");
            bool first = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, VillageDistricts.CityGrid })
                {
                    var placed = new List<PlacePlacement>();
                    var entries = new List<string>();
                    foreach (var data in lib.Places)
                    {
                        var p = VillagePlaces.Place(data, seed, grid, grid, placed);
                        placed.Add(p);
                        var dressing = string.Join(", ", VillagePlaces.Dressing(data, p).Select(i => "[" + Q(i.Kind) + ", " + R(i.X) + ", " + R(i.Z) + ", " + R(i.Yaw) + "]"));
                        var found = string.Join(", ", data.Discoveries.Select(d => Pt(VillagePlaces.DiscoveryPoint(p, d))));
                        var lanterns = string.Join(", ", VillagePlaces.LanternPoints(data, p).Select(Pt));
                        var trail = string.Join(", ", VillagePlaces.TrailDressing(data, p, seed, grid, grid).Select(i => "[" + Q(i.Kind) + ", " + R(i.X) + ", " + R(i.Z) + ", " + R(i.Yaw) + "]"));
                        entries.Add("{ \"id\": " + Q(p.Id) + ", \"at\": " + Pt(new[] { p.X, p.Z }) + ", \"face\": " + Pt(new[] { p.FaceX, p.FaceZ }) + ", \"entrance\": " + Pt(p.Entrance) + ", \"door\": " + Pt(p.Door)
                            + ", \"graph\": " + Q(p.Graph == null ? "" : p.Graph.Dump(seed)) + ", \"tris\": [" + string.Join(", ", Enumerable.Range(0, VillagePlaces.Tiers).Select(t => VillagePlaces.TotalTriangles(data, p, t))) + "]"
                            + ", \"hatch\": " + Pt(p.Hatch) + ", \"tunnelExit\": " + Pt(p.TunnelExit) + ", \"discoveries\": [" + found + "], \"dressing\": [" + dressing + "], \"lanterns\": [" + lanterns + "], \"trail\": [" + trail + "] }");
                    }
                    sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"places\": [").Append(string.Join(", ", entries)).Append("] }");
                    first = false;
                }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>First-person interaction rules (top level key "interaction"): range, cooldown, sanity deltas and category mapping.</summary>
        private static void AppendInteraction(StringBuilder sb, CultureInfo inv)
        {
            float[] distances = { 0f, 1.5f, 2.99f, 3f, 3.01f, 10f, -0.5f, float.NaN, float.PositiveInfinity };
            float[] gaps = { 0f, 0.5f, 0.74f, 0.75f, 0.76f, 5f, -1f };
            string[] categories = { "House", "Landmark", "Prop", "", "Unknown" };
            sb.Append("  \"interaction\": { \"range\": ").Append(InteractionRules.Range.ToString("R", inv))
              .Append(", \"cooldown\": ").Append(InteractionRules.Cooldown.ToString("R", inv)).Append(", \"inRange\": [");
            bool first = true;
            foreach (var d in distances)
            {
                if (!first) sb.Append(", ");
                first = false;
                // NaN and infinity are not JSON numbers; they are encoded as strings.
                string text = float.IsNaN(d) ? "\"NaN\"" : float.IsInfinity(d) ? "\"Infinity\"" : d.ToString("R", inv);
                sb.Append('[').Append(text).Append(", ").Append(InteractionRules.InRange(d) ? 1 : 0).Append(']');
            }
            sb.Append("], \"cooldownElapsed\": [");
            first = true;
            foreach (var g in gaps)
            {
                if (!first) sb.Append(", ");
                first = false;
                sb.Append('[').Append(g.ToString("R", inv)).Append(", ").Append(InteractionRules.CooldownElapsed(10f + g, 10f) ? 1 : 0).Append(']');
            }
            sb.Append("], \"sanityDelta\": [");
            for (int k = 0; k < 4; k++)
                sb.Append(k > 0 ? ", " : "").Append(InteractionRules.SanityDelta((InteractionKind)k).ToString("R", inv));
            sb.Append("], \"kinds\": [");
            first = true;
            foreach (var c in categories)
            {
                if (!first) sb.Append(", ");
                first = false;
                sb.Append('[').Append(JsonSerializer.Serialize(c)).Append(", ").Append((int)InteractionRules.KindForCategory(c)).Append(']');
            }
            sb.Append("] },\n");
        }

        /// <summary>Codex, achievement and daily seed sections (top level keys "codex", "achievements", "daily").</summary>
        private static void AppendProgression(StringBuilder sb, CultureInfo inv)
        {
            sb.Append("  \"codex\": [\n");
            bool first = true;
            foreach (var s in Seeds)
                foreach (var nights in StoryNightCounts)
                {
                    var ritual = RitualChain.Generate(CampaignGenerator.Generate(s, nights));
                    if (!first) sb.Append(",\n");
                    first = false;
                    sb.Append("    { \"seed\": ").Append(s.ToString(inv)).Append(", \"requested\": ").Append(nights.ToString(inv)).Append(", \"order\": [")
                      .Append(string.Join(", ", CodexModel.CreatureOrder(ritual.Seed))).Append("], \"entries\": [");
                    var entries = CodexModel.Entries(ritual);
                    for (int i = 0; i < entries.Count; i++)
                    {
                        var e = entries[i];
                        sb.Append(i > 0 ? ", " : "");
                        if (e.Kind == "stage")
                            sb.Append('[').Append(JsonSerializer.Serialize(e.Id)).Append(", \"stage\", ").Append(e.Creature).Append(", ").Append(JsonSerializer.Serialize(e.Sigil))
                              .Append(", ").Append(JsonSerializer.Serialize(e.StageName)).Append(", ").Append(e.Night).Append(']');
                        else
                            sb.Append('[').Append(JsonSerializer.Serialize(e.Id)).Append(", \"omen\", ").Append(e.Tier).Append(']');
                    }
                    sb.Append("], \"unlocked\": [");
                    bool firstU = true;
                    for (int stage = -1; stage <= ritual.Stages.Count; stage++)
                        for (int tier = 0; tier <= CodexModel.OmenTiers + 1; tier++)
                        {
                            sb.Append(firstU ? "" : ", ").Append('[').Append(stage).Append(", ").Append(tier).Append(", ")
                              .Append(JsonSerializer.Serialize(CodexModel.UnlockedIds(ritual, stage, tier))).Append(']');
                            firstU = false;
                        }
                    sb.Append("] }");
                }
            sb.Append("\n  ],\n  \"sanityRules\": [").Append(SanityModel.FocusCost.ToString("R", inv)).Append(", ").Append(SanityModel.WhisperCost.ToString("R", inv)).Append(", ")
              .Append(SanityModel.ChurchCost.ToString("R", inv)).Append(", ").Append(SanityModel.CandleRestore.ToString("R", inv)).Append(", ")
              .Append(SanityModel.DrainPerSecond.ToString("R", inv)).Append("],\n  \"achievements\": [\n");
            for (int c = 0; c < AchievementCases; c++)
            {
                var r = new SeededRandom(c * 7919 + 13);
                var stats = new AchievementStats
                {
                    Whispers = r.Next(3), Listens = r.Next(6), Doors = r.Next(6), NightsTotal = r.Next(10), Tier = r.Next(5),
                    StageCount = r.Next(10), InvestigatorDone = r.Next(2) == 1,
                };
                stats.NightsVisited = r.Next(stats.NightsTotal + 2);
                stats.Stage = r.Next(stats.StageCount + 2) - 1;
                stats.CodexTotal = r.Next(14);
                stats.CodexCount = r.Next(stats.CodexTotal + 2);
                int mask = r.Next(32);
                for (int k = 0; k < AchievementRules.JournalKinds.Length; k++)
                    if ((mask & (1 << k)) != 0) stats.Kinds.Add(AchievementRules.JournalKinds[k]);
                if ((mask & 16) != 0) stats.Kinds.Add("unrelated");
                var done = AchievementRules.Completion(stats.Kinds);
                sb.Append("    { \"stats\": [").Append(stats.Whispers).Append(", ").Append(stats.Listens).Append(", ").Append(stats.Doors).Append(", ")
                  .Append(stats.NightsVisited).Append(", ").Append(stats.NightsTotal).Append(", ").Append(mask).Append(", ").Append(stats.Tier).Append(", ")
                  .Append(stats.Stage).Append(", ").Append(stats.StageCount).Append(", ").Append(stats.CodexCount).Append(", ").Append(stats.CodexTotal).Append(", ")
                  .Append(stats.InvestigatorDone ? 1 : 0).Append("], \"earned\": ").Append(JsonSerializer.Serialize(AchievementRules.EarnedIds(stats)))
                  .Append(", \"completion\": [").Append(done.Seen).Append(", ").Append(done.Total).Append(", ").Append(done.Percent).Append("] }")
                  .Append(c < AchievementCases - 1 ? ",\n" : "\n");
            }
            sb.Append("  ],\n  \"daily\": {\n    \"keys\": [");
            for (int i = 0; i < DailyInstants.Length; i++)
            {
                var instant = DateTime.Parse(DailyInstants[i], inv, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
                sb.Append(i > 0 ? ", " : "").Append('[').Append(JsonSerializer.Serialize(DailyInstants[i])).Append(", ")
                  .Append(JsonSerializer.Serialize(DailySeed.KeyFor(instant))).Append(']');
            }
            sb.Append("],\n    \"seeds\": [");
            for (int i = 0; i < DailyKeys.Length; i++)
                sb.Append(i > 0 ? ", " : "").Append('[').Append(JsonSerializer.Serialize(DailyKeys[i])).Append(", ").Append(DailySeed.SeedFromKey(DailyKeys[i]).ToString(inv)).Append(']');
            sb.Append("]\n  },\n");
        }

        private static readonly double[][] FlyDurations =
        {
            new[] { 3000.0, 4000.0, 2500.0 }, new[] { 1000.0 }, new[] { 0.0, 500.0, -5.0, 1500.0 }, new double[0],
        };
        private static readonly double[] FlyTimes = { -10, 0, 1, 999, 1500, 3000, 4321, 6999, 7000, 9499, 9500, 11499, 11500, 99999 };
        private static readonly (int w, int d)[] FlyGrids = { (24, 24), (16, 12), (8, 8) };

        private static WebShareOptions[] ShareCases()
        {
            return new[]
            {
                new WebShareOptions { Seed = 1818, Sanity = 100, Night = 0 },
                new WebShareOptions { Seed = -7, Sanity = 55, Night = 2, Theme = "bricks", Cam = "top", Floor = 1 },
                new WebShareOptions { Seed = 42, Sanity = 250, Night = 99, Theme = "auto", Cam = "third", Floor = 50, View3d = true, Cinematic = true },
                new WebShareOptions { Seed = int.MinValue, Sanity = -5, Night = -1, Cam = "first", Meshes = true, SkipIntro = true, Lang = "fr" },
                new WebShareOptions { Seed = 7, Sanity = 80, Night = 4, Story = true, Beat = 3, Tour = true, Lang = "en" },
                new WebShareOptions { Seed = 9, Sanity = 10, Night = 1, Theme = "bad theme!", Cam = "bogus" },
            };
        }

        private static readonly string[] PlaceIds = { "church", "altar", "well", "the walls", "the_walls", "", "house_a", "Church" };

        /// <summary>Showcase sections: "flythrough" (cinematic frames and 3D camera), "shareLinks" and "places".</summary>
        private static void AppendShowcase(StringBuilder sb, CultureInfo inv)
        {
            sb.Append("  \"flythrough\": {\n    \"cases\": [");
            bool first = true;
            foreach (var ds in FlyDurations)
                foreach (var reduced in new[] { false, true })
                    foreach (var g in FlyGrids)
                        foreach (var seed in Seeds)
                        {
                            if (!first) sb.Append(",\n      ");
                            first = false;
                            sb.Append("{ \"durations\": [").Append(string.Join(", ", Array.ConvertAll(ds, d => d.ToString("R", inv))))
                              .Append("], \"reduced\": ").Append(reduced ? "true" : "false").Append(", \"gridW\": ").Append(g.w).Append(", \"gridD\": ").Append(g.d)
                              .Append(", \"seed\": ").Append(seed.ToString(inv)).Append(", \"total\": ").Append(FlythroughPath.TotalMs(ds).ToString("R", inv)).Append(", \"frames\": [");
                            for (int k = 0; k < FlyTimes.Length; k++)
                            {
                                var f = FlythroughPath.Frame(FlyTimes[k], ds, reduced);
                                var c = FlythroughPath.Camera(FlyTimes[k], ds, g.w, g.d, seed, reduced);
                                sb.Append(k > 0 ? ", " : "").Append('[').Append(FlyTimes[k].ToString("R", inv)).Append(", ").Append(f.Done ? 1 : 0).Append(", ").Append(f.Beat)
                                  .Append(", ").Append(f.BeatT.ToString("R", inv)).Append(", ").Append(f.CamX.ToString("R", inv)).Append(", ").Append(f.CamY.ToString("R", inv))
                                  .Append(", ").Append(f.Zoom.ToString("R", inv)).Append(", ").Append(c.X.ToString("R", inv)).Append(", ").Append(c.Y.ToString("R", inv))
                                  .Append(", ").Append(c.Z.ToString("R", inv)).Append(", ").Append(c.Yaw.ToString("R", inv)).Append(", ").Append(c.Pitch.ToString("R", inv)).Append(']');
                            }
                            sb.Append("] }");
                        }
            sb.Append("]\n  },\n  \"shareLinks\": [\n");
            var cases = ShareCases();
            for (int i = 0; i < cases.Length; i++)
            {
                var o = cases[i];
                sb.Append("    { \"seed\": ").Append(o.Seed.ToString(inv)).Append(", \"sanity\": ").Append(o.Sanity).Append(", \"night\": ").Append(o.Night)
                  .Append(", \"theme\": ").Append(o.Theme == null ? "null" : JsonSerializer.Serialize(o.Theme))
                  .Append(", \"cam\": ").Append(o.Cam == null ? "null" : JsonSerializer.Serialize(o.Cam))
                  .Append(", \"floor\": ").Append(o.Floor).Append(", \"story\": ").Append(o.Story ? "true" : "false").Append(", \"beat\": ").Append(o.Beat)
                  .Append(", \"view3d\": ").Append(o.View3d ? "true" : "false").Append(", \"cinematic\": ").Append(o.Cinematic ? "true" : "false")
                  .Append(", \"meshes\": ").Append(o.Meshes ? "true" : "false").Append(", \"skipIntro\": ").Append(o.SkipIntro ? "true" : "false")
                  .Append(", \"tour\": ").Append(o.Tour ? "true" : "false").Append(", \"lang\": ").Append(o.Lang == null ? "null" : JsonSerializer.Serialize(o.Lang))
                  .Append(", \"hash\": ").Append(JsonSerializer.Serialize(WebShareLink.Hash(o))).Append(" }").Append(i < cases.Length - 1 ? ",\n" : "\n");
            }
            sb.Append("  ],\n  \"places\": [");
            first = true;
            foreach (var lang in new[] { "en", "fr", "xx" })
                foreach (var id in PlaceIds)
                {
                    if (!first) sb.Append(", ");
                    first = false;
                    sb.Append('[').Append(JsonSerializer.Serialize(lang)).Append(", ").Append(JsonSerializer.Serialize(id)).Append(", ").Append(JsonSerializer.Serialize(PromptStrings.PlaceName(lang, id))).Append(']');
                }
            sb.Append("]\n");
        }


        private static readonly int[] VigilSeeds = { 1, 42, -7, 1818, 123456789 };
        /// <summary>Scripted lock and lantern-cap trace: [step, begun, locked, canLightProbe, lightResult, nightLanterns] rows for the JS mirror.</summary>
        private static string VigilGates()
        {
            var camp = CampaignGenerator.Generate(1818, 3);
            var v = new VigilState(camp, RitualChain.Generate(camp));
            var rows = new List<string>();
            Action<string, string, int> row = (step, probe, result) => rows.Add("[" + JsonSerializer.Serialize(step) + ", " + (v.Begun ? 1 : 0) + ", " + (v.IsLocked ? 1 : 0) + ", "
                + (v.CanLightLantern(probe) ? 1 : 0) + ", " + result + ", " + v.NightLanterns + "]");
            row("new", "a", -1);
            v.Begin(); row("begin", "a", -1);
            foreach (var id in new[] { "a", "a", "b", "c", "d", "bad;id" }) { int r = v.LightLantern(id) ? 1 : 0; row("light " + id, id, r); }
            v.RecordSanity(0); row("collapse", "e", -1);
            var restored = new VigilState(camp, RitualChain.Generate(camp));
            restored.TryRestore(v.Serialize());
            rows.Add("[\"restored\", " + (restored.Begun ? 1 : 0) + ", " + (restored.IsLocked ? 1 : 0) + ", 0, -1, " + restored.NightLanterns + "]");
            return "[" + string.Join(", ", rows) + "]";
        }

        private static readonly int[] VigilClockTicks = { 0, 1, 239, 240, 839, 840, 841, 1079, 1080, 1439, 1440, 1441, 2279, 2280, 2900, -1, -240, -600, -1441 };
        /// <summary>Clock rules of the vigil: rows [tick, watchHour, watchStart, nightEnd, dueBeforeEnd, dueAtEnd, endureWait, canEndureMet, waitForDusk] plus a scripted ResolveDawn trace.</summary>
        private static string VigilClock()
        {
            var rows = new List<string>();
            foreach (int t in VigilClockTicks)
                rows.Add("[" + t + ", " + (VigilRules.IsWatchHour(t) ? 1 : 0) + ", " + VigilRules.WatchStartTick(t) + ", " + VigilRules.NightEndTick(t) + ", "
                    + (VigilRules.DawnDue(t, VigilRules.NightEndTick(t) - 1) ? 1 : 0) + ", " + (VigilRules.DawnDue(t, VigilRules.NightEndTick(t)) ? 1 : 0) + ", "
                    + VigilRules.EndureWaitMinutes(t) + ", " + (VigilRules.CanEndureAt(t, true) ? 1 : 0) + ", " + VigilRules.WaitForDuskMinutes(t) + "]");
            var camp = CampaignGenerator.Generate(1818, 3);
            var v = new VigilState(camp, RitualChain.Generate(camp));
            var trace = new List<string>();
            Action<string, bool, int> step = (label, endured, sanity) => trace.Add("[" + JsonSerializer.Serialize(label) + ", " + (endured ? 1 : 0) + ", " + sanity + ", " + v.NightsEndured + ", "
                + v.NightClues + ", " + (v.IsFinished ? 1 : 0) + ", " + (v.IsCollapsed ? 1 : 0) + "]");
            int next;
            v.Begin(); v.RecordSanity(70);
            bool ok = v.ResolveDawn(70, out next); step("missed with no clues", ok, next);
            v.RecordClue("a"); ok = v.ResolveDawn(next, out next); step("missed with one clue", ok, next);
            for (int i = 0; i < 6 && !v.CanEndureNight; i++) v.RecordClue("c" + i);
            ok = v.ResolveDawn(next, out next); step("endured", ok, next);
            v.RecordSanity(VigilRules.MissedDawnSanityLoss);
            ok = v.ResolveDawn(VigilRules.MissedDawnSanityLoss, out next); step("missed collapses", ok, next);
            ok = v.ResolveDawn(50, out next); step("finished is unchanged", ok, next);
            return "{\"ticks\": [" + string.Join(", ", rows) + "], \"missedLoss\": " + VigilRules.MissedDawnSanityLoss + ", \"resolve\": [" + string.Join(", ", trace) + "]}";
        }

        private static readonly int[] ClockTicks = { 0, 1, 119, 239, 240, 839, 840, 1079, 1080, 1439, 1440, 1441, 2900, -1, -240, -1441 };
        private static readonly int[] VillagerTicks = { 0, 300, 900, 1100, 1300, 1439 };
        /// <summary>Fractional ticks for presence: walks starting at dawn, market, dusk and night, the patrol, indoors late at night, the dawn door.</summary>
        private static readonly double[] PresenceTicks = { 0.0, 3.0, 130.5, 300.25, 700.0, 845.0, 1085.5, 1100.0, 1270.5, 1380.0, 1439.5, 1445.0 };
        private static readonly float[] PresenceDreads = { 0f, 0.2f, 0.67f, 1f };
        private static readonly float[] VillagerDreads = { 0f, 0.2f, 0.34f, 0.5f, 0.67f, 0.9f, 1f, float.NaN };

        /// <summary>Top level key "dressing": the seeded harbour, square and churchyard dressing on the real layout, per seed and grid.</summary>
        /// <summary>Top level key "walkers": the street walkers per seed, grid, tick and dread, and the walk bounds per seed.</summary>
        private static void AppendWalkers(StringBuilder sb)
        {
            var inv = CultureInfo.InvariantCulture;
            sb.Append("  \"walkers\": [");
            bool first = true;
            foreach (var seed in new[] { 1818, 7, -42 })
                foreach (var grid in new[] { 24, 16, 12 })
                    foreach (var tick in new[] { 0.0, 1100.0, 1337.5, 2000.25 })
                        foreach (var dread in new[] { 0.0, 0.5, 1.0 })
                        {
                            var list = VillageStreets.Walkers(seed, grid, grid, tick, dread);
                            VillageDressing.WalkBounds(seed, grid, grid, out double minX, out double maxX, out double minZ, out double maxZ);
                            sb.Append(first ? "\n    " : ",\n    ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"tick\": ").Append(tick.ToString("R", inv))
                              .Append(", \"dread\": ").Append(dread.ToString("R", inv)).Append(", \"bounds\": [").Append(minX.ToString("R", inv)).Append(", ").Append(maxX.ToString("R", inv)).Append(", ")
                              .Append(minZ.ToString("R", inv)).Append(", ").Append(maxZ.ToString("R", inv)).Append("], \"walkers\": [");
                            first = false;
                            for (int i = 0; i < list.Count; i++)
                            {
                                var w = list[i];
                                sb.Append(i > 0 ? ", " : "").Append('[').Append(w.Id).Append(", ").Append(w.X.ToString("R", inv)).Append(", ").Append(w.Z.ToString("R", inv)).Append(", ")
                                  .Append(w.Yaw.ToString("R", inv)).Append(", ").Append(w.Lantern ? "true" : "false").Append(']');
                            }
                            sb.Append("] }");
                        }
            sb.Append("\n  ]\n");
        }

        private static void AppendDressing(StringBuilder sb, PrefabCatalog cat)
        {
            var inv = CultureInfo.InvariantCulture;
            sb.Append("  \"dressing\": [");
            bool firstWorld = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, 16, VillageDistricts.CityGrid })
                {
                    var layout = grid == VillageDistricts.CityGrid ? VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed) : VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
                    var items = VillageDressing.Compose(seed, grid, grid, layout);
                    sb.Append(firstWorld ? "\n    " : ",\n    ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"dockU\": ")
                      .Append(VillageDressing.DockU(seed, grid, grid).ToString("R", inv)).Append(", \"items\": [");
                    firstWorld = false;
                    for (int i = 0; i < items.Count; i++)
                    {
                        var it = items[i];
                        sb.Append(i > 0 ? ", " : "").Append('[').Append('"').Append(it.Kind).Append('"').Append(", ").Append(it.X.ToString("R", inv)).Append(", ").Append(it.Y.ToString("R", inv)).Append(", ")
                          .Append(it.Z.ToString("R", inv)).Append(", ").Append(it.Yaw.ToString("R", inv)).Append(", ").Append(it.Scale.ToString("R", inv)).Append(']');
                    }
                    sb.Append("] }");
                }
            sb.Append("\n  ]\n");
        }

        /// <summary>Top level key "city": per seed and grid the district map (one string per z row, a digit per cell) and the chunked city layout.</summary>
        private static void AppendCity(StringBuilder sb, PrefabCatalog cat)
        {
            sb.Append("  \"city\": [");
            bool first = true;
            foreach (var seed in VigilSeeds)
                foreach (var g in new[] { new[] { VillageDistricts.CityGrid, VillageDistricts.CityPieces }, new[] { 24, 80 }, new[] { 30, 120 }, new[] { 12, 10 } })
                {
                    int grid = g[0];
                    var map = VillageDistricts.Map(seed, grid, grid);
                    var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, g[1], seed);
                    sb.Append(first ? "\n    " : ",\n    ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"count\": ").Append(g[1]).Append(", \"districts\": [");
                    first = false;
                    for (int z = 0; z < grid; z++)
                    {
                        sb.Append(z > 0 ? ", \"" : "\"");
                        for (int x = 0; x < grid; x++) sb.Append((char)('0' + map[x, z]));
                        sb.Append('"');
                    }
                    sb.Append("], \"pieces\": [");
                    for (int i = 0; i < layout.Count; i++)
                    {
                        var p = layout[i];
                        sb.Append(i > 0 ? ", " : "").Append("[\"").Append(p.Id).Append("\", ").Append(p.X).Append(", ").Append(p.Z).Append(", ").Append(p.SizeX).Append(", ").Append(p.SizeZ).Append(", ").Append(p.Facing).Append(']');
                    }
                    sb.Append("] }");
                }
            sb.Append("\n  ]\n");
        }

        /// <summary>Top level key "corruption": growth levels for dread and night pairs, and per world the ranked sites at full size with the scale of every candidate at every level.</summary>
        private static void AppendCorruption(StringBuilder sb)
        {
            var inv = CultureInfo.InvariantCulture;
            sb.Append("  \"corruption\": {\n    \"levels\": [");
            double[] dreads = { 0.0, 0.1, 0.25, 0.4, 0.5, 0.75, 0.9, 1.0, double.NaN, -1.0, 2.0 };
            int[] nights = { -3, 1, 2, 5, 10, 40 };
            bool first = true;
            foreach (var d in dreads)
                foreach (var n in nights)
                {
                    sb.Append(first ? "" : ", ").Append('[').Append(double.IsNaN(d) ? "null" : d.ToString("R", inv)).Append(", ").Append(n).Append(", ").Append(CorruptionGrowth.Level(d, n)).Append(']');
                    first = false;
                }
            sb.Append("],\n    \"worlds\": [");
            bool firstWorld = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, 16, VillageDistricts.CityGrid })
                {
                    var sites = CorruptionGrowth.Sites(seed, grid, grid);
                    sb.Append(firstWorld ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"sites\": [");
                    firstWorld = false;
                    for (int i = 0; i < sites.Count; i++)
                    {
                        var it = sites[i];
                        sb.Append(i > 0 ? ", " : "").Append("[\"").Append(it.Kind).Append("\", ").Append(it.X.ToString("R", inv)).Append(", ").Append(it.Y.ToString("R", inv)).Append(", ")
                          .Append(it.Z.ToString("R", inv)).Append(", ").Append(it.Yaw.ToString("R", inv)).Append(", ").Append(it.Scale.ToString("R", inv)).Append(']');
                    }
                    sb.Append("], \"scales\": [");
                    for (int level = 0; level <= CorruptionGrowth.Levels; level++)
                    {
                        sb.Append(level > 0 ? ", [" : "[");
                        for (int rank = 0; rank < sites.Count; rank++) sb.Append(rank > 0 ? ", " : "").Append(CorruptionGrowth.ScaleAt(rank, sites.Count, level).ToString("R", inv));
                        sb.Append(']');
                    }
                    sb.Append("] }");
                }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "landmarks": names, and per world the landmark anchors, props, lit paths, path stones and lamps, the walk bounds and the church rise heights.</summary>
        private static void AppendLandmarks(StringBuilder sb)
        {
            var inv = CultureInfo.InvariantCulture;
            string R(double v) { return v.ToString("R", inv); }
            sb.Append("  \"landmarks\": {\n    \"names\": [");
            for (int i = 0; i < VillageLandmarks.Ids.Length; i++)
                sb.Append(i > 0 ? ", " : "").Append("[\"").Append(VillageLandmarks.Ids[i]).Append("\", \"").Append(VillageLandmarks.Name(VillageLandmarks.Ids[i], "en")).Append("\", \"").Append(VillageLandmarks.Name(VillageLandmarks.Ids[i], "fr")).Append("\"]");
            sb.Append("],\n    \"hill\": [");
            double[][] probes = { new[] { 0.0, 0.0 }, new[] { 5.0, 3.0 }, new[] { -12.0, 6.0 }, new[] { 18.0, -9.0 }, new[] { 24.0, 0.0 }, new[] { 30.0, 2.0 } };
            for (int i = 0; i < probes.Length; i++) sb.Append(i > 0 ? ", " : "").Append('[').Append(R(probes[i][0])).Append(", ").Append(R(probes[i][1])).Append(", ").Append(R(VillageLandmarks.HillHeight(9.0, probes[i][0], probes[i][1]))).Append(']');
            sb.Append("],\n    \"worlds\": [");
            bool firstWorld = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, VillageDistricts.CityGrid })
                {
                    sb.Append(firstWorld ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid);
                    firstWorld = false;
                    VillageDressing.WalkBounds(seed, grid, grid, out double minX, out double maxX, out double minZ, out double maxZ);
                    sb.Append(", \"bounds\": [").Append(R(minX)).Append(", ").Append(R(maxX)).Append(", ").Append(R(minZ)).Append(", ").Append(R(maxZ)).Append("], \"marks\": [");
                    var marks = VillageLandmarks.All(seed, grid, grid);
                    for (int i = 0; i < marks.Count; i++) sb.Append(i > 0 ? ", " : "").Append("[\"").Append(marks[i].Id).Append("\", ").Append(R(marks[i].X)).Append(", ").Append(R(marks[i].Z)).Append(", ").Append(R(marks[i].Radius)).Append(']');
                    sb.Append("], \"props\": ");
                    AppendItems(sb, VillageLandmarks.Dressing(seed, grid, grid), inv);
                    sb.Append(", \"paths\": [");
                    var paths = VillageLandmarks.Paths(seed, grid, grid);
                    for (int i = 0; i < paths.Count; i++)
                    {
                        sb.Append(i > 0 ? ", " : "").Append("[\"").Append(paths[i].Target).Append("\"");
                        foreach (var pt in paths[i].Points) sb.Append(", [").Append(R(pt[0])).Append(", ").Append(R(pt[1])).Append(']');
                        sb.Append(']');
                    }
                    sb.Append("], \"lit\": ");
                    AppendItems(sb, VillageLandmarks.PathDressing(seed, grid, grid), inv);
                    sb.Append(", \"at\": [");
                    for (int i = 0; i < marks.Count; i++) sb.Append(i > 0 ? ", " : "").Append('"').Append(VillageLandmarks.At(seed, grid, grid, marks[i].X + 2.0, marks[i].Z - 1.0)).Append('"');
                    sb.Append("], \"ground\": [");
                    VillageDressing.ChurchSite(seed, grid, grid, out double cx, out double cz, out int face, out double hill);
                    for (int i = 0; i < probes.Length; i++) sb.Append(i > 0 ? ", " : "").Append(R(VillageLandmarks.GroundHeight(seed, grid, grid, cx + probes[i][0], cz + probes[i][1])));
                    sb.Append("] }");
                }
            sb.Append("\n    ]\n  }\n");
        }

        private static void AppendItems(StringBuilder sb, List<DressingItem> items, CultureInfo inv)
        {
            sb.Append('[');
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                sb.Append(i > 0 ? ", " : "").Append("[\"").Append(it.Kind).Append("\", ").Append(it.X.ToString("R", inv)).Append(", ").Append(it.Y.ToString("R", inv)).Append(", ").Append(it.Z.ToString("R", inv)).Append(", ")
                  .Append(it.Yaw.ToString("R", inv)).Append(", ").Append(it.Scale.ToString("R", inv)).Append(']');
            }
            sb.Append(']');
        }

        /// <summary>Top level key "villagers": clock, seeded rosters on the real layout, schedules, locations, behaviors, clue rule and talk results.</summary>
        private static void AppendVillagers(StringBuilder sb, PrefabCatalog cat)
        {
            string J(object o) { return JsonSerializer.Serialize(o); }
            sb.Append("  \"villagers\": {\n    \"clockConstants\": [").Append(GameClock.DawnMinutes).Append(", ").Append(GameClock.DayMinutes).Append(", ")
              .Append(GameClock.DuskMinutes).Append(", ").Append(GameClock.NightMinutes).Append(", ").Append(GameClock.MinutesPerDay).Append("],\n    \"sessionStart\": ").Append(GameClock.SessionStartTick).Append(",\n    \"clock\": [");
            for (int i = 0; i < ClockTicks.Length; i++)
            {
                int t = ClockTicks[i];
                sb.Append(i > 0 ? ", " : "").Append('[').Append(t).Append(", ").Append(GameClock.Wrap(t)).Append(", ").Append(GameClock.DayNumber(t)).Append(", ")
                  .Append((int)GameClock.PhaseAt(t)).Append(", ").Append(GameClock.DaylightPercent(t)).Append(", ").Append(GameClock.LanternsLit(t) ? 1 : 0).Append(']');
            }
            sb.Append("],\n    \"weather\": {\"names\": ").Append(J(GameClock.WeatherNames)).Append(", \"days\": [");
            bool firstWeather = true;
            foreach (var wSeed in new[] { 1818, 7, -42 })
            {
                sb.Append(firstWeather ? "" : ", ").Append("[").Append(wSeed);
                firstWeather = false;
                for (int day = -3; day <= 40; day++) sb.Append(", ").Append(GameClock.WeatherIndexForDay(wSeed, day));
                sb.Append(']');
            }
            sb.Append("]},\n    \"clueRule\": [");
            bool firstRule = true;
            for (int d = 0; d < 4; d++)
                for (int b = 0; b < 5; b++)
                {
                    sb.Append(firstRule ? "" : ", ").Append('[').Append(d).Append(", ").Append(b).Append(", ")
                      .Append(VigilRules.VillagerTalkCountsAsClue((VillagerDisposition)d, (VillagerBehavior)b) ? 1 : 0).Append(", ").Append(InteractionRules.TalkSanityDelta((VillagerBehavior)b, d % 2 == 0).ToString("R", CultureInfo.InvariantCulture)).Append(']');
                    firstRule = false;
                }
            sb.Append("],\n    \"worlds\": [");
            bool firstWorld = true;
            foreach (var seed in VigilSeeds)
            {
                var layout = VillageLayoutGenerator.Generate(cat, 24, 24, 40, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var campaign = CampaignGenerator.Generate(seed, 5);
                sb.Append(firstWorld ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"roster\": [");
                firstWorld = false;
                foreach (var v in roster)
                    sb.Append(v.Index > 0 ? ", " : "").Append('[').Append(J(v.Name)).Append(", ").Append((int)v.Role).Append(", ").Append((int)v.Disposition).Append(", ").Append(v.HomeIndex).Append(", ").Append(v.WorkIndex).Append(']');
                sb.Append("], \"schedule\": [");
                foreach (var v in roster)
                {
                    sb.Append(v.Index > 0 ? ", " : "").Append('[');
                    for (int p = 0; p < GameClock.PhaseCount; p++) sb.Append(p > 0 ? ", " : "").Append((int)VillagerRules.ScheduledKind(v, (DayPhase)p));
                    sb.Append(']');
                }
                sb.Append("], \"locations\": [");
                bool firstLoc = true;
                foreach (var v in roster)
                    foreach (var t in VillagerTicks)
                        foreach (var d in VillagerDreads)
                        {
                            var place = VillagerRules.LocationAt(v, t, d);
                            sb.Append(firstLoc ? "" : ", ").Append('[').Append((int)VillagerRules.BehaviorAt(v, t, d)).Append(", ").Append((int)place.Kind).Append(", ").Append(place.PieceIndex).Append(']');
                            firstLoc = false;
                        }
                sb.Append("], \"stand\": [");
                bool firstStand = true;
                foreach (var v in roster)
                    for (int k = 0; k <= (int)VillagerPlaceKind.Shore; k++)
                    {
                        var pt = VillagerRules.StandPoint(v, (VillagerPlaceKind)k, layout, 24, 24, seed);
                        sb.Append(firstStand ? "" : ", ").Append('[').Append(k).Append(", ").Append(pt.X.ToString("R", CultureInfo.InvariantCulture)).Append(", ").Append(pt.Z.ToString("R", CultureInfo.InvariantCulture))
                          .Append(", ").Append(pt.FaceDx.ToString("R", CultureInfo.InvariantCulture)).Append(", ").Append(pt.FaceDz.ToString("R", CultureInfo.InvariantCulture)).Append(']');
                        firstStand = false;
                    }
                sb.Append("], \"lanterns\": [");
                bool firstLamp = true;
                foreach (var v in roster)
                    foreach (var t in VillagerTicks) { sb.Append(firstLamp ? "" : ", ").Append(VillagerRules.CarriesLitLantern(v, t) ? 1 : 0); firstLamp = false; }
                sb.Append("], \"presence\": [");
                bool firstPresence = true;
                foreach (var v in roster)
                    foreach (var t in PresenceTicks)
                        foreach (var d in PresenceDreads)
                        {
                            var pr = VillagerRules.PresenceAt(roster, v, t, d, layout, 24, 24, seed);
                            string R(double x) { return x.ToString("R", CultureInfo.InvariantCulture); }
                            sb.Append(firstPresence ? "" : ", ").Append('[').Append(pr.Gone ? 1 : 0).Append(", ").Append(pr.Walking ? 1 : 0).Append(", ").Append(pr.Indoors ? 1 : 0).Append(", ")
                              .Append((int)pr.Stop).Append(", ").Append((int)pr.Place).Append(", ").Append(R(pr.X)).Append(", ").Append(R(pr.Z)).Append(", ").Append(R(pr.FaceDx)).Append(", ")
                              .Append(R(pr.FaceDz)).Append(", ").Append(R(pr.Stride)).Append(", ").Append(R(pr.Fade)).Append(']');
                            firstPresence = false;
                        }
                sb.Append("], \"talks\": [");
                bool firstTalk = true;
                foreach (var v in roster)
                    foreach (var t in VillagerTicks)
                        foreach (var d in VillagerDreads)
                        {
                            int night = 1 + (v.Index + t) % 7;
                            var r = VillagerRules.Talk(seed, v, t, d, campaign, night);
                            sb.Append(firstTalk ? "" : ", ").Append('[').Append(night).Append(", ").Append(r.Available ? 1 : 0).Append(", ").Append((int)r.Behavior).Append(", ")
                              .Append(r.YieldsClue ? 1 : 0).Append(", ").Append(J(r.ClueId)).Append(", ").Append(r.SanityDelta.ToString("R", CultureInfo.InvariantCulture)).Append(", ")
                              .Append(r.LineVariant).Append(", ").Append(J(r.Rumor)).Append(']');
                            firstTalk = false;
                        }
                sb.Append("], \"chats\": [");
                bool firstChat = true;
                foreach (var v in roster)
                    foreach (var t in VillagerTicks)
                        foreach (var d in VillagerDreads)
                        {
                            int night = 1 + (v.Index + t) % 7, topic = (v.Index + night) % VillagerRules.ChatTopics;
                            int cluesLeft = (v.Index + t) % 3, lampsLeft = (v.Index + night) % 2, sanity = VigilRules.SteadySanity - 10 + 20 * (v.Index % 2);
                            var c = VillagerRules.Chat(seed, v, t, d, night, topic, cluesLeft, lampsLeft, sanity);
                            sb.Append(firstChat ? "" : ", ").Append('[').Append(night).Append(", ").Append(topic).Append(", ").Append(cluesLeft).Append(", ").Append(lampsLeft).Append(", ").Append(sanity).Append(", ")
                              .Append(c.Available ? 1 : 0).Append(", ").Append(c.Topic).Append(", ").Append(J(c.HintId)).Append(", ").Append(c.LineVariant).Append(']');
                            firstChat = false;
                        }
                sb.Append("] }");
            }
            sb.Append("\n    ],\n    \"ticks\": ").Append(J(VillagerTicks)).Append(",\n    \"dreads\": [");
            for (int i = 0; i < VillagerDreads.Length; i++) sb.Append(i > 0 ? ", " : "").Append(DreadToken(VillagerDreads[i], CultureInfo.InvariantCulture));
            sb.Append("]\n  }\n");
        }

        private static readonly string[] VigilBadCodes =
        {
            "", "V1", "V1-5-dawn", "V2-5-dawn-10", "V1-5-nobody-10", "V1-5-dawn--10", "V1-5-dawn-+10", "V1-05-dawn-10", "V1--0-dawn-10",
            "V1-5-dawn-010", "V1-abc-dawn-10", "V1-99999999999-dawn-10", "V1-5-dawn-10-", "V1--7-name_spoken-3400", "V1-2147483647-vessel-0",
        };

        /// <summary>Top level key "lore": the library digest (id, place, sanity, clue) and the seeded placements per village (positions to 3 decimals).</summary>
        private static void AppendLore(StringBuilder sb, PrefabCatalog cat)
        {
            var inv = CultureInfo.InvariantCulture;
            var lib = LoreLibrary.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "lore_books.json")));
            sb.Append("  \"lore\": {\n    \"books\": [");
            for (int i = 0; i < lib.Books.Count; i++)
            {
                var b = lib.Books[i];
                sb.Append(i > 0 ? ", " : "").Append("[\"").Append(b.Id).Append("\", \"").Append(b.Place).Append("\", ").Append(b.Sanity).Append(", ").Append(b.Clue ? 1 : 0).Append(']');
            }
            sb.Append("],\n    \"villages\": [");
            bool first = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, 16 })
                {
                    var layout = VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
                    var placed = LoreBookRules.Place(seed, grid, grid, layout, lib);
                    sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"books\": [");
                    first = false;
                    for (int i = 0; i < placed.Count; i++)
                        sb.Append(i > 0 ? ", " : "").Append("[\"").Append(placed[i].BookId).Append("\", \"").Append(placed[i].Place).Append("\", ")
                          .Append(Math.Round(placed[i].X, 3).ToString("0.###", inv)).Append(", ").Append(Math.Round(placed[i].Z, 3).ToString("0.###", inv)).Append(']');
                    sb.Append("] }");
                }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "items" (round 25): the item library digest, seeded ground items and chests per village (positions to 3 decimals) and a scripted inventory scenario.</summary>
        private static void AppendItems(StringBuilder sb, PrefabCatalog cat)
        {
            var inv = CultureInfo.InvariantCulture;
            var lib = ItemCatalog.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "items.json")));
            sb.Append("  \"items\": {\n    \"defs\": [");
            for (int i = 0; i < lib.Items.Count; i++)
            {
                var d = lib.Items[i];
                sb.Append(i > 0 ? ", " : "").Append("[\"").Append(d.Id).Append("\", \"").Append(d.Kind).Append("\", \"").Append(d.Effect).Append("\", ").Append(d.Amount).Append(", ").Append(d.Stack).Append(", ").Append(d.Weight).Append(", ").Append(d.Clue ? 1 : 0).Append(']');
            }
            sb.Append("],\n    \"villages\": [");
            bool first = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, 16 })
                {
                    var layout = VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
                    var world = ItemWorld.Create(seed, grid, grid, layout, lib);
                    sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"ground\": [");
                    first = false;
                    for (int i = 0; i < world.Ground.Count; i++)
                        sb.Append(i > 0 ? ", " : "").Append("[\"").Append(world.Ground[i].ItemId).Append("\", ").Append(world.Ground[i].Count).Append(", ")
                          .Append(Math.Round(world.Ground[i].X, 3).ToString("0.###", inv)).Append(", ").Append(Math.Round(world.Ground[i].Z, 3).ToString("0.###", inv)).Append(']');
                    sb.Append("], \"chests\": [");
                    for (int i = 0; i < world.Chests.Count; i++)
                        sb.Append(i > 0 ? ", " : "").Append('[').Append(world.Chests[i].HouseIndex).Append(", ").Append(world.Chests[i].Lodging ? 1 : 0).Append(", ")
                          .Append(Math.Round(world.Chests[i].X, 3).ToString("0.###", inv)).Append(", ").Append(Math.Round(world.Chests[i].Z, 3).ToString("0.###", inv)).Append(", \"").Append(world.Chests[i].Contents.SlotsText()).Append("\"]");
                    sb.Append("], \"state\": \"").Append(world.Serialize(new Inventory(ItemRules.PlayerSlots))).Append("\" }");
                }
            sb.Append("\n    ],\n    \"scenario\": [");
            var player = new Inventory(3);
            var sanity = new SanityModel(50f);
            var log = new List<string>();
            log.Add("add bread 7 -> " + player.Add(lib, "bread", 7));
            log.Add("add tea 3 -> " + player.Add(lib, "tea", 3));
            log.Add("add salt 9 -> " + player.Add(lib, "salt", 9));
            log.Add("add herbs 1 -> " + player.Add(lib, "herbs", 1));
            log.Add("use bread -> " + UseText(player.Use(lib, "bread", sanity)) + " sanity " + sanity.Value.ToString("0.###", inv));
            log.Add("use salt -> " + UseText(player.Use(lib, "salt", sanity)));
            log.Add("use lantern_oil -> " + UseText(player.Use(lib, "lantern_oil", sanity)));
            log.Add("remove bread 4 -> " + player.Remove("bread", 4));
            player.Fuel = 70;
            player.Add(lib, "lantern_oil", 2);
            log.Add("use lantern_oil -> " + UseText(player.Use(lib, "lantern_oil", sanity)) + " fuel " + player.Fuel);
            log.Add("use lantern_oil -> " + UseText(player.Use(lib, "lantern_oil", sanity)) + " fuel " + player.Fuel);
            log.Add("slots " + player.SlotsText());
            for (int i = 0; i < log.Count; i++) sb.Append(i > 0 ? ", " : "").Append(JsonSerializer.Serialize(log[i]));
            sb.Append("]\n  }\n");
        }

        private static string UseText(ItemUseResult r)
        {
            return (r.Used ? "used" : "refused " + r.Reason) + " s" + r.SanityDelta + " f" + r.FuelDelta;
        }

        /// <summary>Top level key "creatures" (round 25): the data digest, seeded spawns per village and condition, and a scripted encounter with every counter.</summary>
        private static void AppendCreatures(StringBuilder sb, PrefabCatalog cat)
        {
            var inv = CultureInfo.InvariantCulture;
            var lib = CreatureCatalog.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "creatures.json")));
            var items = ItemCatalog.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "items.json")));
            int night = GameClock.PhaseStart(DayPhase.Night) + 60, dusk = GameClock.PhaseStart(DayPhase.Dusk) + 5, day = GameClock.PhaseStart(DayPhase.Day) + 10;
            sb.Append("  \"creatures\": {\n    \"defs\": [");
            for (int i = 0; i < lib.Defs.Count; i++)
            {
                var d = lib.Defs[i];
                sb.Append(i > 0 ? ", " : "").Append("[\"").Append(d.Id).Append("\", \"").Append(d.Habitat).Append("\", \"").Append(d.Phase).Append("\", \"").Append(d.Weather).Append("\", ").Append(d.MinDread).Append(", ").Append(d.Max).Append(", ")
                  .Append(d.Drain.ToString("0.###", inv)).Append(", ").Append(d.Range.ToString("0.###", inv)).Append(", ").Append(d.NeedsLos ? 1 : 0).Append(", ").Append(d.Speed.ToString("0.###", inv)).Append(", ")
                  .Append(d.Hunt.ToString("0.###", inv)).Append(", ").Append(d.Height.ToString("0.###", inv)).Append(']');
            }
            sb.Append("],\n    \"spawns\": [");
            var conditions = new[] { new object[] { night, 1.0, "fog" }, new object[] { night, 0.0, "clear" }, new object[] { dusk, 0.5, "clear" }, new object[] { day, 0.5, "mist" } };
            bool first = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, 16 })
                {
                    var layout = VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
                    var solids = LoreBookRules.SolidProps(LoreBookRules.AllDressing(seed, grid, grid, layout));
                    Func<double, double, bool> blocked = (x, z) => LoreBookRules.IsBlocked(x, z, layout, solids, seed, grid, grid);
                    foreach (var c in conditions)
                    {
                        var enc = CreatureEncounter.Spawn(seed, grid, grid, (int)c[0], (double)c[1], (string)c[2], lib, blocked);
                        sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"tick\": ").Append((int)c[0]).Append(", \"dread\": ").Append(((double)c[1]).ToString("0.###", inv))
                          .Append(", \"weather\": \"").Append((string)c[2]).Append("\", \"creatures\": [");
                        first = false;
                        for (int i = 0; i < enc.Creatures.Count; i++) sb.Append(i > 0 ? ", " : "").Append('"').Append(enc.Describe(enc.Creatures[i])).Append('"');
                        sb.Append("] }");
                    }
                }
            sb.Append("\n    ],\n    \"scenario\": [");
            var scene = CreatureEncounter.Spawn(1818, 24, 24, night, 1.0, "fog", lib, null);
            var player = new Inventory(12);
            player.Add(items, "salt", 2);
            player.Add(items, "sigil_chalk", 1);
            Func<double, double, bool> wall = (x, z) => x > 20 && x < 22 && z > 0 && z < 40;
            var log = new List<string>();
            var target = scene.Creatures[0];
            double px = target.X + 9.0, pz = target.Z;
            log.Add("spawned " + string.Join(";", scene.Creatures.Select(scene.Describe)));
            Action<string, CreatureStep> note = (label, r) => log.Add(label + " drain " + r.Drain.ToString("0.####", inv) + " burn " + r.FuelBurn + " tele " + r.Telegraph.ToString("0.####", inv) + " near " + r.Nearest + " pushed " + (r.Pushed ? 1 : 0) + " blocked " + (r.Blocked ? 1 : 0) + " at " + scene.Describe(target));
            int tick = night;
            for (int i = 0; i < 4; i++) note("walk" + i, scene.Step(0.5, px, pz, tick, 0, wall));
            for (int i = 0; i < 3; i++) note("lantern" + i, scene.Step(1.0, target.X + 5.0, target.Z, tick, player.Fuel, wall));
            log.Add("salt " + (scene.PlaceSalt(player, target.X + 8.0, target.Z, -1, 0, tick) == "" ? "ok" : "no") + " left " + player.Count("salt"));
            for (int i = 0; i < 3; i++) note("salted" + i, scene.Step(0.5, target.X + 8.0, target.Z, tick, 0, wall));
            log.Add("sigil " + (scene.PlaceSigil(player, target.X + 12.0, target.Z, tick) == "" ? "ok" : "no") + " again " + scene.PlaceSigil(player, target.X, target.Z, tick));
            for (int i = 0; i < 3; i++) note("sigil" + i, scene.Step(0.5, target.X + 12.0, target.Z, tick, 0, wall));
            log.Add("flare " + scene.UseFlare(player, tick) + " fuel " + player.Fuel + " again " + scene.UseFlare(player, tick + 1));
            note("flared", scene.Step(1.0, target.X + 6.0, target.Z, tick + 1, 0, wall));
            tick += CreatureRules.SaltMinutes;
            note("later", scene.Step(0.5, target.X + 8.0, target.Z, tick, 0, wall));
            log.Add("wards " + scene.Wards.Count + " fuelDebt " + scene.FuelDebt.ToString("0.####", inv));
            for (int i = 0; i < log.Count; i++) sb.Append(i > 0 ? ", " : "").Append(JsonSerializer.Serialize(log[i]));
            sb.Append("]\n  }\n");
        }

        /// <summary>Three decimals without a negative zero, so the golden file never holds "-0".</summary>
        private static string F3(double v)
        {
            var s = v.ToString("0.###", CultureInfo.InvariantCulture);
            return s == "-0" ? "0" : s;
        }

        /// <summary>Top level key "homestead" (round 25): the data digest, the plot per golden village (origin and first bed to 3 decimals, plot edge corruption at every level) and a scripted homestead scenario.</summary>
        private static void AppendHomestead(StringBuilder sb, PrefabCatalog cat)
        {
            var inv = CultureInfo.InvariantCulture;
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var items = ItemCatalog.Parse(File.ReadAllText(Path.Combine(data, "items.json")));
            var lib = HomesteadCatalog.Parse(File.ReadAllText(Path.Combine(data, "homestead.json")), items);
            sb.Append("  \"homestead\": {\n    \"defs\": [");
            var defs = new List<string>();
            foreach (var c in lib.Crops) defs.Add("crop " + c.Id + " " + c.Kind + " " + c.SeedItem + " " + c.HarvestItem + " " + c.GrowDays + " " + c.Yield);
            foreach (var s in lib.Structures) defs.Add("structure " + s.Id + " " + s.Cost);
            foreach (var r in lib.Residents) defs.Add("animal " + r.Id + " " + r.Group + " " + r.FoodItem + " " + r.Shelter + " " + r.FedDays + " " + r.Sanity + " " + (r.Produce.Length == 0 ? "-" : r.Produce) + " " + r.Every + " " + r.Cap + " " + r.Count);
            foreach (var s in lib.Starter) defs.Add("starter " + s.Id + " " + s.Count);
            for (int i = 0; i < defs.Count; i++) sb.Append(i > 0 ? ", " : "").Append(JsonSerializer.Serialize(defs[i]));
            sb.Append("],\n    \"plots\": [");
            bool first = true;
            foreach (var seed in VigilSeeds)
                foreach (var grid in new[] { 24, 16 })
                {
                    var layout = VillageLayoutGenerator.Generate(cat, grid, grid, grid == 24 ? 40 : 20, seed);
                    var plot = HomesteadPlot.Create(seed, grid, grid, layout, ItemWorld.Create(seed, grid, grid, layout, items));
                    sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"grid\": ").Append(grid).Append(", \"exists\": ").Append(plot.Exists ? 1 : 0);
                    first = false;
                    sb.Append(", \"origin\": [").Append(F3(plot.OriginX)).Append(", ").Append(F3(plot.OriginZ)).Append("], \"dir\": [").Append(F3(plot.DirX)).Append(", ").Append(F3(plot.DirZ)).Append("], \"bed5\": [");
                    if (plot.Exists) sb.Append(F3(plot.Beds[5][0])).Append(", ").Append(F3(plot.Beds[5][1]));
                    sb.Append("], \"edge\": [");
                    for (int level = 0; level <= CorruptionGrowth.Levels; level++)
                    {
                        var edge = CorruptionGrowth.GrowPlotEdge(plot.OriginX, plot.OriginZ, plot.SideX, plot.SideZ, plot.DirX, plot.DirZ, level);
                        sb.Append(level > 0 ? ", " : "").Append('"');
                        for (int i = 0; i < edge.Count; i++) sb.Append(i > 0 ? ";" : "").Append(edge[i].Kind).Append(' ').Append(F3(edge[i].X)).Append(' ').Append(F3(edge[i].Z)).Append(' ').Append(F3(edge[i].Yaw)).Append(' ').Append(F3(edge[i].Scale));
                        sb.Append('"');
                    }
                    sb.Append("] }");
                }
            sb.Append("\n    ],\n    \"scenario\": [");
            var scene = ItemWorld.Create(1818, 24, 24, VillageLayoutGenerator.Generate(cat, 24, 24, 40, 1818), items);
            var scLayout = VillageLayoutGenerator.Generate(cat, 24, 24, 40, 1818);
            var h = new Homestead(lib, HomesteadPlot.Create(1818, 24, 24, scLayout, scene));
            var player = new Inventory(ItemRules.PlayerSlots);
            var log = new List<string>();
            Func<string, HomesteadResult, string> res = (label, r) => label + " " + (r.Ok ? "ok" : r.Reason) + " " + r.Count;
            int day = GameClock.MinutesPerDay, t = GameClock.SessionStartTick;
            log.Add(res("plant early", h.Plant(0, "turnip", t, player)));
            log.Add(res("claim", h.Claim(t, player, items)));
            log.Add(res("claim again", h.Claim(t, player, items)));
            log.Add(res("plant turnip", h.Plant(0, "turnip", t, player)));
            log.Add(res("plant glowcap", h.Plant(1, "glowcap", t, player)));
            log.Add(res("build coop", h.Build("coop", player)));
            log.Add(res("build coop again", h.Build("coop", player)));
            log.Add(res("build trough", h.Build("trough", player)));
            log.Add(res("build scarecrow", h.Build("scarecrow", player)));
            log.Add(res("build fence", h.Build("fence", player)));
            player.Add(items, "turnip", 1); player.Add(items, "kelp", 1);
            log.Add(res("adopt chicken", h.Feed("chicken", t, player)));
            log.Add(res("adopt jar", h.Feed("jar_tentacle", t, player)));
            foreach (int days in new[] { 0, 1, 2, 3 })
            {
                int now = t + days * day;
                log.Add("day " + days + " stages " + h.StageOf(0, now) + h.StageOf(1, now) + h.StageOf(2, now) + " chickenFed " + h.FedPercent(lib.FindResident("chicken"), t, now) + " mood " + h.Mood(lib.FindResident("chicken"), t, now, 0) + "/" + h.Mood(lib.FindResident("jar_tentacle"), t, now, 3)
                    + " eggs " + h.ProduceReady(lib.FindResident("chicken"), h.Residents[0], now) + " sanity " + h.DailySanity(now, days));
            }
            log.Add(res("collect", h.Collect("chicken", t + 3 * day, player, items)));
            log.Add(res("harvest turnip", h.Harvest(0, t + 3 * day, 4, player, items)));
            log.Add(res("harvest glowcap", h.Harvest(1, t + 3 * day, 4, player, items)));
            log.Add("yields " + h.YieldAt(lib.FindCrop("turnip"), 3) + h.YieldAt(lib.FindCrop("kelp"), 3) + h.YieldAt(lib.FindCrop("eyeroot"), 2));
            log.Add("bag " + player.SlotsText());
            log.Add("save " + h.Serialize());
            for (int i = 0; i < log.Count; i++) sb.Append(i > 0 ? ", " : "").Append(JsonSerializer.Serialize(log[i]));
            sb.Append("]\n  }\n");
        }

        /// <summary>Top level key "names": per city seed, the English and French name of every layout piece and of every landmark (round 24).</summary>
        private static void AppendNames(StringBuilder sb, PrefabCatalog cat)
        {
            var lib = NameLibrary.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "names.json")));
            sb.Append("  \"names\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var names = VillageNames.Assign(lib, seed, grid, grid, layout);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"en\": [");
                first = false;
                for (int i = 0; i < names.Count; i++) sb.Append(i > 0 ? ", " : "").Append('"').Append(names[i] == null ? "" : names[i].Get("en")).Append('"');
                sb.Append("], \"fr\": [");
                for (int i = 0; i < names.Count; i++) sb.Append(i > 0 ? ", " : "").Append('"').Append(names[i] == null ? "" : names[i].Get("fr")).Append('"');
                sb.Append("], \"landmarks\": [");
                for (int i = 0; i < VillageLandmarks.Ids.Length; i++)
                {
                    var n = VillageNames.Landmark(lib, seed, VillageLandmarks.Ids[i]);
                    sb.Append(i > 0 ? ", " : "").Append("[\"").Append(n.Get("en")).Append("\", \"").Append(n.Get("fr")).Append("\"]");
                }
                sb.Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "lighthouseBeam" (round 24): the constants, and per seed the lighthouse site on the 36 by 36 city and the beam yaw at fixed times.</summary>
        private static void AppendLighthouseBeam(StringBuilder sb)
        {
            var inv = CultureInfo.InvariantCulture;
            string R(double v) { return v.ToString("R", inv); }
            double[] times = { 0, 1.5, 4, 8, 15.99, 16, 33.3, 1000.25 };
            sb.Append("  \"lighthouseBeam\": {\n    \"period\": ").Append(R(LighthouseBeam.PeriodSeconds)).Append(", \"halfAngle\": ").Append(R(LighthouseBeam.HalfAngle))
              .Append(", \"lampHeight\": ").Append(R(LighthouseBeam.LampHeight)).Append(", \"length\": ").Append(R(LighthouseBeam.Length)).Append(",\n    \"times\": [");
            for (int i = 0; i < times.Length; i++) sb.Append(i > 0 ? ", " : "").Append(R(times[i]));
            sb.Append("],\n    \"seeds\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818, 99999 })
            {
                int grid = VillageDistricts.CityGrid;
                LighthouseBeam.Site(seed, grid, grid, out double sx, out double sz);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"phase\": ").Append(R(LighthouseBeam.Phase(seed)))
                  .Append(", \"site\": [").Append(R(sx)).Append(", ").Append(R(sz)).Append("], \"yaw\": [");
                first = false;
                for (int i = 0; i < times.Length; i++) sb.Append(i > 0 ? ", " : "").Append(R(LighthouseBeam.Yaw(seed, times[i])));
                sb.Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        private static readonly double[][] CollisionStarts =
        {
            new[] { 5.0, 5.0 }, new[] { 10.1, 11.2 }, new[] { 10.0, 10.0 }, new[] { 9.0, 10.4 }, new[] { 12.3, 8.9 }, new[] { -0.2, 4.0 }, new[] { 4.9, 0.1 }, new[] { 20.0, 20.0 },
        };

        /// <summary>Top level key "collision" (round 24): resolved positions for a trunk, a flat box and both together, so WalkCollision and the JS resolveCollisions are compared on numbers.</summary>
        private static void AppendCollision(StringBuilder sb)
        {
            string R(double v) { return v.ToString("R", CultureInfo.InvariantCulture); }
            var scenes = new[]
            {
                new[] { new WalkBox { MinX = 9.5, MaxX = 10.5, MinZ = 9.5, MaxZ = 10.5, Round = true } },
                new[] { new WalkBox { MinX = 0, MaxX = 10, MinZ = 0, MaxZ = 5 } },
                new[] { new WalkBox { MinX = 0, MaxX = 10, MinZ = 0, MaxZ = 5 }, new WalkBox { MinX = 9.5, MaxX = 10.5, MinZ = 5.2, MaxZ = 6.2, Round = true }, new WalkBox { MinX = 11, MaxX = 13, MinZ = 8, MaxZ = 10 } },
            };
            sb.Append("  \"collision\": {\n    \"radius\": 0.35, \"starts\": [");
            sb.Append(string.Join(", ", CollisionStarts.Select(p => "[" + R(p[0]) + ", " + R(p[1]) + "]"))).Append("],\n    \"scenes\": [");
            for (int i = 0; i < scenes.Length; i++)
            {
                sb.Append(i > 0 ? ",\n      " : "\n      ").Append("{ \"boxes\": [")
                  .Append(string.Join(", ", scenes[i].Select(b => "[" + R(b.MinX) + ", " + R(b.MaxX) + ", " + R(b.MinZ) + ", " + R(b.MaxZ) + ", " + (b.Round ? 1 : 0) + "]"))).Append("], \"resolved\": [");
                for (int j = 0; j < CollisionStarts.Length; j++)
                {
                    double x = CollisionStarts[j][0], z = CollisionStarts[j][1];
                    WalkCollision.Resolve(ref x, ref z, 0.35, scenes[i]);
                    sb.Append(j > 0 ? ", " : "").Append('[').Append(R(x)).Append(", ").Append(R(z)).Append(']');
                }
                sb.Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "cityPresence" (round 24): PresenceAt on the 36 by 36 city, where the vanishing villagers bug was found. Rows as in villagers.presence.</summary>
        private static void AppendCityPresence(StringBuilder sb, PrefabCatalog cat)
        {
            string R(double v) { return v.ToString("R", CultureInfo.InvariantCulture); }
            int grid = VillageDistricts.CityGrid;
            sb.Append("  \"cityPresence\": {\n    \"cases\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 1818 })
            {
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout, grid, grid);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"roster\": [");
                for (int i = 0; i < roster.Count; i++)
                    sb.Append(i == 0 ? "" : ", ").Append('[').Append(Q(roster[i].Name)).Append(", ").Append((int)roster[i].Role).Append(", ").Append((int)roster[i].Disposition).Append(", ").Append(roster[i].HomeIndex).Append(", ").Append(roster[i].WorkIndex).Append(']');
                sb.Append("], \"routes\": [");
                bool firstRoute = true;
                foreach (var v in roster)
                {
                    var home = VillagerRules.StandPoint(v, VillagerPlaceKind.Home, layout, grid, grid, seed);
                    foreach (var kind in new[] { VillagerPlaceKind.Workplace, VillagerPlaceKind.Square, VillagerPlaceKind.Shore })
                    {
                        var to = VillagerRules.StandPoint(v, kind, layout, grid, grid, seed);
                        var route = VillageStreets.LaneRoute(home.X, home.Z, to.X, to.Z, grid, grid, layout);
                        sb.Append(firstRoute ? "" : ", ").Append("[").Append(string.Join(", ", route.Select(w => R(w[0]) + ", " + R(w[1])))).Append("]");
                        firstRoute = false;
                    }
                }
                sb.Append("], \"presence\": [");
                first = false;
                bool firstRow = true;
                foreach (var v in roster)
                    foreach (var t in PresenceTicks)
                        foreach (var d in PresenceDreads)
                        {
                            var pr = VillagerRules.PresenceAt(roster, v, t, d, layout, grid, grid, seed);
                            sb.Append(firstRow ? "" : ", ").Append('[').Append(pr.Gone ? 1 : 0).Append(", ").Append(pr.Walking ? 1 : 0).Append(", ").Append(pr.Indoors ? 1 : 0).Append(", ")
                              .Append((int)pr.Stop).Append(", ").Append((int)pr.Place).Append(", ").Append(R(pr.X)).Append(", ").Append(R(pr.Z)).Append(", ").Append(R(pr.FaceDx)).Append(", ")
                              .Append(R(pr.FaceDz)).Append(", ").Append(R(pr.Stride)).Append(", ").Append(R(pr.Fade)).Append(']');
                            firstRow = false;
                        }
                sb.Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        private static string Q(string s) { return JsonSerializer.Serialize(s); }

        /// <summary>Top level key "story" (round 24): per city seed the families, house owners, missing persons, journal and page texts, gossip, rumors and the lore placement with the story.</summary>
        private static void AppendStory(StringBuilder sb, PrefabCatalog cat)
        {
            var inv = CultureInfo.InvariantCulture;
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(data, "lore_books.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            sb.Append("  \"story\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var campaign = CampaignGenerator.Generate(seed, 5);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), campaign.VillageName);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"village\": ").Append(Q(campaign.VillageName));
                first = false;
                sb.Append(", \"stages\": [").Append(string.Join(", ", campaign.Nights.Select(n => n.Stage.ToString(inv)))).Append(']');
                sb.Append(", \"families\": [").Append(string.Join(", ", story.Families.Select(f => "[" + Q(f.Surname) + ", [" + string.Join(", ", f.Members) + "], " + f.HomePiece + "]"))).Append(']');
                sb.Append(", \"owners\": [").Append(string.Join(", ", story.Owners)).Append(']');
                sb.Append(", \"missing\": [").Append(string.Join(", ", story.Missing.Select(m => "[" + Q(m.Id) + ", " + m.FamilyIndex + ", " + m.KinIndex + ", " + m.WitnessIndex + "]"))).Append(']');
                var texts = new List<string>();
                foreach (var b in lore.Books)
                    if (b.Role.Length > 0 || (b.Missing.Length > 0 && story.HasMissing(b.Missing)))
                        texts.Add("[" + Q(b.Id) + ", " + story.JournalOwner(b) + ", " + Q(story.BookTitle(b, "en")) + ", " + Q(story.BookText(b, "en")) + ", " + Q(story.BookTitle(b, "fr")) + ", " + Q(story.BookText(b, "fr")) + "]");
                sb.Append(", \"books\": [").Append(string.Join(", ", texts)).Append(']');
                var gossip = new List<string>();
                foreach (var v in roster)
                    for (int night = 1; night <= 5; night++)
                    {
                        int stage = VillageStory.StageOfNight(night, 5), tier = (v.Index + night) % VillageStory.Tiers;
                        var g = story.GossipFor(v, night, stage);
                        gossip.Add("[" + v.Index + ", " + night + ", " + tier + ", " + g.Kind + ", " + g.Subject + ", " + g.Stage + ", " + g.Variant + ", " + Q(story.GossipText(g, v, night, tier, "en")) + ", " + Q(story.GossipText(g, v, night, tier, "fr")) + "]");
                    }
                sb.Append(", \"gossip\": [").Append(string.Join(", ", gossip)).Append(']');
                var rumors = new List<string>();
                for (int night = 1; night <= 5; night++)
                    for (int tier = 0; tier < VillageStory.Tiers; tier++)
                        rumors.Add("[" + night + ", " + tier + ", " + Q(story.RumorText(night, VillageStory.StageOfNight(night, 5), tier, "en")) + ", " + Q(story.RumorText(night, VillageStory.StageOfNight(night, 5), tier, "fr")) + "]");
                sb.Append(", \"rumors\": [").Append(string.Join(", ", rumors)).Append(']');
                var placed = LoreBookRules.Place(seed, grid, grid, layout, lore, story);
                sb.Append(", \"placed\": [").Append(string.Join(", ", placed.Select(p => "[" + Q(p.BookId) + ", " + Q(p.Place) + ", " + Math.Round(p.X, 3).ToString("0.###", inv) + ", " + Math.Round(p.Z, 3).ToString("0.###", inv) + "]"))).Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "society" (round 26): per city seed the patient zero, spread delays, fates, opinions after a fixed log, corruption grid and trust gated chat.</summary>
        private static void AppendSociety(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var log = new[]
            {
                new SocietyAction { Kind = SocietyActionKind.ChatPolite, Subject = 1 }, new SocietyAction { Kind = SocietyActionKind.ReturnItem, Subject = 2 },
                new SocietyAction { Kind = SocietyActionKind.SeenNearBody, Subject = VillageSociety.AllVillagers }, new SocietyAction { Kind = SocietyActionKind.ReturnJournal, Subject = 3 },
                new SocietyAction { Kind = SocietyActionKind.NightIntrusion, Subject = 0 }, new SocietyAction { Kind = SocietyActionKind.ChatPolite, Subject = 1 },
                new SocietyAction { Kind = SocietyActionKind.SeenAtRitualSite, Subject = 4 }, new SocietyAction { Kind = SocietyActionKind.WardCreatureInView, Subject = 5 },
                new SocietyAction { Kind = SocietyActionKind.FightCreatureInView, Subject = 6 }, new SocietyAction { Kind = SocietyActionKind.ReturnJournal, Subject = 2 },
                new SocietyAction { Kind = SocietyActionKind.ReturnItem, Subject = 3 }, new SocietyAction { Kind = SocietyActionKind.ReturnJournal, Subject = 5 },
            };
            sb.Append("  \"society\": {\n    \"log\": [").Append(string.Join(", ", log.Select(a => "[" + (int)a.Kind + ", " + a.Subject + "]"))).Append("],\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                var soc = VillageSociety.Build(story, layout);
                var op = soc.OpinionsAfter(log);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed);
                first = false;
                sb.Append(", \"zero\": ").Append(soc.PatientZero);
                sb.Append(", \"neighbour\": [").Append(string.Join(", ", soc.Neighbour)).Append(']');
                sb.Append(", \"delay\": [").Append(string.Join(", ", soc.SpreadDelay.Select(d => d == VillageSociety.Unreachable ? -1 : d))).Append(']');
                sb.Append(", \"fate\": [").Append(string.Join(", ", soc.Fate.Select(f => (int)f))).Append(']');
                sb.Append(", \"trust\": [").Append(string.Join(", ", op.Trust)).Append(']');
                sb.Append(", \"suspicion\": [").Append(string.Join(", ", op.Suspicion)).Append(']');
                var grid2 = new List<string>();
                foreach (var night in new[] { 1, 3, 5, 9 })
                    foreach (var dread in new[] { 0f, 0.25f, 0.5f, 0.75f, 1f })
                        foreach (var ritual in new[] { 0, 2, 5 })
                            grid2.Add("[" + night + ", " + dread.ToString("0.##", CultureInfo.InvariantCulture) + ", " + ritual + ", [" + string.Join(", ", roster.Select(v => soc.CorruptionLevel(v.Index, night, dread, ritual))) + "], ["
                                      + string.Join(", ", roster.Select(v => (int)soc.CorruptionAt(v.Index, night, dread, ritual))) + "]]");
                sb.Append(", \"corruption\": [").Append(string.Join(", ", grid2)).Append(']');
                var chats = new List<string>();
                foreach (var v in roster)
                    for (int night = 1; night <= 6; night++)
                        for (int topic = 0; topic < VillagerRules.ChatTopics; topic++)
                        {
                            var st = soc.StandingOf(v.Index, op, night, 0.25f, 1);
                            var r = VillagerRules.Chat(seed, v, 600, 0.25f, night, topic, 2, 1, 80, st);
                            chats.Add("[" + v.Index + ", " + night + ", " + topic + ", " + (int)st.Tier + ", " + (int)st.Corruption + ", " + (r.Available ? 1 : 0) + ", " + (int)r.Behavior + ", " + Q(r.HintId) + ", "
                                      + (r.StrongHint ? 1 : 0) + ", " + (r.Withheld ? 1 : 0) + ", " + Q(r.LieStatementId) + ", " + (r.ColdLine ? 1 : 0) + ", " + r.LineVariant + "]");
                        }
                sb.Append(", \"chat\": [").Append(string.Join(", ", chats)).Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "axes" (round 29): per city seed the Fear, Faith, Loyalty and Obsession axes over a night, dread and ritual grid after the society log, and the fear gated chat.</summary>
        private static void AppendAxes(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var log = new[]
            {
                new SocietyAction { Kind = SocietyActionKind.ChatPolite, Subject = 1 }, new SocietyAction { Kind = SocietyActionKind.ReturnItem, Subject = 2 },
                new SocietyAction { Kind = SocietyActionKind.SeenNearBody, Subject = VillageSociety.AllVillagers }, new SocietyAction { Kind = SocietyActionKind.ReturnJournal, Subject = 3 },
            };
            sb.Append("  \"axes\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                var soc = VillageSociety.Build(story, layout);
                var op = soc.OpinionsAfter(log);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed);
                first = false;
                var grid2 = new List<string>();
                var chats = new List<string>();
                foreach (var night in new[] { 1, 5, 9 })
                    foreach (var dread in new[] { 0f, 0.5f, 1f })
                        foreach (var ritual in new[] { 0, 5 })
                        {
                            var ax = soc.AxesAfter(op, night, dread, ritual);
                            grid2.Add("[" + night + ", " + dread.ToString("0.##", CultureInfo.InvariantCulture) + ", " + ritual + ", [" + string.Join(", ", ax.Fear) + "], [" + string.Join(", ", ax.Faith) + "], ["
                                      + string.Join(", ", ax.Loyalty) + "], [" + string.Join(", ", ax.Obsession) + "]]");
                            foreach (var v in roster)
                            {
                                var st = soc.StandingWithAxes(v.Index, op, ax, night, dread, ritual);
                                var r = VillagerRules.Chat(seed, v, 600, dread, night, 0, 2, 1, 80, st);
                                chats.Add("[" + v.Index + ", " + night + ", " + dread.ToString("0.##", CultureInfo.InvariantCulture) + ", " + ritual + ", " + (r.Available ? 1 : 0) + ", " + (r.Withheld ? 1 : 0) + ", "
                                          + (r.FearWithheld ? 1 : 0) + ", " + (r.StrongHint ? 1 : 0) + ", " + Q(r.HintId) + ", " + Q(r.LieStatementId) + "]");
                            }
                        }
                sb.Append(", \"grid\": [").Append(string.Join(", ", grid2)).Append(']');
                sb.Append(", \"chat\": [").Append(string.Join(", ", chats)).Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "director" (round 29): per seed the scenario inputs and the director's intensity, beat, quiet counter and cause at every step.</summary>
        private static void AppendDirector(StringBuilder sb)
        {
            sb.Append("  \"director\": {\n    \"runs\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                var inputs = HorrorDirectorTests.Scenario(seed, 160);
                var states = HorrorDirectorTests.Run(seed, inputs);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed);
                first = false;
                sb.Append(", \"inputs\": [").Append(string.Join(", ", inputs.Select(x => "[" + x.Tick + ", " + x.Sanity + ", " + x.Knowledge + ", " + x.Stress + ", " + x.SafeZoneTicks + ", " + x.ClueProgress + ", " + x.CultExposure + ", " + x.Encounters + "]"))).Append(']');
                sb.Append(", \"steps\": [").Append(string.Join(", ", states.Select(s => "[" + s.Intensity + ", " + (int)s.Beat + ", " + s.QuietLeft + ", " + Q(s.Cause) + "]"))).Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "investigation" (round 26): per city seed and two fixed evidence scenarios, the board cards, links, contradictions and timeline.</summary>
        private static void AppendInvestigation(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(data, "lore_books.json")));
            var statements = StatementLibrary.Parse(File.ReadAllText(Path.Combine(data, "statements.json")));
            sb.Append("  \"investigation\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"scenarios\": [");
                first = false;
                var scenarios = new[] { new InvestigationEvidence(), InvestigationModelTests.RichEvidence() };
                var stages = new CorruptionStage[roster.Count];
                stages[1] = CorruptionStage.Corrupted;
                for (int s = 0; s < scenarios.Length; s++)
                {
                    var board = InvestigationRules.Build(story, lore, statements, scenarios[s], stages);
                    sb.Append(s == 0 ? "\n        " : ",\n        ").Append("{ \"cards\": [")
                      .Append(string.Join(", ", board.Cards.Select(c => "[" + (int)c.Kind + ", " + Q(c.Id) + ", " + (c.Revealed ? 1 : 0) + ", " + (c.Invalidated ? 1 : 0) + "]")))
                      .Append("], \"links\": [").Append(string.Join(", ", board.Links.Select(l => "[" + (int)l.Kind + ", " + Q(l.From) + ", " + Q(l.To) + ", " + (l.Revealed ? 1 : 0) + "]")))
                      .Append("], \"contradictions\": [").Append(string.Join(", ", board.Contradictions.Select(c => "[" + Q(c.PairId) + ", " + Q(c.CardA) + ", " + Q(c.CardB) + "]")))
                      .Append("], \"timeline\": [").Append(string.Join(", ", board.Timeline.Select(e => "[" + Q(e.StatementId) + ", " + e.Villager + ", " + e.Night + ", " + e.Minute + "]"))).Append("] }");
                }
                sb.Append("\n      ] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "outcomes" (round 30, spec 163): per city seed and missing person, the outcome at 0 to 6 leads, the weights at 0 and 6 leads, the leads counted from a full evidence set, and the board reveal at 0, 1 and 4 leads in en and fr.</summary>
        private static void AppendOutcomes(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(data, "lore_books.json")));
            var mythos = MythosSimulationTests.Library();
            var outcomes = MissingOutcomesTests.Library();
            var inputs = MythosSimulationTests.GridInputs();
            sb.Append("  \"outcomes\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                var soc = VillageSociety.Build(story, layout);
                var state = MythosSimulation.Run(soc, story, mythos, inputs, MythosSimulationTests.Nights);
                var people = new List<string>();
                for (int k = 0; k < story.Missing.Count; k++)
                {
                    var perLead = Enumerable.Range(0, MissingOutcomes.MaxLeads + 1).Select(l => ((int)MissingOutcomes.Resolve(soc, story, state, outcomes, k, l)).ToString()).ToList();
                    var full = MissingOutcomesTests.FullEvidence(story, lore, k);
                    int counted = MissingOutcomes.CountLeads(story, lore, full, k);
                    var o = MissingOutcomes.Resolve(soc, story, state, outcomes, k, counted);
                    var reveals = new List<string>();
                    foreach (int l in new[] { 0, 1, 4 })
                        foreach (var lang in new[] { "en", "fr" })
                        {
                            var r = MissingOutcomes.Reveal(story, outcomes, o, k, l, lang);
                            reveals.Add("[" + (int)r.Level + ", " + Q(r.Text) + "]");
                        }
                    people.Add("[" + Q(story.Missing[k].Id) + ", [" + string.Join(", ", perLead) + "], [" + string.Join(", ", MissingOutcomes.Weights(soc, story, state, outcomes, k, 0)) + "], ["
                        + string.Join(", ", MissingOutcomes.Weights(soc, story, state, outcomes, k, MissingOutcomes.MaxLeads)) + "], " + counted + ", [" + string.Join(", ", reveals) + "]]");
                }
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"missing\": [").Append(string.Join(", ", people)).Append("] }");
                first = false;
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "memory" (round 34, spec 167): per city seed, the baseline events, then over a fixed event log (VillagerMemoryTests.ScriptedLog) at nights 2, 8 and 15 for villagers 0 to 5: outcome, strength, the four scores, the effect and the memory line in en and fr; plus the night 15 axes of those villagers without and with memory.</summary>
        private static void AppendMemory(StringBuilder sb)
        {
            var lib = VillagerMemoryTests.Library();
            sb.Append("  \"memory\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                var soc = VillageSocietyTests.SocietyOf(seed, out var story, out var roster);
                var baseline = VillagerMemoryModel.BaselineEvents(story);
                var log = VillagerMemoryTests.ScriptedLog(baseline);
                var nights = new List<string>();
                foreach (int night in new[] { 2, 8, 15 })
                {
                    var m = VillagerMemoryModel.Replay(roster.Count, log, night);
                    var people = new List<string>();
                    for (int v = 0; v < 6; v++)
                    {
                        var ef = m.EffectOf(v);
                        people.Add("[" + (int)m.OutcomeOf(v) + ", " + m.StrengthOf(v) + ", [" + string.Join(", ", m.ScoresOf(v)) + "], [" + ef.Trust + ", " + ef.Fear + ", " + ef.Faith + ", " + ef.Loyalty + ", " + ef.Obsession + "], "
                            + Q(m.LineFor(lib, seed, v, night, "en")) + ", " + Q(m.LineFor(lib, seed, v, night, "fr")) + "]");
                    }
                    nights.Add("{ \"night\": " + night + ", \"people\": [" + string.Join(", ", people) + "] }");
                }
                var opinions = soc.OpinionsAfter(new List<SocietyAction>());
                var final = VillagerMemoryModel.Replay(roster.Count, log, 15);
                var effects = final.EffectsOfAll();
                var plain = soc.AxesAfter(opinions, 15, 0.5f, 2);
                var withMemory = soc.AxesAfter(VillagerMemoryModel.TrustAfter(opinions, effects), 15, 0.5f, 2, effects);
                string Axes(SocietyAxes a) { return "[" + string.Join(", ", Enumerable.Range(0, 6).Select(v => "[" + a.Fear[v] + ", " + a.Faith[v] + ", " + a.Loyalty[v] + ", " + a.Obsession[v] + "]")) + "]"; }
                var trusts = VillagerMemoryModel.TrustAfter(opinions, effects).Trust;
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"baseline\": [").Append(string.Join(", ", baseline.Select(e => "[" + e.Villager + ", " + e.Subject + ", " + e.Weight + "]")))
                  .Append("], \"nights\": [").Append(string.Join(", ", nights)).Append("], \"axesPlain\": ").Append(Axes(plain)).Append(", \"axesMemory\": ").Append(Axes(withMemory))
                  .Append(", \"trustMemory\": [").Append(string.Join(", ", Enumerable.Range(0, 6).Select(v => trusts[v].ToString()))).Append("] }");
                first = false;
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "reality" (round 34, spec 169): per city seed, night and knowledge tier, the alterations of RealityInstability (wrong house names, false villager, hidden contradictions, blurred identities, altered places) as one signature string, plus the notes in en and fr.</summary>
        private static void AppendReality(StringBuilder sb)
        {
            var lib = RealityInstabilityTests.Library();
            sb.Append("  \"reality\": {\n    \"pairIds\": [").Append(string.Join(", ", RealityInstabilityTests.PairIds.Select(Q))).Append("],\n    \"placeIds\": [").Append(string.Join(", ", RealityInstabilityTests.PlaceIds.Select(Q)));
            sb.Append("],\n    \"houses\": ").Append(RealityInstabilityTests.Houses).Append(", \"villagers\": ").Append(RealityInstabilityTests.Villagers).Append(",\n    \"notes\": {");
            foreach (var lang in new[] { "en", "fr" }) sb.Append(lang == "en" ? " " : ", ").Append(Q(lang)).Append(": [").Append(string.Join(", ", lib.Notes.Select(n => Q(n.Get(lang))))).Append("]");
            sb.Append(" },\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                var nights = new List<string>();
                for (int night = 1; night <= RealityInstabilityTests.Nights; night++)
                    nights.Add("[" + string.Join(", ", Enumerable.Range(0, KnowledgeLibrary.TierCount).Select(t => Q(RealityInstabilityTests.Signature(lib, seed, night, t)))) + "]");
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"nights\": [\n        ").Append(string.Join(",\n        ", nights)).Append("\n      ] }");
                first = false;
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "chronicleProse" (round 34, spec 168): per city seed and per scenario (0 nothing learned, 1 everything heard with leads 0, 1, 4 and the scripted memory log, see ChronicleProseTests.Context), the night by night prose and the whole story summary in en and fr.</summary>
        private static void AppendChronicleProse(StringBuilder sb)
        {
            sb.Append("  \"chronicleProse\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                var scenarios = new List<string>();
                foreach (int scenario in new[] { 0, 1 })
                {
                    var ctx = ChronicleProseTests.Context(seed, scenario);
                    var parts = new List<string>();
                    foreach (var lang in ChronicleProseTests.Languages)
                        parts.Add("\"" + lang + "\": [" + string.Join(", ", ChronicleProse.Chronicle(ctx, MythosSimulationTests.Nights, lang).Select(Q)) + "], \"summary_" + lang + "\": " + Q(ChronicleProse.Summary(ctx, MythosSimulationTests.Nights, lang)));
                    scenarios.Add("{ \"scenario\": " + scenario + ", " + string.Join(", ", parts) + " }");
                }
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"scenarios\": [\n        ").Append(string.Join(",\n        ", scenarios)).Append("\n      ] }");
                first = false;
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "theories" (round 30, spec 162): per city seed, the instances (kind, subject, truth), the question and option texts in en and fr, and a fixed choice log played over beliefs {0:90, 1:40, 2:70}: the conclusions, counts, knowledge, trust lost, epilogue variant and the epilogue of every ending in en and fr.</summary>
        private static void AppendTheories(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var mythos = MythosSimulationTests.Library();
            var outcomes = MissingOutcomesTests.Library();
            var theories = TheoryModelTests.Library();
            var inputs = MythosSimulationTests.GridInputs();
            var beliefs = TheoryModelTests.Beliefs();
            sb.Append("  \"theories\": {\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                var soc = VillageSociety.Build(story, layout);
                var state = MythosSimulation.Run(soc, story, mythos, inputs, MythosSimulationTests.Nights);
                var instances = TheoryRules.Instances(soc, story, state, theories, outcomes);
                var log = new List<int>();
                for (int i = 0; i < instances.Count; i++)
                {
                    int options = theories.TemplateOf(instances[i].Kind).Options.Count;
                    log.Add(TheoryRules.Choice(TheoryRules.ChoiceTheory, i));
                    log.Add(TheoryRules.Choice(TheoryRules.ChoiceOption, (instances[i].Truth + i % 3) % options));
                    for (int e = 0; e < i % 4; e++) log.Add(TheoryRules.Choice(TheoryRules.ChoiceEvidence, e));
                    log.Add(TheoryRules.Choice(TheoryRules.ChoiceConclude, 0));
                }
                log.Add(TheoryRules.Choice(TheoryRules.ChoiceConclude, 0));
                log.Add(99999);
                var result = TheoryRules.Replay(theories, instances, beliefs, log);
                var variant = TheoryRules.VariantOf(result);
                var texts = new List<string>();
                foreach (var inst in instances)
                {
                    var parts = new List<string>();
                    foreach (var lang in new[] { "en", "fr" })
                    {
                        parts.Add(Q(TheoryRules.Question(theories, soc, story, inst, lang)));
                        for (int o = 0; o < theories.TemplateOf(inst.Kind).Options.Count; o++) parts.Add(Q(TheoryRules.OptionText(theories, soc, story, inst, o, lang)));
                    }
                    texts.Add("[" + string.Join(", ", parts) + "]");
                }
                var epilogues = new List<string>();
                foreach (var ending in VigilRules.EndingIds)
                    foreach (var lang in new[] { "en", "fr" }) epilogues.Add(Q(TheoryRules.Epilogue(theories, ending, variant, lang)));
                var verdicts = new List<string>();
                foreach (var c in result.Conclusions.Values)
                    foreach (var lang in new[] { "en", "fr" }) verdicts.Add(Q(TheoryRules.Verdict(theories, c.Grade, c.Tier, lang)));
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed)
                  .Append(", \"instances\": [").Append(string.Join(", ", instances.Select(x => "[" + (int)x.Kind + ", " + x.Subject + ", " + x.Truth + "]")))
                  .Append("], \"texts\": [").Append(string.Join(", ", texts))
                  .Append("], \"log\": [").Append(string.Join(", ", log))
                  .Append("], \"conclusions\": [").Append(string.Join(", ", result.Conclusions.Values.Select(c => "[" + c.Instance + ", " + c.Option + ", " + (int)c.Grade + ", [" + string.Join(", ", c.Evidence) + "], " + c.AverageBelief + ", " + (int)c.Tier + "]")))
                  .Append("], \"rejected\": ").Append(result.Rejected)
                  .Append(", \"counts\": [").Append(result.Count(TheoryGrade.True)).Append(", ").Append(result.Count(TheoryGrade.Partial)).Append(", ").Append(result.Count(TheoryGrade.False))
                  .Append("], \"knowledge\": ").Append(result.Knowledge).Append(", \"trustLost\": ").Append(TheoryRules.TrustLost(instances, result))
                  .Append(", \"variant\": ").Append((int)variant).Append(", \"epilogues\": [").Append(string.Join(", ", epilogues))
                  .Append("], \"verdicts\": [").Append(string.Join(", ", verdicts)).Append("] }");
                first = false;
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "mythos" (round 27, ticks added round 28): per city seed, the night tick records (night, cultGrowth, rumorsChanged, rumorsAdded, missingPersons, newMissingPerson, newOmen, realityShift, reality, secretDiscovered), the simulation over twelve nights of fixed dread and ritual inputs, the society pressure and a board with every statement heard.</summary>
        private static void AppendMythos(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(data, "lore_books.json")));
            var statements = StatementLibrary.Parse(File.ReadAllText(Path.Combine(data, "statements.json")));
            var mythos = MythosSimulationTests.Library();
            var inputs = MythosSimulationTests.GridInputs();
            sb.Append("  \"mythos\": {\n    \"nights\": ").Append(MythosSimulationTests.Nights).Append(",\n    \"dread\": [").Append(string.Join(", ", inputs.DreadPermille))
              .Append("],\n    \"ritual\": [").Append(string.Join(", ", inputs.RitualStage)).Append("],\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                var soc = VillageSociety.Build(story, layout);
                var state = MythosSimulation.Run(soc, story, mythos, inputs, MythosSimulationTests.Nights);
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed);
                first = false;
                sb.Append(", \"cults\": [").Append(string.Join(", ", state.Cults.Select(c => "[" + Q(c.Id) + ", " + c.Founder + "]")));
                sb.Append("], \"secrets\": [").Append(string.Join(", ", state.SecretKind)).Append("], \"exposedNight\": [").Append(string.Join(", ", state.ExposedNight)).Append("], \"nights\": [");
                for (int i = 0; i < state.Nights.Count; i++)
                {
                    var n = state.Nights[i];
                    sb.Append(i > 0 ? ",\n        " : "\n        ").Append("{ \"events\": [").Append(string.Join(", ", n.Events.Select(e => "[" + (int)e.Kind + ", " + e.Subject + ", " + e.Other + ", " + Q(e.Key) + "]")))
                      .Append("], \"members\": [").Append(string.Join(", ", n.CultMembers.Select(m => "[" + string.Join(", ", m) + "]")))
                      .Append("], \"exposed\": [").Append(string.Join(", ", n.Exposed))
                      .Append("], \"rumors\": [").Append(string.Join(", ", n.Rumors.Select(r => "[" + r.Id + ", " + (int)r.Source + ", " + r.Subject + ", " + r.Origin + ", " + Q(r.Key) + ", " + r.Stage + ", " + r.Tier + ", ["
                          + string.Join(", ", r.Holders.Select(h => "[" + h.Villager + ", " + h.Distortion + ", " + h.Night + "]")) + "]]"))).Append("] }");
                }
                var feed = new MythosFeed { Library = mythos, State = state, Night = MythosSimulationTests.Nights };
                var pressure = MythosSociety.SuspicionPressure(feed.Current, roster.Count);
                var log = new[] { new SocietyAction { Kind = SocietyActionKind.SeenNearBody, Subject = 1 }, new SocietyAction { Kind = SocietyActionKind.ChatPolite, Subject = 2 } };
                var heard = MythosSimulationTests.HearAll(feed);
                var board = InvestigationRules.Build(story, lore, statements, heard, null, feed);
                sb.Append("\n      ], \"pressure\": [").Append(string.Join(", ", pressure)).Append("], \"suspicion\": [").Append(string.Join(", ", soc.OpinionsAfter(log, pressure).Suspicion))
                  .Append("], \"statements\": [").Append(string.Join(", ", MythosRules.Statements(feed).Select(s => "[" + Q(s.Id) + ", " + (int)s.Kind + ", " + s.Subject + ", " + s.Night + ", " + s.Minute + ", " + Q(MythosRules.Text(feed, story, s, s.Rumor != null && MythosRules.IsDistorted(s.Rumor, heard.Heard.First(h => h.StatementId == s.Id).Villager), "en")) + ", "
                      + Q(MythosRules.Text(feed, story, s, s.Rumor != null && MythosRules.IsDistorted(s.Rumor, heard.Heard.First(h => h.StatementId == s.Id).Villager), "fr")) + "]")))
                  .Append("], \"board\": { \"cards\": [").Append(string.Join(", ", board.Cards.Where(c => c.Key.StartsWith(MythosRules.IdPrefix)).Select(c => "[" + Q(c.Id) + ", " + (c.Invalidated ? 1 : 0) + "]")))
                  .Append("], \"contradictions\": [").Append(string.Join(", ", board.Contradictions.Where(c => c.PairId.StartsWith(MythosRules.IdPrefix)).Select(c => "[" + Q(c.PairId) + ", " + Q(c.CardA) + ", " + Q(c.CardB) + "]")))
                  .Append("], \"timeline\": [").Append(string.Join(", ", board.Timeline.Where(e => e.StatementId.StartsWith(MythosRules.IdPrefix)).Select(e => "[" + Q(e.StatementId) + ", " + e.Villager + ", " + e.Night + ", " + e.Minute + "]"))).Append("] }, \"ticks\": [")
                  .Append(string.Join(", ", NightTicks.Build(state, mythos).Select(t => "[" + t.Night + ", " + t.CultGrowth + ", " + t.RumorsChanged + ", " + t.RumorsAdded + ", " + t.MissingPersons + ", " + t.NewMissingPerson + ", " + Q(t.NewOmen) + ", " + t.RealityShift + ", " + t.Reality + ", " + (t.SecretDiscovered ? 1 : 0) + "]"))).Append("] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "knowledge" (round 28): the tiers with thresholds and benefits, the source points, every rumor at every tier in en and fr, the reality distortion per seed, night and tier, and per city the mythos chat lines of a neutral villager asked about the village and of a trusting one asked for a hint.</summary>
        private static void AppendKnowledge(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var know = KnowledgeLibrary.Parse(File.ReadAllText(Path.Combine(data, "knowledge.json")));
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var mythos = MythosSimulationTests.Library();
            var inputs = MythosSimulationTests.GridInputs();
            sb.Append("  \"knowledge\": {\n    \"tiers\": [").Append(string.Join(", ", know.Tiers.Select(t => "[" + Q(t.Id) + ", " + t.Threshold + ", [" + string.Join(", ", t.Benefits.Select(Q)) + "]]")))
              .Append("],\n    \"sources\": [").Append(string.Join(", ", know.SourcePoints))
              .Append("],\n    \"rumors\": [").Append(string.Join(", ", know.Rumors.Select(r => "[" + Q(r.Id) + ", [" + string.Join(", ", Enumerable.Range(0, KnowledgeLibrary.TierCount).Select(t => "[" + Q(KnowledgeRules.RumorText(know, r.Id, t, "en")) + ", " + Q(KnowledgeRules.RumorText(know, r.Id, t, "fr")) + "]")) + "]]")))
              .Append("],\n    \"distortion\": [");
            bool firstSeed = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                sb.Append(firstSeed ? "\n      " : ",\n      ").Append("[").Append(seed).Append(", [");
                firstSeed = false;
                sb.Append(string.Join(", ", Enumerable.Range(1, MythosSimulationTests.Nights).Select(n => "[" + string.Join(", ", Enumerable.Range(0, KnowledgeLibrary.TierCount).Select(t => "[" + string.Join(", ", RealityDistortion.For(know, seed, n, t).Select(Q)) + "]")) + "]")));
                sb.Append("]]");
            }
            sb.Append("\n    ],\n    \"chat\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                var soc = VillageSociety.Build(story, layout);
                var state = MythosSimulation.Run(soc, story, mythos, inputs, MythosSimulationTests.Nights);
                var feed = new MythosFeed { Library = mythos, State = state, Night = MythosSimulationTests.Nights };
                var about = new VillagerChatResult { Available = true, Behavior = VillagerBehavior.Normal, HintId = "village" };
                var hint = new VillagerChatResult { Available = true, Behavior = VillagerBehavior.Normal, HintId = "clues_seek" };
                var rows = new List<string>();
                for (int i = 0; i < roster.Count; i++)
                {
                    var neutral = MythosChat.Lines(soc, feed, story, i, TrustTier.Neutral, MythosSimulationTests.Nights, about, "en");
                    var trusting = MythosChat.Lines(soc, feed, story, i, TrustTier.Trusting, MythosSimulationTests.Nights, hint, "fr");
                    if (neutral.Count == 0 && trusting.Count == 0) continue;
                    rows.Add("[" + i + ", [" + string.Join(", ", neutral.Select(l => "[" + Q(l.Id) + ", " + Q(l.Text) + "]")) + "], [" + string.Join(", ", trusting.Select(l => "[" + Q(l.Id) + ", " + Q(l.Text) + "]")) + "]]");
                }
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"villagers\": [").Append(string.Join(", ", rows)).Append("] }");
                first = false;
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "knowledgeInvestigation" (round 28): per city seed and knowledge tier 0 to 5, the contradictions, resolutions and statement scores of the evidence of <see cref="InvestigationModelTests.SynergyEvidence"/>.</summary>
        private static void AppendKnowledgeInvestigation(StringBuilder sb, PrefabCatalog cat)
        {
            string data = Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data");
            var lib = StoryLibrary.Parse(File.ReadAllText(Path.Combine(data, "story.json")));
            var nameLib = NameLibrary.Parse(File.ReadAllText(Path.Combine(data, "names.json")));
            var lore = LoreLibrary.Parse(File.ReadAllText(Path.Combine(data, "lore_books.json")));
            var statements = StatementLibrary.Parse(File.ReadAllText(Path.Combine(data, "statements.json")));
            var knowledgeLib = KnowledgeLibrary.Parse(File.ReadAllText(Path.Combine(data, "knowledge.json")));
            var earned = KnowledgeState.FromSourceIds(knowledgeLib, InvestigationRules.KnowledgeSources(InvestigationModelTests.SynergyEvidence()));
            sb.Append("  \"knowledgeInvestigation\": {\n    \"sources\": [").Append(string.Join(", ", InvestigationRules.KnowledgeSources(InvestigationModelTests.SynergyEvidence()).Select(Q)))
              .Append("], \"points\": ").Append(earned.Points).Append(", \"tier\": ").Append(earned.Tier(knowledgeLib)).Append(",\n    \"cities\": [");
            bool first = true;
            foreach (var seed in new[] { 1, 42, 1818 })
            {
                int grid = VillageDistricts.CityGrid;
                var layout = VillageLayoutGenerator.GenerateCity(cat, grid, grid, VillageDistricts.CityPieces, seed);
                var roster = VillagerRules.GenerateRoster(seed, layout);
                var story = VillageStory.Build(lib, seed, layout, roster, VillageNames.Assign(nameLib, seed, grid, grid, layout), CampaignGenerator.Generate(seed, 5).VillageName);
                var stages = new CorruptionStage[roster.Count];
                stages[1] = CorruptionStage.Corrupted;
                sb.Append(first ? "\n      " : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"tiers\": [");
                first = false;
                for (int tier = 0; tier <= KnowledgeLibrary.MaxTier; tier++)
                {
                    var board = InvestigationRules.Build(story, lore, statements, InvestigationModelTests.SynergyEvidence(), stages, null, tier);
                    sb.Append(tier == 0 ? "\n        " : ",\n        ").Append("{ \"contradictions\": [").Append(string.Join(", ", board.Contradictions.Select(c => Q(c.PairId))))
                      .Append("], \"resolutions\": [").Append(string.Join(", ", board.Resolutions.Select(c => Q(c.PairId))))
                      .Append("], \"scores\": [").Append(string.Join(", ", board.Scores.Select(c => "[" + Q(c.StatementId) + ", " + c.Confidence + ", " + c.Belief + "]"))).Append("] }");
                }
                sb.Append("\n      ] }");
            }
            sb.Append("\n    ]\n  }\n");
        }

        /// <summary>Top level key "shapes": per mesh part count, triangle count, material count and Unity-axis bounds (3 decimals) from Data/village_shapes.json.</summary>
        private static void AppendShapes(StringBuilder sb)
        {
            var inv = CultureInfo.InvariantCulture;
            var lib = ShapeLibrary.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_shapes.json")));
            sb.Append("  \"shapes\": [");
            bool first = true;
            foreach (var id in lib.MeshIds)
            {
                var m = lib.Build(id);
                var b = m.Bounds();
                sb.Append(first ? "\n    " : ",\n    ").Append("[\"").Append(id).Append("\", ").Append(m.PartCount).Append(", ").Append(m.TriangleCount).Append(", ").Append(m.Submeshes.Count);
                foreach (var x in b) sb.Append(", ").Append(Math.Round((double)x, 3).ToString("0.###", inv));
                sb.Append(']');
                first = false;
            }
            sb.Append("\n  ]\n");
        }

        /// <summary>Top level key "vigil": clue targets, endings, scores, result codes, name reveals and scripted playthroughs.</summary>
        private static void AppendVigil(StringBuilder sb)
        {
            string J(object o) { return JsonSerializer.Serialize(o); }
            sb.Append("  \"vigil\": {\n    \"targets\": [");
            for (int n = -2; n <= 12; n++)
                sb.Append(n > -2 ? ", " : "").Append('[').Append(n).Append(", ").Append(VigilRules.ClueTarget(n)).Append(", ").Append(VigilRules.SourcesOffered(n))
                  .Append(", ").Append(VigilRules.NightCreep(n)).Append(", ").Append(VigilRules.TotalClues(Math.Max(0, n))).Append(']');
            sb.Append("],\n    \"constants\": [").Append(VigilRules.DawnRecovery).Append(", ").Append(VigilRules.LampsPerNight).Append(", ").Append(VigilRules.SteadySanity)
              .Append(", ").Append(VigilRules.SpareSources).Append("],\n    \"endingIds\": ").Append(J(VigilRules.EndingIds))
              .Append(",\n    \"epitaphs\": ").Append(J(VigilRules.Epitaphs)).Append(",\n    \"ranks\": ").Append(J(VigilRules.RankNames))
              .Append(",\n    \"rankThresholds\": ").Append(J(VigilRules.RankThresholds)).Append(",\n    \"endings\": [");
            bool first = true;
            foreach (var sanity in new[] { 0, 1, 49, 50, 51, 100 })
                foreach (var collapsed in new[] { false, true })
                    foreach (var named in new[] { false, true })
                        foreach (var complete in new[] { false, true })
                        {
                            sb.Append(first ? "" : ", ").Append('[').Append(sanity).Append(", ").Append(collapsed ? 1 : 0).Append(", ").Append(named ? 1 : 0)
                              .Append(", ").Append(complete ? 1 : 0).Append(", ").Append(J(VigilRules.EndingFor(sanity, collapsed, named, complete))).Append(']');
                            first = false;
                        }
            sb.Append("],\n    \"scores\": [");
            for (int i = 0; i < 24; i++)
            {
                var r = new SeededRandom(i * 104729 + 3);
                int c = r.Next(30), l = r.Next(20), san = r.Next(101), nn = r.Next(10), x = r.Next(14);
                string end = VigilRules.EndingIds[r.Next(VigilRules.EndingIds.Length)];
                int score = VigilRules.Score(c, l, san, nn, x, end);
                sb.Append(i > 0 ? ", " : "").Append('[').Append(c).Append(", ").Append(l).Append(", ").Append(san).Append(", ").Append(nn).Append(", ").Append(x)
                  .Append(", ").Append(J(end)).Append(", ").Append(score).Append(", ").Append(VigilRules.RankFor(score)).Append(']');
            }
            sb.Append("],\n    \"sanityPoints\": [");
            var raw = new[] { -5f, 0f, 0.49f, 0.5f, 49.5f, 99.5f, 100f, 250f, float.NaN };
            for (int i = 0; i < raw.Length; i++) sb.Append(i > 0 ? ", " : "").Append(VigilRules.SanityPoints(raw[i]));
            sb.Append("],\n    \"codes\": [");
            first = true;
            foreach (var seed in new[] { 0, 5, -7, int.MaxValue, int.MinValue + 1 })
                foreach (var end in VigilRules.EndingIds)
                {
                    string code = VigilRules.ResultCode(seed, end, 1234);
                    sb.Append(first ? "" : ", ").Append('[').Append(seed).Append(", ").Append(J(end)).Append(", 1234, ").Append(J(code)).Append(']');
                    first = false;
                }
            sb.Append("],\n    \"badCodes\": ").Append(J(VigilBadCodes)).Append(",\n    \"goodCodes\": [");
            first = true;
            foreach (var text in VigilBadCodes)
            {
                VigilResultCode parsed;
                if (!VigilRules.TryParseResultCode(text, out parsed)) continue;
                sb.Append(first ? "" : ", ").Append('[').Append(J(text)).Append(", ").Append(parsed.Seed).Append(", ").Append(J(parsed.EndingId)).Append(", ").Append(parsed.Score).Append(']');
                first = false;
            }
            sb.Append("],\n    \"reveals\": [");
            first = true;
            foreach (var seed in VigilSeeds)
                foreach (var nights in new[] { 1, 5, 9 })
                {
                    var ritual = RitualChain.Generate(CampaignGenerator.Generate(seed, nights));
                    int total = VigilRules.TotalClues(nights);
                    sb.Append(first ? "" : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"nights\": ").Append(nights).Append(", \"name\": ").Append(J(ritual.Name))
                      .Append(", \"total\": ").Append(total).Append(", \"masks\": [");
                    for (int f = 0; f <= total + 1; f++) sb.Append(f > 0 ? ", " : "").Append(J(VigilRules.NameReveal(ritual, f, total)));
                    sb.Append("] }");
                    first = false;
                }
            sb.Append("],\n    \"plays\": [");
            first = true;
            foreach (var seed in VigilSeeds)
                foreach (var careful in new[] { true, false })
                {
                    var log = new List<VigilEvent>();
                    var v = VigilPlayer.Play(seed, VigilPlayer.NightsForBalance, careful, log);
                    var o = v.Outcome(3);
                    sb.Append(first ? "" : ",\n      ").Append("{ \"seed\": ").Append(seed).Append(", \"nights\": ").Append(VigilPlayer.NightsForBalance).Append(", \"events\": [");
                    for (int e = 0; e < log.Count; e++)
                        sb.Append(e > 0 ? ", " : "").Append('[').Append(J(log[e].Kind)).Append(", ").Append(J(log[e].Id ?? "")).Append(", ").Append(log[e].Value).Append(']');
                    sb.Append("], \"save\": ").Append(J(v.Serialize())).Append(", \"name\": ").Append(J(v.RevealedName)).Append(", \"ending\": ").Append(J(o.EndingId))
                      .Append(", \"score\": ").Append(o.Score).Append(", \"rank\": ").Append(o.Rank).Append(", \"code\": ").Append(J(o.Code))
                      .Append(", \"named\": ").Append(o.Named ? "true" : "false").Append(", \"ritualComplete\": ").Append(o.RitualComplete ? "true" : "false").Append(" }");
                    first = false;
                }
            sb.Append("],\n    \"sandboxActions\": ").Append(J(VigilRules.SandboxActionIds)).Append(",\n    \"sandboxRule\": [");
            first = true;
            foreach (var id in VigilRules.SandboxActionIds.Concat(new[] { "unknown_cheat", "" }))
                foreach (var live in new[] { true, false })
                {
                    sb.Append(first ? "" : ", ").Append('[').Append(J(id)).Append(", ").Append(live ? 1 : 0).Append(", ").Append(VigilRules.AllowsSandboxAction(live, id) ? 1 : 0).Append(']');
                    first = false;
                }
            sb.Append("],\n    \"gates\": ").Append(VigilGates()).Append(",\n    \"clock\": ").Append(VigilClock()).Append(",\n    \"clueKinds\": [");
            for (int k = 0; k <= (int)InteractionKind.Candle; k++)
                sb.Append(k > 0 ? ", " : "").Append('[').Append(k).Append(", ").Append(VigilRules.CountsAsClue((InteractionKind)k) ? 1 : 0).Append(']');
            sb.Append("]\n  }\n");
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
