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
        /// <summary>CharacterController radius for the explorer, a shoulder-width body.</summary>
        public const float BodyRadius = 0.3f;
    }
}
