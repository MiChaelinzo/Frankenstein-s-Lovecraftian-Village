using System;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Steps a HorrorAmbienceDirector through a seeded campaign: each night sets the starting sanity
    /// from the campaign (sanity = 100 - dread target). Useful for recording the demo video.
    /// Call NextNight or PreviousNight from a UI button, or press . and , with the legacy Input Manager.
    /// Never compiled in the Unity editor; only the Core campaign it calls is covered by tests.
    /// Stepping nights is a sandbox action: it is refused while SandboxLocked (a live vigil), see VigilRules.AllowsSandboxAction.
    /// </summary>
    public sealed class WalkthroughController : MonoBehaviour
    {
        public HorrorAmbienceDirector director;
        public int seed = 1818;
        [Range(CampaignGenerator.MinNights, CampaignGenerator.MaxNights)]
        public int nights = CampaignGenerator.DefaultNights;

        public Campaign Campaign { get; private set; }
        public int NightIndex { get; private set; }
        public CampaignNight CurrentNight => Campaign != null ? Campaign.Nights[NightIndex] : null;

        /// <summary>Raised after a night is applied, with the night's rumor available on the argument.</summary>
        public event Action<CampaignNight> NightStarted;

        private void Start()
        {
            Campaign = CampaignGenerator.Generate(seed, nights);
            Apply(0);
        }

        /// <summary>Raised with a VigilRules.SandboxAction id when a sandbox action is refused because a vigil is live.</summary>
        public event Action<string> ActionRefused;

        /// <summary>Set by VigilDirector while a vigil is live. Core VigilRules.AllowsSandboxAction decides what that forbids.</summary>
        public bool SandboxLocked { get; set; }

        public void NextNight() { if (Allowed()) Apply(NightIndex + 1); }
        public void PreviousNight() { if (Allowed()) Apply(NightIndex - 1); }

        private bool Allowed()
        {
            if (VigilRules.AllowsSandboxAction(SandboxLocked, VigilRules.ActionNightStep)) return true;
            if (ActionRefused != null) ActionRefused(VigilRules.ActionNightStep);
            return false;
        }

        private void Apply(int index)
        {
            if (Campaign == null) return;
            NightIndex = Mathf.Clamp(index, 0, Campaign.Nights.Count - 1);
            if (director != null)
                director.Sanity.Apply(CurrentNight.SanityStart - director.Sanity.Value);
            if (NightStarted != null) NightStarted(CurrentNight);
        }

#if ENABLE_LEGACY_INPUT_MANAGER
        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.Period)) NextNight();
            if (Input.GetKeyDown(KeyCode.Comma)) PreviousNight();
        }
#endif
    }
}
