using System;

namespace Frankenstein.Core
{
    /// <summary>What a door does when the player tries it. Order is stable (golden parity uses the ints).</summary>
    public enum DoorBehavior { Normal = 0, Creak = 1, Slam = 2, Refuse = 3 }

    /// <summary>Camera styles a scene can offer. Order is stable (golden parity uses the ints).</summary>
    public enum CameraMode { FirstPerson = 0, ThirdPerson = 1, TopDown = 2 }

    /// <summary>
    /// Engine-free decisions behind the DLNK Myst Village adapter layer: per-building detail level,
    /// floor peel for top-down views, omen driven door behavior and camera mode policy. Nothing here
    /// knows any DLNK type; Runtime adapters forward the results through UnityEvents.
    /// </summary>
    public static class DreadBuildingPolicy
    {
        public const int MaxDetail = 3;

        /// <summary>FNV-1a over UTF-16 code units, so ids hash the same in C# and JS.</summary>
        public static int StableHash(string text)
        {
            uint h = 2166136261u;
            if (text != null)
                for (int i = 0; i < text.Length; i++) { h ^= text[i]; h = unchecked(h * 16777619u); }
            return unchecked((int)h);
        }

        /// <summary>
        /// Detail level 0..3 (3 = full detail). Calm keeps every building at 3. As the dread tier
        /// rises, each building decays after its own deterministic delay (0..2 tiers), so the village
        /// degrades unevenly. Never increases as dread rises.
        /// </summary>
        public static int DetailLevel(float dread, string buildingId, int seed)
        {
            int tier = DreadThresholds.TierFor(dread);
            int delay = new SeededRandom(unchecked(seed ^ StableHash(buildingId))).Next(3);
            int level = MaxDetail - Math.Max(0, tier - delay);
            return Math.Max(0, Math.Min(MaxDetail, level));
        }

        /// <summary>Clamps a requested floor into [0, floorCount - 1]. Zero or fewer floors gives 0.</summary>
        public static int ClampFloor(int floor, int floorCount)
        {
            if (floorCount <= 0) return 0;
            return Math.Max(0, Math.Min(floorCount - 1, floor));
        }

        /// <summary>Top-down peel: floors up to the active one show, higher ones hide. Other modes show all.</summary>
        public static bool FloorVisible(int floor, int activeFloor, int floorCount, bool topDown)
        {
            if (floor < 0 || floor >= floorCount) return false;
            if (!topDown) return true;
            return floor <= ClampFloor(activeFloor, floorCount);
        }

        /// <summary>Door behavior for one attempt. Calm is always Normal; Slam needs Dire; Refuse needs Abyss.</summary>
        public static DoorBehavior DoorOmen(float dread, string buildingId, int doorIndex, int attempt, int seed)
        {
            int tier = DreadThresholds.TierFor(dread);
            if (tier == 0) return DoorBehavior.Normal;
            int mix = unchecked(seed * 31 + StableHash(buildingId) + doorIndex * 977 + attempt * 7919);
            int roll = new SeededRandom(mix).Next(100);
            if (tier == 1) return roll < 30 ? DoorBehavior.Creak : DoorBehavior.Normal;
            if (tier == 2) return roll < 25 ? DoorBehavior.Creak : roll < 45 ? DoorBehavior.Slam : DoorBehavior.Normal;
            return roll < 20 ? DoorBehavior.Creak : roll < 40 ? DoorBehavior.Slam : roll < 70 ? DoorBehavior.Refuse : DoorBehavior.Normal;
        }

        /// <summary>Mode the scene should offer by default: overview when calm, closer as dread grows.</summary>
        public static CameraMode SuggestedCamera(float dread)
        {
            int tier = DreadThresholds.TierFor(dread);
            return tier == 0 ? CameraMode.TopDown : tier == 1 ? CameraMode.ThirdPerson : CameraMode.FirstPerson;
        }

        /// <summary>The player's request is honored except at Abyss, where the overview is taken away.</summary>
        public static CameraMode AllowedCamera(CameraMode requested, float dread)
        {
            if (DreadThresholds.TierFor(dread) >= 3 && requested == CameraMode.TopDown) return CameraMode.FirstPerson;
            return requested;
        }
    }
}
