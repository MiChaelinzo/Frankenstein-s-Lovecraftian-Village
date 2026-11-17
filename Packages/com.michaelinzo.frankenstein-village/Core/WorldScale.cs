namespace Frankenstein.Core
{
    /// <summary>
    /// Real-world scale standard in metres: the one set of heights that the web view, the Blender meshes (Data/village_shapes.json "scale" block)
    /// and the Unity mesh generator, player and villagers agree on. Meshes are authored at 1 unit = 1 m and placed at scale 1.
    /// The JS mirror is web/src/world-scale.js; tests in both languages compare every value with the shapes data.
    /// </summary>
    public static class WorldScale
    {
        public const float EyeHeight = 1.6f;
        public const float PersonHeight = 1.7f;
        public const float DoorHeight = 2.0f;
        public const float EavesMin = 2.4f;
        public const float EavesMax = 3.2f;
        public const float LampMin = 3.0f;
        public const float LampMax = 3.6f;
        public const float TreeMin = 3.5f;
        /// <summary>One storey of a house, floor to floor. Village houses are <see cref="HouseStoreys"/> storeys with the upper floor overhanging.</summary>
        public const float StoreyHeight = 3.0f;
        public const int HouseStoreys = 2;
        /// <summary>A village house ridge stands between these heights (about 3.5 to 6 times a person).</summary>
        public const float RidgeMin = 6.0f;
        public const float RidgeMax = 10.0f;
        /// <summary>A village house covers at least this many layout cells along both axes (catalog footprints), so its mass fills a block, not a cell.</summary>
        public const int HouseFootprintMinCells = 2;
        /// <summary>Eye height setting range of the first-person view, metres. The default is <see cref="EyeHeight"/>.</summary>
        public const float EyeMin = 1.5f;
        public const float EyeMax = 1.8f;
        /// <summary>Vertical field of view range of the first-person view, degrees. Narrower reads as a tunnel, wider stretches the street.</summary>
        public const float FovMinDegrees = 55f;
        public const float FovMaxDegrees = 75f;
        public const float FovDefaultDegrees = 64f;
        /// <summary>CharacterController radius for the explorer: shoulders plus a hand lantern held out to one side, so the camera never sits in a wall face.</summary>
        public const float BodyRadius = 0.45f;
        /// <summary>Body radius of a villager (no lantern held out): lane walkers clear props by this much and the Unity villager capsule uses it.</summary>
        public const float VillagerRadius = 0.35f;
        /// <summary>Metres added to every side of a solid prop's collision box, because eaves, thatch and branches overhang the measured footprint.</summary>
        public const float OverhangClearance = 0.15f;
    }
}
