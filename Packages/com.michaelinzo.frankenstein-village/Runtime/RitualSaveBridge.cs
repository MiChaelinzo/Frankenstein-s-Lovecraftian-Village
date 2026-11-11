using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Bridges RitualSaveState (pure Core DTO) to PlayerPrefs text. Parsing and clamping are tested in Core;
    /// this wrapper only moves the string. Code-complete, unverified in Unity.
    /// </summary>
    public static class RitualSaveBridge
    {
        public const string PrefsKey = "frankenstein.ritual.v1";

        public static void Save(RitualSaveState state)
        {
            if (state == null) return;
            PlayerPrefs.SetString(PrefsKey, state.Serialize());
            PlayerPrefs.Save();
        }

        /// <summary>Returns null when nothing valid is stored. The result is already clamped to stageCount.</summary>
        public static RitualSaveState Load(int stageCount)
        {
            var parsed = RitualSaveState.Parse(PlayerPrefs.GetString(PrefsKey, ""));
            return parsed == null ? null : parsed.Clamped(stageCount);
        }

        public static void Clear() { PlayerPrefs.DeleteKey(PrefsKey); }
    }
}
