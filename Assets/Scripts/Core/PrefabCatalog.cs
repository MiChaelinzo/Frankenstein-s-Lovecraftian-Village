using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    [Serializable]
    public sealed class CatalogEntry
    {
        public string id;
        public string category;
        public int weight = 1;
        public int footprintX = 1;
        public int footprintZ = 1;
        public int horror;
        /// <summary>Optional real prefab name (names only) this id should bind to. Empty when absent.</summary>
        public string prefabHint;
    }

    /// <summary>Pure C# catalog of stitchable village pieces, looked up by string id.</summary>
    public sealed class PrefabCatalog
    {
        private readonly Dictionary<string, CatalogEntry> _byId = new Dictionary<string, CatalogEntry>();
        private readonly List<CatalogEntry> _entries = new List<CatalogEntry>();

        public PrefabCatalog(IEnumerable<CatalogEntry> entries)
        {
            foreach (var e in entries)
            {
                if (e == null || string.IsNullOrEmpty(e.id)) continue;
                if (e.weight <= 0 || e.footprintX <= 0 || e.footprintZ <= 0) continue;
                if (_byId.ContainsKey(e.id)) continue;
                _byId[e.id] = e;
                _entries.Add(e);
            }
        }

        public IReadOnlyList<CatalogEntry> Entries => _entries;
        public int TotalWeight { get { int t = 0; foreach (var e in _entries) t += e.weight; return t; } }
        public bool TryGet(string id, out CatalogEntry entry) => _byId.TryGetValue(id, out entry);
        public bool Contains(string id) => _byId.ContainsKey(id);

        /// <summary>Weighted pick; roll must be in [0, TotalWeight).</summary>
        public CatalogEntry PickByWeight(int roll)
        {
            foreach (var e in _entries)
            {
                if (roll < e.weight) return e;
                roll -= e.weight;
            }
            return _entries.Count > 0 ? _entries[_entries.Count - 1] : null;
        }
    }
}
