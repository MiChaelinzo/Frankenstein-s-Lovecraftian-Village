using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>The result of a finished vigil: ending, epitaph, score, rank and a shareable code.</summary>
    public sealed class VigilOutcome
    {
        public string EndingId;
        public string Epitaph;
        public int Score;
        public int Rank;          // index into VigilRules.RankNames
        public string RankName;
        public string Code;       // "V1-<seed>-<endingId>-<score>"
        public int Clues;
        public int Lanterns;
        public int NightsEndured;
        public int Sanity;
        public bool Named;
        public bool RitualComplete;
    }

    /// <summary>A parsed result code.</summary>
    public struct VigilResultCode
    {
        public int Seed;
        public string EndingId;
        public int Score;
    }

    /// <summary>
    /// Engine-free, integer-only rules of the Vigil: name the thing in the sea before sanity runs out.
    /// Clues cost sanity and lanterns restore it through <see cref="InteractionRules.SanityDelta"/>, so the numbers live in one place.
    /// Low sanity raises dread, which advances the ritual (<see cref="RitualChain.StageForDread"/>); that is the tension.
    /// </summary>
    public static class VigilRules
    {
        public const int MinClueTarget = 2;
        public const int MaxClueTarget = 6;
        /// <summary>Clue sources offered above the target, so a night never forces one exact path.</summary>
        public const int SpareSources = 2;
        public const int LampsPerNight = 3;
        /// <summary>Sanity regained at dawn, added to the sanity carried out of a night.</summary>
        public const int DawnRecovery = 8;
        /// <summary>The dark creeps in: sanity the caller drains during night N is CreepBase + N * CreepPerNight.</summary>
        public const int CreepBase = 4;
        public const int CreepPerNight = 2;
        /// <summary>Sanity the true ending and the "witness" and "dawn" endings need.</summary>
        public const int SteadySanity = 50;
        public const int MaxSanity = 100;
        public const char HiddenLetter = '\u00b7';

        public const string Hollowing = "hollowing";
        public const string NameSpoken = "name_spoken";
        public const string Dawn = "dawn";
        public const string Fever = "fever";
        public const string Witness = "witness";
        public const string Vessel = "vessel";

        /// <summary>Ending ids in definition order. Clients persist them, so only append.</summary>
        public static readonly string[] EndingIds = { Hollowing, NameSpoken, Dawn, Fever, Witness, Vessel };

        /// <summary>English epitaphs, same order as <see cref="EndingIds"/>. Implication, not gore.</summary>
        public static readonly string[] Epitaphs =
        {
            "They found you at the water's edge in the morning, kneeling, and none of them could say whose face you wore.",
            "You said the name aloud and the sea went quiet, as one does for a creditor who has finally been paid.",
            "The sun came up on a village that remembered nothing. You walked out before it could remember you.",
            "You left with the name half spoken. It still moves your lips, in your sleep, in the wrong language.",
            "You watched the ritual finish and kept your mind. The village will never forgive you for having seen.",
            "The ritual closed around you like a hand. Something wears your shape and walks home in your place.",
        };

        // Score weights (points).
        public const int PointsPerClue = 100;
        public const int PointsPerLantern = 25;
        public const int PointsPerSanity = 2;
        public const int PointsPerNight = 150;
        public const int PointsPerCodexEntry = 20;
        public const int NamerBonus = 1000;

        /// <summary>Rank names, lowest first. <see cref="RankThresholds"/> holds the minimum score of each.</summary>
        public static readonly string[] RankNames = { "Forgotten", "Watcher", "Keeper", "Reader", "Namer" };
        public static readonly int[] RankThresholds = { 0, 600, 1500, 2500, 3500 };

        public const string ResultPrefix = "V1";
        private const int MaxDigits = 10;

        // Sandbox action ids: the player controls that change sanity, night, seed or village outside play.
        public const string ActionSanitySlider = "sanity_slider";
        public const string ActionSanityKeys = "sanity_keys";
        public const string ActionNightSelect = "night_select";
        public const string ActionNightStep = "night_step";
        public const string ActionDreadCreep = "dread_creep";
        public const string ActionNewVillage = "new_village";
        public const string ActionSeedEntry = "seed_entry";
        public const string ActionDaily = "daily";
        public const string ActionLoadSession = "load_session";
        public const string ActionStory = "story_playback";
        public const string ActionCinema = "cinema_playback";

        /// <summary>All sandbox action ids. Clients disable the matching controls while a vigil is live.</summary>
        public static readonly string[] SandboxActionIds =
        {
            ActionSanitySlider, ActionSanityKeys, ActionNightSelect, ActionNightStep, ActionDreadCreep,
            ActionNewVillage, ActionSeedEntry, ActionDaily, ActionLoadSession, ActionStory, ActionCinema,
        };

        /// <summary>
        /// The sandbox lock. While a vigil is locked (VigilState.IsLocked: begun and not finished) every sandbox action is refused, listed or not,
        /// so scores and endings stay honest; refusing rather than marking the run tampered keeps the rule deterministic.
        /// Outside a live vigil everything is allowed. The vigil's own sanity and night changes do not go through this rule.
        /// </summary>
        public static bool AllowsSandboxAction(bool vigilLive, string actionId)
        {
            return !vigilLive;
        }

        /// <summary>
        /// Whether an interaction of this kind is a vigil clue. Whisper and Landmark are clues; Door and Candle are not
        /// (lanterns are counted separately). Unity must use this instead of treating every target as a clue.
        /// </summary>
        public static bool CountsAsClue(InteractionKind kind)
        {
            return kind == InteractionKind.Whisper || kind == InteractionKind.Landmark;
        }

        /// <summary>Clues needed to endure a night. Rises with the night number, clamped. Nights below 1 count as night 1.</summary>
        public static int ClueTarget(int night)
        {
            int n = Math.Max(1, night);
            return Math.Max(MinClueTarget, Math.Min(MaxClueTarget, MinClueTarget + n / 2));
        }

        /// <summary>Clue sources the night offers (target plus spares).</summary>
        public static int SourcesOffered(int night) { return ClueTarget(night) + SpareSources; }

        /// <summary>Sanity the dark drains over the night, applied by the caller (the web client uses its drain rate).</summary>
        public static int NightCreep(int night) { return CreepBase + Math.Max(1, night) * CreepPerNight; }

        /// <summary>Clues across the first <paramref name="nights"/> nights: what the whole name costs.</summary>
        public static int TotalClues(int nights)
        {
            int total = 0;
            for (int n = 1; n <= nights; n++) total += ClueTarget(n);
            return total;
        }

        /// <summary>Rounds a SanityModel value half up into 0..100 points. NaN counts as 0.</summary>
        public static int SanityPoints(float sanity)
        {
            if (float.IsNaN(sanity)) return 0;
            if (sanity <= 0f) return 0;
            if (sanity >= MaxSanity) return MaxSanity;
            return (int)Math.Floor(sanity + 0.5f);
        }

        /// <summary>Sanity at the start of the next night: carried plus dawn recovery, clamped to 0..100.</summary>
        public static int NextNightSanity(int carried)
        {
            return Math.Max(0, Math.Min(MaxSanity, carried + DawnRecovery));
        }

        /// <summary>
        /// The ritual name with a middle dot for each hidden letter. Letters are revealed in a seeded order, so
        /// a revealed letter never hides again as clues grow. At <paramref name="cluesTotal"/> the name is whole.
        /// </summary>
        public static string NameReveal(Ritual ritual, int cluesFound, int cluesTotal)
        {
            if (ritual == null || string.IsNullOrEmpty(ritual.Name)) return "";
            string name = ritual.Name;
            var letters = new List<int>();
            for (int i = 0; i < name.Length; i++) if (IsLetter(name[i])) letters.Add(i);
            var rng = new SeededRandom(ritual.Seed ^ 0x7e57ab1e);
            for (int i = letters.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                int t = letters[i]; letters[i] = letters[j]; letters[j] = t;
            }
            int shown = 0;
            if (cluesTotal > 0)
            {
                int found = Math.Max(0, Math.Min(cluesFound, cluesTotal));
                shown = (int)((long)letters.Count * found / cluesTotal);
            }
            var chars = name.ToCharArray();
            for (int k = shown; k < letters.Count; k++) chars[letters[k]] = HiddenLetter;
            return new string(chars);
        }

        private static bool IsLetter(char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }

        /// <summary>
        /// The one ending for an end state. Priority: hollowing, name_spoken, then the matrix of ritual complete by sanity.
        /// </summary>
        public static string EndingFor(int sanity, bool collapsed, bool named, bool ritualComplete)
        {
            if (collapsed || sanity <= 0) return Hollowing;
            bool steady = sanity >= SteadySanity;
            if (named && !ritualComplete && steady) return NameSpoken;
            if (ritualComplete) return steady ? Witness : Vessel;
            return steady ? Dawn : Fever;
        }

        public static string EpitaphFor(string endingId)
        {
            int i = Array.IndexOf(EndingIds, endingId);
            return i < 0 ? "" : Epitaphs[i];
        }

        /// <summary>Integer score. Hollowing keeps its clues but has no sanity or bonus.</summary>
        public static int Score(int clues, int lanterns, int sanity, int nightsEndured, int codexEntries, string endingId)
        {
            long score = (long)Math.Max(0, clues) * PointsPerClue
                + (long)Math.Max(0, lanterns) * PointsPerLantern
                + (long)Math.Max(0, Math.Min(MaxSanity, sanity)) * PointsPerSanity
                + (long)Math.Max(0, nightsEndured) * PointsPerNight
                + (long)Math.Max(0, codexEntries) * PointsPerCodexEntry
                + (endingId == NameSpoken ? NamerBonus : 0);
            return (int)Math.Min(score, int.MaxValue);
        }

        /// <summary>Index of the highest rank whose threshold the score reaches.</summary>
        public static int RankFor(int score)
        {
            int rank = 0;
            for (int i = 0; i < RankThresholds.Length; i++) if (score >= RankThresholds[i]) rank = i;
            return rank;
        }

        public static string ResultCode(int seed, string endingId, int score)
        {
            return ResultPrefix + "-" + seed.ToString(CultureInfo.InvariantCulture) + "-" + endingId + "-" + score.ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>Parses a canonical result code. Rejects unknown endings, signs on the score, leading zeros and stray text.</summary>
        public static bool TryParseResultCode(string text, out VigilResultCode result)
        {
            result = new VigilResultCode();
            string head = ResultPrefix + "-";
            if (text == null || !text.StartsWith(head, StringComparison.Ordinal)) return false;
            int last = text.LastIndexOf('-');
            if (last <= head.Length) return false;
            int mid = text.LastIndexOf('-', last - 1);
            if (mid < head.Length) return false;
            string seedText = text.Substring(head.Length, mid - head.Length);
            string ending = text.Substring(mid + 1, last - mid - 1);
            string scoreText = text.Substring(last + 1);
            int seed, score;
            if (Array.IndexOf(EndingIds, ending) < 0) return false;
            if (!TryParseInt(seedText, true, out seed) || !TryParseInt(scoreText, false, out score)) return false;
            result = new VigilResultCode { Seed = seed, EndingId = ending, Score = score };
            return true;
        }

        /// <summary>Strict canonical integer: digits only, optional leading minus when allowed, no leading zeros, no "-0".</summary>
        internal static bool TryParseInt(string text, bool allowNegative, out int value)
        {
            value = 0;
            if (string.IsNullOrEmpty(text) || text.Length > MaxDigits + 1) return false;
            int start = 0;
            if (text[0] == '-')
            {
                if (!allowNegative) return false;
                start = 1;
            }
            if (start >= text.Length) return false;
            if (text[start] == '0' && text.Length - start > 1) return false;
            if (start == 1 && text[1] == '0') return false;
            for (int i = start; i < text.Length; i++) if (text[i] < '0' || text[i] > '9') return false;
            return int.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out value);
        }
    }

    /// <summary>
    /// One run through the campaign nights. Sanity effects are applied by the caller through SanityModel and
    /// InteractionRules; this class only counts what was found and decides when the vigil ends.
    /// </summary>
    public sealed class VigilState
    {
        private const string SaveTag = "vigil1";
        private readonly Campaign _campaign;
        private readonly Ritual _ritual;
        private readonly HashSet<string> _nightClues = new HashSet<string>();
        private readonly HashSet<string> _nightLamps = new HashSet<string>();
        private bool _begun;
        private int _nightsEndured;
        private int _sanity;
        private int _minSanity;
        private int _clues;
        private int _lanterns;

        public VigilState(Campaign campaign, Ritual ritual)
        {
            _campaign = campaign;
            _ritual = ritual;
            _sanity = campaign != null && campaign.Nights.Count > 0 ? VigilRules.SanityPoints(campaign.Nights[0].SanityStart) : VigilRules.MaxSanity;
            _minSanity = _sanity;
        }

        public int NightsTotal { get { return _campaign == null ? 0 : _campaign.Nights.Count; } }
        public int NightsEndured { get { return _nightsEndured; } }
        /// <summary>The night being played, 1-based, held at the last night once finished.</summary>
        public int Night { get { return Math.Max(1, Math.Min(_nightsEndured + 1, Math.Max(1, NightsTotal))); } }
        public int Sanity { get { return _sanity; } }
        public int MinSanity { get { return _minSanity; } }
        public int TotalClues { get { return _clues; } }
        public int TotalLanterns { get { return _lanterns; } }
        public int NightClues { get { return _nightClues.Count; } }
        public int NightLanterns { get { return _nightLamps.Count; } }
        public int ClueTarget { get { return VigilRules.ClueTarget(Night); } }
        /// <summary>Clues the whole campaign asks for.</summary>
        public int CluesRequired { get { return VigilRules.TotalClues(NightsTotal); } }
        public bool IsCollapsed { get { return _minSanity <= 0; } }
        /// <summary>True while the vigil is not finished. Does not say whether the player committed to it, see <see cref="IsLocked"/>.</summary>
        public bool IsLive { get { return !IsFinished; } }
        /// <summary>True once <see cref="Begin"/> was called (or a save was restored). Clients decide what the first action is.</summary>
        public bool Begun { get { return _begun; } }
        /// <summary>The sandbox lock state, the value to pass to VigilRules.AllowsSandboxAction: begun and not finished. Web and Unity both use it.</summary>
        public bool IsLocked { get { return _begun && !IsFinished; } }
        /// <summary>Commits the player to the vigil. Idempotent. Before this the village, seed and sanity may still be chosen.</summary>
        public void Begin() { _begun = true; }
        public bool IsFinished { get { return IsCollapsed || _nightsEndured >= NightsTotal; } }
        public bool IsNamed { get { return CluesRequired > 0 && _clues >= CluesRequired; } }

        /// <summary>Highest dread percent reached (100 minus the lowest sanity seen).</summary>
        public int PeakDread { get { return VigilRules.MaxSanity - _minSanity; } }

        /// <summary>Effective ritual stage from the peak dread alone (-1 for none). Not the night schedule.</summary>
        public int RitualStage { get { return RitualChain.StageForDread(_ritual, PeakDread); } }

        /// <summary>Same predicate as the "ritual" achievement.</summary>
        public bool IsRitualComplete { get { return _ritual != null && _ritual.Stages.Count > 0 && RitualStage >= _ritual.Stages.Count - 1; } }

        public string RevealedName { get { return VigilRules.NameReveal(_ritual, _clues, CluesRequired); } }

        public bool CanEndureNight { get { return !IsFinished && _nightClues.Count >= ClueTarget; } }

        /// <summary>Counts a clue from a source. True only the first time this source is heard on this night.</summary>
        public bool RecordClue(string sourceId)
        {
            if (IsFinished || !IsValidId(sourceId) || !_nightClues.Add(sourceId)) return false;
            _clues++;
            return true;
        }

        /// <summary>
        /// Whether this lamp can still be lit tonight: valid, not yet lit and under the lamp cap. Callers apply the sanity gain only when
        /// this is true (or when <see cref="LightLantern"/> returned true), so the cap bounds the sanity economy as well as the count.
        /// </summary>
        public bool CanLightLantern(string lampId)
        {
            return !IsFinished && IsValidId(lampId) && !_nightLamps.Contains(lampId) && _nightLamps.Count < VigilRules.LampsPerNight;
        }

        /// <summary>Counts a lit lantern. True only when <see cref="CanLightLantern"/> allows it. The caller applies the sanity gain.</summary>
        public bool LightLantern(string lampId)
        {
            if (!CanLightLantern(lampId) || !_nightLamps.Add(lampId)) return false;
            _lanterns++;
            return true;
        }

        /// <summary>Records current sanity points (clamped 0..100). Reaching 0 ends the vigil in hollowing.</summary>
        public void RecordSanity(int sanity)
        {
            if (IsFinished) return;
            _sanity = Math.Max(0, Math.Min(VigilRules.MaxSanity, sanity));
            if (_sanity < _minSanity) _minSanity = _sanity;
        }

        /// <summary>
        /// Ends the night when its clue target is met. Returns the sanity to start the next night with, or the carried
        /// sanity after the last night. Returns -1 when the target is not met or the vigil is over.
        /// </summary>
        public int EndureNight(int carriedSanity)
        {
            if (!CanEndureNight) return -1;
            RecordSanity(carriedSanity);
            if (IsCollapsed) return 0;
            _nightsEndured++;
            _nightClues.Clear();
            _nightLamps.Clear();
            if (_nightsEndured >= NightsTotal) return _sanity;
            _sanity = VigilRules.NextNightSanity(_sanity);
            return _sanity;
        }

        /// <summary>The outcome, or null while the vigil is still running.</summary>
        public VigilOutcome Outcome(int codexEntries)
        {
            if (!IsFinished) return null;
            string ending = VigilRules.EndingFor(_sanity, IsCollapsed, IsNamed, IsRitualComplete);
            int score = VigilRules.Score(_clues, _lanterns, _sanity, _nightsEndured, codexEntries, ending);
            int rank = VigilRules.RankFor(score);
            return new VigilOutcome
            {
                EndingId = ending,
                Epitaph = VigilRules.EpitaphFor(ending),
                Score = score,
                Rank = rank,
                RankName = VigilRules.RankNames[rank],
                Code = VigilRules.ResultCode(_campaign == null ? 0 : _campaign.Seed, ending, score),
                Clues = _clues,
                Lanterns = _lanterns,
                NightsEndured = _nightsEndured,
                Sanity = _sanity,
                Named = IsNamed,
                RitualComplete = IsRitualComplete,
            };
        }

        /// <summary>Compact save: "vigil1;endured;sanity;minSanity;clues;lanterns;clueIds;lampIds" (ids comma separated).</summary>
        public string Serialize()
        {
            var sb = new StringBuilder(SaveTag);
            sb.Append(';').Append(_nightsEndured).Append(';').Append(_sanity).Append(';').Append(_minSanity)
              .Append(';').Append(_clues).Append(';').Append(_lanterns)
              .Append(';').Append(string.Join(",", SortedIds(_nightClues))).Append(';').Append(string.Join(",", SortedIds(_nightLamps)));
            return sb.ToString();
        }

        /// <summary>Restores a saved string. Malformed or inconsistent input returns false and leaves this state unchanged.</summary>
        public bool TryRestore(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;
            var parts = text.Split(';');
            if (parts.Length != 8 || parts[0] != SaveTag) return false;
            int endured, sanity, min, clues, lanterns;
            if (!VigilRules.TryParseInt(parts[1], false, out endured) || !VigilRules.TryParseInt(parts[2], false, out sanity)
                || !VigilRules.TryParseInt(parts[3], false, out min) || !VigilRules.TryParseInt(parts[4], false, out clues)
                || !VigilRules.TryParseInt(parts[5], false, out lanterns)) return false;
            if (endured > NightsTotal || sanity > VigilRules.MaxSanity || min > sanity) return false;
            var nightClues = ParseIds(parts[6]);
            var nightLamps = ParseIds(parts[7]);
            if (nightClues == null || nightLamps == null || nightClues.Count > clues || nightLamps.Count > lanterns) return false;
            // Bounds: a hand-edited save must not reach IsNamed early or exceed what play can produce.
            if (clues > CluesRequired || lanterns > VigilRules.LampsPerNight * NightsTotal) return false;
            if (nightClues.Count > VigilRules.MaxClueTarget || nightLamps.Count > VigilRules.LampsPerNight) return false;
            _nightsEndured = endured; _sanity = sanity; _minSanity = min; _clues = clues; _lanterns = lanterns;
            _nightClues.Clear(); _nightClues.UnionWith(nightClues);
            _nightLamps.Clear(); _nightLamps.UnionWith(nightLamps);
            _begun = true;
            return true;
        }

        private static bool IsValidId(string id)
        {
            return !string.IsNullOrEmpty(id) && id.IndexOf(';') < 0 && id.IndexOf(',') < 0;
        }

        private static List<string> SortedIds(HashSet<string> ids)
        {
            var list = new List<string>(ids);
            list.Sort(StringComparer.Ordinal);
            return list;
        }

        private static HashSet<string> ParseIds(string text)
        {
            var set = new HashSet<string>();
            if (text.Length == 0) return set;
            foreach (var id in text.Split(','))
                if (!IsValidId(id) || !set.Add(id)) return null;
            return set;
        }
    }
}
