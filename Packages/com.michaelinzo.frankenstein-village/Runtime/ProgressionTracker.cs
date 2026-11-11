using System;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin MonoBehaviour over Core.ProgressionSession (CodexModel + AchievementRules) and DailySeed. It forwards interactions,
    /// omen crossings and ritual stages to the session, persists the unlocked ids in PlayerPrefs and raises Unlocked.
    /// With useDailySeed the walkthrough seed is set from the UTC date before the campaign is generated.
    /// Code-complete, unverified in Unity (compile checked against original stubs only).
    /// </summary>
    public sealed class ProgressionTracker : MonoBehaviour
    {
        public const string CodexPrefsKey = "frankenstein.codex";
        public const string AchievementsPrefsKey = "frankenstein.achievements";

        public HorrorAmbienceDirector director;
        public InteractionRaycaster interactor;
        public RitualDirector ritualDirector;
        public WalkthroughController walkthrough;
        [Tooltip("Opt in: every player gets the same village on the same UTC day (Core DailySeed).")]
        public bool useDailySeed = false;

        public ProgressionSession Session { get; } = new ProgressionSession();

        /// <summary>Raised whenever codex entries or achievements are newly unlocked.</summary>
        public event Action<ProgressionUpdate> Unlocked;

        private Ritual _boundRitual;

        private void Awake()
        {
            if (useDailySeed && walkthrough != null)
                walkthrough.seed = DailySeed.SeedFromKey(DailySeed.KeyFor(DateTime.UtcNow));
        }

        private void OnEnable()
        {
            if (interactor != null) interactor.Interacted += OnInteracted;
            if (director != null) director.OmenCrossed += OnOmenCrossed;
        }

        private void OnDisable()
        {
            if (interactor != null) interactor.Interacted -= OnInteracted;
            if (director != null) director.OmenCrossed -= OnOmenCrossed;
        }

        private void Update()
        {
            if (ritualDirector == null || ritualDirector.Ritual == null) return;
            if (!ReferenceEquals(ritualDirector.Ritual, _boundRitual))
            {
                _boundRitual = ritualDirector.Ritual;
                Publish(Session.SetRitual(_boundRitual));
                Session.Restore(ProgressionSession.ParseIds(PlayerPrefs.GetString(CodexPrefsKey, "")),
                                ProgressionSession.ParseIds(PlayerPrefs.GetString(AchievementsPrefsKey, "")));
            }
            if (ritualDirector.Progress != null) Publish(Session.RecordRitualStage(ritualDirector.Progress.Effective));
        }

        private void OnInteracted(InteractionKind kind) { Publish(Session.RecordInteraction(kind)); }

        private void OnOmenCrossed(DreadEvent e) { if (e.Rising) Publish(Session.RecordOmenTier(e.Tier)); }

        private void Publish(ProgressionUpdate update)
        {
            if (update == null || !update.Any) return;
            PlayerPrefs.SetString(CodexPrefsKey, ProgressionSession.SerializeIds(Session.UnlockedCodexIds));
            PlayerPrefs.SetString(AchievementsPrefsKey, ProgressionSession.SerializeIds(Session.EarnedAchievementIds));
            PlayerPrefs.Save();
            if (Unlocked != null) Unlocked(update);
        }
    }
}
