using System.Collections.Generic;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    [CreateAssetMenu(menuName = "Frankenstein/Village Catalog")]
    public sealed class VillageCatalogAsset : ScriptableObject
    {
        [System.Serializable]
        public sealed class Binding
        {
            public CatalogEntry entry;
            public GameObject prefab; // assign from your owned Lovecraftian Village pack
        }

        [System.Serializable]
        private sealed class CatalogFile { public List<CatalogEntry> entries = new List<CatalogEntry>(); }

        public List<Binding> bindings = new List<Binding>();

        /// <summary>Replaces the bindings with one empty-prefab binding per entry in the catalog JSON (the file shipped in Data/).</summary>
        public void LoadFromJson(string json)
        {
            bindings.Clear();
            var file = JsonUtility.FromJson<CatalogFile>(json);
            if (file == null || file.entries == null) { Debug.LogWarning("VillageCatalogAsset: catalog JSON has no entries."); return; }
            foreach (var entry in file.entries) bindings.Add(new Binding { entry = entry });
        }

        public PrefabCatalog ToCatalog()
        {
            var list = new List<CatalogEntry>();
            foreach (var b in bindings) list.Add(b.entry);
            return new PrefabCatalog(list);
        }

        public GameObject PrefabFor(string id)
        {
            foreach (var b in bindings)
                if (b.entry != null && b.entry.id == id) return b.prefab;
            return null;
        }
    }
}
