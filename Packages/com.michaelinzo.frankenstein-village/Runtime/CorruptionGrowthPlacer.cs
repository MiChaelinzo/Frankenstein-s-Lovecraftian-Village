using System;
using System.Collections.Generic;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin MonoBehaviour: asks Core (CorruptionGrowth.Grow) which tentacle trees, fungi and spires stand at this dread and night, and instantiates
    /// the prefab assigned to each kind. The prefab slots are optional and empty in the repository: the author can drag in prefabs from their own
    /// imported Alien Terrain Pack (or any look-alike), and kinds without a prefab are skipped and counted. No rule lives here and no pack asset is committed.
    /// Positions are Core metres on a VillageDressing.Cell grid, scaled like VillageDressingPlacer. Call Refresh whenever dread or the night changes; it replaces the previous set.
    /// UNVERIFIED in Unity: compile checked against stubs only.
    /// </summary>
    public sealed class CorruptionGrowthPlacer : MonoBehaviour
    {
        [Serializable]
        public sealed class KindPrefab
        {
            [Tooltip("A Core corruption kind: tentacle_tree, tentacle_sapling, fungus_tall, fungus_cluster, fungus_shelf, spire_horn or spire_ribbed.")]
            public string kind;
            public GameObject prefab;
        }

        public VillageBuilder village;
        [Tooltip("Optional prefab per corruption kind (for example imported Alien Terrain Pack prefabs). Empty slots place nothing.")]
        public List<KindPrefab> prefabs = new List<KindPrefab>();

        /// <summary>Items placed by the last Refresh.</summary>
        public int PlacedCount { get; private set; }
        /// <summary>Kinds that stood at the last level but had no prefab.</summary>
        public IReadOnlyCollection<string> MissingKinds { get { return _missing; } }

        private readonly HashSet<string> _missing = new HashSet<string>();
        private readonly List<GameObject> _placed = new List<GameObject>();

        public void Refresh(double dread, int night)
        {
            if (village == null || village.Layout == null) { Debug.LogWarning("CorruptionGrowthPlacer: no built village."); return; }
            foreach (var old in _placed) if (old != null) Destroy(old);
            _placed.Clear();
            _missing.Clear();
            float ratio = village.cellSize / (float)VillageDressing.Cell;
            foreach (var item in CorruptionGrowth.Grow(village.seed, village.width, village.depth, dread, night))
            {
                var prefab = PrefabFor(item.Kind);
                if (prefab == null) { _missing.Add(item.Kind); continue; }
                var position = village.transform.position + new Vector3((float)item.X * ratio, (float)item.Y, (float)item.Z * ratio);
                var instance = Instantiate(prefab, position, Quaternion.Euler(0f, (float)item.Yaw * Mathf.Rad2Deg, 0f), transform);
                instance.transform.localScale = Vector3.one * (float)item.Scale;
                _placed.Add(instance);
            }
            PlacedCount = _placed.Count;
        }

        private GameObject PrefabFor(string kind)
        {
            foreach (var entry in prefabs) if (entry != null && entry.kind == kind) return entry.prefab;
            return null;
        }
    }
}
