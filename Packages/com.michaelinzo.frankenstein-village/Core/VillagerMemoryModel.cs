using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>What a villager can remember. Order is stable (golden data uses the integers).</summary>
    public enum MemoryKind
    {
        Accused = 0, Accusing = 1, ClueFound = 2, RumorHeard = 3, RitualWitnessed = 4, FamilyLost = 5, MythosExposure = 6, Conversation = 7,
    }

    /// <summary>What the memories add up to. None means nothing strong enough to change behavior. Order is stable.</summary>
    public enum MemoryOutcome { None = 0, Forgive = 1, Paranoid = 2, Loyal = 3, Obsessed = 4 }

    /// <summary>
    /// One thing that happened to one villager. Night is 1-based. Subject is who it involved (a villager index, or -1 for the player). Weight is per mille, 1 to
    /// <see cref="VillagerMemoryModel.Scale"/>.
    /// </summary>
    public struct MemoryEvent
    {
        public int Night;
        public int Villager;
        public MemoryKind Kind;
        public int Subject;
        public int Weight;
    }

    /// <summary>Per mille changes a villager's memory makes to the society values. Added to the society values and clamped there, never below 0 or above the scale.</summary>
    public struct MemoryEffect
    {
        public int Trust;
        public int Fear;
        public int Faith;
        public int Loyalty;
        public int Obsession;
    }

    /// <summary>
    /// The data file Data/memory.json: authored lines a villager says because of what they remember, per outcome plus one for a memory that has faded. The same file is read by
    /// web/src/memory.js, and a drift test compares the two copies.
    /// </summary>
    public sealed class MemoryLibrary
    {
        /// <summary>Ids in line group order: the four outcomes of <see cref="MemoryOutcome"/> (1 to 4) then "faded", a memory that no longer reaches an outcome.</summary>
        public static readonly string[] LineIds = { "forgive", "paranoid", "loyal", "obsessed", "faded" };
        public const int MinVariants = 2;

        /// <summary>Variants per line id, in <see cref="LineIds"/> order.</summary>
        public List<List<LocalizedName>> Variants = new List<List<LocalizedName>>();

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed, lacks a line id, has too few variants or lacks a language.</summary>
        public static MemoryLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("memory: root is not an object");
            var list = root.ContainsKey("lines") ? root["lines"] as List<object> : null;
            if (list == null) throw new FormatException("memory: missing lines array");
            var groups = new List<LocalizedName>[LineIds.Length];
            foreach (var item in list)
            {
                var o = item as Dictionary<string, object>;
                if (o == null) throw new FormatException("memory: lines holds a non-object");
                string id = o.ContainsKey("id") ? o["id"] as string : null;
                int k = Array.IndexOf(LineIds, id);
                if (k < 0) throw new FormatException("memory: unknown line id " + id);
                if (groups[k] != null) throw new FormatException("memory: duplicate line id " + id);
                var variants = o.ContainsKey("variants") ? o["variants"] as List<object> : null;
                if (variants == null || variants.Count < MinVariants) throw new FormatException("memory: line " + id + " needs at least " + MinVariants + " variants");
                groups[k] = new List<LocalizedName>();
                foreach (var v in variants)
                {
                    var d = v as Dictionary<string, object>;
                    if (d == null) throw new FormatException("memory: line " + id + " holds a non-object variant");
                    var name = new LocalizedName();
                    foreach (var lang in VillageNames.Languages)
                    {
                        var s = d.ContainsKey(lang) ? d[lang] as string : null;
                        if (string.IsNullOrWhiteSpace(s)) throw new FormatException("memory: line " + id + " lacks " + lang + " text");
                        name.Text[lang] = s;
                    }
                    groups[k].Add(name);
                }
            }
            var lib = new MemoryLibrary();
            for (int k = 0; k < LineIds.Length; k++)
            {
                if (groups[k] == null) throw new FormatException("memory: lacks line id " + LineIds[k]);
                lib.Variants.Add(groups[k]);
            }
            return lib;
        }
    }

    /// <summary>
    /// What every villager remembers of the player and the village (round 34, spec 167). A villager's memory is, per <see cref="MemoryKind"/>, an intensity from 0 to
    /// <see cref="Scale"/>. An event adds its weight. Each night that passes keeps <see cref="DecayKeepPermille"/> of every intensity, but an intensity that has ever been
    /// touched never drops under <see cref="FloorPermille"/>, so the village never forgets completely. Everything is integers and a pure function of the event log: replaying
    /// the log gives the same memory as recording the events one at a time. Nothing here changes <see cref="VillageSociety"/> unless a caller passes the effects in.
    /// </summary>
    public sealed class VillagerMemoryModel
    {
        public const int Scale = 1000;
        public const int KindCount = 8;
        public const int FloorPermille = 20;
        public const int DecayKeepPermille = 850;
        /// <summary>A score under this does not change behavior.</summary>
        public const int OutcomeAt = 150;
        public const int MemoryStream = 0x4D454D;

        private readonly int[][] intensity;
        private readonly int[][] lastSubject;
        public int Night { get; private set; }
        public int VillagerCount { get { return intensity.Length; } }

        public VillagerMemoryModel(int villagerCount)
        {
            if (villagerCount < 0) throw new ArgumentOutOfRangeException("villagerCount");
            intensity = new int[villagerCount][];
            lastSubject = new int[villagerCount][];
            for (int i = 0; i < villagerCount; i++)
            {
                intensity[i] = new int[KindCount];
                lastSubject[i] = new int[KindCount];
                for (int k = 0; k < KindCount; k++) lastSubject[i][k] = -1;
            }
            Night = 1;
        }

        /// <summary>Moves to a later night, decaying every touched intensity once per night passed. An earlier or equal night does nothing: memory never runs backwards.</summary>
        public void AdvanceTo(int night)
        {
            while (Night < night)
            {
                for (int i = 0; i < intensity.Length; i++)
                    for (int k = 0; k < KindCount; k++)
                        if (intensity[i][k] > 0) intensity[i][k] = Math.Max(FloorPermille, intensity[i][k] * DecayKeepPermille / Scale);
                Night++;
            }
        }

        /// <summary>
        /// Records one event after advancing to its night (an event dated before the current night counts as happening on the current night). Returns false and changes nothing
        /// for a villager or kind out of range or a weight under 1. The weight is capped at <see cref="Scale"/>.
        /// </summary>
        public bool Record(MemoryEvent e)
        {
            if (e.Villager < 0 || e.Villager >= intensity.Length || (int)e.Kind < 0 || (int)e.Kind >= KindCount || e.Weight < 1) return false;
            AdvanceTo(e.Night);
            int k = (int)e.Kind;
            intensity[e.Villager][k] = Math.Max(FloorPermille, Math.Min(Scale, intensity[e.Villager][k] + Math.Min(Scale, e.Weight)));
            lastSubject[e.Villager][k] = e.Subject;
            return true;
        }

        /// <summary>The memory after an ordered log, advanced to the given night. Events are applied in the order given.</summary>
        public static VillagerMemoryModel Replay(int villagerCount, IList<MemoryEvent> log, int night)
        {
            var m = new VillagerMemoryModel(villagerCount);
            if (log != null) foreach (var e in log) m.Record(e);
            m.AdvanceTo(night);
            return m;
        }

        /// <summary>Intensity of one kind for one villager (0 when never touched), or 0 for an index out of range.</summary>
        public int IntensityOf(int villager, MemoryKind kind)
        {
            if (villager < 0 || villager >= intensity.Length || (int)kind < 0 || (int)kind >= KindCount) return 0;
            return intensity[villager][(int)kind];
        }

        /// <summary>Who the last memory of that kind involved: a villager index, -1 for the player or when there is none.</summary>
        public int LastSubjectOf(int villager, MemoryKind kind)
        {
            if (villager < 0 || villager >= intensity.Length || (int)kind < 0 || (int)kind >= KindCount) return -1;
            return lastSubject[villager][(int)kind];
        }

        /// <summary>True once any event has touched the villager. It stays true forever (the floor).</summary>
        public bool HasAnyMemory(int villager)
        {
            if (villager < 0 || villager >= intensity.Length) return false;
            for (int k = 0; k < KindCount; k++) if (intensity[villager][k] > 0) return true;
            return false;
        }

        /// <summary>
        /// Score of each of the four outcomes, indexed by <see cref="MemoryOutcome"/> (index 0 is always 0). Paranoid: accused less half the conversation (kindness softens an accusation), plus half of accusing, rumors and exposure.
        /// Obsessed: half of clues, rituals and exposure plus a quarter of lost family. Forgive: the smaller of accused and conversation. Loyal: conversation beyond twice the
        /// accusation plus half of the clues shared. Scores run 0 to a little over <see cref="Scale"/>.
        /// </summary>
        public int[] ScoresOf(int villager)
        {
            var s = new int[5];
            if (villager < 0 || villager >= intensity.Length) return s;
            var m = intensity[villager];
            int acc = m[(int)MemoryKind.Accused], conv = m[(int)MemoryKind.Conversation];
            s[(int)MemoryOutcome.Paranoid] = Math.Max(0, acc - conv / 2) + m[(int)MemoryKind.Accusing] / 2 + (m[(int)MemoryKind.RumorHeard] + m[(int)MemoryKind.MythosExposure]) / 2;
            s[(int)MemoryOutcome.Obsessed] = (m[(int)MemoryKind.ClueFound] + m[(int)MemoryKind.RitualWitnessed] + m[(int)MemoryKind.MythosExposure]) / 2 + m[(int)MemoryKind.FamilyLost] / 4;
            s[(int)MemoryOutcome.Forgive] = Math.Min(acc, conv);
            s[(int)MemoryOutcome.Loyal] = Math.Max(0, conv - 2 * acc) + m[(int)MemoryKind.ClueFound] / 2;
            return s;
        }

        /// <summary>The strongest outcome whose score reaches <see cref="OutcomeAt"/>; a tie goes to the earlier of Paranoid, Obsessed, Forgive, Loyal. None when no score reaches it.</summary>
        public MemoryOutcome OutcomeOf(int villager)
        {
            var s = ScoresOf(villager);
            var best = MemoryOutcome.None;
            int bestScore = OutcomeAt - 1;
            foreach (var o in TieOrder) if (s[(int)o] > bestScore) { best = o; bestScore = s[(int)o]; }
            return best;
        }

        private static readonly MemoryOutcome[] TieOrder = { MemoryOutcome.Paranoid, MemoryOutcome.Obsessed, MemoryOutcome.Forgive, MemoryOutcome.Loyal };

        /// <summary>How strong the winning outcome is, per mille (0 for None, at most <see cref="Scale"/>).</summary>
        public int StrengthOf(int villager)
        {
            var o = OutcomeOf(villager);
            return o == MemoryOutcome.None ? 0 : Math.Min(Scale, ScoresOf(villager)[(int)o]);
        }

        /// <summary>Changes per mille at full strength for each outcome (index = <see cref="MemoryOutcome"/>): Trust, Fear, Faith, Loyalty, Obsession.</summary>
        public static readonly int[][] OutcomeEffects =
        {
            new[] { 0, 0, 0, 0, 0 },
            new[] { 100, -100, 0, 150, 0 },
            new[] { -150, 250, -50, -150, 50 },
            new[] { 150, -50, 50, 250, 0 },
            new[] { -50, 50, 100, -100, 300 },
        };

        /// <summary>The effect of one villager's memory: the outcome table scaled by strength, truncated toward zero. All zero for None.</summary>
        public MemoryEffect EffectOf(int villager)
        {
            var o = OutcomeOf(villager);
            if (o == MemoryOutcome.None) return new MemoryEffect();
            int strength = StrengthOf(villager);
            var t = OutcomeEffects[(int)o];
            return new MemoryEffect { Trust = t[0] * strength / Scale, Fear = t[1] * strength / Scale, Faith = t[2] * strength / Scale, Loyalty = t[3] * strength / Scale, Obsession = t[4] * strength / Scale };
        }

        public MemoryEffect[] EffectsOfAll()
        {
            var all = new MemoryEffect[intensity.Length];
            for (int i = 0; i < all.Length; i++) all[i] = EffectOf(i);
            return all;
        }

        /// <summary>
        /// The line a villager says because of what they remember: one of the authored variants of their outcome, or of "faded" when they remember but no outcome is strong
        /// enough. "" when they remember nothing. Seeded by seed, villager and night, so a villager says the same thing all night and may say another the next.
        /// </summary>
        public string LineFor(MemoryLibrary lib, int seed, int villager, int night, string lang)
        {
            if (lib == null || !HasAnyMemory(villager)) return "";
            var o = OutcomeOf(villager);
            var group = lib.Variants[o == MemoryOutcome.None ? MemoryLibrary.LineIds.Length - 1 : (int)o - 1];
            int pick = new SeededRandom(seed ^ MemoryStream ^ (villager * VillageSociety.IndexStep) ^ (night * 31)).Next(group.Count);
            return group[pick].Get(lang);
        }

        /// <summary>
        /// The memory event a society action leaves with the villager it was done to, or false when it leaves none (a subject of AllVillagers or out of range is the caller's to expand).
        /// Weights are authored here: polite words 300, a returned item 500, a returned journal 600, seen near a body 500, seen at the ritual site 600, a night intrusion 400,
        /// a ward with a creature in view 400, a fight with one in view 500.
        /// </summary>
        public static bool EventFor(SocietyActionKind action, int villager, int night, out MemoryEvent e)
        {
            e = new MemoryEvent { Night = Math.Max(1, night), Villager = villager, Subject = -1 };
            switch (action)
            {
                case SocietyActionKind.ChatPolite: e.Kind = MemoryKind.Conversation; e.Weight = 300; return villager >= 0;
                case SocietyActionKind.ReturnItem: e.Kind = MemoryKind.Conversation; e.Weight = 500; return villager >= 0;
                case SocietyActionKind.ReturnJournal: e.Kind = MemoryKind.Conversation; e.Weight = 600; return villager >= 0;
                case SocietyActionKind.SeenNearBody: e.Kind = MemoryKind.Accused; e.Weight = 500; return villager >= 0;
                case SocietyActionKind.SeenAtRitualSite: e.Kind = MemoryKind.RitualWitnessed; e.Weight = 600; return villager >= 0;
                case SocietyActionKind.NightIntrusion: e.Kind = MemoryKind.Accused; e.Weight = 400; return villager >= 0;
                case SocietyActionKind.WardCreatureInView: e.Kind = MemoryKind.MythosExposure; e.Weight = 400; return villager >= 0;
                case SocietyActionKind.FightCreatureInView: e.Kind = MemoryKind.MythosExposure; e.Weight = 500; return villager >= 0;
                default: return false;
            }
        }

        /// <summary>Weight of the lost family memory every kin of a missing person starts the story with.</summary>
        public const int FamilyLostWeight = 600;

        /// <summary>The memories the village starts with: the kin of every missing person has lost family, on night 1 (subject is the index of the missing person in the story).</summary>
        public static List<MemoryEvent> BaselineEvents(VillageStory story)
        {
            var list = new List<MemoryEvent>();
            if (story == null) return list;
            for (int k = 0; k < story.Missing.Count; k++)
                if (story.Missing[k].KinIndex >= 0) list.Add(new MemoryEvent { Night = 1, Villager = story.Missing[k].KinIndex, Kind = MemoryKind.FamilyLost, Subject = k, Weight = FamilyLostWeight });
            return list;
        }

        /// <summary>The trust of every villager after their memory, clamped to [0, Scale]. A null or short effects array changes nothing for the missing entries. Suspicion is untouched.</summary>
        public static SocietyOpinions TrustAfter(SocietyOpinions opinions, IList<MemoryEffect> effects)
        {
            var o = new SocietyOpinions { Trust = (int[])opinions.Trust.Clone(), Suspicion = (int[])opinions.Suspicion.Clone() };
            if (effects == null) return o;
            for (int i = 0; i < o.Trust.Length && i < effects.Count; i++) o.Trust[i] = Math.Max(0, Math.Min(Scale, o.Trust[i] + effects[i].Trust));
            return o;
        }
    }
}
