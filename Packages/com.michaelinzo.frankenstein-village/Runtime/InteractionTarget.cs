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
    }
}
