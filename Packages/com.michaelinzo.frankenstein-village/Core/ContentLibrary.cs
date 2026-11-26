using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One authored quest from Data/content/quests.json: the theories it can end in, the statements that are its evidence and one conclusion text per theory.</summary>
    public sealed class ContentQuest
    {
        public string Id;
        public List<string> Theory = new List<string>();
        public List<string> Evidence = new List<string>();
        public Dictionary<string, LocalizedName> Conclusions = new Dictionary<string, LocalizedName>();
    }

    /// <summary>One authored rumor from Data/content/rumors.json: whether the first telling is true and its tellings from the first to the most distorted.</summary>
    public sealed class ContentRumor
    {
        public string Id;
        public bool Truth;
        public List<LocalizedName> Mutations = new List<LocalizedName>();
    }

    /// <summary>One authored event from Data/content/events.json: a line of village history on a night, told when the omen named by <see cref="Condition"/> is that night's new omen. Effects are parsed and kept; the game does not apply them (spec 179).</summary>
    public sealed class ContentEvent
    {
        public string Id;
        public int Night;
        public string Condition;
        public LocalizedName Text;
        public Dictionary<string, int> Effects = new Dictionary<string, int>();
    }

    /// <summary>
    /// The authored content files under Data/content (round 37, spec 179). The files are validated against their schemas by tools/content_schemas.py (references to real theory, statement and omen ids);
    /// this loader checks the shape the game relies on and throws FormatException naming the file, the item and the field. web/src/content.js is the JavaScript port and a golden test keeps both equal.
    /// Pure data in, pure data out: nothing here reads or writes a save, sanity, dread or an ending.
    /// </summary>
    public sealed class ContentLibrary
    {
        public List<ContentQuest> Quests = new List<ContentQuest>();
        public List<ContentRumor> Rumors = new List<ContentRumor>();
        public List<ContentEvent> Events = new List<ContentEvent>();

        /// <summary>Parses the three files. A null or empty text means the file is absent and its list stays empty.</summary>
        public static ContentLibrary Parse(string questsJson, string rumorsJson, string eventsJson)
        {
            var lib = new ContentLibrary();
            var ids = new HashSet<string>();
            foreach (var o in Items(questsJson, "quests"))
            {
                var q = new ContentQuest { Id = Id(o, "quests", ids, "quest") };
                string p = "quests.json: quest '" + q.Id + "'";
                q.Theory = Strings(o, "theory", p);
                q.Evidence = Strings(o, "evidence", p);
                var concl = List(o, "conclusions", p);
                foreach (var c in concl)
                {
                    var d = c as Dictionary<string, object>;
                    string theory = d != null && d.ContainsKey("theory") ? d["theory"] as string : null;
                    if (theory == null || !q.Theory.Contains(theory)) throw new FormatException(p + ": field 'conclusions.theory': must be one of this quest's theory ids");
                    q.Conclusions[theory] = Text(d, p + ": field 'conclusions");
                }
                lib.Quests.Add(q);
            }
            ids.Clear();
            foreach (var o in Items(rumorsJson, "rumors"))
            {
                var r = new ContentRumor { Id = Id(o, "rumors", ids, "rumor") };
                string p = "rumors.json: rumor '" + r.Id + "'";
                if (!o.ContainsKey("truth") || !(o["truth"] is bool)) throw new FormatException(p + ": field 'truth': must be true or false");
                r.Truth = (bool)o["truth"];
                foreach (var m in List(o, "mutations", p)) r.Mutations.Add(Text(m as Dictionary<string, object>, p + ": field 'mutations"));
                lib.Rumors.Add(r);
            }
            ids.Clear();
            foreach (var o in Items(eventsJson, "events"))
            {
                var e = new ContentEvent { Id = Id(o, "events", ids, "event") };
                string p = "events.json: event '" + e.Id + "'";
                if (!o.ContainsKey("night") || !(o["night"] is double) || (double)o["night"] != Math.Floor((double)o["night"]) || (double)o["night"] < 1 || (double)o["night"] > 99) throw new FormatException(p + ": field 'night': must be an integer 1..99");
                e.Night = (int)(double)o["night"];
                e.Condition = o.ContainsKey("condition") ? o["condition"] as string : null;
                if (string.IsNullOrEmpty(e.Condition)) throw new FormatException(p + ": field 'condition': missing");
                e.Text = Text(o.ContainsKey("text") ? o["text"] as Dictionary<string, object> : null, p + ": field 'text");
                var fx = o.ContainsKey("effects") ? o["effects"] as Dictionary<string, object> : null;
                if (fx != null)
                    foreach (var kv in fx)
                    {
                        if (!(kv.Value is double)) throw new FormatException(p + ": field 'effects." + kv.Key + "': must be an integer");
                        e.Effects[kv.Key] = (int)(double)kv.Value;
                    }
                lib.Events.Add(e);
            }
            return lib;
        }

        /// <summary>The authored events told on <paramref name="night"/> when <paramref name="newOmen"/> (the omen id new that night, or "") is its omen, in file order. A client shows them only when the player has learned of that omen.</summary>
        public List<ContentEvent> EventsFor(int night, string newOmen)
        {
            var list = new List<ContentEvent>();
            if (string.IsNullOrEmpty(newOmen)) return list;
            foreach (var e in Events) if (e.Night == night && e.Condition == newOmen) list.Add(e);
            return list;
        }

        private static List<Dictionary<string, object>> Items(string json, string key)
        {
            var result = new List<Dictionary<string, object>>();
            if (string.IsNullOrWhiteSpace(json)) return result;
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            string file = key + ".json";
            if (root == null) throw new FormatException(file + ": root is not an object");
            if (!root.ContainsKey("version") || !(root["version"] is double) || (double)root["version"] != 1) throw new FormatException(file + ": field 'version': must be 1");
            var list = root.ContainsKey(key) ? root[key] as List<object> : null;
            if (list == null) throw new FormatException(file + ": field '" + key + "': must be a list");
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException(file + ": " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static string Id(Dictionary<string, object> o, string key, HashSet<string> seen, string kind)
        {
            string id = o.ContainsKey("id") ? o["id"] as string : null;
            if (string.IsNullOrEmpty(id)) throw new FormatException(key + ".json: a " + kind + " lacks an id");
            if (!seen.Add(id)) throw new FormatException(key + ".json: " + kind + " '" + id + "': field 'id': duplicate id");
            return id;
        }

        private static List<object> List(Dictionary<string, object> o, string field, string prefix)
        {
            var list = o.ContainsKey(field) ? o[field] as List<object> : null;
            if (list == null || list.Count == 0) throw new FormatException(prefix + ": field '" + field + "': must be a non empty list");
            return list;
        }

        private static List<string> Strings(Dictionary<string, object> o, string field, string prefix)
        {
            var result = new List<string>();
            foreach (var x in List(o, field, prefix))
            {
                var s = x as string;
                if (string.IsNullOrEmpty(s)) throw new FormatException(prefix + ": field '" + field + "': holds a non-string");
                result.Add(s);
            }
            return result;
        }

        /// <summary>owner is the message prefix up to the field name without its closing quote, for example "events.json: event 'a': field 'text".</summary>
        private static LocalizedName Text(Dictionary<string, object> d, string owner)
        {
            if (d == null) throw new FormatException(owner + "': must be an object with en and fr");
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = d.ContainsKey(lang) ? d[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException(owner + "." + lang + "': missing or empty");
                name.Text[lang] = s;
            }
            return name;
        }
    }
}
