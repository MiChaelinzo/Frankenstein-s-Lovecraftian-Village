// PARTIALLY VERIFIED: compile checked against original stubs. UNVERIFIED at runtime: never run in the Unity editor.
using System.Collections.Generic;
using Frankenstein.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Frankenstein.Editor
{
    /// <summary>
    /// Opens a scene from the imported DLNK pack (Assets/_DLNK, git-ignored) and adds a VillageFlythroughCamera so
    /// the pack's own look can be recorded with the Core fly-through. Does not touch pack files except the open scene.
    /// </summary>
    public static class DlnkShowcaseSceneHelper
    {
        public const string PackRoot = "Assets/_DLNK";

        [MenuItem("Tools/Frankenstein/Open DLNK Demo Scene And Add Showcase Camera")]
        public static void OpenAndAddCamera()
        {
            if (!AssetDatabase.IsValidFolder(PackRoot))
            {
                EditorUtility.DisplayDialog("DLNK demo scene", "Import the DLNK pack under " + PackRoot + " first (see docs/UNITY_SETUP.md).", "OK");
                return;
            }
            string scenePath = FindDemoScene(PackRoot);
            if (scenePath == null)
            {
                EditorUtility.DisplayDialog("DLNK demo scene", "No .unity scene found under " + PackRoot + ".", "OK");
                return;
            }
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            AddShowcaseCamera();
            EditorSceneManager.MarkSceneDirty(scene);
            Debug.Log("[Frankenstein] Opened " + scenePath + " and added a showcase camera. Disable other cameras and AudioListeners, then press Play.");
        }

        /// <summary>Ordinal-first scene path under root, preferring names that contain "demo". Null when none.</summary>
        public static string FindDemoScene(string root)
        {
            var paths = new List<string>();
            foreach (string guid in AssetDatabase.FindAssets("t:Scene", new[] { root }))
                paths.Add(AssetDatabase.GUIDToAssetPath(guid));
            paths.Sort(System.StringComparer.Ordinal);
            foreach (string p in paths)
                if (p.ToLowerInvariant().Contains("demo")) return p;
            return paths.Count > 0 ? paths[0] : null;
        }

        private static void AddShowcaseCamera()
        {
            var existing = Object.FindFirstObjectByType<VillageFlythroughCamera>();
            if (existing != null) { Selection.activeObject = existing.gameObject; return; }
            var go = new GameObject("Frankenstein Showcase Camera");
            go.AddComponent<Camera>();
            var fly = go.AddComponent<VillageFlythroughCamera>();
            var builder = Object.FindFirstObjectByType<VillageBuilder>();
            if (builder != null) fly.villageBuilder = builder;
            Undo.RegisterCreatedObjectUndo(go, "Add showcase camera");
            Selection.activeObject = go;
        }
    }
}
