// Original minimal stubs. Syntax/type check only; not the real Unity API. No behavior.
using System;
using UnityEngine;
using Object = UnityEngine.Object;

namespace UnityEditor
{
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class MenuItem : Attribute { public MenuItem(string path) { } }

    public class EditorWindow : ScriptableObject
    {
        public static T GetWindow<T>(string title) where T : EditorWindow, new() { return new T(); }
    }

    public static class EditorUtility
    {
        public static bool DisplayDialog(string title, string message, string ok) { return true; }
        public static bool DisplayDialog(string title, string message, string ok, string cancel) { return true; }
        public static string OpenFolderPanel(string title, string folder, string defaultName) { return ""; }
        public static void SetDirty(Object target) { }
    }

    public static class EditorPrefs
    {
        public static string GetString(string key, string defaultValue) { return defaultValue; }
        public static void SetString(string key, string value) { }
    }

    public static class FileUtil
    {
        public static string GetProjectRelativePath(string path) { return path; }
    }

    public static class Undo
    {
        public static void RecordObject(Object target, string name) { }
    }

    public static class Selection
    {
        public static Object activeObject { get { return null; } }
    }

    public static class AssetDatabase
    {
        public static bool IsValidFolder(string path) { return false; }
        public static string[] FindAssets(string filter, string[] searchInFolders) { return new string[0]; }
        public static string GUIDToAssetPath(string guid) { return ""; }
        public static T LoadAssetAtPath<T>(string path) where T : Object { return null; }
        public static void SaveAssets() { }
        public static void CreateAsset(Object asset, string path) { }
        public static void AddObjectToAsset(Object obj, Object assetObject) { }
        public static string CreateFolder(string parent, string newFolderName) { return ""; }
    }

    public enum MessageType { None, Info, Warning, Error }

    public sealed class GUIStyle { }
    public static class EditorStyles
    {
        public static GUIStyle miniLabel { get { return null; } }
        public static GUIStyle boldLabel { get { return null; } }
        public static GUIStyle textArea { get { return null; } }
    }

    public static class EditorGUILayout
    {
        public static void LabelField(string label) { }
        public static void LabelField(string label, string text) { }
        public static void LabelField(string label, GUIStyle style) { }
        public static Object ObjectField(string label, Object obj, Type objType, bool allowSceneObjects) { return obj; }
        public static int IntField(string label, int value) { return value; }
        public static float Slider(string label, float value, float left, float right) { return value; }
        public static void HelpBox(string message, MessageType type) { }
        public static Vector2 BeginScrollView(Vector2 scroll) { return scroll; }
        public static void EndScrollView() { }
        public static void SelectableLabel(string text, GUIStyle style, params GUILayoutOption[] options) { }
    }
}

namespace UnityEditor.SceneManagement
{
    public enum NewSceneSetup { EmptyScene, DefaultGameObjects }
    public enum NewSceneMode { Single, Additive }
    public struct Scene { }
    public static class EditorSceneManager
    {
        public static Scene NewScene(NewSceneSetup setup, NewSceneMode mode) { return default; }
        public static bool SaveScene(Scene scene, string path) { return true; }
    }
}
