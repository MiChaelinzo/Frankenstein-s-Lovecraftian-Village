using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>Maps sanity to dread and drives audio volume. Extend with HDRP Volume fog/vignette blending.</summary>
    public sealed class HorrorAmbienceDirector : MonoBehaviour
    {
        public AudioSource ambienceLoop;
        public float sanityDrainPerSecond = 0.5f;

        public SanityModel Sanity { get; } = new SanityModel();
        public INarrationProvider Narration { get; set; } = new StaticNarrationProvider();

        private void Update()
        {
            Sanity.Apply(-sanityDrainPerSecond * Time.deltaTime);
            if (ambienceLoop != null) ambienceLoop.volume = 0.2f + 0.8f * Sanity.Dread;
        }

        public string Describe(string locationId) { return Narration.Narrate(locationId, Sanity.Dread); }
    }
}
