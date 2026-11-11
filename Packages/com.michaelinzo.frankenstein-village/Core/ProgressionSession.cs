using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>What one recorded event newly unlocked. Both lists are in stable definition order.</summary>
    public sealed class ProgressionUpdate
    {
        public List<string> CodexIds = new List<string>();
        public List<string> AchievementIds = new List<string>();
        public bool Any { get { return CodexIds.Count > 0 || AchievementIds.Count > 0; } }
    }

    /// <summary>
    /// Engine-free play-session progression for the Unity layer: counts interactions, remembers the highest omen tier
    /// and ritual stage, and asks <see cref="CodexModel"/> and <see cref="AchievementRules"/> what that unlocks.
    /// The Runtime tracker only forwards events and persists <see cref="SerializeIds"/>; no rule lives there.
    /// Counting follows the web client: a whisper counts as a whisper and a listen, a landmark as a listen, a door as a door.
    /// </summary>
    public sealed class ProgressionSession
    {
        private readonly AchievementStats _stats = new AchievementStats();
        private readonly HashSet<string> _codex = new HashSet<string>();
        private readonly HashSet<string> _earned = new HashSet<string>();
        private Ritual _ritual;
        private VigilState _vigil;

        public IReadOnlyCollection<string> UnlockedCodexIds { get { return _codex; } }
        public IReadOnlyCollection<string> EarnedAchievementIds { get { return _earned; } }
        public AchievementStats Stats { get { return _stats; } }
        /// <summary>The running vigil, or null before <see cref="StartVigil"/>.</summary>
        public VigilState Vigil { get { return _vigil; } }
        public JournalCompletion Journal { get { return AchievementRules.Completion(_stats.Kinds); } }

        /// <summary>Sets the ritual whose codex is tracked. A different ritual seed resets codex, tier and stage; counts and earned ids stay.</summary>
        public ProgressionUpdate SetRitual(Ritual ritual)
        {
            if (_ritual == null || ritual == null || _ritual.Seed != ritual.Seed)
            {
                _codex.Clear();
                _stats.Tier = 0;
                _stats.Stage = -1;
                _vigil = null;
            }
            _ritual = ritual;
            _stats.StageCount = ritual == null ? 0 : ritual.Stages.Count;
            _stats.CodexTotal = CodexModel.Entries(ritual).Count;
            return Refresh();
        }

        public ProgressionUpdate RecordInteraction(InteractionKind kind)
        {
            switch (kind)
            {
                case InteractionKind.Door: _stats.Doors++; _stats.Kinds.Add("door"); break;
                case InteractionKind.Whisper: _stats.Whispers++; _stats.Listens++; _stats.Kinds.Add("narration"); break;
                case InteractionKind.Landmark: _stats.Listens++; _stats.Kinds.Add("narration"); break;
            }
            return Refresh();
        }

        /// <summary>Starts a fresh vigil over the campaign and the current ritual. The ritual must be set first.</summary>
        public void StartVigil(Campaign campaign) { _vigil = new VigilState(campaign, _ritual); }

        /// <summary>Forwards a heard clue source. Returns true when it was new this night.</summary>
        public bool RecordVigilClue(string sourceId, out ProgressionUpdate update)
        {
            bool fresh = _vigil != null && _vigil.RecordClue(sourceId);
            update = Refresh();
            return fresh;
        }

        /// <summary>Forwards a lit lamp. Returns true when it was new this night. The sanity gain is applied by the caller.</summary>
        public bool RecordVigilLantern(string lampId, out ProgressionUpdate update)
        {
            bool fresh = _vigil != null && _vigil.LightLantern(lampId);
            update = Refresh();
            return fresh;
        }

        /// <summary>Forwards current sanity points; a collapse or a finish can award the vigil achievements.</summary>
        public ProgressionUpdate RecordVigilSanity(int sanity)
        {
            if (_vigil != null) _vigil.RecordSanity(sanity);
            return Refresh();
        }

        /// <summary>Ends the night if its clues are met. Returns the next night's sanity, or -1 when refused.</summary>
        public int EndureVigilNight(int carriedSanity, out ProgressionUpdate update)
        {
            int next = _vigil == null ? -1 : _vigil.EndureNight(carriedSanity);
            update = Refresh();
            return next;
        }

        /// <summary>Records the omen tier reached (0 Calm .. 3 Abyss). The highest tier seen is kept.</summary>
        public ProgressionUpdate RecordOmenTier(int tier)
        {
            if (tier > _stats.Tier) _stats.Tier = System.Math.Min(tier, CodexModel.OmenTiers);
            if (tier > 0) _stats.Kinds.Add("omen");
            return Refresh();
        }

        /// <summary>Records the effective ritual stage (-1 for none). The highest stage seen is kept.</summary>
        public ProgressionUpdate RecordRitualStage(int stage)
        {
            if (stage > _stats.Stage) _stats.Stage = stage;
            return Refresh();
        }

        /// <summary>Restores previously saved ids. Unknown ids are dropped. Codex ids only count for the current ritual.</summary>
        public void Restore(IEnumerable<string> codexIds, IEnumerable<string> achievementIds)
        {
            if (codexIds != null) CodexModel.UnlockInto(_codex, _ritual, codexIds);
            if (achievementIds != null)
                foreach (var id in achievementIds)
                    if (System.Array.IndexOf(AchievementRules.Ids, id) >= 0) _earned.Add(id);
            _stats.CodexCount = _codex.Count;
        }

        public static string SerializeIds(IEnumerable<string> ids) { return string.Join(",", ids); }

        public static string[] ParseIds(string text)
        {
            return string.IsNullOrEmpty(text) ? new string[0] : text.Split(new[] { ',' }, System.StringSplitOptions.RemoveEmptyEntries);
        }

        private ProgressionUpdate Refresh()
        {
            var update = new ProgressionUpdate();
            update.CodexIds = CodexModel.UnlockInto(_codex, _ritual, CodexModel.UnlockedIds(_ritual, _stats.Stage, _stats.Tier));
            _stats.CodexCount = _codex.Count;
            var outcome = _vigil == null ? null : _vigil.Outcome(_codex.Count);
            _stats.VigilDone = outcome != null;
            _stats.NamerDone = outcome != null && outcome.EndingId == VigilRules.NameSpoken;
            update.AchievementIds = AchievementRules.Award(_earned, _stats);
            return update;
        }
    }
}
