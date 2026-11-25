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

    /// <summary>Round 36: what an effect record says about the player. Order is stable (golden data uses the integers).</summary>
    public enum ReputationEffectKind { Trusted = 0, Accused = 1 }

    /// <summary>
    /// Round 36 (spec 176): one explicit reputation effect. Source is the roster index the player acted on (the origin event), Target the villager who now holds it for or against the player,
    /// Hop 0 for the origin itself and 1 or 2 for villagers it was passed to. Strength is a positive per mille magnitude; Effect gives the direction. Night is the night the action happened.
    /// </summary>
    public struct ReputationEffect
    {
        public int Source;
        public int Target;
        public SocietyActionKind Kind;
        public ReputationEffectKind Effect;
        public int Hop;
        public int Strength;
        public int Night;
    }

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

    /// <summary>Round 29 trust network: four more feelings per villager, each in [0, <see cref="VillageSociety.Scale"/>], indexed by roster index. See <see cref="VillageSociety.AxesAfter"/>.</summary>
    public sealed class SocietyAxes
    {
        public int[] Fear;
        public int[] Faith;
        public int[] Loyalty;
        public int[] Obsession;
    }

    /// <summary>
    /// What chat needs to know about a villager's standing: the tier toward the player and how far the rot has reached them. Trust and Fear (per mille) are the optional
    /// round 29 axes; both default to 0, which never withholds, so a standing built without them chats exactly as before.
    /// </summary>
    public struct SocialStanding
    {
        public TrustTier Tier;
        public CorruptionStage Corruption;
        public int Trust;
        public int Fear;
        /// <summary>Round 34: what the villager remembers adds up to (see <see cref="VillagerMemoryModel"/>). None by default, which changes nothing in chat.</summary>
        public MemoryOutcome Memory;
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

        // Round 29 axes. Each axis = disposition base + seeded jitter + the documented pressure terms, then clamped to [0, Scale]. Integer arithmetic only.
        public const int FearStream = 0x464541, FaithStream = 0x464149, LoyaltyStream = 0x4C4F59, ObsessionStream = 0x4F4253;
        /// <summary>Axis jitter is in [-AxisJitter, +AxisJitter] (Obsession uses [0, ObsessionSpread]).</summary>
        public const int AxisJitter = 50, ObsessionSpread = 150;
        /// <summary>Opening Fear and Faith by disposition (Kind, Wary, Haunted, Closed).</summary>
        public static readonly int[] FearBase = { 100, 250, 400, 200 };
        public static readonly int[] FaithBase = { 200, 250, 450, 300 };
        /// <summary>Fear gains dread / FearDreadDivisor, FearRitualStep per ritual stage and corruption / FearCorruptionDivisor.</summary>
        public const int FearDreadDivisor = 3, FearRitualStep = 40, FearCorruptionDivisor = 5;
        /// <summary>Faith gains FaithRitualStep per ritual stage and corruption / FaithCorruptionDivisor.</summary>
        public const int FaithRitualStep = 60, FaithCorruptionDivisor = 2;
        /// <summary>Loyalty is LoyaltyBase + LoyaltyFamilyStep per family link (at most LoyaltyFamilyCap) + trust / 4 - suspicion / 4.</summary>
        public const int LoyaltyBase = 300, LoyaltyFamilyStep = 100, LoyaltyFamilyCap = 3, LoyaltyOpinionDivisor = 4;
        /// <summary>Obsession is a seeded [0, ObsessionSpread] + ObsessionNightStep per night + ObsessionHauntedBonus for the Haunted + dread / ObsessionDreadDivisor.</summary>
        public const int ObsessionNightStep = 40, ObsessionHauntedBonus = 150, ObsessionDreadDivisor = 4;
        /// <summary>A villager whose Fear is at least this and above their Trust is too terrified to talk, though their trust still shows.</summary>
        public const int TerrifiedAt = 800;

        // Round 36 reputation propagation. Origin strength is |ActionTrust - ActionSuspicion| / repeat divisor; each hop divides it by HopDecayDivisor.
        /// <summary>Propagation stops after this many hops from the villager acted on.</summary>
        public const int MaxReputationHops = 2;
        public const int HopDecayDivisor = 2;
        /// <summary>No single effect record is stronger than this.</summary>
        public const int MaxEffectStrength = 500;
        /// <summary>Total propagated (hop 1 or more) strength one villager can receive over the whole log.</summary>
        public const int PropagatedCapPerVillager = 300;
        /// <summary>Total propagated strength the whole village can receive from the actions of one night.</summary>
        public const int PropagatedCapPerNight = 600;

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

        /// <summary>The villagers one link away from <paramref name="index"/>: family and the nearest neighbour, both ways, ascending and without duplicates.</summary>
        public List<int> LinkedTo(int index)
        {
            var set = new SortedSet<int>(FamilyLinks[index]);
            if (Neighbour[index] >= 0) set.Add(Neighbour[index]);
            for (int j = 0; j < Neighbour.Length; j++) if (Neighbour[j] == index) set.Add(j);
            set.Remove(index);
            return new List<int>(set);
        }

        /// <summary>
        /// Round 36 (spec 176): the explicit effect records of an ordered action log. Each action on one villager yields an origin record (hop 0) and then spreads breadth first along
        /// <see cref="LinkedTo"/> to at most <see cref="MaxReputationHops"/> hops, halving per hop. A villager is visited once per origin event, propagated records never start new events,
        /// a villager receives at most <see cref="PropagatedCapPerVillager"/> propagated strength in total and the village at most <see cref="PropagatedCapPerNight"/> per night.
        /// An action on <see cref="AllVillagers"/> yields only origin records (everyone already saw it). Repeats decay as in <see cref="OpinionsAfter(IList{SocietyAction})"/>.
        /// <paramref name="nights"/> gives the night of each log entry (null or short means night 0). Pure integer arithmetic and the log order only: replay equals incremental. This does not
        /// change <see cref="OpinionsAfter(IList{SocietyAction})"/> or any existing value.
        /// </summary>
        public List<ReputationEffect> ReputationEffectsAfter(IList<SocietyAction> log, IList<int> nights)
        {
            int n = Roster.Count;
            var result = new List<ReputationEffect>();
            if (log == null) return result;
            var repeats = new Dictionary<int, int>();
            var received = new int[n];
            var perNight = new Dictionary<int, int>();
            for (int k = 0; k < log.Count; k++)
            {
                var a = log[k];
                int kind = (int)a.Kind;
                if (kind < 0 || kind >= ActionTrust.Length) continue;
                int key = kind * 1000 + (a.Subject + 1), seen;
                repeats.TryGetValue(key, out seen);
                repeats[key] = seen + 1;
                int night = nights != null && k < nights.Count ? nights[k] : 0;
                int net = ActionTrust[kind] - ActionSuspicion[kind];
                var effect = net < 0 ? ReputationEffectKind.Accused : ReputationEffectKind.Trusted;
                int origin = Math.Min(MaxEffectStrength, Math.Abs(net) / (1 + seen * RepeatDecayStep));
                if (a.Subject == AllVillagers)
                {
                    if (origin > 0) for (int i = 0; i < n; i++) result.Add(Effect(i, i, a.Kind, effect, 0, origin, night));
                    continue;
                }
                if (a.Subject < 0 || a.Subject >= n) continue;
                if (origin > 0) result.Add(Effect(a.Subject, a.Subject, a.Kind, effect, 0, origin, night));
                var visited = new HashSet<int> { a.Subject };
                var frontier = new List<int> { a.Subject };
                for (int hop = 1; hop <= MaxReputationHops && frontier.Count > 0; hop++)
                {
                    int strength = origin;
                    for (int h = 0; h < hop; h++) strength /= HopDecayDivisor;
                    var next = new List<int>();
                    foreach (int from in frontier)
                        foreach (int to in LinkedTo(from))
                        {
                            if (!visited.Add(to)) continue;
                            next.Add(to);
                            int nightUsed;
                            perNight.TryGetValue(night, out nightUsed);
                            int give = Math.Min(strength, Math.Min(PropagatedCapPerVillager - received[to], PropagatedCapPerNight - nightUsed));
                            if (give <= 0) continue;
                            received[to] += give;
                            perNight[night] = nightUsed + give;
                            result.Add(Effect(a.Subject, to, a.Kind, effect, hop, give, night));
                        }
                    frontier = next;
                }
            }
            return result;
        }

        private static ReputationEffect Effect(int source, int target, SocietyActionKind kind, ReputationEffectKind effect, int hop, int strength, int night)
        {
            return new ReputationEffect { Source = source, Target = target, Kind = kind, Effect = effect, Hop = hop, Strength = strength, Night = night };
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

        private int AxisJitter_(int stream, int i) { return new SeededRandom(Seed ^ stream ^ (i * IndexStep)).Next(2 * AxisJitter + 1) - AxisJitter; }

        /// <summary>
        /// Fear, Faith, Loyalty and Obsession of every villager (additive: nothing here changes <see cref="OpinionsAfter(IList{SocietyAction})"/> or corruption). Deterministic in
        /// seed, opinions, night (1-based), dread and ritual stage; every value is clamped to [0, Scale]. Formulas are the constants documented above.
        /// </summary>
        public SocietyAxes AxesAfter(SocietyOpinions opinions, int night, float dread, int ritualStage)
        {
            return AxesAfter(opinions, night, dread, ritualStage, null);
        }

        /// <summary>
        /// <see cref="AxesAfter(SocietyOpinions, int, float, int)"/> with what each villager remembers (round 34, <see cref="VillagerMemoryModel.EffectsOfAll"/>) added on top and clamped to
        /// [0, Scale]. A null or short array adds nothing for the missing entries, so an empty memory gives exactly the plain result. Trust is not an axis: pass opinions from
        /// <see cref="VillagerMemoryModel.TrustAfter"/> to apply it.
        /// </summary>
        public SocietyAxes AxesAfter(SocietyOpinions opinions, int night, float dread, int ritualStage, IList<MemoryEffect> memory)
        {
            int n = Roster.Count;
            var a = new SocietyAxes { Fear = new int[n], Faith = new int[n], Loyalty = new int[n], Obsession = new int[n] };
            int dp = DreadPermille(dread), nt = Math.Max(1, night), rs = Math.Max(0, Math.Min(MaxRitualStage, ritualStage));
            for (int i = 0; i < n; i++)
            {
                int disp = (int)Roster[i].Disposition, corruption = CorruptionLevel(i, nt, dread, rs);
                a.Fear[i] = Clamp(FearBase[disp] + AxisJitter_(FearStream, i) + dp / FearDreadDivisor + rs * FearRitualStep + corruption / FearCorruptionDivisor);
                a.Faith[i] = Clamp(FaithBase[disp] + AxisJitter_(FaithStream, i) + rs * FaithRitualStep + corruption / FaithCorruptionDivisor);
                a.Loyalty[i] = Clamp(LoyaltyBase + Math.Min(FamilyLinks[i].Count, LoyaltyFamilyCap) * LoyaltyFamilyStep + opinions.Trust[i] / LoyaltyOpinionDivisor - opinions.Suspicion[i] / LoyaltyOpinionDivisor + AxisJitter_(LoyaltyStream, i));
                a.Obsession[i] = Clamp(new SeededRandom(Seed ^ ObsessionStream ^ (i * IndexStep)).Next(ObsessionSpread + 1) + nt * ObsessionNightStep + (Roster[i].Disposition == VillagerDisposition.Haunted ? ObsessionHauntedBonus : 0) + dp / ObsessionDreadDivisor);
            }
            if (memory != null)
                for (int i = 0; i < n && i < memory.Count; i++)
                {
                    a.Fear[i] = Clamp(a.Fear[i] + memory[i].Fear);
                    a.Faith[i] = Clamp(a.Faith[i] + memory[i].Faith);
                    a.Loyalty[i] = Clamp(a.Loyalty[i] + memory[i].Loyalty);
                    a.Obsession[i] = Clamp(a.Obsession[i] + memory[i].Obsession);
                }
            return a;
        }

        /// <summary>True when fear outweighs trust and is high: the villager trusts you perhaps, but is too frightened to talk.</summary>
        public static bool FearWithholds(int trust, int fear) { return fear >= TerrifiedAt && fear > trust; }

        /// <summary><see cref="StandingOf"/> plus the Trust and Fear axes, so chat can withhold from a terrified villager.</summary>
        public SocialStanding StandingWithAxes(int index, SocietyOpinions opinions, SocietyAxes axes, int night, float dread, int ritualStage)
        {
            var st = StandingOf(index, opinions, night, dread, ritualStage);
            st.Trust = opinions.Trust[index];
            st.Fear = axes.Fear[index];
            return st;
        }

        /// <summary><see cref="StandingWithAxes(int, SocietyOpinions, SocietyAxes, int, float, int)"/> plus the memory outcome of the villager.</summary>
        public SocialStanding StandingWithAxes(int index, SocietyOpinions opinions, SocietyAxes axes, int night, float dread, int ritualStage, MemoryOutcome memory)
        {
            var st = StandingWithAxes(index, opinions, axes, night, dread, ritualStage);
            st.Memory = memory;
            return st;
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
