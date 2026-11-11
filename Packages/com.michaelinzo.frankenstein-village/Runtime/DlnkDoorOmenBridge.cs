using Frankenstein.Core;
using UnityEngine;
using UnityEngine.Events;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Door adapter for the DLNK Push Trigger (moves or rotates an object from a trigger and hotkey).
    /// Call TryOpen from your own input or from a UnityEvent; if the result lets the door open,
    /// onAllowOpen fires so you can invoke the Push Trigger, otherwise a creak, slam or refusal
    /// event fires instead. No DLNK types are referenced. Never compiled in the Unity editor.
    /// </summary>
    public sealed class DlnkDoorOmenBridge : MonoBehaviour
    {
        public string buildingId = "house_a";
        public int doorIndex;
        public int seed = 1818;

        [Tooltip("Normal and Creak: let the door move (wire to the Push Trigger action).")]
        public UnityEvent onAllowOpen = new UnityEvent();
        public UnityEvent onCreak = new UnityEvent();
        [Tooltip("Slam: door should move, then slam shut. Wire a sound and a close action.")]
        public UnityEvent onSlam = new UnityEvent();
        [Tooltip("Refuse: the door must not move. Wire a rattle sound.")]
        public UnityEvent onRefuse = new UnityEvent();

        private int _attempt;

        /// <summary>Returns the behavior used. Dread is SanityModel.Dread.</summary>
        public DoorBehavior TryOpen(float dread)
        {
            var behavior = DreadBuildingPolicy.DoorOmen(dread, buildingId, doorIndex, _attempt++, seed);
            switch (behavior)
            {
                case DoorBehavior.Creak: onCreak.Invoke(); onAllowOpen.Invoke(); break;
                case DoorBehavior.Slam: onAllowOpen.Invoke(); onSlam.Invoke(); break;
                case DoorBehavior.Refuse: onRefuse.Invoke(); break;
                default: onAllowOpen.Invoke(); break;
            }
            return behavior;
        }
    }
}
