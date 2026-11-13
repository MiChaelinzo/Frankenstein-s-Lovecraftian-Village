// UNVERIFIED: written without access to the Unity editor, so it has not been run in Unity. It is
// compile checked against original hand-written stubs only (tests/UnityCompileCheck). The geometry
// comes from ShapeLibrary (Core), which is covered by dotnet tests and a golden parity check with the web port.
using System.Collections.Generic;
using Frankenstein.Core;
using Frankenstein.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Frankenstein.Editor
{
    /// <summary>
    /// Writes the original, dependency-free village look into the user's project (not the package):
    /// one Mesh, one Material per palette entry and one prefab per mesh id in Data/village_shapes.json.
    /// The scene builder binds these prefabs to catalog entries that no pack prefab covers.
    /// No glTF importer and no third-party art are needed.
    /// </summary>
    public static class OriginalVillageAssetGenerator
    {
        public const string ShapesJsonPath = "Packages/com.michaelinzo.frankenstein-village/Data/village_shapes.json";
        public const string GeneratedRoot = "Assets/FrankensteinVillage/Generated";
        private const string MeshFolder = GeneratedRoot + "/Meshes";
        private const string MaterialFolder = GeneratedRoot + "/Materials";
        private const string PrefabFolder = GeneratedRoot + "/Prefabs";

        public static string PrefabPathFor(string id) { return PrefabFolder + "/" + id + ".prefab"; }

        [MenuItem("Tools/Frankenstein/Generate Original Village Assets")]
        public static void Generate()
        {
            var json = AssetDatabase.LoadAssetAtPath<TextAsset>(ShapesJsonPath);
            if (json == null) { Debug.LogError("[Frankenstein] Shape data not found at " + ShapesJsonPath + ". Is the package installed?"); return; }
            ShapeLibrary library;
            try { library = ShapeLibrary.Parse(json.text); }
            catch (System.FormatException ex) { Debug.LogError("[Frankenstein] Shape data is malformed: " + ex.Message); return; }

            foreach (var folder in new[] { "Assets/FrankensteinVillage", GeneratedRoot, MeshFolder, MaterialFolder, PrefabFolder }) EnsureFolder(folder);

            var shader = FindLitShader(out string shaderName);
            if (shader == null) { Debug.LogError("[Frankenstein] No lit shader found (looked for URP Lit, HDRP Lit, Standard). Nothing was generated."); return; }
            var materials = new Dictionary<string, Material>();
            foreach (var kv in library.Palette) materials[kv.Key] = CreateMaterial(kv.Key, kv.Value, shader);

            foreach (var id in library.MeshIds)
            {
                var data = library.Build(id);
                var mesh = CreateMesh(data);
                var go = new GameObject(id);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var renderer = go.AddComponent<MeshRenderer>();
                var slots = new Material[mesh.subMeshCount];
                for (int i = 0; i < slots.Length; i++) slots[i] = materials[data.Submeshes[i].Material];
                renderer.sharedMaterials = slots;
                PrefabUtility.SaveAsPrefabAsset(go, PrefabPathFor(id));
                Object.DestroyImmediate(go);
            }
            AssetDatabase.SaveAssets();
            Debug.Log("[Frankenstein] Generated " + library.MeshIds.Count + " original meshes and " + materials.Count + " materials in " + GeneratedRoot + " (shader: " + shaderName + ").");
        }

        /// <summary>Fills empty catalog slots with the generated prefab of the same id. Pack prefabs already bound are never replaced. Returns the number bound.</summary>
        public static int BindMissing(VillageCatalogAsset catalog)
        {
            int bound = 0;
            foreach (var b in catalog.bindings)
            {
                if (b.entry == null || b.prefab != null) continue;
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPathFor(b.entry.id));
                if (prefab == null) continue;
                b.prefab = prefab;
                bound++;
            }
            if (bound > 0) EditorUtility.SetDirty(catalog);
            return bound;
        }

        /// <summary>Picks the lit shader for the active pipeline: by the pipeline asset type, then by what exists, then the built in Standard shader.</summary>
        private static Shader FindLitShader(out string name)
        {
            var pipeline = GraphicsSettings.currentRenderPipeline;
            string typeName = pipeline != null ? pipeline.GetType().Name : "";
            var candidates = new List<string>();
            if (typeName.Contains("HDRender")) candidates.Add("HDRP/Lit");
            if (typeName.Contains("Universal")) candidates.Add("Universal Render Pipeline/Lit");
            candidates.AddRange(new[] { "Universal Render Pipeline/Lit", "HDRP/Lit", "Standard", "Sprites/Default" });
            foreach (var candidate in candidates)
            {
                var shader = Shader.Find(candidate);
                if (shader != null) { name = candidate; return shader; }
            }
            name = "none";
            return null;
        }

        private static Material CreateMaterial(string slot, float[] rgba, Shader shader)
        {
            var material = new Material(shader);
            material.name = "Village_" + slot;
            var color = new Color(rgba[0], rgba[1], rgba[2], rgba[3]);
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
            if (material.HasProperty("_Color")) material.SetColor("_Color", color);
            if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 0.15f);
            if (material.HasProperty("_Glossiness")) material.SetFloat("_Glossiness", 0.15f);
            if (ShapeLibrary.IsEmissive(slot))
            {
                var glow = new Color(rgba[0] * 1.6f, rgba[1] * 1.6f, rgba[2] * 1.6f);
                material.EnableKeyword("_EMISSION");
                if (material.HasProperty("_EmissionColor")) material.SetColor("_EmissionColor", glow);
                if (material.HasProperty("_EmissiveColor")) material.SetColor("_EmissiveColor", glow);
            }
            string path = MaterialFolder + "/" + material.name + ".mat";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        private static Mesh CreateMesh(ShapeMesh data)
        {
            var vertices = new Vector3[data.VertexCount];
            for (int i = 0; i < vertices.Length; i++) vertices[i] = new Vector3(data.Positions[i * 3], data.Positions[i * 3 + 1], data.Positions[i * 3 + 2]);
            var mesh = new Mesh();
            mesh.name = "Village_" + data.Id;
            mesh.vertices = vertices;
            mesh.subMeshCount = data.Submeshes.Count;
            for (int s = 0; s < data.Submeshes.Count; s++) mesh.SetTriangles(data.Submeshes[s].Indices, s);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            string path = MeshFolder + "/" + mesh.name + ".asset";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);
            return mesh;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            int slash = path.LastIndexOf('/');
            AssetDatabase.CreateFolder(path.Substring(0, slash), path.Substring(slash + 1));
        }
    }
}
