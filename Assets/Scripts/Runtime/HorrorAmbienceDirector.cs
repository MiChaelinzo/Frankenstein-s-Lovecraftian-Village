using System;
using System.Collections.Generic;
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
        private readonly List<DreadEvent> _eventBuffer = new List<DreadEvent>(4);

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
            _events.Update(Sanity.Dread, _eventBuffer);
            for (int i = 0; i < _eventBuffer.Count; i++) OmenCrossed?.Invoke(_eventBuffer[i]);
        }

        public string Describe(string locationId) { return Narration.Narrate(locationId, Sanity.Dread); }
    }
}
