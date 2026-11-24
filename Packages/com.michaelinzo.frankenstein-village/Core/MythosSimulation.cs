using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>One authored entry of Data/mythos.json: a cult name, a secret kind (with its base exposure pressure) or an omen.</summary>
    public sealed class MythosEntry
    {
        public string Id;
        /// <summary>Per mille of exposure a held secret of this kind adds each night (0 for entries without pressure).</summary>
        public int Pressure;
        public LocalizedName Text;
    }

    /// <summary>Where a rumor comes from. Order is stable (golden data uses the integers).</summary>
    public enum RumorSource { Secret = 0, Cosmic = 1, Missing = 2 }

    /// <summary>One authored rumor line. Ref is the secret kind or omen id it tells ("" for a missing person). Truth false is the distorted telling.</summary>
    public sealed class MythosRumorLine
    {
        public RumorSource Source;
        public string Ref = "";
        public bool Truth;
        public LocalizedName Text;
    }

    /// <summary>The parsed Data/mythos.json. The same file is read by web/src/mythos.js; a drift test compares the two copies.</summary>
    public sealed class MythosLibrary
    {
        public static readonly string[] SourceIds = { "secret", "cosmic", "missing" };

        public List<MythosEntry> Cults = new List<MythosEntry>();
        public List<MythosEntry> Secrets = new List<MythosEntry>();
        public List<MythosEntry> Omens = new List<MythosEntry>();
        public List<MythosRumorLine> Rumors = new List<MythosRumorLine>();
        /// <summary>Template with {name} and {cult}.</summary>
        public LocalizedName CultLine;
        public LocalizedName ContradictionReason;

        public static int IndexOf(List<MythosEntry> list, string id)
        {
            for (int i = 0; i < list.Count; i++) if (list[i].Id == id) return i;
            return -1;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed.</summary>
        public static MythosLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("mythos: root is not an object");
            var lib = new MythosLibrary();
            lib.Cults = Entries(root, "cults", false);
            lib.Secrets = Entries(root, "secrets", true);
            lib.Omens = Entries(root, "omens", false);
            lib.CultLine = Text(Child(root, "cultLine"), "cultLine");
            lib.ContradictionReason = Text(Child(root, "contradiction"), "contradiction");
            if (lib.Cults.Count < MythosSimulation.MaxCults) throw new FormatException("mythos: cults needs at least " + MythosSimulation.MaxCults + " entries");
            if (lib.Secrets.Count == 0 || lib.Omens.Count == 0) throw new FormatException("mythos: secrets and omens must not be empty");
            foreach (var o in Objects(root, "rumors"))
            {
                int source = Array.IndexOf(SourceIds, Str(o, "source", "rumor"));
                if (source < 0) throw new FormatException("mythos: rumor has an unknown source");
                var line = new MythosRumorLine { Source = (RumorSource)source, Ref = o.ContainsKey("ref") ? o["ref"] as string ?? "" : "", Text = Text(o, "rumor " + SourceIds[source]) };
                if (!o.ContainsKey("truth") || !(o["truth"] is bool)) throw new FormatException("mythos: rumor " + SourceIds[source] + " lacks truth");
                line.Truth = (bool)o["truth"];
                if (line.Source == RumorSource.Secret && IndexOf(lib.Secrets, line.Ref) < 0) throw new FormatException("mythos: rumor refers to unknown secret " + line.Ref);
                if (line.Source == RumorSource.Cosmic && IndexOf(lib.Omens, line.Ref) < 0) throw new FormatException("mythos: rumor refers to unknown omen " + line.Ref);
                lib.Rumors.Add(line);
            }
            return lib;
        }

        private static List<MythosEntry> Entries(Dictionary<string, object> root, string key, bool pressure)
        {
            var list = new List<MythosEntry>();
            foreach (var o in Objects(root, key))
            {
                var e = new MythosEntry { Id = Str(o, "id", key + " entry") };
                e.Text = Text(o, key + " " + e.Id);
                if (pressure)
                {
                    if (!o.ContainsKey("pressure") || !(o["pressure"] is double)) throw new FormatException("mythos: " + key + " " + e.Id + " lacks pressure");
                    e.Pressure = (int)(double)o["pressure"];
                    if (e.Pressure <= 0 || e.Pressure > VillageSociety.Scale) throw new FormatException("mythos: " + key + " " + e.Id + " has pressure out of range");
                }
                if (IndexOf(list, e.Id) >= 0) throw new FormatException("mythos: duplicate " + key + " id " + e.Id);
                list.Add(e);
            }
            return list;
        }

        private static List<Dictionary<string, object>> Objects(Dictionary<string, object> o, string key)
        {
            var list = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (list == null) throw new FormatException("mythos: missing " + key + " array");
            var result = new List<Dictionary<string, object>>();
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException("mythos: " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static Dictionary<string, object> Child(Dictionary<string, object> o, string key)
        {
            var d = o.ContainsKey(key) ? o[key] as Dictionary<string, object> : null;
            if (d == null) throw new FormatException("mythos: missing " + key + " object");
            return d;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("mythos: " + owner + " lacks " + key);
            return s;
        }

        private static LocalizedName Text(Dictionary<string, object> o, string owner)
        {
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = o.ContainsKey(lang) ? o[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("mythos: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>What happened in the village. Order is stable (golden data uses the integers).</summary>
    public enum MythosEventKind { CultFounded = 0, CultJoined = 1, SecretExposed = 2, RumorStarted = 3, CosmicOmen = 4 }

    /// <summary>One thing that happened on a night. Subject is a roster index (-1 for none); Other is a cult index, a rumor subject or -1; Key names the cult, secret, omen or rumor line.</summary>
    public struct MythosEvent
    {
        public MythosEventKind Kind;
        public int Subject;
        public int Other;
        public string Key;
        public int Night;
    }

    /// <summary>One villager who holds a rumor. Distortion counts the hops that changed it; the rumor is the truth only when that is 0.</summary>
    public struct RumorHolder
    {
        public int Villager;
        public int Distortion;
        /// <summary>The night the villager first heard it.</summary>
        public int Night;
        public bool Truth { get { return Distortion == 0; } }
    }

    /// <summary>A rumor born on a night (Id is that night). Subject is the villager of a secret, the omen index or the missing person index. Stage and Tier select the fallback rumor of story.json.</summary>
    public sealed class MythosRumor
    {
        public int Id;
        public int Night;
        public RumorSource Source;
        public int Subject;
        public int Origin;
        public string Key;
        public int Stage;
        public int Tier;
        public List<RumorHolder> Holders = new List<RumorHolder>();
    }

    /// <summary>The village at the end of one night: what happened that night, who belongs to each cult, whose secret is out, and who holds which rumor.</summary>
    public sealed class MythosNight
    {
        public int Night;
        public List<MythosEvent> Events = new List<MythosEvent>();
        /// <summary>Roster indices per cult (ascending), parallel to <see cref="MythosState.Cults"/>.</summary>
        public List<List<int>> CultMembers = new List<List<int>>();
        public List<int> Exposed = new List<int>();
        public List<MythosRumor> Rumors = new List<MythosRumor>();
    }

    public sealed class MythosCult
    {
        /// <summary>Index into <see cref="MythosLibrary.Cults"/>.</summary>
        public int DataIndex;
        public string Id;
        public int Founder;
    }

    /// <summary>Per night inputs of the simulation. A night past the end of an array reads the last value; an empty or null array reads 0.</summary>
    public sealed class MythosInputs
    {
        public int[] DreadPermille;
        public int[] RitualStage;
        /// <summary>Optional (round 34, spec 170): how many recruited missing persons are active on each night (<see cref="MissingOutcomes.RecruitedByNight"/>). Null (the default) changes nothing, so every existing run is byte identical.</summary>
        public int[] RecruitedByNight;

        /// <summary>Dread per mille added by each night of the fixed replay schedule.</summary>
        public const int DreadPerNight = 100;

        /// <summary>
        /// The fixed schedule a play session replays the village on: night k has dread 100 * k per mille (capped at 1000) and ritual stage k - 1 (capped at the maximum).
        /// It never reads live values, so a statement heard on night N is recomputed identically on every later night.
        /// </summary>
        public static MythosInputs Schedule(int nights)
        {
            int n = Math.Max(0, nights);
            var inputs = new MythosInputs { DreadPermille = new int[n], RitualStage = new int[n] };
            for (int k = 1; k <= n; k++)
            {
                inputs.DreadPermille[k - 1] = Math.Min(VillageSociety.Scale, DreadPerNight * k);
                inputs.RitualStage[k - 1] = Math.Min(VillageSociety.MaxRitualStage, k - 1);
            }
            return inputs;
        }

        public static int At(int[] values, int night)
        {
            if (values == null || values.Length == 0) return 0;
            return values[Math.Min(Math.Max(night, 1), values.Length) - 1];
        }
    }

    public sealed class MythosState
    {
        public int Seed;
        public List<MythosCult> Cults = new List<MythosCult>();
        /// <summary>Index into <see cref="MythosLibrary.Secrets"/> held by each villager, or -1.</summary>
        public int[] SecretKind;
        /// <summary>The night each villager's secret came out, or 0 while hidden.</summary>
        public int[] ExposedNight;
        public List<MythosNight> Nights = new List<MythosNight>();

        /// <summary>The village after night <paramref name="night"/> (clamped to the simulated nights); null when none was simulated.</summary>
        public MythosNight AtNight(int night)
        {
            if (Nights.Count == 0) return null;
            return Nights[Math.Min(Math.Max(night, 1), Nights.Count) - 1];
        }
    }

    /// <summary>
    /// The background engine of the village: cults that recruit corrupted villagers, secrets whose exposure pressure builds night after night, cosmic omens that press on both,
    /// and rumors that travel the same family and neighbour links as the rot, distorting as they go. A pure function of the society, the story, the data and the per night inputs:
    /// there is no hidden state, so replaying nights 1..N always gives the same result and the first K nights of a longer run equal a run through K. Integer arithmetic only.
    /// </summary>
    public static class MythosSimulation
    {
        public const int CultStream = 0x43554C, FounderStream = 0x464F55, JoinStream = 0x4A4F4E, SecretStream = 0x534543, OmenStream = 0x4F4D4E, RumorPickStream = 0x52504B, RumorOriginStream = 0x524F52, DistortStream = 0x444953;
        public const int MaxCults = 3;
        /// <summary>One villager in this many holds no secret.</summary>
        public const int SecretFreeOutOf = 3;
        /// <summary>The hidden exposure of a secret starts in [0, StartExposureRange).</summary>
        public const int StartExposureRange = 300;
        /// <summary>Linked villagers' suspicion is divided by this before it adds to exposure pressure.</summary>
        /// <summary>Pressure each cult member linked to the secret holder adds.</summary>
        public const int CultNeighbourPressure = 40;
        /// <summary>An omen happens when a roll in [0, Scale) is under EventBaseChance + intensity / EventIntensityDivisor.</summary>
        public const int EventBaseChance = 150, EventIntensityDivisor = 2;
        public const int RitualIntensityStep = 100;
        /// <summary>The most an omen (full intensity) lowers the corruption needed to join a cult, and adds to exposure pressure, the night after.</summary>
        public const int JoinBoostMax = 100, ExposureBoostMax = 60;
        /// <summary>Per active recruited missing person: lowers the corruption needed to join a cult (cult strength) and adds to exposure pressure (rumors). Only applied when <see cref="MythosInputs.RecruitedByNight"/> is supplied.</summary>
        public const int RecruitedJoinBoost = 15, RecruitedExposureBoost = 10;
        /// <summary>A hop distorts a rumor with chance 1/DistortOutOf.</summary>
        public const int DistortOutOf = 4;

        public static MythosState Run(VillageSociety society, VillageStory story, MythosLibrary lib, MythosInputs inputs, int throughNight)
        {
            int n = society.Roster.Count;
            var state = new MythosState { Seed = society.Seed, SecretKind = new int[n], ExposedNight = new int[n] };
            if (n == 0) return state;
            var links = Graph.Build(society);
            var meter = new int[n];
            for (int i = 0; i < n; i++)
            {
                var rng = new SeededRandom(society.Seed ^ SecretStream ^ (i * VillageSociety.IndexStep));
                state.SecretKind[i] = rng.Next(SecretFreeOutOf) == 0 ? -1 : rng.Next(lib.Secrets.Count);
                meter[i] = rng.Next(StartExposureRange);
            }
            var cultOf = new int[n];
            for (int i = 0; i < n; i++) cultOf[i] = -1;
            FoundCults(society, lib, state, cultOf);

            var rumors = new List<MythosRumor>();
            int previousIntensity = 0;
            for (int night = 1; night <= throughNight; night++)
            {
                int dread = Math.Max(0, Math.Min(VillageSociety.Scale, MythosInputs.At(inputs.DreadPermille, night)));
                int ritual = Math.Max(0, Math.Min(VillageSociety.MaxRitualStage, MythosInputs.At(inputs.RitualStage, night)));
                int joinBoost = previousIntensity * JoinBoostMax / VillageSociety.Scale;
                int exposureBoost = previousIntensity * ExposureBoostMax / VillageSociety.Scale;
                int recruited = MythosInputs.At(inputs.RecruitedByNight, night);
                joinBoost += recruited * RecruitedJoinBoost;
                exposureBoost += recruited * RecruitedExposureBoost;
                var events = new List<MythosEvent>();
                if (night == 1)
                    foreach (var c in state.Cults) events.Add(new MythosEvent { Kind = MythosEventKind.CultFounded, Subject = c.Founder, Other = state.Cults.IndexOf(c), Key = c.Id, Night = night });

                float dreadFloat = dread / (float)VillageSociety.Scale;
                for (int i = 0; i < n; i++)
                {
                    if (cultOf[i] >= 0 || society.Fate[i] != CorruptionStage.Cultist) continue;
                    if (society.CorruptionLevel(i, night, dreadFloat, ritual) < VillageSociety.CultAt - joinBoost) continue;
                    cultOf[i] = CultFor(society, state, links, cultOf, i);
                    events.Add(new MythosEvent { Kind = MythosEventKind.CultJoined, Subject = i, Other = cultOf[i], Key = state.Cults[cultOf[i]].Id, Night = night });
                }

                var exposedTonight = new List<int>();
                for (int i = 0; i < n; i++)
                {
                    if (state.SecretKind[i] < 0 || state.ExposedNight[i] > 0) continue;
                    int pressure = lib.Secrets[state.SecretKind[i]].Pressure + exposureBoost;
                    foreach (int j in links.Neighbours[i])
                    {
                        if (cultOf[j] >= 0) pressure += CultNeighbourPressure;
                    }
                    meter[i] += pressure;
                    if (meter[i] < VillageSociety.Scale) continue;
                    state.ExposedNight[i] = night;
                    exposedTonight.Add(i);
                    events.Add(new MythosEvent { Kind = MythosEventKind.SecretExposed, Subject = i, Other = -1, Key = lib.Secrets[state.SecretKind[i]].Id, Night = night });
                }

                int intensity = 0, omen = -1;
                var omenRoll = new SeededRandom(society.Seed ^ OmenStream ^ (night * VillageSociety.IndexStep));
                int candidate = Math.Max(0, Math.Min(VillageSociety.Scale, dread + ritual * RitualIntensityStep));
                if (omenRoll.Next(VillageSociety.Scale) < EventBaseChance + candidate / EventIntensityDivisor)
                {
                    omen = omenRoll.Next(lib.Omens.Count);
                    intensity = candidate;
                    events.Add(new MythosEvent { Kind = MythosEventKind.CosmicOmen, Subject = -1, Other = omen, Key = lib.Omens[omen].Id, Night = night });
                }
                previousIntensity = intensity;

                var rumor = StartRumor(society, story, lib, state, links, night, dread, ritual, exposedTonight, omen);
                if (rumor != null)
                {
                    rumors.Add(rumor);
                    events.Add(new MythosEvent { Kind = MythosEventKind.RumorStarted, Subject = rumor.Origin, Other = rumor.Subject, Key = rumor.Key, Night = night });
                }
                state.Nights.Add(Snapshot(state, cultOf, events, rumors, night, n));
            }
            return state;
        }

        private static void FoundCults(VillageSociety society, MythosLibrary lib, MythosState state, int[] cultOf)
        {
            int n = society.Roster.Count;
            int count = 1 + new SeededRandom(society.Seed ^ CultStream).Next(MaxCults);
            int offset = new SeededRandom(society.Seed ^ CultStream ^ VillageSociety.IndexStep).Next(lib.Cults.Count);
            for (int c = 0; c < count && c < n; c++)
            {
                int founder = c == 0 ? society.PatientZero : new SeededRandom(society.Seed ^ FounderStream ^ (c * VillageSociety.IndexStep)).Next(n);
                while (cultOf[founder] >= 0) founder = (founder + 1) % n;
                int data = (offset + c) % lib.Cults.Count;
                state.Cults.Add(new MythosCult { DataIndex = data, Id = lib.Cults[data].Id, Founder = founder });
                cultOf[founder] = c;
            }
        }

        /// <summary>The cult of the nearest linked villager who already belongs to one (closest link first, lowest index on a tie), else a seeded cult.</summary>
        private static int CultFor(VillageSociety society, MythosState state, Graph links, int[] cultOf, int villager)
        {
            foreach (int j in links.Neighbours[villager]) if (cultOf[j] >= 0) return cultOf[j];
            return new SeededRandom(society.Seed ^ JoinStream ^ (villager * VillageSociety.IndexStep)).Next(state.Cults.Count);
        }

        private static MythosRumor StartRumor(VillageSociety society, VillageStory story, MythosLibrary lib, MythosState state, Graph links, int night, int dread, int ritual, List<int> exposedTonight, int omen)
        {
            var sources = new List<MythosRumor>();
            foreach (int v in exposedTonight) sources.Add(new MythosRumor { Source = RumorSource.Secret, Subject = v, Key = RumorSourceKey(RumorSource.Secret, lib.Secrets[state.SecretKind[v]].Id) });
            if (omen >= 0) sources.Add(new MythosRumor { Source = RumorSource.Cosmic, Subject = omen, Key = RumorSourceKey(RumorSource.Cosmic, lib.Omens[omen].Id) });
            for (int k = 0; k < story.Missing.Count; k++) sources.Add(new MythosRumor { Source = RumorSource.Missing, Subject = k, Key = RumorSourceKey(RumorSource.Missing, "") });
            if (sources.Count == 0) return null;
            var r = sources[new SeededRandom(society.Seed ^ RumorPickStream ^ (night * VillageSociety.IndexStep)).Next(sources.Count)];
            int n = society.Roster.Count;
            r.Id = night;
            r.Night = night;
            r.Origin = r.Source == RumorSource.Secret && links.Neighbours[r.Subject].Count > 0 ? links.Neighbours[r.Subject][0]
                     : r.Source == RumorSource.Missing && story.Missing[r.Subject].WitnessIndex >= 0 ? story.Missing[r.Subject].WitnessIndex
                     : new SeededRandom(society.Seed ^ RumorOriginStream ^ (night * VillageSociety.IndexStep)).Next(n);
            r.Tier = Math.Min(VillageStory.Tiers - 1, dread * VillageStory.Tiers / (VillageSociety.Scale + 1));
            r.Stage = Math.Min(VillageStory.Stages - 1, ritual * VillageStory.Stages / (VillageSociety.MaxRitualStage + 1));
            MythosRumors.Spread(society, links, r);
            return r;
        }

        public static string RumorSourceKey(RumorSource source, string refId) { return MythosLibrary.SourceIds[(int)source] + ":" + refId; }

        private static MythosNight Snapshot(MythosState state, int[] cultOf, List<MythosEvent> events, List<MythosRumor> rumors, int night, int n)
        {
            var snap = new MythosNight { Night = night, Events = events };
            foreach (var c in state.Cults) snap.CultMembers.Add(new List<int>());
            for (int i = 0; i < n; i++)
            {
                if (cultOf[i] >= 0) snap.CultMembers[cultOf[i]].Add(i);
                if (state.ExposedNight[i] > 0) snap.Exposed.Add(i);
            }
            foreach (var r in rumors) snap.Rumors.Add(MythosRumors.AsOfNight(r, night));
            return snap;
        }

        /// <summary>Family and nearest neighbour links of the society as one undirected graph, each villager's links ordered by delay then index.</summary>
        internal sealed class Graph
        {
            public List<int>[] Neighbours;
            public List<int>[] Delays;

            public static Graph Build(VillageSociety society)
            {
                int n = society.Roster.Count;
                var best = new Dictionary<long, int>();
                Action<int, int, int> add = (a, b, delay) =>
                {
                    if (a == b || a < 0 || b < 0) return;
                    long key = (long)a * n + b;
                    int existing;
                    if (!best.TryGetValue(key, out existing) || delay < existing) best[key] = delay;
                };
                for (int i = 0; i < n; i++)
                {
                    foreach (int j in society.FamilyLinks[i]) { add(i, j, VillageSociety.FamilyDelay); add(j, i, VillageSociety.FamilyDelay); }
                    add(i, society.Neighbour[i], VillageSociety.NeighbourDelay);
                    add(society.Neighbour[i], i, VillageSociety.NeighbourDelay);
                }
                var g = new Graph { Neighbours = new List<int>[n], Delays = new List<int>[n] };
                for (int i = 0; i < n; i++)
                {
                    var edges = new List<KeyValuePair<int, int>>();
                    for (int j = 0; j < n; j++) { int d; if (best.TryGetValue((long)i * n + j, out d)) edges.Add(new KeyValuePair<int, int>(d, j)); }
                    edges.Sort((x, y) => x.Key != y.Key ? x.Key.CompareTo(y.Key) : x.Value.CompareTo(y.Value));
                    g.Neighbours[i] = new List<int>();
                    g.Delays[i] = new List<int>();
                    foreach (var e in edges) { g.Neighbours[i].Add(e.Value); g.Delays[i].Add(e.Key); }
                }
                return g;
            }
        }
    }

    /// <summary>How a rumor travels: hop delays from its origin and which hops distort it. Shared by the simulation and its tests.</summary>
    public static class MythosRumors
    {
        /// <summary>Nights of delay from the origin to each villager (<see cref="VillageSociety.Unreachable"/> when no chain of links reaches them).</summary>
        public static int[] Delays(VillageSociety society, int origin)
        {
            var graph = MythosSimulation.Graph.Build(society);
            return Delays(graph, society.Roster.Count, origin);
        }

        internal static int[] Delays(MythosSimulation.Graph g, int n, int origin)
        {
            var delay = new int[n];
            for (int i = 0; i < n; i++) delay[i] = VillageSociety.Unreachable;
            delay[origin] = 0;
            bool changed = true;
            while (changed)
            {
                changed = false;
                for (int i = 0; i < n; i++)
                {
                    if (delay[i] == VillageSociety.Unreachable) continue;
                    for (int k = 0; k < g.Neighbours[i].Count; k++)
                    {
                        int j = g.Neighbours[i][k], d = delay[i] + g.Delays[i][k];
                        if (d < delay[j]) { delay[j] = d; changed = true; }
                    }
                }
            }
            return delay;
        }

        /// <summary>Whether the hop into villager <paramref name="to"/> distorts rumor <paramref name="rumorId"/>. Decided by the receiver only, so it does not depend on which neighbour told them.</summary>
        public static bool HopDistorts(int seed, int rumorId, int to)
        {
            return new SeededRandom(seed ^ MythosSimulation.DistortStream ^ (rumorId * VillageSociety.IndexStep) ^ (to * 7919)).Next(MythosSimulation.DistortOutOf) == 0;
        }

        /// <summary>
        /// A copy of the rumor holding only the villagers who have heard it by <paramref name="night"/>. Holders are ordered by the night they heard, then roster index. The distortion of a
        /// holder is the distortion of the nearest earlier holder who could have told them (lowest index on a tie) plus one when their own hop distorts.
        /// </summary>
        internal static MythosRumor AsOfNight(MythosRumor rumor, int night)
        {
            var copy = new MythosRumor { Id = rumor.Id, Night = rumor.Night, Source = rumor.Source, Subject = rumor.Subject, Origin = rumor.Origin, Key = rumor.Key, Stage = rumor.Stage, Tier = rumor.Tier };
            foreach (var h in rumor.Holders) if (h.Night <= night) copy.Holders.Add(h);
            return copy;
        }

        /// <summary>Fills in the holders of a freshly born rumor for every villager the links reach. Called once per rumor.</summary>
        internal static void Spread(VillageSociety society, MythosSimulation.Graph g, MythosRumor rumor)
        {
            int n = society.Roster.Count;
            var delay = Delays(g, n, rumor.Origin);
            var order = new List<int>();
            for (int i = 0; i < n; i++) if (delay[i] != VillageSociety.Unreachable) order.Add(i);
            order.Sort((a, b) => delay[a] != delay[b] ? delay[a].CompareTo(delay[b]) : a.CompareTo(b));
            var distortion = new int[n];
            foreach (int i in order)
            {
                if (i != rumor.Origin)
                {
                    int parent = -1;
                    for (int k = 0; k < g.Neighbours[i].Count && parent < 0; k++)
                    {
                        int j = g.Neighbours[i][k];
                        if (delay[j] != VillageSociety.Unreachable && delay[j] + g.Delays[i][k] == delay[i]) parent = j;
                    }
                    distortion[i] = distortion[parent] + (HopDistorts(society.Seed, rumor.Id, i) ? 1 : 0);
                }
                rumor.Holders.Add(new RumorHolder { Villager = i, Distortion = distortion[i], Night = rumor.Night + delay[i] });
            }
        }
    }
}
