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

        public List<Binding> bindings = new List<Binding>();

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
