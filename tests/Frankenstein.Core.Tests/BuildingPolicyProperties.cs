using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class BuildingPolicyProperties
    {
        private static string Id(SeededRandom r) => "b" + r.Next(50);

        [Fact]
        public void Detail_is_in_range_full_when_calm_and_never_rises_with_dread()
        {
            Property.ForAll((r, seed) =>
            {
                string id = Id(r);
                int s = r.Next(100000);
                Assert.Equal(3, DreadBuildingPolicy.DetailLevel(0f, id, s));
                int prev = 3;
                for (int i = 0; i <= 100; i++)
                {
                    int level = DreadBuildingPolicy.DetailLevel(i / 100f, id, s);
                    Assert.InRange(level, 0, 3);
                    Assert.True(level <= prev, "detail rose at dread " + i / 100f);
                    prev = level;
                }
                Assert.Equal(DreadBuildingPolicy.DetailLevel(0.5f, id, s), DreadBuildingPolicy.DetailLevel(0.5f, id, s));
            });
        }

        [Fact]
        public void Floor_peel_shows_exactly_floors_up_to_active_in_top_down_and_all_otherwise()
        {
            Property.ForAll((r, seed) =>
            {
                int count = 1 + r.Next(8);
                int active = r.Next(14) - 3;
                int clamped = DreadBuildingPolicy.ClampFloor(active, count);
                Assert.InRange(clamped, 0, count - 1);
                int visible = 0;
                for (int f = 0; f < count; f++)
                {
                    Assert.True(DreadBuildingPolicy.FloorVisible(f, active, count, false));
                    if (DreadBuildingPolicy.FloorVisible(f, active, count, true)) visible++;
                }
                Assert.Equal(clamped + 1, visible);
                Assert.True(DreadBuildingPolicy.FloorVisible(clamped, active, count, true));
                Assert.False(DreadBuildingPolicy.FloorVisible(count, active, count, false));
                Assert.False(DreadBuildingPolicy.FloorVisible(-1, active, count, true));
            });
        }

        [Fact]
        public void Door_omens_are_deterministic_and_gated_by_tier()
        {
            Property.ForAll((r, seed) =>
            {
                string id = Id(r);
                int s = r.Next(100000);
                for (int attempt = 0; attempt < 20; attempt++)
                {
                    int door = r.Next(4);
                    Assert.Equal(DoorBehavior.Normal, DreadBuildingPolicy.DoorOmen(0.1f, id, door, attempt, s));
                    var uneasy = DreadBuildingPolicy.DoorOmen(0.4f, id, door, attempt, s);
                    Assert.True(uneasy == DoorBehavior.Normal || uneasy == DoorBehavior.Creak);
                    var dire = DreadBuildingPolicy.DoorOmen(0.7f, id, door, attempt, s);
                    Assert.NotEqual(DoorBehavior.Refuse, dire);
                    var abyss = DreadBuildingPolicy.DoorOmen(0.95f, id, door, attempt, s);
                    Assert.Equal(abyss, DreadBuildingPolicy.DoorOmen(0.95f, id, door, attempt, s));
                }
            });
        }

        [Fact]
        public void Abyss_eventually_refuses_and_calm_never_does_over_many_attempts()
        {
            bool refused = false, slammed = false;
            for (int a = 0; a < 200; a++)
            {
                var b = DreadBuildingPolicy.DoorOmen(1f, "house_a", 0, a, 1818);
                refused |= b == DoorBehavior.Refuse;
                slammed |= b == DoorBehavior.Slam;
            }
            Assert.True(refused && slammed);
        }

        [Fact]
        public void Camera_policy_suggests_closer_views_and_never_allows_top_down_at_abyss()
        {
            Property.ForAll((r, seed) =>
            {
                float d = r.Next(1001) / 1000f;
                var requested = (CameraMode)r.Next(3);
                var allowed = DreadBuildingPolicy.AllowedCamera(requested, d);
                if (d >= DreadThresholds.Abyss) Assert.NotEqual(CameraMode.TopDown, allowed);
                else Assert.Equal(requested, allowed);
                Assert.Equal(allowed, DreadBuildingPolicy.AllowedCamera(allowed, d));
                Assert.True((int)DreadBuildingPolicy.SuggestedCamera(d) <= 2);
            });
            Assert.Equal(CameraMode.TopDown, DreadBuildingPolicy.SuggestedCamera(0f));
            Assert.Equal(CameraMode.FirstPerson, DreadBuildingPolicy.SuggestedCamera(1f));
        }

        [Fact]
        public void Stable_hash_matches_known_fnv1a_vectors()
        {
            Assert.Equal(unchecked((int)2166136261u), DreadBuildingPolicy.StableHash(""));
            Assert.Equal(unchecked((int)0xE40C292Cu), DreadBuildingPolicy.StableHash("a"));
        }
    }
}
