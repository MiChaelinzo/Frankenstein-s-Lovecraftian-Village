using System;
using Frankenstein.Core;
using UnityEngine;
using UnityEngine.Events;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Camera mode adapter for the DLNK Scene Control (player, hotkeys, UI, cameras). Request a mode
    /// from your UI; the allowed mode is raised as an int event (0 FirstPerson, 1 ThirdPerson,
    /// 2 TopDown) for you to wire to the pack's camera switching, plus a top-down flag for
    /// DlnkBuildingFloorBridge.SetTopDown. No DLNK types are referenced. Never compiled in Unity.
    /// </summary>
    public sealed class DlnkCameraModeBridge : MonoBehaviour
    {
        [Serializable] public sealed class ModeEvent : UnityEvent<int> { }
        [Serializable] public sealed class FlagEvent : UnityEvent<bool> { }

        public ModeEvent onModeChanged = new ModeEvent();
        public FlagEvent onTopDownChanged = new FlagEvent();

        public CameraMode Current { get; private set; } = CameraMode.TopDown;
        private bool _hasMode;

        /// <summary>Applies the player's request, subject to dread (top-down is removed at Abyss).</summary>
        public CameraMode Request(CameraMode requested, float dread)
        {
            Set(DreadBuildingPolicy.AllowedCamera(requested, dread));
            return Current;
        }

        /// <summary>UnityEvent friendly overload: 0 FirstPerson, 1 ThirdPerson, 2 TopDown.</summary>
        public void RequestInt(int mode) { Request((CameraMode)Mathf.Clamp(mode, 0, 2), _lastDread); }

        /// <summary>Re-evaluate when dread changes: forces the mode out of top-down at Abyss.</summary>
        public void OnDread(float dread)
        {
            _lastDread = dread;
            Set(DreadBuildingPolicy.AllowedCamera(Current, dread));
        }

        /// <summary>Jump to the default mode for this dread.</summary>
        public void ApplySuggested(float dread)
        {
            _lastDread = dread;
            Set(DreadBuildingPolicy.AllowedCamera(DreadBuildingPolicy.SuggestedCamera(dread), dread));
        }

        private float _lastDread;

        private void Set(CameraMode mode)
        {
            if (_hasMode && mode == Current) return;
            _hasMode = true;
            Current = mode;
            onModeChanged.Invoke((int)mode);
            onTopDownChanged.Invoke(mode == CameraMode.TopDown);
        }
    }
}
