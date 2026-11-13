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
                // Intentional: the candle is repeatable, limited only by the cooldown. This matches the 2D web view.
                case InteractionKind.Candle: return SanityModel.CandleRestore;
                default: return 0f;
            }
        }

        /// <summary>
        /// Sanity change for talking to a villager. A clue costs what studying a landmark costs; a villager at the window costs the same;
        /// one facing the sea or repeating a phrase costs what a whisper costs; a vanished villager costs nothing. The worst applies.
        /// </summary>
        public static float TalkSanityDelta(VillagerBehavior behavior, bool yieldsClue)
        {
            if (behavior == VillagerBehavior.Vanished) return 0f;
            float delta = yieldsClue ? SanityDelta(InteractionKind.Landmark) : 0f;
            if (behavior >= VillagerBehavior.FacingSea) return Math.Min(delta, SanityDelta(InteractionKind.Whisper));
            if (behavior == VillagerBehavior.AtWindow) return Math.Min(delta, SanityDelta(InteractionKind.Landmark));
            return delta;
        }

        /// <summary>What a catalog category does when touched: houses have doors, landmarks are studied, everything else whispers.</summary>
        public static InteractionKind KindForCategory(string category)
        {
            if (category == "House") return InteractionKind.Door;
            if (category == "Landmark") return InteractionKind.Landmark;
            return InteractionKind.Whisper;
        }

        /// <summary>Line shown when a door is tried. Matches the behavior chosen by <see cref="DreadBuildingPolicy.DoorOmen"/>.</summary>
        public static string DoorMessage(DoorBehavior behavior)
        {
            switch (behavior)
            {
                case DoorBehavior.Creak: return "The door creaks open on its own time.";
                case DoorBehavior.Slam: return "The door opens, then slams behind the dark.";
                case DoorBehavior.Refuse: return "The door will not open. Something holds it from within.";
                default: return "The door gives.";
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
