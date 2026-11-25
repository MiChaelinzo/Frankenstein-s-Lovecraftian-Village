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
        /// <summary>Round 36 (spec 176): one leader record per cult at the end of the night, parallel to <see cref="MythosState.Cults"/>.</summary>
        public List<CultLeader> Leaders = new List<CultLeader>();
        /// <summary>Round 36: the leader events of the night. Kept apart from <see cref="Events"/> so existing consumers and golden data are unchanged.</summary>
        public List<CultLeaderEvent> LeaderEvents = new List<CultLeaderEvent>();
    }

    /// <summary>What happened to a cult's leader. Order is stable (golden data uses the integers).</summary>
    public enum CultLeaderEventKind { Replaced = 0, Disappeared = 1, Exposed = 2, BecameVessel = 3 }

    /// <summary>The stated causes of every leader event. Each event carries exactly one, so no leader change is causeless.</summary>
    public static class CultLeaderCause
    {
        public const string ExposureOverThreshold = "exposure_over_threshold", InfluenceCollapse = "influence_collapse", MythosTide = "mythos_tide", VacancyFilled = "vacancy_filled";
        public static readonly string[] All = { ExposureOverThreshold, InfluenceCollapse, MythosTide, VacancyFilled };
    }

    /// <summary>One leader event of a night. Cult is a cult index, Leader the villager it happened to, Successor the new leader of a replacement (else -1), Cause one of <see cref="CultLeaderCause.All"/>.</summary>
    public struct CultLeaderEvent
    {
        public CultLeaderEventKind Kind;
        public int Cult;
        public int Leader;
        public int Successor;
        public string Cause;
        public int Night;
    }

    /// <summary>The leader record of one cult at the end of a night. Leader is a roster index, -1 while the post is vacant. Influence and Exposure stay in [0, <see cref="CultLeadership.MaxValue"/>].</summary>
    public sealed class CultLeader
    {
        public int Cult;
        public int Leader;
        public int Influence;
        /// <summary>Villagers who joined the cult while this leader led it.</summary>
        public int Recruits;
        public int Exposure;
        /// <summary>Whether the village knows who leads the cult (an Exposed event happened to this leader).</summary>
        public bool Exposed;
        /// <summary>A vessel leader is final: the leader no longer changes.</summary>
        public bool Vessel;

        public CultLeader Copy() { return (CultLeader)MemberwiseClone(); }
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

            var leaders = CultLeadership.Found(state);
            var gone = new bool[n];
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
                var leaderEvents = CultLeadership.Evolve(society, links, state, cultOf, leaders, gone, night, dread, ritual, intensity, events, exposedTonight);

                var rumor = StartRumor(society, story, lib, state, links, night, dread, ritual, exposedTonight, omen);
                if (rumor != null)
                {
                    rumors.Add(rumor);
                    events.Add(new MythosEvent { Kind = MythosEventKind.RumorStarted, Subject = rumor.Origin, Other = rumor.Subject, Key = rumor.Key, Night = night });
                }
                var snap = Snapshot(state, cultOf, events, rumors, night, n);
                foreach (var l in leaders) snap.Leaders.Add(l.Copy());
                snap.LeaderEvents = leaderEvents;
                state.Nights.Add(snap);
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

    /// <summary>
    /// Round 36 (spec 176 part 2): the leader of each cult evolves night by night. Influence grows with recruits and the mythos tide (omen intensity) and decays otherwise; exposure grows with dread and
    /// with exposed secrets of the leader and the leader's links. Every event carries a <see cref="CultLeaderCause"/>. Uses its own seed stream and never touches the streams of the rest of the simulation,
    /// so existing events, members and rumors are unchanged. Integer arithmetic only; values are clamped to [0, MaxValue].
    /// </summary>
    public static class CultLeadership
    {
        public const int LeaderStream = 0x4C4452, CultSalt = 7919;
        public const int MaxValue = 1000;
        /// <summary>Influence of a founder, of a successor, the per night decay, the gain per recruit and the divisor of the omen intensity (the mythos tide).</summary>
        public const int FounderInfluence = 500, SuccessorInfluence = 300, InfluenceDecay = 20, RecruitInfluence = 50, TideInfluenceDivisor = 10;
        /// <summary>Exposure per night: a base, plus dread divided by the divisor, plus a jump when the leader's own secret comes out and one per exposed secret of a linked villager.</summary>
        public const int ExposureBase = 15, ExposureDreadDivisor = 50, OwnSecretExposure = 300, LinkedSecretExposure = 100;
        /// <summary>Exposure at which the village learns who leads, at which the leader is replaced when exposed, and at which the leader disappears.</summary>
        public const int ExposedAt = 600, ReplacedAt = 750, DisappearAt = 900;
        /// <summary>Influence at or under which the leadership collapses.</summary>
        public const int CollapseAt = 100;
        /// <summary>A leader becomes a vessel when the ritual stage and the omen intensity reach these and a roll in [0, Scale) is under the chance.</summary>
        public const int VesselRitualStage = 4, VesselIntensity = 500, VesselChance = 250;

        /// <summary>The cults before night 1: every founder leads.</summary>
        public static List<CultLeader> Found(MythosState state)
        {
            var list = new List<CultLeader>();
            for (int c = 0; c < state.Cults.Count; c++) list.Add(new CultLeader { Cult = c, Leader = state.Cults[c].Founder, Influence = FounderInfluence });
            return list;
        }

        private static int Clamp(int v) { return Math.Max(0, Math.Min(MaxValue, v)); }

        internal static List<CultLeaderEvent> Evolve(VillageSociety society, MythosSimulation.Graph links, MythosState state, int[] cultOf, List<CultLeader> leaders, bool[] gone, int night, int dread, int ritual, int intensity, List<MythosEvent> events, List<int> exposedTonight)
        {
            var result = new List<CultLeaderEvent>();
            int n = cultOf.Length;
            for (int c = 0; c < leaders.Count; c++)
            {
                var l = leaders[c];
                var rng = new SeededRandom(society.Seed ^ LeaderStream ^ (night * VillageSociety.IndexStep) ^ (c * CultSalt));
                int roll = rng.Next(VillageSociety.Scale);
                if (l.Vessel) continue;
                if (l.Leader < 0)
                {
                    int heir = Successor(rng, cultOf, gone, c, -1, n);
                    if (heir >= 0) Replace(result, l, heir, CultLeaderCause.VacancyFilled, night);
                    continue;
                }
                int joined = 0;
                foreach (var e in events) if (e.Kind == MythosEventKind.CultJoined && e.Other == c) joined++;
                l.Recruits += joined;
                l.Influence = Clamp(l.Influence + joined * RecruitInfluence + intensity / TideInfluenceDivisor - InfluenceDecay);
                int exposure = ExposureBase + dread / ExposureDreadDivisor;
                if (exposedTonight.Contains(l.Leader)) exposure += OwnSecretExposure;
                foreach (int j in links.Neighbours[l.Leader]) if (exposedTonight.Contains(j)) exposure += LinkedSecretExposure;
                l.Exposure = Clamp(l.Exposure + exposure);

                if (ritual >= VesselRitualStage && intensity >= VesselIntensity && roll < VesselChance)
                {
                    l.Vessel = true;
                    l.Influence = MaxValue;
                    result.Add(new CultLeaderEvent { Kind = CultLeaderEventKind.BecameVessel, Cult = c, Leader = l.Leader, Successor = -1, Cause = CultLeaderCause.MythosTide, Night = night });
                }
                else if (l.Influence <= CollapseAt)
                {
                    int heir = Successor(rng, cultOf, gone, c, l.Leader, n);
                    if (heir >= 0) Replace(result, l, heir, CultLeaderCause.InfluenceCollapse, night);
                    else Vanish(result, l, gone, CultLeaderCause.InfluenceCollapse, night);
                }
                else if (l.Exposure >= DisappearAt) Vanish(result, l, gone, CultLeaderCause.ExposureOverThreshold, night);
                else if (l.Exposure >= ExposedAt && !l.Exposed)
                {
                    l.Exposed = true;
                    result.Add(new CultLeaderEvent { Kind = CultLeaderEventKind.Exposed, Cult = c, Leader = l.Leader, Successor = -1, Cause = CultLeaderCause.ExposureOverThreshold, Night = night });
                }
                else if (l.Exposed && l.Exposure >= ReplacedAt)
                {
                    int heir = Successor(rng, cultOf, gone, c, l.Leader, n);
                    if (heir >= 0) Replace(result, l, heir, CultLeaderCause.ExposureOverThreshold, night);
                }
            }
            return result;
        }

        /// <summary>A seeded member of the cult who has not disappeared and is not the current leader, or -1.</summary>
        private static int Successor(SeededRandom rng, int[] cultOf, bool[] gone, int cult, int current, int n)
        {
            var candidates = new List<int>();
            for (int i = 0; i < n; i++) if (cultOf[i] == cult && !gone[i] && i != current) candidates.Add(i);
            return candidates.Count == 0 ? -1 : candidates[rng.Next(candidates.Count)];
        }

        private static void Replace(List<CultLeaderEvent> result, CultLeader l, int heir, string cause, int night)
        {
            result.Add(new CultLeaderEvent { Kind = CultLeaderEventKind.Replaced, Cult = l.Cult, Leader = l.Leader, Successor = heir, Cause = cause, Night = night });
            l.Leader = heir;
            l.Influence = SuccessorInfluence;
            l.Recruits = 0;
            l.Exposure = 0;
            l.Exposed = false;
        }

        private static void Vanish(List<CultLeaderEvent> result, CultLeader l, bool[] gone, string cause, int night)
        {
            result.Add(new CultLeaderEvent { Kind = CultLeaderEventKind.Disappeared, Cult = l.Cult, Leader = l.Leader, Successor = -1, Cause = cause, Night = night });
            gone[l.Leader] = true;
            l.Leader = -1;
            l.Influence = 0;
            l.Recruits = 0;
            l.Exposure = 0;
            l.Exposed = false;
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
