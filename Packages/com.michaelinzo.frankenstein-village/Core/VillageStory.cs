using System;
using System.Collections.Generic;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>A family history from Data/story.json. The surname is also a last name of <see cref="VillagerRules.GenerateRoster"/>.</summary>
    public sealed class StoryFamilyData
    {
        public string Surname;
        public LocalizedName History;
    }

    /// <summary>One missing person of the data file: given name, what is said at each stage of the arc, and the journal lines of a witness and of kin.</summary>
    public sealed class StoryMissingData
    {
        public string Id;
        public LocalizedName Given;
        /// <summary>Chat lines for stage 0 (early nights), 1 and 2 (late nights).</summary>
        public List<LocalizedName> Chat = new List<LocalizedName>();
        public LocalizedName Witness;
        public LocalizedName Kin;
    }

    /// <summary>A local legend tied to one landmark of <see cref="VillageLandmarks.Ids"/>.</summary>
    public sealed class StoryLegend
    {
        public string Id;
        public LocalizedName Title;
        public LocalizedName Text;
    }

    /// <summary>A rumor for one stage of the campaign (band 0..2) and one dread tier (0..3).</summary>
    public sealed class StoryRumor
    {
        public int Band;
        public int Tier;
        public LocalizedName Text;
    }

    /// <summary>The parsed narrative data file Data/story.json. The same file is read by web/src/village-story.js; a drift test compares the two copies.</summary>
    public sealed class StoryLibrary
    {
        public List<StoryFamilyData> Families = new List<StoryFamilyData>();
        public Dictionary<string, LocalizedName> Districts = new Dictionary<string, LocalizedName>();
        public List<StoryLegend> Legends = new List<StoryLegend>();
        public List<StoryMissingData> Missing = new List<StoryMissingData>();
        public List<LocalizedName> GossipNeighbour = new List<LocalizedName>();
        public List<LocalizedName> GossipFamily = new List<LocalizedName>();
        public List<StoryRumor> Rumors = new List<StoryRumor>();

        public int FamilyIndex(string surname)
        {
            for (int i = 0; i < Families.Count; i++) if (Families[i].Surname == surname) return i;
            return -1;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending entry when it is malformed.</summary>
        public static StoryLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("story: root is not an object");
            var lib = new StoryLibrary();
            foreach (var o in Objects(root, "families"))
            {
                var surname = Str(o, "surname", "family");
                lib.Families.Add(new StoryFamilyData { Surname = surname, History = Text(o, "family " + surname) });
            }
            var districts = root.ContainsKey("districts") ? root["districts"] as Dictionary<string, object> : null;
            if (districts == null) throw new FormatException("story: missing districts object");
            foreach (var kv in districts) lib.Districts[kv.Key] = Text(kv.Value as Dictionary<string, object>, "district " + kv.Key);
            foreach (var o in Objects(root, "legends"))
            {
                var id = Str(o, "id", "legend");
                lib.Legends.Add(new StoryLegend { Id = id, Title = Loc(o, "title", "legend " + id), Text = Loc(o, "text", "legend " + id) });
            }
            foreach (var o in Objects(root, "missing"))
            {
                var id = Str(o, "id", "missing");
                var m = new StoryMissingData { Id = id, Given = Loc(o, "given", "missing " + id), Witness = Loc(o, "witness", "missing " + id), Kin = Loc(o, "kin", "missing " + id) };
                var chat = o.ContainsKey("chat") ? o["chat"] as List<object> : null;
                if (chat == null || chat.Count != VillageStory.Stages) throw new FormatException("story: missing " + id + " needs " + VillageStory.Stages + " chat lines");
                foreach (var c in chat) m.Chat.Add(Text(c as Dictionary<string, object>, "missing " + id + " chat"));
                lib.Missing.Add(m);
            }
            var gossip = root.ContainsKey("gossip") ? root["gossip"] as Dictionary<string, object> : null;
            if (gossip == null) throw new FormatException("story: missing gossip object");
            foreach (var o in Objects(gossip, "neighbour")) lib.GossipNeighbour.Add(Text(o, "gossip neighbour"));
            foreach (var o in Objects(gossip, "family")) lib.GossipFamily.Add(Text(o, "gossip family"));
            if (lib.GossipNeighbour.Count == 0 || lib.GossipFamily.Count == 0) throw new FormatException("story: gossip needs neighbour and family lines");
            foreach (var o in Objects(root, "rumors"))
            {
                var r = new StoryRumor { Text = Text(o, "rumor") };
                r.Band = o.ContainsKey("band") && o["band"] is double ? (int)(double)o["band"] : -1;
                r.Tier = o.ContainsKey("tier") && o["tier"] is double ? (int)(double)o["tier"] : -1;
                if (r.Band < 0 || r.Band >= VillageStory.Stages || r.Tier < 0 || r.Tier >= VillageStory.Tiers) throw new FormatException("story: rumor has band or tier out of range");
                lib.Rumors.Add(r);
            }
            if (lib.Families.Count == 0) throw new FormatException("story: no families");
            return lib;
        }

        private static List<Dictionary<string, object>> Objects(Dictionary<string, object> o, string key)
        {
            var list = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (list == null) throw new FormatException("story: missing " + key + " array");
            var result = new List<Dictionary<string, object>>();
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException("story: " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("story: " + owner + " lacks " + key);
            return s;
        }

        private static LocalizedName Text(Dictionary<string, object> o, string owner)
        {
            if (o == null) throw new FormatException("story: " + owner + " is not an object");
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = o.ContainsKey(lang) ? o[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("story: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }

        private static LocalizedName Loc(Dictionary<string, object> o, string key, string owner)
        {
            return Text(o.ContainsKey(key) ? o[key] as Dictionary<string, object> : null, owner + " " + key);
        }
    }

    /// <summary>A family of the village: a surname from the data file, the villagers who carry it and the house that is theirs.</summary>
    public sealed class StoryFamily
    {
        public int SurnameIndex;
        public string Surname;
        /// <summary>Roster indices of the living villagers of this family.</summary>
        public List<int> Members = new List<int>();
        /// <summary>Layout index of the family house, or -1 when the layout has no free house.</summary>
        public int HomePiece = -1;
    }

    /// <summary>One missing person of this village: whose family, who is kin, who saw the last evening.</summary>
    public sealed class StoryMissing
    {
        public int DataIndex;
        public string Id;
        public int FamilyIndex;
        /// <summary>Roster index of a family member, or -1 when the family has no living villager.</summary>
        public int KinIndex = -1;
        /// <summary>Roster index of a villager outside the family who saw the last evening, or -1.</summary>
        public int WitnessIndex = -1;
    }

    /// <summary>What a villager brings up when chatted with about the village (topic 3): kind 0 a neighbour, 1 their own family, 2 a missing person, 3 the night's rumor.</summary>
    public struct StoryGossip
    {
        public int Kind;
        /// <summary>Roster index of the neighbour (kind 0) or index into <see cref="VillageStory.Missing"/> (kind 2), else -1.</summary>
        public int Subject;
        public int Stage;
        public int Variant;
    }

    /// <summary>
    /// The narrative layer of one village: families and surnames, who owns which house, a seeded handful of missing persons whose fate is told in lore pages, chat and journals,
    /// rumors that change with the night and the dread tier, and the district histories and landmark legends. It is built from the roster and the seeded names, so every villager's
    /// home is a named house and the other villagers mention them. Pure and deterministic; the same seed, layout, roster and data always give the same story. Wording never decides anything.
    /// </summary>
    public sealed class VillageStory
    {
        public const int Stages = 3;
        public const int Tiers = 4;
        public const int MissingCount = 3;
        public const int OwnerStream = 0x4F574E;
        public const int HomeStream = 0x484F4D;
        public const int MissingStream = 0x4D4953;
        public const int NeighbourStream = 0x4E4549;
        public const int GossipStream = 0x474F53;
        public const int RumorStream = 0x52554D;
        public const int IndexStep = 40503;
        /// <summary>The kinds of <see cref="StoryGossip"/>.</summary>
        public const int GossipKindNeighbour = 0, GossipKindFamily = 1, GossipKindMissing = 2, GossipKindRumor = 3;

        public StoryLibrary Library;
        public int Seed;
        public IList<Villager> Roster;
        public IList<LocalizedName> Names;
        public string VillageName = "";
        public List<StoryFamily> Families = new List<StoryFamily>();
        public List<StoryMissing> Missing = new List<StoryMissing>();
        /// <summary>Per layout piece, the surname index (into <see cref="StoryLibrary.Families"/>) of the family that owns the house, or -1 for a piece that is no house.</summary>
        public int[] Owners = new int[0];

        /// <summary>Stage of the campaign arc for a night: 0 early, 1 middle, 2 late. The same split as <see cref="CampaignGenerator"/>.</summary>
        public static int StageOfNight(int night, int nights)
        {
            nights = CampaignGenerator.ClampNights(nights);
            int i = Math.Max(0, Math.Min(nights - 1, night - 1));
            return nights == 1 ? 1 : i * 3 / nights;
        }

        public static string SurnameOf(string fullName)
        {
            int k = fullName.LastIndexOf(' ');
            return k < 0 ? fullName : fullName.Substring(k + 1);
        }

        public static VillageStory Build(StoryLibrary lib, int seed, IList<PlacedPiece> layout, IList<Villager> roster, IList<LocalizedName> names, string villageName)
        {
            var story = new VillageStory { Library = lib, Seed = seed, Roster = roster ?? new List<Villager>(), Names = names, VillageName = villageName ?? "" };
            int n = layout == null ? 0 : layout.Count, famCount = lib.Families.Count;
            story.Owners = new int[n];
            var claimed = new bool[n];
            for (int i = 0; i < n; i++)
                story.Owners[i] = layout[i].Id != null && layout[i].Id.StartsWith("house", StringComparison.Ordinal) ? new SeededRandom(seed ^ OwnerStream ^ (i * IndexStep)).Next(famCount) : -1;

            foreach (var v in story.Roster)
            {
                int s = lib.FamilyIndex(SurnameOf(v.Name));
                if (s < 0) continue;
                var fam = story.FamilyFor(s);
                fam.Members.Add(v.Index);
                if (v.HomeIndex >= 0 && v.HomeIndex < n && !claimed[v.HomeIndex])
                {
                    claimed[v.HomeIndex] = true;
                    story.Owners[v.HomeIndex] = s;
                    if (fam.HomePiece < 0) fam.HomePiece = v.HomeIndex;
                }
            }
            var homeRng = new SeededRandom(seed ^ HomeStream);
            foreach (var fam in story.Families) if (fam.HomePiece < 0) story.AssignHome(fam, layout, claimed, homeRng);

            var order = new List<int>();
            for (int i = 0; i < lib.Missing.Count; i++) order.Add(i);
            var rng = new SeededRandom(seed ^ MissingStream);
            for (int i = order.Count - 1; i > 0; i--) { int j = rng.Next(i + 1); int t = order[i]; order[i] = order[j]; order[j] = t; }
            for (int k = 0; k < Math.Min(MissingCount, order.Count); k++)
            {
                int s = rng.Next(famCount);
                var fam = story.FamilyFor(s);
                if (fam.HomePiece < 0) story.AssignHome(fam, layout, claimed, rng);
                var m = new StoryMissing { DataIndex = order[k], Id = lib.Missing[order[k]].Id, FamilyIndex = story.Families.IndexOf(fam) };
                int kinRoll = rng.Next(Math.Max(1, fam.Members.Count));
                if (fam.Members.Count > 0) m.KinIndex = fam.Members[kinRoll];
                var others = new List<int>();
                foreach (var v in story.Roster) if (!fam.Members.Contains(v.Index)) others.Add(v.Index);
                int witnessRoll = rng.Next(Math.Max(1, others.Count));
                if (others.Count > 0) m.WitnessIndex = others[witnessRoll];
                story.Missing.Add(m);
            }
            return story;
        }

        private StoryFamily FamilyFor(int surnameIndex)
        {
            foreach (var f in Families) if (f.SurnameIndex == surnameIndex) return f;
            var fam = new StoryFamily { SurnameIndex = surnameIndex, Surname = Library.Families[surnameIndex].Surname };
            Families.Add(fam);
            return fam;
        }

        private void AssignHome(StoryFamily fam, IList<PlacedPiece> layout, bool[] claimed, SeededRandom rng)
        {
            var free = new List<int>();
            for (int i = 0; i < Owners.Length; i++) if (Owners[i] >= 0 && !claimed[i]) free.Add(i);
            int roll = rng.Next(Math.Max(1, free.Count));
            if (free.Count == 0) return;
            fam.HomePiece = free[roll];
            claimed[fam.HomePiece] = true;
            Owners[fam.HomePiece] = fam.SurnameIndex;
        }

        public bool HasMissing(string id)
        {
            foreach (var m in Missing) if (m.Id == id) return true;
            return false;
        }

        /// <summary>The surname of the family that owns a house, or "" for a piece that is no house.</summary>
        public string OwnerSurname(int piece)
        {
            return piece >= 0 && piece < Owners.Length && Owners[piece] >= 0 ? Library.Families[Owners[piece]].Surname : "";
        }

        /// <summary>The seeded name of a layout piece in a language, or a plain fallback when the piece has none.</summary>
        public string PieceName(int piece, string lang, string surname)
        {
            var n = Names != null && piece >= 0 && piece < Names.Count ? Names[piece] : null;
            if (n != null) return n.Get(lang);
            return lang == "fr" ? "la maison " + surname : "the " + surname + " house";
        }

        private string FamilyHomeName(StoryFamily fam, string lang) { return PieceName(fam.HomePiece, lang, fam.Surname); }

        /// <summary>Substitutes {key} placeholders in one pass; an unknown key stays as written.</summary>
        public static string Render(string template, IDictionary<string, string> vars)
        {
            var sb = new StringBuilder();
            int i = 0;
            while (i < template.Length)
            {
                char c = template[i];
                int close = c == '{' ? template.IndexOf('}', i + 1) : -1;
                string value;
                if (close > 0 && vars.TryGetValue(template.Substring(i + 1, close - i - 1), out value)) { sb.Append(value); i = close + 1; }
                else { sb.Append(c); i++; }
            }
            return sb.ToString();
        }

        /// <summary>The roster index of the villager who lives next to villager <paramref name="index"/> in the telling: always another villager when there is more than one.</summary>
        public int NeighbourOf(int index)
        {
            int count = Roster.Count;
            if (count < 2) return index;
            return (index + 1 + new SeededRandom(Seed ^ NeighbourStream ^ (index * IndexStep)).Next(count - 1)) % count;
        }

        public Dictionary<string, string> VillagerVars(Villager v, string lang)
        {
            var vars = new Dictionary<string, string>();
            string surname = SurnameOf(v.Name);
            vars["village"] = VillageName;
            vars["name"] = v.Name;
            vars["surname"] = surname;
            vars["home"] = PieceName(v.HomeIndex, lang, surname);
            var nb = Roster[NeighbourOf(v.Index)];
            vars["neighbour"] = nb.Name;
            vars["neighbourHome"] = PieceName(nb.HomeIndex, lang, SurnameOf(nb.Name));
            return vars;
        }

        public Dictionary<string, string> MissingVars(StoryMissing m, string lang)
        {
            var fam = Families[m.FamilyIndex];
            string given = Library.Missing[m.DataIndex].Given.Get(lang);
            var vars = new Dictionary<string, string>();
            vars["village"] = VillageName;
            vars["given"] = given;
            vars["surname"] = fam.Surname;
            vars["missing"] = given + " " + fam.Surname;
            vars["home"] = FamilyHomeName(fam, lang);
            return vars;
        }

        private static void Merge(Dictionary<string, string> into, Dictionary<string, string> over) { foreach (var kv in over) into[kv.Key] = kv.Value; }

        private Villager VillagerOfJournal(LoreBook book)
        {
            foreach (var v in Roster) if (VillagerRules.RoleIds[(int)v.Role] == book.Role) return v;
            return null;
        }

        /// <summary>The title of a book as this village tells it: placeholders of journals and missing person pages are filled in.</summary>
        public string BookTitle(LoreBook book, string lang)
        {
            return Render(Pick(book.Titles, lang), BookVars(book, lang));
        }

        /// <summary>The text of a book. A villager's journal also carries the line of every missing person they saw or grieve for.</summary>
        public string BookText(LoreBook book, string lang)
        {
            var text = Render(Pick(book.Texts, lang), BookVars(book, lang));
            var v = book.Role.Length > 0 ? VillagerOfJournal(book) : null;
            if (v != null)
                foreach (var m in Missing)
                {
                    var data = Library.Missing[m.DataIndex];
                    var vars = VillagerVars(v, lang);
                    Merge(vars, MissingVars(m, lang));
                    if (m.KinIndex == v.Index) text += "\n\n" + Render(data.Kin.Get(lang), vars);
                    else if (m.WitnessIndex == v.Index) text += "\n\n" + Render(data.Witness.Get(lang), vars);
                }
            return text;
        }

        private static string Pick(Dictionary<string, string> texts, string lang) { string s; return texts.TryGetValue(lang, out s) ? s : texts[VillageNames.Languages[0]]; }

        private Dictionary<string, string> BookVars(LoreBook book, string lang)
        {
            if (book.Missing.Length > 0)
                foreach (var m in Missing) if (m.Id == book.Missing) return MissingVars(m, lang);
            if (book.Role.Length > 0)
            {
                var v = VillagerOfJournal(book);
                if (v != null) return VillagerVars(v, lang);
            }
            return new Dictionary<string, string> { { "village", VillageName } };
        }

        /// <summary>The roster index of the villager whose journal this book is, or -1.</summary>
        public int JournalOwner(LoreBook book)
        {
            var v = book.Role.Length > 0 ? VillagerOfJournal(book) : null;
            return v == null ? -1 : v.Index;
        }

        /// <summary>What villager <paramref name="v"/> says about the village when asked on <paramref name="night"/> (1-based), at a stage 0..2 and a dread tier 0..3.</summary>
        public StoryGossip GossipFor(Villager v, int night, int stage)
        {
            var rng = new SeededRandom(Seed ^ GossipStream ^ (v.Index * 7919) ^ (night * 31));
            int roll = rng.Next(4), variant = rng.Next(3);
            int involved = -1;
            for (int i = 0; i < Missing.Count && involved < 0; i++) if (Missing[i].KinIndex == v.Index || Missing[i].WitnessIndex == v.Index) involved = i;
            var g = new StoryGossip { Subject = -1, Stage = Math.Max(0, Math.Min(Stages - 1, stage)), Variant = variant };
            if (involved >= 0 && roll < 3) { g.Kind = GossipKindMissing; g.Subject = involved; }
            else if (roll == 0) { g.Kind = GossipKindNeighbour; g.Subject = NeighbourOf(v.Index); }
            else if (roll == 1) g.Kind = GossipKindFamily;
            else if (roll == 2 && Missing.Count > 0) { g.Kind = GossipKindMissing; g.Subject = variant % Missing.Count; }
            else g.Kind = GossipKindRumor;
            return g;
        }

        public string GossipText(StoryGossip g, Villager v, int night, int dreadTier, string lang)
        {
            var vars = VillagerVars(v, lang);
            if (g.Kind == GossipKindNeighbour) return Render(Library.GossipNeighbour[g.Variant % Library.GossipNeighbour.Count].Get(lang), vars);
            if (g.Kind == GossipKindFamily) return Render(Library.GossipFamily[0].Get(lang), vars);
            if (g.Kind == GossipKindMissing)
            {
                Merge(vars, MissingVars(Missing[g.Subject], lang));
                return Render(Library.Missing[Missing[g.Subject].DataIndex].Chat[g.Stage].Get(lang), vars);
            }
            return RumorText(night, g.Stage, dreadTier, lang);
        }

        /// <summary>The rumor for a night: one of the data file's rumors of this stage and dread tier, chosen by seed and night. "" when the data has none.</summary>
        public string RumorText(int night, int stage, int dreadTier, string lang)
        {
            int tier = Math.Max(0, Math.Min(Tiers - 1, dreadTier));
            stage = Math.Max(0, Math.Min(Stages - 1, stage));
            var eligible = new List<StoryRumor>();
            foreach (var r in Library.Rumors) if (r.Band == stage && r.Tier == tier) eligible.Add(r);
            if (eligible.Count == 0) return "";
            var pick = eligible[new SeededRandom(Seed ^ RumorStream ^ (night * IndexStep) ^ (tier * 31)).Next(eligible.Count)];
            return Render(pick.Text.Get(lang), new Dictionary<string, string> { { "village", VillageName } });
        }
    }
}
