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

        /// <summary>The mode currently allowed (what the pack camera should show).</summary>
        public CameraMode Current { get; private set; } = CameraMode.TopDown;
        /// <summary>The player's preferred mode; restored when dread falls below Abyss.</summary>
        public CameraMode Requested { get; private set; } = CameraMode.TopDown;
        /// <summary>The last mode suggested for a dread level by ApplySuggested; never overwrites Requested.</summary>
        public CameraMode Suggested { get; private set; } = CameraMode.TopDown;
        /// <summary>The mode last passed through the dread policy and applied (same as Current once any dread is known).</summary>
        public CameraMode Applied => Current;
        private bool _hasMode;
        private bool _hasDread;
        private float _lastDread;

        /// <summary>Applies the player's request, subject to dread (top-down is removed at Abyss).</summary>
        public CameraMode Request(CameraMode requested, float dread)
        {
            Requested = requested;
            _lastDread = dread;
            _hasDread = true;
            Set(DreadBuildingPolicy.AllowedCamera(requested, dread));
            return Current;
        }

        /// <summary>
        /// UnityEvent friendly overload: 0 FirstPerson, 1 ThirdPerson, 2 TopDown. Uses the last dread
        /// pushed through OnDread or ApplySuggested. Before any dread is known, the request is only
        /// stored and applied on the first OnDread, so the Abyss ban cannot be bypassed.
        /// </summary>
        public void RequestInt(int mode)
        {
            var requested = DreadBuildingPolicy.CameraFromInt(mode);
            if (!_hasDread) { Requested = requested; return; }
            Request(requested, _lastDread);
        }

        /// <summary>Re-evaluate when dread changes: forces the mode out of top-down at Abyss and restores the preference after.</summary>
        public void OnDread(float dread)
        {
            _lastDread = dread;
            _hasDread = true;
            Set(DreadBuildingPolicy.AllowedCamera(Requested, dread));
        }

        /// <summary>
        /// Jump to the default mode for this dread. The player's stored Requested mode is left alone,
        /// so a later OnDread restores their preference rather than this suggestion.
        /// </summary>
        public void ApplySuggested(float dread)
        {
            _lastDread = dread;
            _hasDread = true;
            Suggested = DreadBuildingPolicy.SuggestedCamera(dread);
            Set(DreadBuildingPolicy.AllowedCamera(Suggested, dread));
        }

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
