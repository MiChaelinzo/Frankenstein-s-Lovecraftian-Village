using System;
using System.Collections.Generic;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin MonoBehaviour: asks Core for the village dressing (VillageDressing.Compose) and the street surfaces (VillageStreets.Surfaces)
    /// for the layout of a VillageBuilder, then instantiates one prefab per item and one flat slab per street rectangle. No rules live here.
    /// Core measures the dressing in metres on a VillageDressing.Cell grid, so positions are scaled by builder.cellSize / Cell to stay aligned
    /// with the builder's layout. Kinds without a prefab are skipped and counted, never replaced by guesses.
    /// UNVERIFIED in Unity: compile checked against stubs only. The yaw sign convention (Core radians about the vertical axis versus Unity degrees) is unconfirmed.
    /// </summary>
    public sealed class VillageDressingPlacer : MonoBehaviour
    {
        public VillageBuilder village;
        [Tooltip("Metres above the ground plane for the street slabs, so they do not z-fight with it.")]
        public float streetLift = 0.02f;
        [Tooltip("Slab thickness in metres.")]
        public float streetThickness = 0.04f;
        public Color streetColor = new Color(0.16f, 0.15f, 0.14f);

        /// <summary>Items placed by the last Place call.</summary>
        public int PlacedCount { get; private set; }
        /// <summary>Item kinds that had no prefab in the last Place call.</summary>
        public IReadOnlyCollection<string> MissingKinds { get { return _missing; } }

        private readonly HashSet<string> _missing = new HashSet<string>();

        /// <summary>Places dressing and streets. prefabFor maps a mesh kind (for example "barrel") to its prefab, or null when none exists.</summary>
        public void Place(Func<string, GameObject> prefabFor)
        {
            if (village == null || village.Layout == null) { Debug.LogWarning("VillageDressingPlacer: no built village to dress."); return; }
            PlacedCount = 0;
            _missing.Clear();
            float ratio = village.cellSize / (float)VillageDressing.Cell;
            foreach (var item in VillageDressing.Compose(village.seed, village.width, village.depth, village.Layout))
            {
                var prefab = prefabFor(item.Kind);
                if (prefab == null) { _missing.Add(item.Kind); continue; }
                var position = village.transform.position + new Vector3((float)item.X * ratio, (float)item.Y, (float)item.Z * ratio);
                var instance = Instantiate(prefab, position, Quaternion.Euler(0f, (float)item.Yaw * Mathf.Rad2Deg, 0f), transform);
                instance.transform.localScale = Vector3.one * (float)item.Scale;
                PlacedCount++;
            }
            foreach (var r in VillageStreets.Surfaces(village.width, village.depth, village.cellSize))
                AddStreetSlab((float)r[0], (float)r[1], (float)r[2], (float)r[3]);
            if (_missing.Count > 0) Debug.LogWarning("[Frankenstein] Dressing kinds without a prefab: " + string.Join(", ", _missing));
        }

        private void AddStreetSlab(float x0, float z0, float x1, float z1)
        {
            var slab = GameObject.CreatePrimitive(PrimitiveType.Cube);
            slab.name = "Street";
            slab.transform.SetParent(transform, false);
            slab.transform.position = village.transform.position + new Vector3((x0 + x1) * 0.5f, streetLift, (z0 + z1) * 0.5f);
            slab.transform.localScale = new Vector3(x1 - x0, streetThickness, z1 - z0);
            var renderer = slab.GetComponent<Renderer>();
            if (renderer != null && renderer.sharedMaterial != null) renderer.sharedMaterial.color = streetColor;
        }
    }
}
