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

        private static PrefabCatalog LoadCatalog(string root)
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
            sb.Append("}\n");
            return sb.ToString();
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

        private static readonly string[] VigilBadCodes =
        {
            "", "V1", "V1-5-dawn", "V2-5-dawn-10", "V1-5-nobody-10", "V1-5-dawn--10", "V1-5-dawn-+10", "V1-05-dawn-10", "V1--0-dawn-10",
            "V1-5-dawn-010", "V1-abc-dawn-10", "V1-99999999999-dawn-10", "V1-5-dawn-10-", "V1--7-name_spoken-3400", "V1-2147483647-vessel-0",
        };

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
            sb.Append("],\n    \"gates\": ").Append(VigilGates()).Append(",\n    \"clueKinds\": [");
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
