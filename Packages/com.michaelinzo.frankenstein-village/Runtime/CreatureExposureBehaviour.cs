using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin hook for the creatures: it reads Core's CreatureEncounter and the player's position, and hands the sanity drain to the director.
    /// It holds no rules of its own. Compile-checked only (tests/UnityCompileCheck); it has not been run in Unity.
    /// </summary>
    public sealed class CreatureExposureBehaviour : MonoBehaviour
    {
        public HorrorAmbienceDirector director;
        public DayNightDirector clock;
        public Transform player;
        public TextAsset creatureData;
        public Inventory satchel = new Inventory(ItemRules.PlayerSlots);

        private CreatureEncounter _encounter;

        /// <summary>Spawns the creatures for the given village state. The caller supplies the seed, grid, tick, dread and weather it already tracks.</summary>
        public void Build(int seed, int gridW, int gridD, int tick, double dread, string weather)
        {
            var cat = CreatureCatalog.Parse(creatureData.text);
            _encounter = CreatureEncounter.Spawn(seed, gridW, gridD, tick, dread, weather, cat, null);
        }

        private void Update()
        {
            if (_encounter == null || player == null || director == null || clock == null) return;
            var p = player.position;
            var step = _encounter.Step(Time.deltaTime, p.x, p.z, clock.Tick, satchel.Fuel, null);
            if (step.FuelBurn > 0) satchel.BurnFuel(step.FuelBurn);
            if (step.Drain > 0) director.Sanity.Apply((float)-step.Drain);
        }
    }
}
