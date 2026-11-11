using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// ScriptableObject mirror of the ritual progress, so designers can inspect or pre-seed it in the editor.
    /// Holds only plain data; all logic lives in Core (RitualChain, RitualSaveState). Code-complete, unverified in Unity.
    /// </summary>
    [CreateAssetMenu(menuName = "Frankenstein/Ritual State")]
    public sealed class RitualStateAsset : ScriptableObject
    {
        public int seed = 1818;
        [Min(1)] public int nightNumber = 1;
        [Tooltip("Effective stage, 0-based. -1 means the ritual has not begun.")]
        public int stage = -1;
        [Tooltip("Read-only mirror of the last pace: behind, on or ahead.")]
        public string pace = "on";

        public RitualSaveState ToSave() { return new RitualSaveState { Seed = seed, NightNumber = nightNumber, Stage = stage }; }

        public void Apply(RitualSaveState state, int stageCount)
        {
            if (state == null) return;
            var c = state.Clamped(stageCount);
            seed = c.Seed;
            nightNumber = c.NightNumber;
            stage = c.Stage;
        }

        public void Apply(RitualProgress progress)
        {
            if (progress == null) return;
            stage = progress.Effective;
            pace = progress.Pace;
        }
    }
}
