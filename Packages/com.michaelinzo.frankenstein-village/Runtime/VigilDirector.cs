using System;
using Frankenstein.Core;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin driver for the Vigil. On Play (startOnPlay) it starts Core's VigilState through ProgressionTracker.Session, applies the
    /// Core night creep, shows the Core objective line and an Endure action (key E when nothing is in front of the crosshair, or the
    /// HUD button) that is offered only while VigilState.CanEndureNight, and raises Finished with the Core VigilOutcome.
    /// While the vigil is live it locks sandbox actions (WalkthroughController.SandboxLocked, Core VigilRules.AllowsSandboxAction).
    /// Every number and word comes from Core (VigilRules, VigilState, VigilStrings). Compile checked against original stubs only;
    /// runtime behaviour is Unverified in Unity.
    /// </summary>
    public sealed class VigilDirector : MonoBehaviour
    {
        public const float SampleSeconds = 0.5f;

        public HorrorAmbienceDirector director;
        public ProgressionTracker tracker;
        public WalkthroughController walkthrough;
        public RitualDirector ritualDirector;
        public InteractionRaycaster interactor;
        public DreadHud hud;
        [Tooltip("Start the vigil as soon as the village ritual is ready. Off keeps free exploration with no sandbox lock.")]
        public bool startOnPlay = true;
        [Tooltip("Vigil wording language, a key of Core VigilStrings (en or fr). Unknown values fall back to English.")]
        public string language = VigilStrings.DefaultLanguage;

        /// <summary>Raised once when the vigil ends, with the Core outcome.</summary>
        public event Action<VigilOutcome> Finished;

        private bool _announced;
        private bool _endureOffered;
        private float _nextSample;

        private VigilState Vigil { get { return tracker != null ? tracker.Session.Vigil : null; } }

        /// <summary>True while the vigil is begun and not finished. Core VigilState.IsLocked, the same value the web passes to VigilRules.AllowsSandboxAction.</summary>
        public bool Locked { get { return Vigil != null && Vigil.IsLocked; } }

        private void OnEnable()
        {
            if (walkthrough != null) walkthrough.ActionRefused += OnActionRefused;
            if (hud != null) hud.EndureRequested += OnEndurePressed;
        }

        private void OnDisable()
        {
            if (walkthrough != null) walkthrough.ActionRefused -= OnActionRefused;
            if (hud != null) hud.EndureRequested -= OnEndurePressed;
        }

        private void Update()
        {
            if (tracker == null || director == null) return;
            if (Vigil == null)
            {
                // A new ritual seed in the tracker drops the vigil (Core ProgressionSession.SetRitual); release the lock until a new one begins.
                if (walkthrough != null) walkthrough.SandboxLocked = false;
                if (startOnPlay) TryBegin();
                return;
            }
            if (walkthrough != null) walkthrough.SandboxLocked = Locked;

            if (Locked)
            {
                if (Time.time >= _nextSample)
                {
                    _nextSample = Time.time + SampleSeconds;
                    tracker.Publish(tracker.Session.RecordVigilSanity(VigilRules.SanityPoints(director.Sanity.Value)));
                }
                var keys = Keyboard.current;
                bool nothingFocused = interactor == null || interactor.Focus == null;
                if (keys != null && nothingFocused && keys.eKey.wasPressedThisFrame) Endure();
            }
            if (Vigil.IsFinished) Announce(Vigil);
            else Refresh(Vigil);
        }

        /// <summary>Starts the vigil once the walkthrough campaign and the tracker's ritual exist. Returns true when it started.</summary>
        public bool TryBegin()
        {
            if (walkthrough == null || walkthrough.Campaign == null || !tracker.RitualBound) return false;
            tracker.Session.StartVigil(walkthrough.Campaign);
            Vigil.Begin(); // Unity has no sandbox to tweak before play: starting the vigil is the first action (the web begins on its first clue).
            _announced = false;
            _endureOffered = false;
            ApplyNightCreep();
            return true;
        }

        /// <summary>Ends the night when Core allows it, then starts the next night's sanity and creep. Returns false when refused.</summary>
        public bool Endure()
        {
            var vigil = Vigil;
            if (vigil == null || !vigil.CanEndureNight) return false;
            ProgressionUpdate update;
            int next = tracker.Session.EndureVigilNight(VigilRules.SanityPoints(director.Sanity.Value), out update);
            tracker.Publish(update);
            if (next < 0) return false;
            _endureOffered = false;
            if (!vigil.IsFinished)
            {
                director.Sanity.Apply(next - director.Sanity.Value);
                ApplyNightCreep();
                if (hud != null) hud.ShowMessage(VigilStrings.Format(VigilStrings.Template(language, "vigil.night"), "night", vigil.Night));
            }
            return true;
        }

        private void ApplyNightCreep()
        {
            int creep = VigilRules.NightCreep(Vigil.Night);
            director.Sanity.Apply(-creep);
            tracker.Publish(tracker.Session.RecordVigilSanity(VigilRules.SanityPoints(director.Sanity.Value)));
            if (hud != null)
                hud.ShowMessage(VigilStrings.Format(VigilStrings.Template(language, "vigil.creep"), "n", creep, "night", Vigil.Night));
        }

        private void Refresh(VigilState vigil)
        {
            if (hud == null) return;
            hud.SetObjective(VigilStrings.Objective(language, vigil));
            bool canEndure = vigil.CanEndureNight;
            string key = vigil.Night >= vigil.NightsTotal ? "vigil.finish" : "vigil.endure";
            hud.SetEndure(canEndure, VigilStrings.Template(language, key));
            if (canEndure && !_endureOffered) hud.ShowMessage(VigilStrings.Template(language, "vigil.endure.ready"));
            _endureOffered = canEndure;
        }

        private void Announce(VigilState vigil)
        {
            if (_announced) return;
            _announced = true;
            var outcome = tracker.VigilOutcome;
            if (outcome == null) return;
            if (hud != null)
            {
                int stageCount = ritualDirector != null && ritualDirector.Ritual != null ? ritualDirector.Ritual.Stages.Count : 0;
                hud.SetEndure(false, "");
                hud.ShowEnding(VigilStrings.Title(language, outcome.EndingId), VigilStrings.EndingBody(language, vigil, outcome, stageCount));
            }
            if (walkthrough != null) walkthrough.SandboxLocked = false;
            if (Finished != null) Finished(outcome);
        }

        private void OnEndurePressed() { Endure(); }

        private void OnActionRefused(string actionId)
        {
            if (hud != null) hud.ShowMessage(VigilStrings.Template(language, "vigil.lock"));
        }
    }
}
