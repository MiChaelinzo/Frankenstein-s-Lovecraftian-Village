// Original minimal stubs. Syntax/type check only; not the real Unity API. No behavior.
using System;
using System.Collections.Generic;

namespace UnityEngine
{
    public class Object
    {
        public string name { get; set; }
        public static T Instantiate<T>(T original, Vector3 position, Quaternion rotation, Transform parent) where T : Object { return original; }
        public static void DestroyImmediate(Object obj) { }
        public static T FindFirstObjectByType<T>() where T : Object { return null; }
        public static implicit operator bool(Object o) { return o != null; }
    }
    public class Component : Object
    {
        public Transform transform { get { return null; } }
        public GameObject gameObject { get { return null; } }
        public T GetComponent<T>() { return default; }
        public T GetComponentInParent<T>() { return default; }
        public T[] GetComponentsInChildren<T>() { return new T[0]; }
    }
    public class Behaviour : Component { public bool enabled { get; set; } }
    public class MonoBehaviour : Behaviour { }
    public class ScriptableObject : Object
    {
        public static T CreateInstance<T>() where T : ScriptableObject, new() { return new T(); }
    }
    public enum PrimitiveType { Sphere, Capsule, Cylinder, Cube, Plane, Quad }
    public sealed class GameObject : Object
    {
        public GameObject() { }
        public GameObject(string name) { }
        public Transform transform { get { return null; } }
        public string tag { get; set; }
        public T AddComponent<T>() where T : Component, new() { return new T(); }
        public void SetActive(bool value) { }
        public T GetComponent<T>() { return default; }
        public T GetComponentInChildren<T>() { return default; }
        public T[] GetComponentsInChildren<T>() { return new T[0]; }
        public static GameObject CreatePrimitive(PrimitiveType type) { return null; }
    }
    public sealed class Transform : Component
    {
        public Vector3 position { get { return default; } set { } }
        public Quaternion rotation { get { return default; } set { } }
        public Vector3 localScale { get { return default; } set { } }
        public Vector3 forward { get { return default; } }
        public Vector3 right { get { return default; } }
        public void SetParent(Transform parent, bool worldPositionStays) { }
        public void SetPositionAndRotation(Vector3 position, Quaternion rotation) { }
    }
    public class Renderer : Component { public bool enabled { get; set; } public Material[] sharedMaterials { get; set; } }
    public class Mesh : Object
    {
        public Vector3[] vertices { get; set; }
        public int subMeshCount { get; set; }
        public void SetTriangles(int[] triangles, int submesh) { }
        public void RecalculateNormals() { }
        public void RecalculateBounds() { }
    }
    public sealed class Shader : Object { public static Shader Find(string name) { return null; } }
    public class Material : Object
    {
        public Material(Shader shader) { }
        public bool HasProperty(string name) { return false; }
        public void SetColor(string name, Color value) { }
        public void SetFloat(string name, float value) { }
        public void EnableKeyword(string keyword) { }
    }
    public sealed class MeshRenderer : Renderer { }
    public sealed class MeshFilter : Component { public Mesh sharedMesh { get; set; } }
    public class Collider : Component { }
    public sealed class MeshCollider : Collider { public Mesh sharedMesh { get; set; } }
    public sealed class CapsuleCollider : Collider { }
    public sealed class CharacterController : Collider
    {
        public float height { get; set; }
        public float radius { get; set; }
        public Vector3 center { get; set; }
        public bool isGrounded { get { return false; } }
        public int Move(Vector3 motion) { return 0; }
    }
    public struct Ray { }
    public struct RaycastHit { public float distance { get { return 0f; } } public Collider collider { get { return null; } } }
    public static class Physics
    {
        public static bool Raycast(Vector3 origin, Vector3 direction, out RaycastHit hit, float maxDistance) { hit = default; return false; }
    }
    public enum CameraClearFlags { Skybox, SolidColor }
    public sealed class Camera : Behaviour
    {
        public CameraClearFlags clearFlags { get; set; }
        public Color backgroundColor { get; set; }
        public float farClipPlane { get; set; }
    }
    public sealed class AudioListener : Behaviour { }
    public enum LightType { Spot, Directional, Point }
    public sealed class Light : Behaviour
    {
        public LightType type { get; set; }
        public Color color { get; set; }
        public float intensity { get; set; }
    }
    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b) { this.r = r; this.g = g; this.b = b; a = 1f; }
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
    }
    public enum CursorLockMode { None, Locked, Confined }
    public static class Cursor { public static CursorLockMode lockState { get; set; } }
    public class Font : Object { }
    public static class Resources
    {
        public static T GetBuiltinResource<T>(string path) where T : Object { return null; }
    }
    public class TextAsset : Object { public string text { get { return ""; } } }
    public enum TextAnchor { UpperLeft, UpperCenter, MiddleCenter, LowerCenter }
    public enum RenderMode { ScreenSpaceOverlay }
    public sealed class Canvas : Behaviour { public RenderMode renderMode { get; set; } }
    public sealed class RectTransform : Component
    {
        public Vector2 anchorMin { get; set; }
        public Vector2 anchorMax { get; set; }
        public Vector2 pivot { get; set; }
        public Vector2 anchoredPosition { get; set; }
        public Vector2 sizeDelta { get; set; }
    }
    public sealed class AudioSource : Behaviour
    {
        public float volume { get; set; }
    }

    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero { get { return default; } }
    }
    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 forward { get { return default; } }
        public static Vector3 zero { get { return default; } }
        public static Vector3 operator +(Vector3 a, Vector3 b) { return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); }
        public static Vector3 operator -(Vector3 a, Vector3 b) { return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); }
        public static Vector3 operator *(Vector3 a, float f) { return new Vector3(a.x * f, a.y * f, a.z * f); }
    }
    public struct Quaternion
    {
        public static Quaternion identity { get { return default; } }
        public static Quaternion Euler(float x, float y, float z) { return default; }
        public static Vector3 operator *(Quaternion q, Vector3 v) { return v; }
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
        public static float time { get { return 0f; } }
    }

    public static class GUIUtility
    {
        public static string systemCopyBuffer { get; set; }
    }

    public static class Debug
    {
        public static void Log(object message) { }
        public static void LogWarning(object message) { }
        public static void LogError(object message) { }
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

namespace UnityEngine.UI
{
    public class Text : Behaviour
    {
        public Font font { get; set; }
        public int fontSize { get; set; }
        public TextAnchor alignment { get; set; }
        public Color color { get; set; }
        public bool raycastTarget { get; set; }
        public string text { get; set; }
        public RectTransform rectTransform { get { return null; } }
    }
    public class Image : Behaviour { public Color color { get; set; } }
    public class Button : Behaviour { public Events.UnityEvent onClick { get { return null; } } }
}

namespace UnityEngine.EventSystems
{
    public class EventSystem : Behaviour { }
}

namespace UnityEngine.InputSystem.UI
{
    public class InputSystemUIInputModule : Behaviour { }
}

namespace UnityEngine.InputSystem
{
    public sealed class ButtonControl { public bool isPressed { get { return false; } } public bool wasPressedThisFrame { get { return false; } } }
    public sealed class Vector2Control { public Vector2 ReadValue() { return default; } }
    public sealed class Keyboard
    {
        public static Keyboard current { get { return null; } }
        public ButtonControl wKey { get { return null; } }
        public ButtonControl aKey { get { return null; } }
        public ButtonControl sKey { get { return null; } }
        public ButtonControl dKey { get { return null; } }
        public ButtonControl eKey { get { return null; } }
        public ButtonControl vKey { get { return null; } }
        public ButtonControl escapeKey { get { return null; } }
    }
    public sealed class Mouse
    {
        public static Mouse current { get { return null; } }
        public Vector2Control delta { get { return null; } }
        public ButtonControl leftButton { get { return null; } }
    }
}

namespace UnityEngine.Events
{
    public delegate void UnityAction<T0>(T0 a);
    public delegate void UnityAction();
    public class UnityEvent
    {
        public void AddListener(UnityAction call) { }
        public void Invoke() { }
    }
    public class UnityEvent<T0>
    {
        public void AddListener(UnityAction<T0> call) { }
        public void Invoke(T0 a) { }
    }
    public class UnityEvent<T0, T1>
    {
        public void Invoke(T0 a, T1 b) { }
    }
}

namespace UnityEngine.Rendering
{
    public class RenderPipelineAsset : ScriptableObject { }
    public static class GraphicsSettings { public static RenderPipelineAsset currentRenderPipeline { get { return null; } } }
    public class Volume : MonoBehaviour
    {
        public float weight { get; set; }
        public bool isGlobal { get; set; }
        public VolumeProfile sharedProfile { get; set; }
    }
    public class VolumeComponent : ScriptableObject { }
    public abstract class VolumeParameter { public bool overrideState { get; set; } }
    public sealed class VolumeProfile : ScriptableObject
    {
        public VolumeComponent Add(Type type, bool overrides) { return null; }
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
        public string error { get { return null; } }
        public void SetRequestHeader(string name, string value) { }
        public UnityWebRequestAsyncOperation SendWebRequest() { return null; }
        public void Dispose() { }
    }
}
