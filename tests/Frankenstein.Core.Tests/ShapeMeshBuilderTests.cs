using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class ShapeMeshBuilderTests
    {
        private static string ShapesJson()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return File.ReadAllText(Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_shapes.json"));
        }

        [Fact]
        public void Every_entry_builds_a_non_empty_valid_mesh()
        {
            var lib = ShapeLibrary.Parse(ShapesJson());
            Assert.Equal(25, lib.MeshIds.Count);
            foreach (var id in lib.MeshIds)
            {
                var m = lib.Build(id);
                Assert.True(m.TriangleCount > 0, id);
                Assert.Equal(m.TriangleCount, m.Submeshes.Sum(s => s.Indices.Length / 3));
                Assert.All(m.Positions, p => Assert.True(float.IsFinite(p), id));
                foreach (var s in m.Submeshes)
                {
                    Assert.True(lib.Palette.ContainsKey(s.Material), id);
                    Assert.All(s.Indices, i => Assert.InRange(i, 0, m.VertexCount - 1));
                }
                var b = m.Bounds();
                Assert.True(b[1] >= -2f && b[4] < 30f, id + " stays within sane height");
                Assert.True(b[3] > b[0] && b[4] > b[1] && b[5] > b[2], id + " has volume");
            }
        }

        [Fact]
        public void Building_is_deterministic()
        {
            var a = ShapeLibrary.Parse(ShapesJson()).Build("church");
            var b = ShapeLibrary.Parse(ShapesJson()).Build("church");
            Assert.Equal(a.Positions, b.Positions);
            Assert.Equal(a.Submeshes.SelectMany(s => s.Indices), b.Submeshes.SelectMany(s => s.Indices));
        }

        [Fact]
        public void Box_has_twelve_triangles_and_expected_bounds()
        {
            var lib = ShapeLibrary.Parse("{\"palette\":{\"stone\":[1,1,1,1]},\"meshes\":[{\"id\":\"b\",\"group\":\"prop\",\"parts\":[{\"name\":\"p\",\"material\":\"stone\",\"shape\":\"box\",\"at\":[1,2,0.5],\"size\":[2,4,1]}]}]}");
            var m = lib.Build("b");
            Assert.Equal(12, m.TriangleCount);
            Assert.Equal(24, m.VertexCount);
            Assert.Equal(new[] { 0f, 0.5f, 0f, 2f, 1.5f, 4f }, m.Bounds());
        }

        [Fact]
        public void Bad_data_fails_with_a_clear_error()
        {
            Assert.Throws<FormatException>(() => ShapeLibrary.Parse("{\"palette\":{},\"meshes\":[{\"id\":\"x\",\"parts\":[{\"name\":\"p\",\"material\":\"nope\",\"shape\":\"box\",\"at\":[0,0,0],\"size\":[1,1,1]}]}]}"));
            Assert.Throws<FormatException>(() => ShapeLibrary.Parse("{\"palette\":"));
            Assert.Throws<KeyNotFoundException>(() => ShapeLibrary.Parse("{\"palette\":{},\"meshes\":[]}").Build("missing"));
        }

        [Fact]
        public void Emissive_materials_are_glow_and_rune()
        {
            Assert.True(ShapeLibrary.IsEmissive("glow"));
            Assert.True(ShapeLibrary.IsEmissive("rune"));
            Assert.False(ShapeLibrary.IsEmissive("stone"));
        }
    }
}
