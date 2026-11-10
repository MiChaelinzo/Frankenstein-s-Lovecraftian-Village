using System;
using Frankenstein.Core;
using UnityEngine;
using UnityEngine.Events;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Floor peel adapter for one building, meant for the DLNK Building Control / Building Trigger
    /// scripts. Wire onActiveFloorChanged to whatever sets the active floor, and onFloorVisibility to
    /// whatever shows or hides a floor, or assign IBuildingDetailTarget components. No DLNK types are
    /// referenced. Never compiled in the Unity editor.
    /// </summary>
    public sealed class DlnkBuildingFloorBridge : MonoBehaviour
    {
        [Serializable] public sealed class FloorEvent : UnityEvent<int> { }
        [Serializable] public sealed class FloorVisibilityEvent : UnityEvent<int, bool> { }

        [Min(1)] public int floorCount = 2;
        public bool topDown;
        public FloorEvent onActiveFloorChanged = new FloorEvent();
        public FloorVisibilityEvent onFloorVisibility = new FloorVisibilityEvent();
        public MonoBehaviour[] targets = new MonoBehaviour[0];

        public int ActiveFloor { get; private set; }

        /// <summary>Hook this to a floor to floor trigger (Building Trigger). Out of range floors are clamped.</summary>
        public void SetActiveFloor(int floor)
        {
            ActiveFloor = DreadBuildingPolicy.ClampFloor(floor, floorCount);
            Refresh();
            onActiveFloorChanged.Invoke(ActiveFloor);
        }

        /// <summary>Switch peel on (top-down camera) or off (first or third person).</summary>
        public void SetTopDown(bool value)
        {
            topDown = value;
            Refresh();
        }

        private void Start() { Refresh(); }

        public void Refresh()
        {
            for (int f = 0; f < floorCount; f++)
            {
                bool visible = DreadBuildingPolicy.FloorVisible(f, ActiveFloor, floorCount, topDown);
                onFloorVisibility.Invoke(f, visible);
                foreach (var m in targets)
                {
                    var t = m as IBuildingDetailTarget;
                    if (t != null) t.SetFloorVisible(f, visible);
                }
            }
        }
    }
}
