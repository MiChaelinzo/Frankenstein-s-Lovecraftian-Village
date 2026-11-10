// UNVERIFIED: written without access to the Unity editor, so it has not been compiled or run in Unity.
// The matching logic itself (PrefabNameMatcher) is pure Core code covered by dotnet property tests.
using System.Collections.Generic;
using System.IO;
using System.Text;
using Frankenstein.Core;
using Frankenstein.Runtime;
using UnityEditor;
using UnityEngine;

namespace Frankenstein.Editor
{
    /// <summary>
    /// Fills the prefab slots of the selected VillageCatalogAsset by matching catalog ids to prefab
    /// names found under a root folder (default: the imported Lovecraftian Village pack).
    /// Only empty slots are filled; existing assignments are never overwritten.
    /// </summary>
    public static class CatalogAutoBinder
    {
        public const string DefaultRoot = "Assets/Lovecraftian Village";
        private const string RootPrefKey = "Frankenstein.AutoBind.Root";

        [MenuItem("Tools/Frankenstein/Auto-bind Catalog Prefabs")]
        public static void BindSelected()
        {
            var asset = Selection.activeObject as VillageCatalogAsset;
            if (asset == null)
            {
                EditorUtility.DisplayDialog("Auto-bind", "Select a VillageCatalogAsset in the Project window first.", "OK");
                return;
            }
            Bind(asset, EditorPrefs.GetString(RootPrefKey, DefaultRoot));
        }

        [MenuItem("Tools/Frankenstein/Set Auto-bind Search Root")]
        public static void ChooseRoot()
        {
            string picked = EditorUtility.OpenFolderPanel("Prefab search root", "Assets", "");
            if (string.IsNullOrEmpty(picked)) return;
            string rel = FileUtil.GetProjectRelativePath(picked.Replace('\\', '/'));
            if (string.IsNullOrEmpty(rel)) { Debug.LogWarning("[Frankenstein] Pick a folder inside this project."); return; }
            EditorPrefs.SetString(RootPrefKey, rel);
        }

        public static void Bind(VillageCatalogAsset asset, string root)
        {
            if (!AssetDatabase.IsValidFolder(root))
            {
                Debug.LogWarning($"[Frankenstein] Search root '{root}' not found. Import the pack or use Tools/Frankenstein/Set Auto-bind Search Root.");
                return;
            }

            var pathByName = new Dictionary<string, string>();
            foreach (string guid in AssetDatabase.FindAssets("t:Prefab", new[] { root }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                string name = Path.GetFileNameWithoutExtension(path);
                if (!pathByName.ContainsKey(name)) pathByName[name] = path;
            }

            Undo.RecordObject(asset, "Auto-bind catalog prefabs");
            var bound = new StringBuilder();
            var missed = new StringBuilder();
            foreach (var b in asset.bindings)
            {
                if (b == null || b.entry == null || string.IsNullOrEmpty(b.entry.id)) continue;
                if (b.prefab != null) continue;
                string match = PrefabNameMatcher.Best(b.entry.id, pathByName.Keys);
                if (match == null) { missed.Append("  ").Append(b.entry.id).Append('\n'); continue; }
                b.prefab = AssetDatabase.LoadAssetAtPath<GameObject>(pathByName[match]);
                bound.Append("  ").Append(b.entry.id).Append(" -> ").Append(pathByName[match]).Append('\n');
            }

            EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Frankenstein] Auto-bind searched {pathByName.Count} prefabs under '{root}'.\nBound:\n{(bound.Length > 0 ? bound.ToString() : "  none\n")}Not bound:\n{(missed.Length > 0 ? missed.ToString() : "  none\n")}");
        }
    }
}
