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

        [Serializable] public sealed class AggregateEvent : UnityEvent<float, int[]> { }
        [Tooltip("Raised with (mean level, count of buildings at each level 0..3) when the aggregate changes.")]
        public AggregateEvent onAggregateChanged = new AggregateEvent();

        /// <summary>Mean detail level over all buildings after the last Apply.</summary>
        public float MeanLevel { get; private set; }
        /// <summary>Number of buildings at each level 0..3 after the last Apply.</summary>
        public int[] LevelCounts { get; } = new int[DreadBuildingPolicy.MaxDetail + 1];

        private int _lastGlobal = -1;
        private float _lastMean = -1f;
        private readonly int[] _lastCounts = { -1, -1, -1, -1 };
        private readonly List<int> _levels = new List<int>();

        /// <summary>Call every frame or on change with SanityModel.Dread; only changes raise events.</summary>
        public void Apply(float dread)
        {
            _levels.Clear();
            foreach (var b in buildings)
            {
                if (b == null) continue;
                int level = DreadBuildingPolicy.DetailLevel(dread, b.buildingId, seed);
                _levels.Add(level);
                if (level == b.lastLevel) continue;
                b.lastLevel = level;
                b.onDetailChanged.Invoke(level);
                onBuildingDetailChanged.Invoke(b.buildingId, level);
                var t = b.target as IBuildingDetailTarget;
                if (t != null) t.SetDetailLevel(level);
            }
            var summary = DreadBuildingPolicy.Summarize(_levels);
            if (summary.Best != _lastGlobal && buildings.Count > 0)
            {
                _lastGlobal = summary.Best;
                onGlobalDetailChanged.Invoke(summary.Best);
            }
            MeanLevel = summary.Mean;
            Array.Copy(summary.LevelCounts, LevelCounts, LevelCounts.Length);
            bool changed = !Mathf.Approximately(MeanLevel, _lastMean);
            for (int i = 0; i < _lastCounts.Length && !changed; i++) changed = LevelCounts[i] != _lastCounts[i];
            if (summary.Count > 0 && changed)
            {
                _lastMean = MeanLevel;
                Array.Copy(LevelCounts, _lastCounts, _lastCounts.Length);
                onAggregateChanged.Invoke(MeanLevel, (int[])LevelCounts.Clone());
            }
        }
    }
}
