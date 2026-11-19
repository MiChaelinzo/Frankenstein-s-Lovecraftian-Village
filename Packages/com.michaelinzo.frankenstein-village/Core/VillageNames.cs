using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One name in every language, from Data/names.json.</summary>
    public sealed class LocalizedName
    {
        public Dictionary<string, string> Text = new Dictionary<string, string>();
        public string Get(string lang) { string s; return Text.TryGetValue(lang, out s) ? s : Text[VillageNames.Languages[0]]; }
    }

    /// <summary>The naming words of one building kind: curated names per district, curated names for any district, and a prefix by form grid.</summary>
    public sealed class NameKind
    {
        public Dictionary<string, List<LocalizedName>> Districts = new Dictionary<string, List<LocalizedName>>();
        public List<LocalizedName> Any = new List<LocalizedName>();
        public List<LocalizedName> Prefixes = new List<LocalizedName>();
        /// <summary>Templates holding "{p}" where a prefix goes.</summary>
        public List<LocalizedName> Forms = new List<LocalizedName>();
    }

    /// <summary>The parsed names data file. The same file is read by web/src/names.js; a drift test compares the two copies.</summary>
    public sealed class NameLibrary
    {
        public Dictionary<string, NameKind> Kinds = new Dictionary<string, NameKind>();
        public Dictionary<string, List<LocalizedName>> Landmarks = new Dictionary<string, List<LocalizedName>>();

        /// <summary>Parses the data file. Throws FormatException naming the offending kind or landmark when it is malformed.</summary>
        public static NameLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            var kinds = root != null && root.ContainsKey("kinds") ? root["kinds"] as Dictionary<string, object> : null;
            var lands = root != null && root.ContainsKey("landmarks") ? root["landmarks"] as Dictionary<string, object> : null;
            if (kinds == null) throw new FormatException("names: missing kinds object");
            if (lands == null) throw new FormatException("names: missing landmarks object");
            var lib = new NameLibrary();
            foreach (var kv in kinds)
            {
                var o = kv.Value as Dictionary<string, object>;
                if (o == null) throw new FormatException("names: kind " + kv.Key + " is not an object");
                var kind = new NameKind();
                var districts = o.ContainsKey("districts") ? o["districts"] as Dictionary<string, object> : null;
                if (districts == null) throw new FormatException("names: kind " + kv.Key + " lacks districts");
                foreach (var d in districts) kind.Districts[d.Key] = List(d.Value, "kind " + kv.Key + " district " + d.Key);
                kind.Any = List(o.ContainsKey("any") ? o["any"] : null, "kind " + kv.Key + " any");
                kind.Prefixes = List(o.ContainsKey("prefixes") ? o["prefixes"] : null, "kind " + kv.Key + " prefixes");
                kind.Forms = List(o.ContainsKey("forms") ? o["forms"] : null, "kind " + kv.Key + " forms");
                if (kind.Prefixes.Count == 0 || kind.Forms.Count == 0) throw new FormatException("names: kind " + kv.Key + " needs prefixes and forms");
                foreach (var f in kind.Forms)
                    foreach (var lang in VillageNames.Languages)
                        if (f.Text[lang].IndexOf("{p}", StringComparison.Ordinal) < 0) throw new FormatException("names: kind " + kv.Key + " form lacks {p} in " + lang);
                lib.Kinds[kv.Key] = kind;
            }
            foreach (var kv in lands)
            {
                var list = List(kv.Value, "landmark " + kv.Key);
                if (list.Count == 0) throw new FormatException("names: landmark " + kv.Key + " has no names");
                lib.Landmarks[kv.Key] = list;
            }
            return lib;
        }

        private static List<LocalizedName> List(object value, string owner)
        {
            var arr = value as List<object>;
            if (arr == null) throw new FormatException("names: " + owner + " is not an array");
            var result = new List<LocalizedName>();
            foreach (var item in arr)
            {
                var o = item as Dictionary<string, object>;
                if (o == null) throw new FormatException("names: " + owner + " holds a non-object");
                var name = new LocalizedName();
                foreach (var lang in VillageNames.Languages)
                {
                    var s = o.ContainsKey(lang) ? o[lang] as string : null;
                    if (string.IsNullOrWhiteSpace(s)) throw new FormatException("names: " + owner + " lacks " + lang + " text");
                    name.Text[lang] = s;
                }
                result.Add(name);
            }
            return result;
        }
    }

    /// <summary>
    /// The name rule: building kind + district + seed -> a name no other building of the village has. Every building index gets the same name every time
    /// (the narrative can say "the family of Crowmere Hall" for layout index i), and the choice never depends on the language, so en and fr always describe the same building.
    /// </summary>
    public static class VillageNames
    {
        public static readonly string[] Languages = { "en", "fr" };
        public const int NameStream = 0x4E414D;
        public const int LandmarkStream = 0x4C4D4B;
        public const int IndexStep = 40503;
        /// <summary>Percent chance a building takes a curated name before a composed one.</summary>
        public const int CuratedPercent = 40;
        private const string PrefixMarker = "{p}";

        /// <summary>
        /// One name per layout piece, in layout order. A piece whose kind has no words gets null. Names are unique by their English text;
        /// when every candidate of a kind is taken, the pick gets " 2", " 3" and so on.
        /// </summary>
        public static List<LocalizedName> Assign(NameLibrary lib, int seed, int gridW, int gridD, IList<PlacedPiece> layout)
        {
            var result = new List<LocalizedName>();
            var used = new HashSet<string>();
            for (int i = 0; i < layout.Count; i++)
            {
                var piece = layout[i];
                NameKind kind;
                if (!lib.Kinds.TryGetValue(piece.Id, out kind)) { result.Add(null); continue; }
                string districtId = VillageDistricts.Ids[VillageDistricts.At(seed, gridW, gridD, piece.X, piece.Z)];
                var curated = new List<LocalizedName>();
                List<LocalizedName> local;
                if (kind.Districts.TryGetValue(districtId, out local)) curated.AddRange(local);
                curated.AddRange(kind.Any);
                int composed = kind.Prefixes.Count * kind.Forms.Count;
                var rng = new SeededRandom(seed ^ NameStream ^ (i * IndexStep));
                bool curatedFirst = curated.Count > 0 && rng.Next(100) < CuratedPercent;
                int start = rng.Next(1000000);
                int firstSize = curatedFirst ? curated.Count : composed;
                int secondSize = curatedFirst ? composed : curated.Count;
                LocalizedName pick = null, first = null;
                for (int k = 0; k < firstSize + secondSize && pick == null; k++)
                {
                    bool inFirst = k < firstSize;
                    int size = inFirst ? firstSize : secondSize;
                    int index = (start + k) % size;
                    bool fromCurated = inFirst ? curatedFirst : !curatedFirst;
                    var cand = Candidate(kind, curated, fromCurated, index);
                    if (first == null) first = cand;
                    if (used.Add(cand.Get("en"))) pick = cand;
                }
                if (pick == null)
                {
                    for (int n = 2; pick == null; n++)
                    {
                        var numbered = new LocalizedName();
                        foreach (var lang in Languages) numbered.Text[lang] = first.Text[lang] + " " + n;
                        if (used.Add(numbered.Get("en"))) pick = numbered;
                    }
                }
                result.Add(pick);
            }
            return result;
        }

        /// <summary>The seeded name of one landmark of the wider world (id from <see cref="VillageLandmarks.Ids"/>), or null for an unknown id.</summary>
        public static LocalizedName Landmark(NameLibrary lib, int seed, string landmarkId)
        {
            int slot = Array.IndexOf(VillageLandmarks.Ids, landmarkId);
            List<LocalizedName> list;
            if (slot < 0 || !lib.Landmarks.TryGetValue(landmarkId, out list)) return null;
            return list[new SeededRandom(seed ^ LandmarkStream ^ (slot * IndexStep)).Next(list.Count)];
        }

        private static LocalizedName Candidate(NameKind kind, List<LocalizedName> curated, bool fromCurated, int index)
        {
            if (fromCurated) return curated[index];
            var prefix = kind.Prefixes[index / kind.Forms.Count];
            var form = kind.Forms[index % kind.Forms.Count];
            var name = new LocalizedName();
            foreach (var lang in Languages) name.Text[lang] = form.Text[lang].Replace(PrefixMarker, prefix.Text[lang]);
            return name;
        }
    }
}
