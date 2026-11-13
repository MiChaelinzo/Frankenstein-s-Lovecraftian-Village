using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>
    /// Engine-free builder for the original village meshes. Reads Data/village_shapes.json, the one shape source shared with
    /// tools/blender/mesh_defs.py and web/src/shapes.js, and returns vertex and index arrays that the Unity Editor wraps into Mesh assets.
    /// Output coordinates follow the Unity convention (x right, y up, z forward); the source file is Z-up, so (x, y, z) becomes (x, z, y)
    /// and doors that face -y in the source face -z here. Faces are flat shaded (each face owns its vertices). Deterministic, no randomness.
    /// </summary>
    public sealed class ShapeLibrary
    {
        public IReadOnlyDictionary<string, float[]> Palette { get; }
        public IReadOnlyList<string> MeshIds { get; }
        private readonly Dictionary<string, List<Dictionary<string, object>>> _parts;

        private ShapeLibrary(Dictionary<string, float[]> palette, List<string> ids, Dictionary<string, List<Dictionary<string, object>>> parts)
        {
            Palette = palette;
            MeshIds = ids;
            _parts = parts;
        }

        /// <summary>Materials named glow or rune are emissive, matching web/src/shapes.js.</summary>
        public static bool IsEmissive(string material) => material.StartsWith("glow", StringComparison.Ordinal) || material.StartsWith("rune", StringComparison.Ordinal);

        /// <summary>Parses the shapes document. Throws FormatException with the offending mesh or part named when the data is malformed.</summary>
        public static ShapeLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null || !root.ContainsKey("palette") || !root.ContainsKey("meshes")) throw new FormatException("shapes: document needs palette and meshes");
            var palette = new Dictionary<string, float[]>();
            foreach (var kv in (Dictionary<string, object>)root["palette"])
            {
                var rgba = (List<object>)kv.Value;
                if (rgba.Count != 4) throw new FormatException("shapes: palette entry " + kv.Key + " needs 4 numbers");
                palette[kv.Key] = new[] { (float)(double)rgba[0], (float)(double)rgba[1], (float)(double)rgba[2], (float)(double)rgba[3] };
            }
            var ids = new List<string>();
            var parts = new Dictionary<string, List<Dictionary<string, object>>>();
            foreach (Dictionary<string, object> mesh in (List<object>)root["meshes"])
            {
                string id = (string)mesh["id"];
                if (parts.ContainsKey(id)) throw new FormatException("shapes: duplicate mesh id " + id);
                var list = new List<Dictionary<string, object>>();
                foreach (Dictionary<string, object> part in (List<object>)mesh["parts"])
                {
                    string material = (string)part["material"];
                    if (!palette.ContainsKey(material)) throw new FormatException("shapes: unknown material " + material + " in " + id + "/" + part["name"]);
                    list.Add(part);
                }
                ids.Add(id);
                parts[id] = list;
            }
            return new ShapeLibrary(palette, ids, parts);
        }

        public bool Contains(string id) => _parts.ContainsKey(id);

        /// <summary>Builds one mesh. Submeshes are grouped per material in order of first use.</summary>
        public ShapeMesh Build(string id)
        {
            if (!_parts.TryGetValue(id, out var specs)) throw new KeyNotFoundException("shapes: unknown mesh " + id);
            var positions = new List<float>();
            var submeshIndex = new Dictionary<string, int>();
            var submeshes = new List<ShapeSubmesh>();
            var indexLists = new List<List<int>>();
            int triangles = 0;
            foreach (var spec in specs)
            {
                string material = (string)spec["material"];
                if (!submeshIndex.TryGetValue(material, out int slot))
                {
                    slot = submeshes.Count;
                    submeshIndex[material] = slot;
                    submeshes.Add(new ShapeSubmesh(material, null));
                    indexLists.Add(new List<int>());
                }
                var (v, f) = PartGeometry(spec);
                foreach (var face in f)
                {
                    int first = positions.Count / 3;
                    foreach (int vi in face)
                    {
                        positions.Add((float)v[vi][0]);
                        positions.Add((float)v[vi][2]);
                        positions.Add((float)v[vi][1]);
                    }
                    for (int i = 1; i < face.Length - 1; i++)
                    {
                        indexLists[slot].Add(first);
                        indexLists[slot].Add(first + i);
                        indexLists[slot].Add(first + i + 1);
                        triangles++;
                    }
                }
            }
            for (int i = 0; i < submeshes.Count; i++) submeshes[i] = new ShapeSubmesh(submeshes[i].Material, indexLists[i].ToArray());
            return new ShapeMesh(id, positions.ToArray(), submeshes, specs.Count, triangles);
        }

        private static double Num(object o) => (double)o;
        private static double[] Nums(object o) { var l = (List<object>)o; var r = new double[l.Count]; for (int i = 0; i < r.Length; i++) r[i] = (double)l[i]; return r; }
        private static bool Has(Dictionary<string, object> d, string key) => d.ContainsKey(key);

        private static (double[][] v, int[][] f) PartGeometry(Dictionary<string, object> spec)
        {
            string shape = (string)spec["shape"];
            double[] at = Nums(spec["at"]);
            double cx = at[0], cy = at[1], z0 = at[2];
            int sides = Has(spec, "sides") ? (int)Num(spec["sides"]) : 8;
            (double[][] v, int[][] f) g;
            switch (shape)
            {
                case "box": { var s = Nums(spec["size"]); g = Box(cx, cy, z0, s[0], s[1], s[2]); break; }
                case "wedge": { var s = Nums(spec["size"]); g = Wedge(cx, cy, z0, s[0], s[1], s[2], Has(spec, "overhang") ? Num(spec["overhang"]) : 0.15); break; }
                case "cylinder": { var r = Nums(spec["radii"]); g = Cylinder(cx, cy, z0, r[0], r[1], Num(spec["height"]), sides); break; }
                case "cone": g = Cylinder(cx, cy, z0, Num(spec["radius"]), 0.0, Num(spec["height"]), sides); break;
                case "hull": { var s = Nums(spec["size"]); g = Hull(s[0], s[1], s[2], z0, Has(spec, "bottom") ? Num(spec["bottom"]) : 0.55); break; }
                default: throw new FormatException("shapes: unknown shape " + shape + " in part " + spec["name"]);
            }
            var v = g.v;
            if (Has(spec, "shear"))
            {
                var sh = (Dictionary<string, object>)spec["shear"];
                double dx = Num(sh["dx"]), from = Num(sh["from"]), height = Num(sh["height"]);
                for (int i = 0; i < v.Length; i++) v[i] = new[] { v[i][0] + dx * Math.Max(0.0, v[i][2] - from) / height, v[i][1], v[i][2] };
            }
            if (Has(spec, "yaw") && Num(spec["yaw"]) != 0.0)
            {
                double rad = Num(spec["yaw"]) * Math.PI / 180.0, c = Math.Cos(rad), s = Math.Sin(rad);
                for (int i = 0; i < v.Length; i++)
                    v[i] = new[] { cx + (v[i][0] - cx) * c - (v[i][1] - cy) * s, cy + (v[i][0] - cx) * s + (v[i][1] - cy) * c, v[i][2] };
            }
            return (v, g.f);
        }

        private static (double[][] v, int[][] f) Box(double cx, double cy, double z0, double sx, double sy, double sz)
        {
            double x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z1 = z0 + sz;
            var v = new[]
            {
                new[] { x0, y0, z0 }, new[] { x1, y0, z0 }, new[] { x1, y1, z0 }, new[] { x0, y1, z0 },
                new[] { x0, y0, z1 }, new[] { x1, y0, z1 }, new[] { x1, y1, z1 }, new[] { x0, y1, z1 },
            };
            var f = new[] { new[] { 0, 3, 2, 1 }, new[] { 4, 5, 6, 7 }, new[] { 0, 1, 5, 4 }, new[] { 1, 2, 6, 5 }, new[] { 2, 3, 7, 6 }, new[] { 3, 0, 4, 7 } };
            return (v, f);
        }

        private static (double[][] v, int[][] f) Wedge(double cx, double cy, double z0, double sx, double sy, double rise, double overhang)
        {
            double x0 = cx - sx / 2 - overhang, x1 = cx + sx / 2 + overhang, y0 = cy - sy / 2 - overhang, y1 = cy + sy / 2 + overhang, zr = z0 + rise;
            var v = new[]
            {
                new[] { x0, y0, z0 }, new[] { x1, y0, z0 }, new[] { x1, y1, z0 }, new[] { x0, y1, z0 }, new[] { x0, cy, zr }, new[] { x1, cy, zr },
            };
            var f = new[] { new[] { 0, 3, 2, 1 }, new[] { 0, 1, 5, 4 }, new[] { 2, 3, 4, 5 }, new[] { 0, 4, 3 }, new[] { 1, 2, 5 } };
            return (v, f);
        }

        private static (double[][] v, int[][] f) Cylinder(double cx, double cy, double z0, double r0, double r1, double h, int n)
        {
            var v = new List<double[]>();
            var f = new List<int[]>();
            for (int i = 0; i < n; i++) { double a = 2 * Math.PI * i / n; v.Add(new[] { cx + r0 * Math.Cos(a), cy + r0 * Math.Sin(a), z0 }); }
            if (r1 > 0)
            {
                for (int i = 0; i < n; i++) { double a = 2 * Math.PI * i / n; v.Add(new[] { cx + r1 * Math.Cos(a), cy + r1 * Math.Sin(a), z0 + h }); }
                for (int i = 0; i < n; i++) { int j = (i + 1) % n; f.Add(new[] { i, j, n + j, n + i }); }
                var bottom = new int[n]; var top = new int[n];
                for (int i = 0; i < n; i++) { bottom[i] = n - 1 - i; top[i] = n + i; }
                f.Add(bottom); f.Add(top);
            }
            else
            {
                v.Add(new[] { cx, cy, z0 + h });
                for (int i = 0; i < n; i++) f.Add(new[] { i, (i + 1) % n, n });
                var bottom = new int[n];
                for (int i = 0; i < n; i++) bottom[i] = n - 1 - i;
                f.Add(bottom);
            }
            return (v.ToArray(), f.ToArray());
        }

        private static (double[][] v, int[][] f) Hull(double length, double width, double depth, double z0, double bottom)
        {
            double hl = length / 2, hw = width / 2;
            var ring = new[] { new[] { -hl, -1.0 }, new[] { 0.0, -1.0 }, new[] { hl, 0.0 }, new[] { 0.0, 1.0 }, new[] { -hl, 1.0 } };
            var v = new List<double[]>();
            foreach (var r in ring) v.Add(new[] { r[0], r[1] * hw * bottom, z0 });
            foreach (var r in ring) v.Add(new[] { r[0], r[1] * hw, z0 + depth });
            var f = new List<int[]>();
            for (int i = 0; i < 5; i++) f.Add(new[] { i, (i + 1) % 5, 5 + (i + 1) % 5, 5 + i });
            f.Add(new[] { 0, 4, 3, 2, 1 });
            return (v.ToArray(), f.ToArray());
        }
    }

    /// <summary>Triangles of one mesh that share a material slot name from the shapes palette.</summary>
    public readonly struct ShapeSubmesh
    {
        public string Material { get; }
        public int[] Indices { get; }
        public ShapeSubmesh(string material, int[] indices) { Material = material; Indices = indices; }
    }

    /// <summary>Vertex and index arrays for one mesh: Positions holds x,y,z triplets in Unity axes (see ShapeLibrary).</summary>
    public sealed class ShapeMesh
    {
        public string Id { get; }
        public float[] Positions { get; }
        public IReadOnlyList<ShapeSubmesh> Submeshes { get; }
        public int PartCount { get; }
        public int TriangleCount { get; }
        public int VertexCount => Positions.Length / 3;

        public ShapeMesh(string id, float[] positions, IReadOnlyList<ShapeSubmesh> submeshes, int partCount, int triangleCount)
        {
            Id = id; Positions = positions; Submeshes = submeshes; PartCount = partCount; TriangleCount = triangleCount;
        }

        /// <summary>Axis aligned bounds as {minX, minY, minZ, maxX, maxY, maxZ}.</summary>
        public float[] Bounds()
        {
            var b = new[] { float.MaxValue, float.MaxValue, float.MaxValue, float.MinValue, float.MinValue, float.MinValue };
            for (int i = 0; i < Positions.Length; i++)
            {
                int k = i % 3;
                b[k] = Math.Min(b[k], Positions[i]);
                b[3 + k] = Math.Max(b[3 + k], Positions[i]);
            }
            return b;
        }
    }

    /// <summary>Just enough JSON for the shapes document: objects, arrays, strings, numbers, booleans, null. Throws FormatException with the offset on bad input.</summary>
    internal static class MiniJson
    {
        public static object Parse(string text)
        {
            int i = 0;
            var value = ReadValue(text, ref i);
            SkipSpace(text, ref i);
            if (i != text.Length) throw new FormatException("json: unexpected text at " + i);
            return value;
        }

        private static void SkipSpace(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        private static object ReadValue(string s, ref int i)
        {
            SkipSpace(s, ref i);
            if (i >= s.Length) throw new FormatException("json: unexpected end");
            char c = s[i];
            if (c == '{') return ReadObject(s, ref i);
            if (c == '[') return ReadArray(s, ref i);
            if (c == '"') return ReadString(s, ref i);
            if (string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int start = i;
            while (i < s.Length && "+-.eE0123456789".IndexOf(s[i]) >= 0) i++;
            if (i == start || !double.TryParse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture, out double d))
                throw new FormatException("json: bad value at " + start);
            return d;
        }

        private static Dictionary<string, object> ReadObject(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++;
            SkipSpace(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return d; }
            while (true)
            {
                SkipSpace(s, ref i);
                if (i >= s.Length || s[i] != '"') throw new FormatException("json: expected key at " + i);
                string key = ReadString(s, ref i);
                SkipSpace(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new FormatException("json: expected ':' at " + i);
                i++;
                d[key] = ReadValue(s, ref i);
                SkipSpace(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; return d; }
                throw new FormatException("json: expected ',' or '}' at " + i);
            }
        }

        private static List<object> ReadArray(string s, ref int i)
        {
            var l = new List<object>();
            i++;
            SkipSpace(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return l; }
            while (true)
            {
                l.Add(ReadValue(s, ref i));
                SkipSpace(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; return l; }
                throw new FormatException("json: expected ',' or ']' at " + i);
            }
        }

        private static string ReadString(string s, ref int i)
        {
            var sb = new StringBuilder();
            i++;
            while (i < s.Length && s[i] != '"')
            {
                if (s[i] != '\\') { sb.Append(s[i++]); continue; }
                i++;
                if (i >= s.Length) break;
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u':
                        if (i + 4 > s.Length) throw new FormatException("json: bad unicode escape at " + i);
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default: sb.Append(e); break;
                }
            }
            if (i >= s.Length) throw new FormatException("json: unterminated string");
            i++;
            return sb.ToString();
        }
    }
}
