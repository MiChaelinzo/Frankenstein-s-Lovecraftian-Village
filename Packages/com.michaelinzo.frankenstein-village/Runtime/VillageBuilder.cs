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
        public int pieceCount = 80; // the web demo before round 23 (24x24 grid). The web city is 36x36 with 180 pieces and city on (VillageDistricts.CityGrid, CityPieces)
        [Tooltip("Use the chunked city layout with districts (VillageLayoutGenerator.GenerateCity), as the web demo does since round 23.")]
        public bool city = false;
        public int seed = 1818; // Frankenstein was published in 1818
        public float cellSize = 6f;
        [Tooltip("Build a plain block for catalog ids that have no prefab bound.")]
        public bool primitiveFallback = true;
        [Tooltip("Build automatically on Start. The scene builder turns this off and calls Build in the editor.")]
        public bool buildOnStart = true;
        [Tooltip("Optional Data/names.json. When set, every building gets its seeded name (Core VillageNames) in prompts and narration.")]
        public TextAsset namesData;

        private List<PlacedPiece> _layout;

        /// <summary>The Core layout for the current settings. Deterministic, so a village built in the editor and this list agree at runtime.</summary>
        public List<PlacedPiece> Layout
        {
            get
            {
                if (_layout == null && catalog != null) _layout = Generate(catalog.ToCatalog());
                return _layout;
            }
        }

        private List<PlacedPiece> Generate(PrefabCatalog pieces)
        {
            return city ? VillageLayoutGenerator.GenerateCity(pieces, width, depth, pieceCount, seed) : VillageLayoutGenerator.Generate(pieces, width, depth, pieceCount, seed);
        }

        /// <summary>The seeded name of the layout piece at an index (the same name the web demo shows), or null without names data or for a kind with no words.</summary>
        public LocalizedName NameAt(int index)
        {
            var names = Names();
            return names != null && Layout != null && index >= 0 && index < names.Count ? names[index] : null;
        }

        private List<LocalizedName> _names;

        private List<LocalizedName> Names()
        {
            if (_names == null && namesData != null && Layout != null)
                _names = VillageNames.Assign(NameLibrary.Parse(namesData.text), seed, width, depth, Layout);
            return _names;
        }

        /// <summary>World position of a cell coordinate (fractional cells allowed), on the ground.</summary>
        public Vector3 CellToWorld(double x, double z) { return transform.position + new Vector3((float)x * cellSize, 0f, (float)z * cellSize); }

        private void Start() { if (buildOnStart) Build(); }

        [ContextMenu("Build Village")]
        public void Build()
        {
            if (catalog == null) { Debug.LogWarning("VillageBuilder: no catalog assigned."); return; }
            var pieces = catalog.ToCatalog();
            var layout = _layout = Generate(pieces);
            _names = null;
            var names = Names();
            for (int i = 0; i < layout.Count; i++)
            {
                var p = layout[i];
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
                Tag(instance, p.Id, entry, names != null ? names[i] : null);
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

        private static void Tag(GameObject instance, string id, CatalogEntry entry, LocalizedName name)
        {
            var target = instance.AddComponent<InteractionTarget>();
            target.locationId = id;
            if (name != null) { target.displayNameEn = name.Get("en"); target.displayNameFr = name.Get("fr"); instance.name = name.Get("en"); }
            target.kind = InteractionRules.KindForCategory(entry != null ? entry.category : null);
            if (target.kind != InteractionKind.Door) return;
            var door = instance.AddComponent<DlnkDoorOmenBridge>();
            door.buildingId = id;
            target.door = door;
        }
    }
}
