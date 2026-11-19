using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>Marks a collider as something the player can use. The rules live in Core (InteractionRules).</summary>
    public sealed class InteractionTarget : MonoBehaviour
    {
        public InteractionKind kind = InteractionKind.Whisper;
        [Tooltip("Catalog id or place name used for narration and door omens.")]
        public string locationId = "the village";
        [Tooltip("Optional. Doors without a bridge only show their message.")]
        public DlnkDoorOmenBridge door;
        [Tooltip("Seeded building name in English (Core VillageNames). Empty: the prompt names the kind instead.")]
        public string displayNameEn = "";
        [Tooltip("Seeded building name in French.")]
        public string displayNameFr = "";

        /// <summary>The seeded name in a language (English for unknown languages), or the localised kind name when no name was assigned.</summary>
        public string DisplayName(string language)
        {
            string name = language == "fr" ? displayNameFr : displayNameEn;
            if (string.IsNullOrEmpty(name)) name = displayNameEn;
            return string.IsNullOrEmpty(name) ? PromptStrings.PlaceName(language, locationId) : name;
        }
    }
}
