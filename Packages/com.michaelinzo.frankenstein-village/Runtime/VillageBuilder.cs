using System.Collections.Generic;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin MonoBehaviour: asks pure C# for a layout, then instantiates prefabs. Pieces without a
    /// bound prefab become plain primitive blocks (when primitiveFallback is on), so the village is
    /// walkable without the third-party pack. Every piece gets an InteractionTarget whose kind comes
    /// from Core (InteractionRules.KindForCategory).
    /// </summary>
    public sealed class VillageBuilder : MonoBehaviour
    {
        public VillageCatalogAsset catalog;
        public int width = 24;
        public int depth = 24;
        public int pieceCount = 80; // matches the web demo piece count (24x24 grid; use the same seed to compare)
        public int seed = 1818; // Frankenstein was published in 1818
        public float cellSize = 6f;
        [Tooltip("Build a plain block for catalog ids that have no prefab bound.")]
        public bool primitiveFallback = true;
        [Tooltip("Build automatically on Start. The scene builder turns this off and calls Build in the editor.")]
        public bool buildOnStart = true;

        private List<PlacedPiece> _layout;

        /// <summary>The Core layout for the current settings. Deterministic, so a village built in the editor and this list agree at runtime.</summary>
        public List<PlacedPiece> Layout
        {
            get
            {
                if (_layout == null && catalog != null) _layout = VillageLayoutGenerator.Generate(catalog.ToCatalog(), width, depth, pieceCount, seed);
                return _layout;
            }
        }

        /// <summary>World position of a cell coordinate (fractional cells allowed), on the ground.</summary>
        public Vector3 CellToWorld(double x, double z) { return transform.position + new Vector3((float)x * cellSize, 0f, (float)z * cellSize); }

        private void Start() { if (buildOnStart) Build(); }

        [ContextMenu("Build Village")]
        public void Build()
        {
            if (catalog == null) { Debug.LogWarning("VillageBuilder: no catalog assigned."); return; }
            var pieces = catalog.ToCatalog();
            var layout = _layout = VillageLayoutGenerator.Generate(pieces, width, depth, pieceCount, seed);
            foreach (var p in layout)
            {
                CatalogEntry entry;
                pieces.TryGet(p.Id, out entry);
                var pos = transform.position + new Vector3(p.X * cellSize, 0f, p.Z * cellSize);
                var prefab = catalog.PrefabFor(p.Id);
                GameObject instance;
                if (prefab != null)
                {
                    instance = Instantiate(prefab, pos, Quaternion.identity, transform);
                    EnsureColliders(instance);
                }
                else if (primitiveFallback)
                {
                    instance = BuildBlock(p, entry, pos);
                }
                else continue;
                Tag(instance, p.Id, entry);
            }
        }

        private GameObject BuildBlock(PlacedPiece piece, CatalogEntry entry, Vector3 pos)
        {
            var block = GameObject.CreatePrimitive(PrimitiveType.Cube);
            block.name = piece.Id;
            block.transform.SetParent(transform, false);
            float height = entry == null ? 2f : entry.category == "Landmark" ? 10f : entry.category == "House" ? 4f : 1.5f;
            block.transform.position = pos + new Vector3(0f, height * 0.5f, 0f);
            block.transform.localScale = new Vector3(piece.SizeX * cellSize * 0.6f, height, piece.SizeZ * cellSize * 0.6f);
            return block;
        }

        private static void EnsureColliders(GameObject instance)
        {
            foreach (var filter in instance.GetComponentsInChildren<MeshFilter>())
            {
                if (filter.gameObject.GetComponent<Collider>() != null) continue;
                filter.gameObject.AddComponent<MeshCollider>().sharedMesh = filter.sharedMesh;
            }
        }

        private static void Tag(GameObject instance, string id, CatalogEntry entry)
        {
            var target = instance.AddComponent<InteractionTarget>();
            target.locationId = id;
            target.kind = InteractionRules.KindForCategory(entry != null ? entry.category : null);
            if (target.kind != InteractionKind.Door) return;
            var door = instance.AddComponent<DlnkDoorOmenBridge>();
            door.buildingId = id;
            target.door = door;
        }
    }
}
