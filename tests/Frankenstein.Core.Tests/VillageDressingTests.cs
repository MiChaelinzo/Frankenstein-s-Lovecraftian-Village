using System;
using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class VillageDressingTests
    {
        private static readonly int[] Seeds = { 1, 42, -7, 1818, 123456789 };

        [Fact]
        public void Compose_is_deterministic_never_enlarges_and_uses_every_village_kind()
        {
            foreach (var seed in Seeds)
            {
                var a = VillageDressing.Compose(seed, 24, 24, new List<PlacedPiece>());
                var b = VillageDressing.Compose(seed, 24, 24, new List<PlacedPiece>());
                Assert.Equal(a.Count, b.Count);
                for (int i = 0; i < a.Count; i++) { Assert.Equal(a[i].Kind, b[i].Kind); Assert.Equal(a[i].X, b[i].X); Assert.Equal(a[i].Z, b[i].Z); }
                Assert.All(a, it => Assert.InRange(it.Scale, 0.1, 1.0));
                foreach (var kind in new[] { "lighthouse", "chapel", "inn", "cottage_thatch", "crate_stack", "barrel", "gravestone", "fence_iron", "lamp" })
                    Assert.Contains(a, it => it.Kind == kind);
            }
        }

        [Fact]
        public void Market_stall_avoids_layout_pieces()
        {
            var blocker = new List<PlacedPiece> { new PlacedPiece { Id = "house_a", X = 5, Z = 5, SizeX = 2, SizeZ = 2 } };
            var items = VillageDressing.Compose(1818, 12, 12, blocker);
            foreach (var it in items.Where(i => i.Kind == "market_stall")) Assert.False(VillageDressing.OverlapsLayout(it, blocker, 0));
        }

        [Fact]
        public void Door_props_keep_wall_clearance_so_a_bench_never_touches_the_plaster()
        {
            int checkedProps = 0;
            for (int facing = 0; facing < 4; facing++)
                for (int seed = 1; seed <= 60; seed++)
                {
                    var house = new PlacedPiece { Id = "house_a", X = 10, Z = 10, SizeX = 3, SizeZ = 3, Facing = facing };
                    double yaw = VillageStreets.FacingYaw(facing), dirX = Math.Sin(yaw), dirZ = Math.Cos(yaw), sideX = Math.Cos(yaw), sideZ = -Math.Sin(yaw);
                    double cx = (house.X + house.SizeX / 2.0) * VillageDressing.Cell, cz = (house.Z + house.SizeZ / 2.0) * VillageDressing.Cell;
                    double wall = house.SizeX * VillageDressing.Cell / 2.0 - VillageDressing.HouseSetback;
                    foreach (var it in VillageDressing.Compose(seed, 24, 24, new List<PlacedPiece> { house }))
                    {
                        if (Array.IndexOf(VillageDressing.DoorKinds, it.Kind) < 1 || it.Yaw != yaw) continue;
                        double ahead = (it.X - cx) * dirX + (it.Z - cz) * dirZ, across = (it.X - cx) * sideX + (it.Z - cz) * sideZ;
                        if (Math.Abs(Math.Abs(across) - 2.2) > 1e-6) continue; // only the door step of this house, not scatter or other items
                        Assert.True(ahead - VillageDressing.FootprintOf(it.Kind).HalfZ - wall >= VillageDressing.DoorWallClearance - 1e-9, $"{it.Kind} touches the wall, facing {facing} seed {seed}");
                        Assert.True(ahead + VillageDressing.FootprintOf(it.Kind).HalfZ <= house.SizeX * VillageDressing.Cell / 2.0 + 1e-9, $"{it.Kind} sticks out into the lane, facing {facing} seed {seed}");
                        checkedProps++;
                    }
                }
            Assert.True(checkedProps > 20, $"only {checkedProps} door props checked");
        }

        [Fact]
        public void Collision_box_adds_the_overhang_clearance_and_only_for_solid_kinds()
        {
            var barrel = new DressingItem { Kind = "barrel", Yaw = 0, Scale = 1.0 };
            Assert.True(VillageDressing.TryCollisionHalfExtents(barrel, out double hx, out double hz));
            var f = VillageDressing.FootprintOf("barrel");
            Assert.Equal(f.HalfX + WorldScale.OverhangClearance, hx, 6);
            Assert.Equal(f.HalfZ + WorldScale.OverhangClearance, hz, 6);
            Assert.False(VillageDressing.TryCollisionHalfExtents(new DressingItem { Kind = "bench", Yaw = 0, Scale = 1.0 }, out _, out _));
            Assert.True(WorldScale.BodyRadius >= 0.45f);
        }

        [Fact]
        public void Tree_collision_is_the_trunk_not_the_canopy()
        {
            var tree = new DressingItem { Kind = "tree", Yaw = 0.7, Scale = 1.0 };
            Assert.True(VillageDressing.TryCollisionHalfExtents(tree, out double hx, out double hz));
            Assert.Equal(0.35 + WorldScale.OverhangClearance, hx, 6);
            Assert.Equal(hx, hz, 6);
            Assert.True(hx < VillageDressing.FootprintOf("tree").HalfX / 1.5);
        }

        [Fact]
        public void Walking_into_a_trunk_slides_along_it_and_passes()
        {
            double h = 0.35 + WorldScale.OverhangClearance, r = WorldScale.BodyRadius;
            var boxes = new[] { new WalkBox { MinX = -h, MaxX = h, MinZ = -h, MaxZ = h, Round = true } };
            double x = 0.1, z = 5.0, step = 0.05;
            for (int i = 0; i < 400; i++)
            {
                z -= step; // walks straight at the trunk, slightly off centre
                WalkCollision.Resolve(ref x, ref z, r, boxes);
                if (z < -3) break;
            }
            Assert.True(z < -3, $"explorer stuck at z={z}");
        }
    }
}
