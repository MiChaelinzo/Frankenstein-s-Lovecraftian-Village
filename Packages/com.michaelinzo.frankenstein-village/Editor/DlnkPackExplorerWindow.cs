// PARTIALLY VERIFIED: compile checked against original stubs. UNVERIFIED at runtime: never run in the Unity editor.
// Grouping uses Core PrefabNameMatcher against the shipped catalog ids; nothing is copied or committed from the pack.
using System.Collections.Generic;
using System.IO;
using Frankenstein.Core;
using Frankenstein.Runtime;
using UnityEditor;
using UnityEngine;

namespace Frankenstein.Editor
{
    /// <summary>
    /// Lists prefabs under Assets/_DLNK grouped by the catalog category their name best matches (House, Landmark,
    /// Prop, or Other when nothing matches), with search, ping and frame, and place-in-scene buttons.
    /// </summary>
    public sealed class DlnkPackExplorerWindow : EditorWindow
    {
        private const string CatalogPath = "Packages/com.michaelinzo.frankenstein-village/Data/village_catalog.json";
        private const string OtherGroup = "Other";
        private static readonly string[] GroupOrder = { "House", "Landmark", "Prop", OtherGroup };

        private readonly Dictionary<string, List<string>> _pathsByGroup = new Dictionary<string, List<string>>();
        private string _search = "";
        private string _status = "Press Rescan to list prefabs.";
        private Vector2 _scroll;

        [MenuItem("Tools/Frankenstein/DLNK Pack Explorer")]
        public static void Open()
        {
            GetWindow<DlnkPackExplorerWindow>("DLNK Pack Explorer").Rescan();
        }

        /// <summary>Reads the prefabs under the pack root and groups them. Order inside a group is ordinal by path.</summary>
        public void Rescan()
        {
            _pathsByGroup.Clear();
            if (!AssetDatabase.IsValidFolder(DlnkShowcaseSceneHelper.PackRoot))
            {
                _status = "Import the DLNK pack under " + DlnkShowcaseSceneHelper.PackRoot + " first.";
                return;
            }
            var ids = new List<string>();
            var categoryById = new Dictionary<string, string>();
            var text = AssetDatabase.LoadAssetAtPath<TextAsset>(CatalogPath);
            if (text != null)
            {
                var asset = ScriptableObject.CreateInstance<VillageCatalogAsset>();
                asset.LoadFromJson(text.text);
                foreach (var e in asset.ToCatalog().Entries) { ids.Add(e.id); categoryById[e.id] = e.category; }
            }
            var paths = new List<string>();
            foreach (string guid in AssetDatabase.FindAssets("t:Prefab", new[] { DlnkShowcaseSceneHelper.PackRoot }))
                paths.Add(AssetDatabase.GUIDToAssetPath(guid));
            paths.Sort(System.StringComparer.Ordinal);
            foreach (string path in paths)
            {
                string id = PrefabNameMatcher.Best(Path.GetFileNameWithoutExtension(path), ids);
                string group = id != null && categoryById.ContainsKey(id) ? categoryById[id] : OtherGroup;
                if (!_pathsByGroup.ContainsKey(group)) _pathsByGroup[group] = new List<string>();
                _pathsByGroup[group].Add(path);
            }
            _status = paths.Count + " prefabs under " + DlnkShowcaseSceneHelper.PackRoot + (text == null ? " (catalog JSON not found, all grouped as Other)." : ".");
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("Reads prefab names only. Pack files stay local and git-ignored. Not verified in Unity.", EditorStyles.miniLabel);
            _search = EditorGUILayout.TextField("Search", _search);
            if (GUILayout.Button("Rescan")) Rescan();
            EditorGUILayout.HelpBox(_status, MessageType.None);

            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            foreach (string group in GroupOrder)
            {
                List<string> paths;
                if (!_pathsByGroup.TryGetValue(group, out paths)) continue;
                EditorGUILayout.LabelField(group + " (" + paths.Count + ")", EditorStyles.boldLabel);
                foreach (string path in paths)
                {
                    string name = Path.GetFileNameWithoutExtension(path);
                    if (_search.Length > 0 && name.IndexOf(_search, System.StringComparison.OrdinalIgnoreCase) < 0) continue;
                    EditorGUILayout.BeginHorizontal();
                    EditorGUILayout.LabelField(name);
                    if (GUILayout.Button("Ping")) Ping(path);
                    if (GUILayout.Button("Place")) Place(path);
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndScrollView();
        }

        private static void Ping(string path)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab == null) return;
            EditorGUIUtility.PingObject(prefab);
            Selection.activeObject = prefab;
        }

        private static void Place(string path)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab == null) { Debug.LogWarning("[Frankenstein] Could not load " + path); return; }
            var instance = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
            if (instance == null) return;
            var view = SceneView.lastActiveSceneView;
            if (view != null) instance.transform.position = view.pivot;
            Undo.RegisterCreatedObjectUndo(instance, "Place DLNK prefab");
            Selection.activeObject = instance;
            SceneView.FrameLastActiveSceneView();
        }
    }
}
