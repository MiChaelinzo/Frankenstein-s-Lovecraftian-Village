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

        /// <summary>The finished vigil's outcome, or null while it is running or not started. Rules live in Core VigilState.</summary>
        public VigilOutcome VigilOutcome { get { return Session.Vigil == null ? null : Session.Vigil.Outcome(Session.UnlockedCodexIds.Count); } }

        /// <summary>True once the village ritual is bound to the session; a vigil can only start after that.</summary>
        public bool RitualBound { get { return _boundRitual != null; } }

        private void Awake()
        {
            if (useDailySeed && walkthrough != null)
                walkthrough.seed = DailySeed.SeedFromKey(DailySeed.KeyFor(DateTime.UtcNow));
        }

        private void OnEnable()
        {
            if (interactor != null) { interactor.Interacted += OnInteracted; interactor.InteractedTarget += OnInteractedTarget; interactor.SanityGate = AllowsSanityEffect; }
            if (director != null) director.OmenCrossed += OnOmenCrossed;
        }

        private void OnDisable()
        {
            if (interactor != null) { interactor.Interacted -= OnInteracted; interactor.InteractedTarget -= OnInteractedTarget; interactor.SanityGate = null; }
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

        /// <summary>
        /// Whether the raycaster may apply this target's sanity effect. During a vigil a candle restores sanity only when Core
        /// VigilState.CanLightLantern allows the lamp (not already lit, under VigilRules.LampsPerNight), as in the web.
        /// </summary>
        public bool AllowsSanityEffect(InteractionTarget target)
        {
            if (target == null || target.kind != InteractionKind.Candle || Session.Vigil == null || !Session.Vigil.IsLocked) return true;
            return Session.Vigil.CanLightLantern(target.locationId);
        }

        // While a vigil runs (VigilDirector starts it) clue and lantern events are forwarded by location id. Core decides what counts:
        // VigilRules.CountsAsClue for clues, VigilState.LightLantern for the lamp cap (AllowsSanityEffect gates the restore).
        // The sanity is published after every interaction, so a dip caused by a door or a refused candle is never missed.
        private void OnInteractedTarget(InteractionTarget target)
        {
            if (target == null || Session.Vigil == null || director == null) return;
            ProgressionUpdate update = null;
            if (target.kind == InteractionKind.Candle) Session.RecordVigilLantern(target.locationId, out update);
            else if (VigilRules.CountsAsClue(target.kind)) Session.RecordVigilClue(target.locationId, out update);
            Publish(update);
            Publish(Session.RecordVigilSanity(VigilRules.SanityPoints(director.Sanity.Value)));
        }

        private void OnOmenCrossed(DreadEvent e) { if (e.Rising) Publish(Session.RecordOmenTier(e.Tier)); }

        /// <summary>Persists newly unlocked ids and raises <see cref="Unlocked"/>. Does nothing for an empty update.</summary>
        public void Publish(ProgressionUpdate update)
        {
            if (update == null || !update.Any) return;
            PlayerPrefs.SetString(CodexPrefsKey, ProgressionSession.SerializeIds(Session.UnlockedCodexIds));
            PlayerPrefs.SetString(AchievementsPrefsKey, ProgressionSession.SerializeIds(Session.EarnedAchievementIds));
            PlayerPrefs.Save();
            if (Unlocked != null) Unlocked(update);
        }
    }
}
