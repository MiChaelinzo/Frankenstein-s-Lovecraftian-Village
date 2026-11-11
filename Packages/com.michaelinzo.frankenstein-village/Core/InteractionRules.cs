using System;

namespace Frankenstein.Core
{
    /// <summary>What the player is touching. Order is stable.</summary>
    public enum InteractionKind { Door = 0, Whisper = 1, Landmark = 2, Candle = 3 }

    /// <summary>
    /// Engine-free rules for the first-person layer: how far the player can reach, how often they can
    /// act, what each action costs in sanity and how the camera cycles under the dread policy.
    /// Runtime (InteractionRaycaster, FirstPersonExplorer) only measures distance and time, then asks here.
    /// Sanity costs reuse the constants in <see cref="SanityModel"/>, so there is one source for them.
    /// </summary>
    public static class InteractionRules
    {
        /// <summary>Reach in world units (meters) from the camera to the target.</summary>
        public const float Range = 3f;
        /// <summary>Minimum seconds between two interactions, so a held key cannot spam omens.</summary>
        public const float Cooldown = 0.75f;

        /// <summary>True when the distance is a finite, non-negative number within <see cref="Range"/>.</summary>
        public static bool InRange(float distance)
        {
            if (float.IsNaN(distance) || float.IsInfinity(distance)) return false;
            return distance >= 0f && distance <= Range;
        }

        /// <summary>
        /// True once <see cref="Cooldown"/> seconds have passed since the last interaction. A NaN or
        /// negative-infinity lastUse means nothing was used yet. A clock that went backwards is not ready.
        /// </summary>
        public static bool CooldownElapsed(float now, float lastUse)
        {
            if (float.IsNaN(now) || float.IsInfinity(now)) return false;
            if (float.IsNaN(lastUse) || float.IsNegativeInfinity(lastUse)) return true;
            return now - lastUse >= Cooldown;
        }

        /// <summary>Sanity change for one interaction. Doors are free; candles restore; the rest cost.</summary>
        public static float SanityDelta(InteractionKind kind)
        {
            switch (kind)
            {
                case InteractionKind.Whisper: return -SanityModel.WhisperCost;
                case InteractionKind.Landmark: return -SanityModel.FocusCost;
                case InteractionKind.Candle: return SanityModel.CandleRestore;
                default: return 0f;
            }
        }

        /// <summary>
        /// Next camera in the cycle first person, third person, top down. The result always passes
        /// <see cref="DreadBuildingPolicy.AllowedCamera"/>, so Abyss never offers the overview.
        /// </summary>
        public static CameraMode NextCamera(CameraMode current, float dread)
        {
            var next = (CameraMode)(((int)DreadBuildingPolicy.CameraFromInt((int)current) + 1) % 3);
            return DreadBuildingPolicy.AllowedCamera(next, dread);
        }
    }
}
