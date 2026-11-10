using Frankenstein.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Blends two global post-processing Volumes by dread. Author a calm Volume and a dread Volume
    /// (HDRP Fog, Vignette, Color Adjustments, Film Grain) with the same overrides enabled; this
    /// component only moves their weights, so it needs no HDRP-specific types and compiles anywhere
    /// the render-pipeline core package is present.
    /// </summary>
    public sealed class DreadVolumeBlender : MonoBehaviour
    {
        public Volume calmVolume;
        public Volume dreadVolume;
        [Tooltip("Seconds to ease toward the target weight.")]
        public float smoothing = 0.5f;

        private float _current;

        /// <summary>Call every frame (HorrorAmbienceDirector does) with SanityModel.Dread.</summary>
        public void Apply(float dread)
        {
            float target = DreadCurve.Weight(dread);
            _current = smoothing <= 0f ? target : Mathf.MoveTowards(_current, target, Time.deltaTime / smoothing);
            if (dreadVolume != null) dreadVolume.weight = _current;
            if (calmVolume != null) calmVolume.weight = 1f - _current;
        }
    }
}
