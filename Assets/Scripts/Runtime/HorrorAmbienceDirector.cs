using System;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>Maps sanity to dread, drives audio volume and (optionally) HDRP volume blending and AI narration.</summary>
    public sealed class HorrorAmbienceDirector : MonoBehaviour
    {
        public AudioSource ambienceLoop;
        public DreadVolumeBlender volumeBlender;
        public float sanityDrainPerSecond = 0.5f;
        [Tooltip("Optional HTTP endpoint for AI narration. Empty keeps the offline narrator.")]
        public string narrationEndpoint = "";

        public SanityModel Sanity { get; } = new SanityModel();
        public INarrationProvider Narration { get; set; } = new StaticNarrationProvider();

        /// <summary>Raised when dread crosses an omen threshold (rising, or falling past hysteresis).</summary>
        public event Action<DreadEvent> OmenCrossed;

        private readonly DreadEventTracker _events = new DreadEventTracker();

        private void Awake()
        {
            if (!string.IsNullOrEmpty(narrationEndpoint))
                Narration = new SafeNarrationProvider(new HttpNarrationProvider(narrationEndpoint), new StaticNarrationProvider());
        }

        private void Update()
        {
            Sanity.Apply(-sanityDrainPerSecond * Time.deltaTime);
            if (ambienceLoop != null) ambienceLoop.volume = 0.2f + 0.8f * Sanity.Dread;
            if (volumeBlender != null) volumeBlender.Apply(Sanity.Dread);
            foreach (var e in _events.Update(Sanity.Dread)) OmenCrossed?.Invoke(e);
        }

        public string Describe(string locationId) { return Narration.Narrate(locationId, Sanity.Dread); }
    }
}
