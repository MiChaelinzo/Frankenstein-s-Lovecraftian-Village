namespace Frankenstein.Runtime
{
    /// <summary>
    /// Implement this on your own component to receive Core decisions for one building. It lets you
    /// call whatever a third party Town Manager or Building Control exposes without this project
    /// referencing those types.
    /// </summary>
    public interface IBuildingDetailTarget
    {
        /// <summary>Detail level 0..3 (3 = full detail).</summary>
        void SetDetailLevel(int level);

        /// <summary>Show or hide one floor (0 = ground).</summary>
        void SetFloorVisible(int floor, bool visible);
    }
}
