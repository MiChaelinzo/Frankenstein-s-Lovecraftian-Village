using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// One record per night of the village chronicle (round 28, spec 154a). Integers, ids and one flag only. Every field is counted from the <see cref="MythosNight"/> of that night
    /// and the night before it, so a record is a pure function of the simulation: replaying nights 1..N gives the same records as building them one night at a time.
    /// </summary>
    public sealed class NightTickRecord
    {
        public int Night;
        /// <summary>Villagers who founded or joined a cult tonight.</summary>
        public int CultGrowth;
        /// <summary>Villagers who heard, tonight, a rumor that was born on an earlier night.</summary>
        public int RumorsChanged;
        /// <summary>Rumors born tonight (0 or 1).</summary>
        public int RumorsAdded;
        /// <summary>Missing persons the village has talked about up to and including tonight.</summary>
        public int MissingPersons;
        /// <summary>How many missing persons the village talked about for the first time tonight. One rumor is born per night, so the value is 0 or 1; 1 when tonight's rumor is the first one about that missing person.</summary>
        public int NewMissingPerson;
        /// <summary>Id of the omen that happened tonight, or "" when there was none.</summary>
        public string NewOmen = "";
        /// <summary>How far tonight pushed the reality state. Presentation only: it never changes a Vigil rule or an ending.</summary>
        public int RealityShift;
        /// <summary>The reality state after tonight: the sum of every RealityShift up to and including tonight.</summary>
        public int Reality;
        public bool SecretDiscovered;
        /// <summary>Round 36 (spec 176): the cult leader events of tonight, each with a stated cause. Empty on a quiet night. Not part of the round 28 golden "ticks" rows.</summary>
        public List<CultLeaderEvent> LeaderEvents = new List<CultLeaderEvent>();
    }

    public static class NightTicks
    {
        /// <summary>Reality shift of a secret coming out, of each cult recruit and of an omen.</summary>
        public const int SecretShift = 2, CultShift = 1, OmenShift = 3;

        /// <summary>The record of every simulated night, in order. An empty list when nothing was simulated. Throws FormatException naming newOmen when an event holds an omen id the data lacks.</summary>
        public static List<NightTickRecord> Build(MythosState state, MythosLibrary lib)
        {
            var list = new List<NightTickRecord>();
            if (state == null || lib == null) return list;
            int reality = 0;
            var seenMissing = new HashSet<int>();
            foreach (var night in state.Nights)
            {
                var rec = new NightTickRecord { Night = night.Night, LeaderEvents = new List<CultLeaderEvent>(night.LeaderEvents) };
                foreach (var e in night.Events)
                {
                    switch (e.Kind)
                    {
                        case MythosEventKind.CultFounded:
                        case MythosEventKind.CultJoined: rec.CultGrowth++; break;
                        case MythosEventKind.RumorStarted: rec.RumorsAdded++; break;
                        case MythosEventKind.SecretExposed: rec.SecretDiscovered = true; break;
                        case MythosEventKind.CosmicOmen:
                            if (MythosLibrary.IndexOf(lib.Omens, e.Key) < 0) throw new FormatException("mythos: night " + night.Night + " newOmen names unknown omen " + e.Key);
                            rec.NewOmen = e.Key;
                            break;
                    }
                }
                int exposedTonight = 0;
                foreach (var e in night.Events) if (e.Kind == MythosEventKind.SecretExposed) exposedTonight++;
                int before = seenMissing.Count;
                foreach (var r in night.Rumors)
                {
                    if (r.Source == RumorSource.Missing) seenMissing.Add(r.Subject);
                    if (r.Night >= night.Night) continue;
                    foreach (var h in r.Holders) if (h.Night == night.Night) rec.RumorsChanged++;
                }
                rec.MissingPersons = seenMissing.Count;
                rec.NewMissingPerson = seenMissing.Count - before;
                rec.RealityShift = exposedTonight * SecretShift + rec.CultGrowth * CultShift + (rec.NewOmen.Length > 0 ? OmenShift : 0);
                reality += rec.RealityShift;
                rec.Reality = reality;
                list.Add(rec);
            }
            return list;
        }

        private sealed class CachedTicks { public MythosLibrary Lib; public int NightCount; public List<NightTickRecord> Records; }
        private static readonly System.Runtime.CompilerServices.ConditionalWeakTable<MythosState, CachedTicks> Cache = new System.Runtime.CompilerServices.ConditionalWeakTable<MythosState, CachedTicks>();

        /// <summary>The record of one night, built once per simulated state and reused, so asking for every night is linear. A night outside the simulated range clamps to the nearest, null when nothing was simulated.</summary>
        public static NightTickRecord At(MythosState state, MythosLibrary lib, int night)
        {
            if (state == null || lib == null) return null;
            List<NightTickRecord> all;
            lock (Cache)
            {
                CachedTicks hit;
                if (Cache.TryGetValue(state, out hit) && ReferenceEquals(hit.Lib, lib) && hit.NightCount == state.Nights.Count) all = hit.Records;
                else
                {
                    all = Build(state, lib);
                    Cache.Remove(state);
                    Cache.Add(state, new CachedTicks { Lib = lib, NightCount = state.Nights.Count, Records = all });
                }
            }
            if (all.Count == 0) return null;
            return all[Math.Min(Math.Max(night, 1), all.Count) - 1];
        }
    }
}
