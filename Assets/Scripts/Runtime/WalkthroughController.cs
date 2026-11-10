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
    /// </summary>
    public sealed class WalkthroughController : MonoBehaviour
    {
        public HorrorAmbienceDirector director;
        public int seed = 1818;
        [Range(CampaignGenerator.MinNights, CampaignGenerator.MaxNights)]
        public int nights = CampaignGenerator.DefaultNights;

        public Campaign Campaign { get; private set; }
        public int NightIndex { get; private set; }
        public CampaignNight CurrentNight => Campaign.Nights[NightIndex];

        /// <summary>Raised after a night is applied, with the night's rumor available on the argument.</summary>
        public event Action<CampaignNight> NightStarted;

        private void Start()
        {
            Campaign = CampaignGenerator.Generate(seed, nights);
            Apply(0);
        }

        public void NextNight() { Apply(NightIndex + 1); }
        public void PreviousNight() { Apply(NightIndex - 1); }

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
