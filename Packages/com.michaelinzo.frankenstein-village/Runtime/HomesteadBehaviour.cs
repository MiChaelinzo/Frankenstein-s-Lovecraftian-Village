using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin hook for the homestead: it owns Core's Homestead for one village, applies the daily sanity of the animals' moods once a village day and exposes the Core actions
    /// for UI buttons. It holds no rules of its own. Compile-checked only (tests/UnityCompileCheck); it has not been run in Unity.
    /// </summary>
    public sealed class HomesteadBehaviour : MonoBehaviour
    {
        public HorrorAmbienceDirector director;
        public DayNightDirector clock;
        public TextAsset itemData;
        public TextAsset homesteadData;
        public Inventory satchel = new Inventory(ItemRules.PlayerSlots);

        private ItemCatalog _items;
        private Homestead _home;

        public Homestead Home { get { return _home; } }

        /// <summary>Finds the plot beside the lodging house of the given village. The caller supplies the layout and the item world it already built.</summary>
        public void Build(int seed, int gridW, int gridD, System.Collections.Generic.IList<PlacedPiece> layout, ItemWorld world)
        {
            _items = ItemCatalog.Parse(itemData.text);
            var cat = HomesteadCatalog.Parse(homesteadData.text, _items);
            _home = new Homestead(cat, HomesteadPlot.Create(seed, gridW, gridD, layout, world));
        }

        public HomesteadResult Claim() { return _home.Claim(clock.Tick, satchel, _items); }
        public HomesteadResult Plant(int bed, string cropId) { return _home.Plant(bed, cropId, clock.Tick, satchel); }
        public HomesteadResult Harvest(int bed) { return _home.Harvest(bed, clock.Tick, Level(), satchel, _items); }
        public HomesteadResult Feed(string animalId) { return _home.Feed(animalId, clock.Tick, satchel); }

        private int Level() { return CorruptionGrowth.Level(director.Sanity.Dread, 1); }

        private void Update()
        {
            if (_home == null || director == null || clock == null) return;
            int delta = _home.DailySanity(clock.Tick, Level());
            if (delta != 0) director.Sanity.Apply(delta);
        }
    }
}
