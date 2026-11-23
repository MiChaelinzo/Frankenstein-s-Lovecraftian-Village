using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>What the player did that a villager can hold against them or be grateful for. Order is stable (golden data uses the integers).</summary>
    public enum SocietyActionKind
    {
        ChatPolite = 0, ReturnItem = 1, ReturnJournal = 2, SeenNearBody = 3, SeenAtRitualSite = 4,
        NightIntrusion = 5, WardCreatureInView = 6, FightCreatureInView = 7,
    }

    /// <summary>How a villager treats the player, from trust and suspicion together. Suspicious wins over Trusting. Neutral is 0 so a default standing changes nothing.</summary>
    public enum TrustTier { Neutral = 0, Suspicious = 1, Trusting = 2 }

    /// <summary>
    /// How far the village's rot has reached one villager. None to Corrupted escalate; the last stage is either Cultist or Missing, fixed per villager by the seed.
    /// </summary>
    public enum CorruptionStage { None = 0, Uneasy = 1, Corrupted = 2, Cultist = 3, Missing = 4 }

    /// <summary>One entry of the action log. Subject is the roster index the action concerns, or <see cref="VillageSociety.AllVillagers"/> when the whole village saw it.</summary>
    public struct SocietyAction
    {
        public SocietyActionKind Kind;
        public int Subject;
    }

    /// <summary>Trust and suspicion of every villager after a log, both in [0, <see cref="VillageSociety.Scale"/>], indexed by roster index.</summary>
    public sealed class SocietyOpinions
    {
        public int[] Trust;
        public int[] Suspicion;
    }

    /// <summary>What chat needs to know about a villager's standing: the tier toward the player and how far the rot has reached them.</summary>
    public struct SocialStanding
    {
        public TrustTier Tier;
        public CorruptionStage Corruption;
    }

    /// <summary>
    /// The shared social model of the village: who is linked to whom (family, nearest neighbour by home), how each villager's trust and suspicion of the player follow from an
    /// ordered action log, and how corruption spreads from a seed-chosen patient zero along those same links, night after night. Pure integer arithmetic (per mille), so C# and
    /// the JS mirror agree exactly. Nothing here is random beyond the seed; wording is never read by these rules.
    /// </summary>
    public sealed class VillageSociety
    {
        /// <summary>Full scale of trust, suspicion and corruption level. Values are clamped to [0, Scale].</summary>
        public const int Scale = 1000;
        public const int AllVillagers = -1;
        public const int JitterStream = 0x4A4954;
        public const int ZeroStream = 0x5A4552;
        public const int FateStream = 0x464154;
        public const int ChatStream = 0x43485A;
        public const int IndexStep = 40503;

        /// <summary>Opening trust by disposition (Kind, Wary, Haunted, Closed) before the seeded jitter.</summary>
        public static readonly int[] StartTrust = { 500, 300, 250, 150 };
        /// <summary>Seeded jitter is in [-JitterRange, +JitterRange].</summary>
        public const int JitterRange = 50;

        // Trust delta and suspicion delta of each action, indexed by SocietyActionKind.
        public static readonly int[] ActionTrust = { 50, 150, 200, -50, -100, -150, 100, -50 };
        public static readonly int[] ActionSuspicion = { -10, -30, -50, 250, 300, 200, -50, 100 };
        /// <summary>The Nth repeat of the same action on the same villager has its effect divided by (1 + N).</summary>
        public const int RepeatDecayStep = 1;
        /// <summary>Family members of the subject feel 1/FamilyShare of the effect; the nearest neighbour 1/NeighbourShare.</summary>
        public const int FamilyShare = 2, NeighbourShare = 4;
        /// <summary>While a villager is already suspicious (order matters), a trust gain is divided by this.</summary>
        public const int SuspectGainDivisor = 2;
        public const int SuspiciousAt = 500, TrustingAt = 700;

        // Corruption: pressure grows with dread, night and ritual stage; each night of spread delay takes SpreadPenalty off.
        public const int DreadPressureDivisor = 2, NightPressure = 60, RitualPressure = 100, MaxRitualStage = 5;
        public const int FamilyDelay = 1, NeighbourDelay = 2, SpreadPenalty = 80;
        public const int UneasyAt = 250, CorruptedAt = 500, CultAt = 800;
        /// <summary>One villager in this many is taken (Missing) instead of joining the cult at the last stage.</summary>
        public const int MissingFateOutOf = 3;
        public const int Unreachable = int.MaxValue;

        /// <summary>Authored ids of the statements a suspicious villager can lie with; the board shows wording for them.</summary>
        public static readonly string[] LieStatementIds = { "lie_saw_nothing", "lie_was_asleep", "lie_blame_neighbour", "lie_not_me" };
        /// <summary>A suspicious, lucid villager lies with chance 1/LieOutOf and otherwise withholds.</summary>
        public const int LieOutOf = 2;

        public int Seed;
        public IList<Villager> Roster;
        /// <summary>Roster indices linked by family, per villager (ascending).</summary>
        public List<int>[] FamilyLinks;
        /// <summary>The roster index of the nearest other villager by home, or -1.</summary>
        public int[] Neighbour;
        public int PatientZero;
        /// <summary>Nights of spread delay from patient zero (<see cref="Unreachable"/> when no chain of links reaches the villager).</summary>
        public int[] SpreadDelay;
        /// <summary>Fixed fate of each villager if the rot goes all the way: Cultist or Missing.</summary>
        public CorruptionStage[] Fate;

        public static VillageSociety Build(VillageStory story, IList<PlacedPiece> layout)
        {
            int n = story.Roster.Count;
            var s = new VillageSociety { Seed = story.Seed, Roster = story.Roster, FamilyLinks = new List<int>[n], Neighbour = new int[n], SpreadDelay = new int[n], Fate = new CorruptionStage[n] };
            for (int i = 0; i < n; i++) s.FamilyLinks[i] = new List<int>();
            foreach (var fam in story.Families)
                foreach (int a in fam.Members) foreach (int b in fam.Members) if (a != b && a < n && b < n) s.FamilyLinks[a].Add(b);
            for (int i = 0; i < n; i++) s.FamilyLinks[i].Sort();
            for (int i = 0; i < n; i++) s.Neighbour[i] = NearestByHome(story.Roster, layout, i);
            s.PatientZero = n == 0 ? -1 : new SeededRandom(story.Seed ^ ZeroStream).Next(n);
            for (int i = 0; i < n; i++)
                s.Fate[i] = new SeededRandom(story.Seed ^ FateStream ^ (i * IndexStep)).Next(MissingFateOutOf) == 0 ? CorruptionStage.Missing : CorruptionStage.Cultist;
            s.ComputeDelays();
            return s;
        }

        private static int NearestByHome(IList<Villager> roster, IList<PlacedPiece> layout, int index)
        {
            int best = -1;
            double bestD = double.MaxValue;
            int home = roster[index].HomeIndex;
            if (layout == null || home < 0 || home >= layout.Count) return -1;
            for (int j = 0; j < roster.Count; j++)
            {
                int h = roster[j].HomeIndex;
                if (j == index || h < 0 || h >= layout.Count) continue;
                double dx = (layout[home].X + layout[home].SizeX / 2.0) - (layout[h].X + layout[h].SizeX / 2.0);
                double dz = (layout[home].Z + layout[home].SizeZ / 2.0) - (layout[h].Z + layout[h].SizeZ / 2.0);
                double d = dx * dx + dz * dz;
                if (d < bestD) { bestD = d; best = j; }
            }
            return best;
        }

        private void ComputeDelays()
        {
            int n = Roster.Count;
            for (int i = 0; i < n; i++) SpreadDelay[i] = Unreachable;
            if (PatientZero < 0) return;
            SpreadDelay[PatientZero] = 0;
            bool changed = true;
            while (changed)
            {
                changed = false;
                for (int i = 0; i < n; i++)
                {
                    if (SpreadDelay[i] == Unreachable) continue;
                    foreach (int j in FamilyLinks[i]) changed |= Relax(i, j, FamilyDelay);
                    if (Neighbour[i] >= 0) { changed |= Relax(i, Neighbour[i], NeighbourDelay); changed |= Relax(Neighbour[i], i, NeighbourDelay); }
                }
            }
        }

        private bool Relax(int from, int to, int delay)
        {
            if (SpreadDelay[from] == Unreachable || SpreadDelay[from] + delay >= SpreadDelay[to]) return false;
            SpreadDelay[to] = SpreadDelay[from] + delay;
            return true;
        }

        private static int Clamp(int v) { return Math.Max(0, Math.Min(Scale, v)); }

        /// <summary>
        /// Trust and suspicion after the log. Same seed, roster and log always give the same values. Order matters in two documented ways: a repeat of the same action on the
        /// same villager counts less (divided by 1 + repeats so far), and a trust gain is halved while the villager is already suspicious at that moment.
        /// </summary>
        public SocietyOpinions OpinionsAfter(IList<SocietyAction> log)
        {
            int n = Roster.Count;
            var o = new SocietyOpinions { Trust = new int[n], Suspicion = new int[n] };
            for (int i = 0; i < n; i++)
            {
                int jitter = new SeededRandom(Seed ^ JitterStream ^ (i * IndexStep)).Next(2 * JitterRange + 1) - JitterRange;
                o.Trust[i] = Clamp(StartTrust[(int)Roster[i].Disposition] + jitter);
            }
            var repeats = new Dictionary<int, int>();
            if (log == null) return o;
            foreach (var a in log)
            {
                int kind = (int)a.Kind;
                if (kind < 0 || kind >= ActionTrust.Length) continue;
                int key = kind * 1000 + (a.Subject + 1), seen;
                repeats.TryGetValue(key, out seen);
                repeats[key] = seen + 1;
                int divisor = 1 + seen * RepeatDecayStep;
                if (a.Subject == AllVillagers) { for (int i = 0; i < n; i++) Apply(o, i, kind, divisor, 1); continue; }
                if (a.Subject < 0 || a.Subject >= n) continue;
                Apply(o, a.Subject, kind, divisor, 1);
                foreach (int j in FamilyLinks[a.Subject]) Apply(o, j, kind, divisor, FamilyShare);
                int nb = Neighbour[a.Subject];
                if (nb >= 0 && !FamilyLinks[a.Subject].Contains(nb)) Apply(o, nb, kind, divisor, NeighbourShare);
            }
            return o;
        }

        /// <summary>
        /// <see cref="OpinionsAfter(IList{SocietyAction})"/> with extra suspicion per villager on top (see <see cref="MythosSociety.SuspicionPressure"/>), clamped to [0, Scale].
        /// A null or short array adds nothing for the missing entries, so the result then equals the plain overload.
        /// </summary>
        public SocietyOpinions OpinionsAfter(IList<SocietyAction> log, IList<int> extraSuspicion)
        {
            var o = OpinionsAfter(log);
            if (extraSuspicion == null) return o;
            for (int i = 0; i < o.Suspicion.Length && i < extraSuspicion.Count; i++) o.Suspicion[i] = Clamp(o.Suspicion[i] + extraSuspicion[i]);
            return o;
        }

        private static void Apply(SocietyOpinions o, int who, int kind, int divisor, int share)
        {
            int dt = ActionTrust[kind] / (divisor * share), ds = ActionSuspicion[kind] / (divisor * share);
            if (dt > 0 && o.Suspicion[who] >= SuspiciousAt) dt /= SuspectGainDivisor;
            o.Trust[who] = Clamp(o.Trust[who] + dt);
            o.Suspicion[who] = Clamp(o.Suspicion[who] + ds);
        }

        public static TrustTier TierOf(int trust, int suspicion)
        {
            if (suspicion >= SuspiciousAt) return TrustTier.Suspicious;
            return trust >= TrustingAt ? TrustTier.Trusting : TrustTier.Neutral;
        }

        /// <summary>Per mille of dread, rounded half up, clamped to [0, Scale]. Integer so both ports agree.</summary>
        public static int DreadPermille(float dread)
        {
            if (float.IsNaN(dread)) return 0;
            return Clamp((int)Math.Floor(dread * Scale + 0.5));
        }

        /// <summary>
        /// Corruption level of a villager (0 to well past <see cref="Scale"/> is clamped to Scale): pressure from dread, night (1-based) and ritual stage, less a penalty for every night
        /// of spread delay from patient zero. A villager the links never reach, or the rot has not reached yet (night before 1 + delay), is 0. Monotone in dread, night and ritual stage.
        /// </summary>
        public int CorruptionLevel(int index, int night, float dread, int ritualStage)
        {
            if (index < 0 || index >= SpreadDelay.Length || SpreadDelay[index] == Unreachable) return 0;
            night = Math.Max(1, night);
            if (night < 1 + SpreadDelay[index]) return 0;
            int rs = Math.Max(0, Math.Min(MaxRitualStage, ritualStage));
            int pressure = DreadPermille(dread) / DreadPressureDivisor + night * NightPressure + rs * RitualPressure;
            return Clamp(pressure - SpreadDelay[index] * SpreadPenalty);
        }

        public CorruptionStage CorruptionAt(int index, int night, float dread, int ritualStage)
        {
            int level = CorruptionLevel(index, night, dread, ritualStage);
            if (level >= CultAt) return Fate[index];
            if (level >= CorruptedAt) return CorruptionStage.Corrupted;
            return level >= UneasyAt ? CorruptionStage.Uneasy : CorruptionStage.None;
        }

        /// <summary>The visible behavior corruption forces: Uneasy at the window, Corrupted facing the sea, Cultist repeating the phrase, Missing vanished.</summary>
        public static VillagerBehavior BehaviorOf(CorruptionStage stage)
        {
            switch (stage)
            {
                case CorruptionStage.Uneasy: return VillagerBehavior.AtWindow;
                case CorruptionStage.Corrupted: return VillagerBehavior.FacingSea;
                case CorruptionStage.Cultist: return VillagerBehavior.RepeatingPhrase;
                case CorruptionStage.Missing: return VillagerBehavior.Vanished;
                default: return VillagerBehavior.Normal;
            }
        }

        /// <summary>The behavior a villager shows: whichever is worse of what dread does and what corruption does.</summary>
        public static VillagerBehavior CombinedBehavior(VillagerBehavior fromDread, CorruptionStage stage)
        {
            var c = BehaviorOf(stage);
            return (int)c > (int)fromDread ? c : fromDread;
        }

        /// <summary>A corrupted villager (Corrupted or later) speaks the colder variant of the chat line.</summary>
        public static bool ColdLine(CorruptionStage stage) { return (int)stage >= (int)CorruptionStage.Corrupted; }

        public SocialStanding StandingOf(int index, SocietyOpinions opinions, int night, float dread, int ritualStage)
        {
            return new SocialStanding { Tier = TierOf(opinions.Trust[index], opinions.Suspicion[index]), Corruption = CorruptionAt(index, night, dread, ritualStage) };
        }

        /// <summary>Seeded pick of what a suspicious villager does on a chat: "" to withhold, or an authored lie id.</summary>
        public static string SuspiciousStatement(int seed, int villagerIndex, int night, int topic)
        {
            var rng = new SeededRandom(seed ^ ChatStream ^ (villagerIndex * IndexStep) ^ (night * 31) ^ ((topic + 1) * 104729));
            if (rng.Next(LieOutOf) != 0) return "";
            return LieStatementIds[rng.Next(LieStatementIds.Length)];
        }
    }
}
