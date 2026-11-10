using System;
using System.Collections.Generic;
using Frankenstein.Core;
using UnityEngine;
using UnityEngine.Events;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Town level adapter for the DLNK Myst Village scripts. It owns no DLNK types: wire the
    /// UnityEvents in the inspector to the pack's Town Manager (detail level) or to your own
    /// IBuildingDetailTarget components. See docs/DLNK_INTEGRATION.md for what is confirmed and
    /// what is guessed. Never compiled in the Unity editor; the decisions come from tested Core code.
    /// </summary>
    public sealed class DlnkTownManagerBridge : MonoBehaviour
    {
        [Serializable] public sealed class DetailEvent : UnityEvent<int> { }
        [Serializable] public sealed class BuildingDetailEvent : UnityEvent<string, int> { }

        [Serializable]
        public sealed class BuildingEntry
        {
            public string buildingId = "house_a";
            [Tooltip("Optional: your own component implementing IBuildingDetailTarget.")]
            public MonoBehaviour target;
            [Tooltip("Raised with this building's detail level (0..3) when it changes.")]
            public DetailEvent onDetailChanged = new DetailEvent();
            [NonSerialized] public int lastLevel = -1;
        }

        public int seed = 1818;
        [Tooltip("Raised with the most detailed level any building currently has; wire to a global detail setter.")]
        public DetailEvent onGlobalDetailChanged = new DetailEvent();
        [Tooltip("Raised with (buildingId, level) for every building change; wire to a per-building setter.")]
        public BuildingDetailEvent onBuildingDetailChanged = new BuildingDetailEvent();
        public List<BuildingEntry> buildings = new List<BuildingEntry>();

        private int _lastGlobal = -1;

        /// <summary>Call every frame or on change with SanityModel.Dread; only changes raise events.</summary>
        public void Apply(float dread)
        {
            int best = 0;
            foreach (var b in buildings)
            {
                if (b == null) continue;
                int level = DreadBuildingPolicy.DetailLevel(dread, b.buildingId, seed);
                if (level > best) best = level;
                if (level == b.lastLevel) continue;
                b.lastLevel = level;
                b.onDetailChanged.Invoke(level);
                onBuildingDetailChanged.Invoke(b.buildingId, level);
                var t = b.target as IBuildingDetailTarget;
                if (t != null) t.SetDetailLevel(level);
            }
            if (best != _lastGlobal && buildings.Count > 0)
            {
                _lastGlobal = best;
                onGlobalDetailChanged.Invoke(best);
            }
        }
    }
}
