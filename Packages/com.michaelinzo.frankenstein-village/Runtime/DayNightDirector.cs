using System;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin owner of the village clock. Ticks are Core GameClock minutes (one real second is one village minute by default, as on the web),
    /// starting at Core GameClock.SessionStartTick. Light, fog and ambient follow Core GameClock.DaylightPercent between a night look and a day look
    /// set in the Inspector; the sun's elevation follows the same percent. Phase rules (watch hours, dawn) stay in Core VigilRules and GameClock.
    /// Compile checked against original stubs only; runtime behaviour is Unverified in Unity.
    /// </summary>
    public sealed class DayNightDirector : MonoBehaviour
    {
        public const float NightSunElevation = -6f;
        public const float DaySunElevation = 55f;

        public Light sun;
        [Tooltip("Village minutes per real second. 1 matches the web demo.")]
        [Min(0f)] public float minutesPerSecond = 1f;
        [Tooltip("Clock tick at Play. Core GameClock.SessionStartTick is the heart of dusk.")]
        public int startTick = GameClock.SessionStartTick;
        public bool driveFog = true;

        [Header("Night look")]
        public Color nightLight = new Color(0.34f, 0.4f, 0.62f);
        public float nightIntensity = 0.25f;
        public Color nightFog = new Color(0.07f, 0.08f, 0.13f);
        public Color nightAmbient = new Color(0.1f, 0.11f, 0.17f);

        [Header("Day look (overcast)")]
        public Color dayLight = new Color(1f, 0.92f, 0.8f);
        public float dayIntensity = 1.6f;
        public Color dayFog = new Color(0.46f, 0.52f, 0.56f);
        public Color dayAmbient = new Color(0.42f, 0.45f, 0.5f);

        [Tooltip("Fog density at night and by day. Dawn and dusk sit between, following daylight.")]
        public float nightFogDensity = 0.03f;
        public float dayFogDensity = 0.012f;

        /// <summary>Raised when the Core phase changes (dawn, day, dusk, night).</summary>
        public event Action<DayPhase> PhaseChanged;

        private double _minutes;
        private DayPhase _phase;
        private bool _started;

        /// <summary>The whole-minute Core tick. Rules read this, never the fractional clock.</summary>
        public int Tick { get { return (int)Math.Floor(_minutes); } }
        public DayPhase Phase { get { return GameClock.PhaseAt(Tick); } }
        public bool LanternsLit { get { return GameClock.LanternsLit(Tick); } }
        /// <summary>0..1 daylight, from Core GameClock.DaylightPercent.</summary>
        public float Daylight01 { get { return GameClock.DaylightPercent(Tick) / (float)GameClock.FullDaylightPercent; } }

        private void Start()
        {
            _minutes = startTick;
            _phase = Phase;
            _started = true;
            Apply();
        }

        private void Update()
        {
            if (!_started) return;
            _minutes += Time.deltaTime * minutesPerSecond;
            Apply();
        }

        /// <summary>Runs the clock forward (Endure the night uses this to reach dawn). Negative values are ignored.</summary>
        public void Advance(int minutes)
        {
            if (minutes <= 0) return;
            _minutes += minutes;
            Apply();
        }

        private void Apply()
        {
            float day = Daylight01;
            if (sun != null)
            {
                sun.color = Color.Lerp(nightLight, dayLight, day);
                sun.intensity = Mathf.Lerp(nightIntensity, dayIntensity, day);
                sun.transform.rotation = Quaternion.Euler(Mathf.Lerp(NightSunElevation, DaySunElevation, day), -30f, 0f);
            }
            RenderSettings.ambientLight = Color.Lerp(nightAmbient, dayAmbient, day);
            if (driveFog)
            {
                RenderSettings.fog = true;
                RenderSettings.fogColor = Color.Lerp(nightFog, dayFog, day);
                RenderSettings.fogDensity = Mathf.Lerp(nightFogDensity, dayFogDensity, day);
            }
            var phase = Phase;
            if (phase != _phase)
            {
                _phase = phase;
                if (PhaseChanged != null) PhaseChanged(phase);
            }
        }
    }
}
