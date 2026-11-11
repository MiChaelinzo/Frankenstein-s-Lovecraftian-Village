using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>Thin MonoBehaviour: asks pure C# for a layout, then instantiates prefabs.</summary>
    public sealed class VillageBuilder : MonoBehaviour
    {
        public VillageCatalogAsset catalog;
        public int width = 24;
        public int depth = 24;
        public int pieceCount = 80; // matches the web demo piece count (24x24 grid; use the same seed to compare)
        public int seed = 1818; // Frankenstein was published in 1818
        public float cellSize = 6f;

        private void Start() { Build(); }

        [ContextMenu("Build Village")]
        public void Build()
        {
            if (catalog == null) { Debug.LogWarning("VillageBuilder: no catalog assigned."); return; }
            var layout = VillageLayoutGenerator.Generate(catalog.ToCatalog(), width, depth, pieceCount, seed);
            foreach (var p in layout)
            {
                var prefab = catalog.PrefabFor(p.Id);
                if (prefab == null) continue;
                var pos = transform.position + new Vector3(p.X * cellSize, 0f, p.Z * cellSize);
                Instantiate(prefab, pos, Quaternion.identity, transform);
            }
        }
    }
}
