// Original minimal stubs. Syntax/type check only; not the real Unity API. No behavior.
using System;
using System.Collections.Generic;

namespace UnityEngine
{
    public class Object
    {
        public static T Instantiate<T>(T original, Vector3 position, Quaternion rotation, Transform parent) where T : Object { return original; }
    }
    public class Component : Object
    {
        public Transform transform { get { return null; } }
    }
    public class Behaviour : Component { }
    public class MonoBehaviour : Behaviour { }
    public class ScriptableObject : Object { }
    public sealed class GameObject : Object { }
    public sealed class Transform : Component
    {
        public Vector3 position { get { return default; } set { } }
    }
    public sealed class AudioSource : Behaviour
    {
        public float volume { get; set; }
    }

    public struct Vector2 { }
    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 operator +(Vector3 a, Vector3 b) { return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); }
    }
    public struct Quaternion
    {
        public static Quaternion identity { get { return default; } }
    }

    public static class Mathf
    {
        public static int Clamp(int v, int min, int max) { return v < min ? min : (v > max ? max : v); }
        public static float Clamp(float v, float min, float max) { return v < min ? min : (v > max ? max : v); }
        public static int RoundToInt(float f) { return (int)Math.Round(f); }
        public static bool Approximately(float a, float b) { return Math.Abs(a - b) < 1e-6f; }
        public static float MoveTowards(float current, float target, float maxDelta) { return current; }
    }

    public static class Time
    {
        public static float deltaTime { get { return 0f; } }
    }

    public static class Debug
    {
        public static void Log(object message) { }
        public static void LogWarning(object message) { }
    }

    public static class PlayerPrefs
    {
        public static void SetString(string key, string value) { }
        public static string GetString(string key, string defaultValue) { return defaultValue; }
        public static void Save() { }
        public static void DeleteKey(string key) { }
    }

    public enum KeyCode { Period, Comma }
    public static class Input
    {
        public static bool GetKeyDown(KeyCode key) { return false; }
    }

    public static class JsonUtility
    {
        public static string ToJson(object obj) { return ""; }
        public static T FromJson<T>(string json) { return default; }
    }

    [AttributeUsage(AttributeTargets.Field)] public sealed class MinAttribute : Attribute { public MinAttribute(float min) { } }
    [AttributeUsage(AttributeTargets.Field)] public sealed class RangeAttribute : Attribute { public RangeAttribute(float min, float max) { } }
    [AttributeUsage(AttributeTargets.Field)] public sealed class TooltipAttribute : Attribute { public TooltipAttribute(string tooltip) { } }
    [AttributeUsage(AttributeTargets.Method)] public sealed class ContextMenu : Attribute { public ContextMenu(string name) { } }
    [AttributeUsage(AttributeTargets.Class)] public sealed class CreateAssetMenuAttribute : Attribute { public string menuName { get; set; } }

    public static class GUILayout
    {
        public static bool Button(string text) { return false; }
        public static GUILayoutOption MinHeight(float h) { return null; }
    }
    public sealed class GUILayoutOption { }
}

namespace UnityEngine.Events
{
    public class UnityEvent
    {
        public void Invoke() { }
    }
    public class UnityEvent<T0>
    {
        public void Invoke(T0 a) { }
    }
    public class UnityEvent<T0, T1>
    {
        public void Invoke(T0 a, T1 b) { }
    }
}

namespace UnityEngine.Rendering
{
    public class Volume : MonoBehaviour
    {
        public float weight { get; set; }
    }
}

namespace UnityEngine.Networking
{
    public class UploadHandler : IDisposable { public void Dispose() { } }
    public sealed class UploadHandlerRaw : UploadHandler { public UploadHandlerRaw(byte[] data) { } }
    public class DownloadHandler : IDisposable { public string text { get { return ""; } } public void Dispose() { } }
    public sealed class DownloadHandlerBuffer : DownloadHandler { }
    public class AsyncOperation { public event Action<AsyncOperation> completed { add { } remove { } } }
    public sealed class UnityWebRequestAsyncOperation : AsyncOperation { }
    public sealed class UnityWebRequest : IDisposable
    {
        public const string kHttpVerbPOST = "POST";
        public enum Result { InProgress, Success, ConnectionError, ProtocolError, DataProcessingError }
        public UnityWebRequest(string url, string method) { }
        public UploadHandler uploadHandler { get; set; }
        public DownloadHandler downloadHandler { get; set; }
        public int timeout { get; set; }
        public Result result { get { return Result.InProgress; } }
        public void SetRequestHeader(string name, string value) { }
        public UnityWebRequestAsyncOperation SendWebRequest() { return null; }
        public void Dispose() { }
    }
}
