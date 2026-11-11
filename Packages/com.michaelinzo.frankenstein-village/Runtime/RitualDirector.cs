using Frankenstein.Core;
using UnityEngine;
using UnityEngine.Events;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin MonoBehaviour over RitualChain. Listens to the dread events raised by HorrorAmbienceDirector and the nights started by
    /// WalkthroughController, asks Core for the RitualProgress (night schedule sets a floor, dread can run ahead) and raises
    /// OnStageAdvanced when the effective stage rises. Code-complete, unverified in Unity (not compiled here).
    /// </summary>
    public sealed class RitualDirector : MonoBehaviour
    {
        [System.Serializable] public sealed class StageEvent : UnityEvent<int, string> { }

        public HorrorAmbienceDirector director;
        public WalkthroughController walkthrough;
        [Tooltip("Optional mirror asset updated on every change.")]
        public RitualStateAsset stateAsset;
        public bool restoreSavedStage = false;

        /// <summary>Raised with (stage index, stage name) when the effective stage rises.</summary>
        public StageEvent OnStageAdvanced = new StageEvent();

        public Ritual Ritual { get; private set; }
        public RitualProgress Progress { get; private set; }
        public int NightNumber { get; private set; } = 1;
        private int _lastStage = -1;

        private void OnEnable()
        {
            if (director != null) director.OmenCrossed += OnOmenCrossed;
            if (walkthrough != null) walkthrough.NightStarted += OnNightStarted;
        }

        private void OnDisable()
        {
            if (director != null) director.OmenCrossed -= OnOmenCrossed;
            if (walkthrough != null) walkthrough.NightStarted -= OnNightStarted;
        }

        private void Start()
        {
            if (walkthrough != null && walkthrough.Campaign != null)
            {
                Ritual = RitualChain.Generate(walkthrough.Campaign);
                NightNumber = walkthrough.CurrentNight != null ? walkthrough.CurrentNight.Number : 1;
            }
            if (restoreSavedStage && Ritual != null)
            {
                var saved = RitualSaveBridge.Load(Ritual.Stages.Count);
                if (saved != null && saved.Seed == Ritual.Seed) _lastStage = saved.Stage;
            }
            Refresh();
        }

        private void OnOmenCrossed(DreadEvent e) { Refresh(); }

        private void OnNightStarted(CampaignNight night)
        {
            if (walkthrough != null && walkthrough.Campaign != null && (Ritual == null || Ritual.Seed != walkthrough.Campaign.Seed))
                Ritual = RitualChain.Generate(walkthrough.Campaign);
            NightNumber = night.Number;
            Refresh();
        }

        /// <summary>Recomputes progress from the current night and dread, raises OnStageAdvanced when the stage rises, mirrors state.</summary>
        public void Refresh()
        {
            if (Ritual == null || director == null) return;
            int dreadPercent = DreadThresholds.Percent(director.Sanity.Dread);
            Progress = RitualChain.Progress(Ritual, NightNumber, dreadPercent);
            if (Progress.Effective > _lastStage && Progress.Effective >= 0)
            {
                OnStageAdvanced.Invoke(Progress.Effective, Ritual.Stages[Progress.Effective].Name);
                Save();
            }
            _lastStage = Progress.Effective;
            if (stateAsset != null)
            {
                stateAsset.Apply(Progress);
                stateAsset.Apply(RitualSaveState.From(Ritual, NightNumber, dreadPercent), Ritual.Stages.Count);
            }
        }

        public void Save()
        {
            if (Ritual == null || director == null) return;
            RitualSaveBridge.Save(RitualSaveState.From(Ritual, NightNumber, DreadThresholds.Percent(director.Sanity.Dread)));
        }
    }
}
