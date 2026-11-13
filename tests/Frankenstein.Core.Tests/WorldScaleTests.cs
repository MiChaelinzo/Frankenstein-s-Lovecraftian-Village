using System;
using System.IO;
using System.Text.Json;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Scale-reference tests: the shapes data, WorldScale and the generated meshes must agree on real-world sizes.</summary>
    public class WorldScaleTests
    {
        private static string ShapesJson()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return File.ReadAllText(Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_shapes.json"));
        }

        private static float Height(ShapeLibrary lib, string id) => lib.Build(id).Bounds()[4];

        [Fact]
        public void Constants_equal_the_scale_block_of_the_shapes_data()
        {
            var s = JsonDocument.Parse(ShapesJson()).RootElement.GetProperty("scale");
            Assert.Equal(WorldScale.EyeHeight, s.GetProperty("eyeHeight").GetSingle());
            Assert.Equal(WorldScale.PersonHeight, s.GetProperty("personHeight").GetSingle());
            Assert.Equal(WorldScale.DoorHeight, s.GetProperty("doorHeight").GetSingle());
            Assert.Equal(WorldScale.EavesMin, s.GetProperty("eavesMin").GetSingle());
            Assert.Equal(WorldScale.EavesMax, s.GetProperty("eavesMax").GetSingle());
            Assert.Equal(WorldScale.LampMin, s.GetProperty("lampMin").GetSingle());
            Assert.Equal(WorldScale.LampMax, s.GetProperty("lampMax").GetSingle());
            Assert.Equal(WorldScale.TreeMin, s.GetProperty("treeMin").GetSingle());
        }

        [Fact]
        public void Villager_is_a_regular_person_and_trees_stand_taller()
        {
            var lib = ShapeLibrary.Parse(ShapesJson());
            Assert.InRange(Height(lib, "villager"), WorldScale.PersonHeight - 0.05f, WorldScale.PersonHeight + 0.05f);
            Assert.True(Height(lib, "dead_tree") >= WorldScale.TreeMin);
            Assert.True(Height(lib, "dead_tree") > Height(lib, "villager"));
        }

        [Fact]
        public void Lamps_stand_between_the_lamp_limits()
        {
            var lib = ShapeLibrary.Parse(ShapesJson());
            foreach (var id in new[] { "lamp", "lamp_double" })
                Assert.InRange(Height(lib, id), WorldScale.LampMin, WorldScale.LampMax);
        }

        [Fact]
        public void Eye_height_sits_below_the_door_lintel_in_every_house()
        {
            Assert.InRange(WorldScale.DoorHeight / WorldScale.EyeHeight, 1.15f, 1.4f);
            Assert.True(WorldScale.EyeHeight < WorldScale.PersonHeight);
        }
    }
}
