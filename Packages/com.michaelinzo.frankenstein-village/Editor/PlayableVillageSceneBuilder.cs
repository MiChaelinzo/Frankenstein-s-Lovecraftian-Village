// UNVERIFIED: written without access to the Unity editor, so it has not been run in Unity. It is
// compile checked against original hand-written stubs only (tests/UnityCompileCheck). The layout it
// builds comes from VillageLayoutGenerator, which is covered by dotnet property tests.
using System;
using Frankenstein.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Frankenstein.Editor
{
    /// <summary>
    /// One click playable scene: village from VillageBuilder (pack prefabs when imported and bound,
    /// plain blocks otherwise), a first person player, the dread HUD, ambience, ritual and walkthrough
    /// directors, and calm and dread Volumes blended by DreadVolumeBlender. Fog and vignette overrides are
    /// added by reflection so this assembly never references a specific render pipeline; when the
    /// override types are missing (for example URP) the Volumes stay empty and a warning says so.
    /// </summary>
    public static class PlayableVillageSceneBuilder
    {
        public const string CatalogJsonPath = "Packages/com.michaelinzo.frankenstein-village/Data/village_catalog.json";
        public const string OutputFolder = "Assets/Frankenstein";
        public const string ScenePath = OutputFolder + "/PlayableVillage.unity";
        private const string HdrpNamespace = "UnityEngine.Rendering.HighDefinition";
        private const string HdrpAssembly = "Unity.RenderPipelines.HighDefinition.Runtime";

        [MenuItem("Tools/Frankenstein/Create Playable Village Scene")]
        public static void Create()
        {
            EnsureFolder(OutputFolder);
            var catalog = LoadOrCreateCatalog();
            bool packImported = AssetDatabase.IsValidFolder(CatalogAutoBinder.DefaultRoot);
            if (packImported) CatalogAutoBinder.Bind(catalog, CatalogAutoBinder.DefaultRoot);
            else Debug.LogWarning("[Frankenstein] No pack found at '" + CatalogAutoBinder.DefaultRoot + "'. Building with plain blocks. See docs/UNITY_SETUP.md to import your own copy of the pack.");

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            AddSun();
            AddGround();

            var village = new GameObject("Village");
            var builder = village.AddComponent<VillageBuilder>();
            builder.catalog = catalog;
            builder.buildOnStart = false;
            builder.Build();

            var director = AddDirectors();
            var player = AddPlayer(builder, director);
            player.interactor.hud = DreadHud.Create(director);

            var tracker = director.gameObject.AddComponent<ProgressionTracker>();
            tracker.director = director;
            tracker.interactor = player.interactor;
            tracker.ritualDirector = director.GetComponent<RitualDirector>();
            tracker.walkthrough = director.GetComponent<WalkthroughController>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            Debug.Log("[Frankenstein] Saved " + ScenePath + (packImported ? " (pack prefabs bound where names matched)." : " (primitive fallback, pack not imported)."));
        }

        private static VillageCatalogAsset LoadOrCreateCatalog()
        {
            string path = OutputFolder + "/VillageCatalog.asset";
            var existing = AssetDatabase.LoadAssetAtPath<VillageCatalogAsset>(path);
            if (existing != null) return existing;
            var json = AssetDatabase.LoadAssetAtPath<TextAsset>(CatalogJsonPath);
            if (json == null) throw new InvalidOperationException("Catalog JSON not found at " + CatalogJsonPath + ". Is the package installed?");
            var asset = ScriptableObject.CreateInstance<VillageCatalogAsset>();
            asset.LoadFromJson(json.text);
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        private static void AddSun()
        {
            var go = new GameObject("Dusk Light");
            var light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(0.55f, 0.6f, 0.8f);
            light.intensity = 2f; // HDRP uses lux; raise this in the Inspector if the scene is too dark
            go.transform.rotation = Quaternion.Euler(35f, -30f, 0f);
        }

        private static void AddGround()
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.transform.position = new Vector3(72f, 0f, 72f);
            ground.transform.localScale = new Vector3(20f, 1f, 20f);
        }

        private static HorrorAmbienceDirector AddDirectors()
        {
            var go = new GameObject("Dread Director");
            var director = go.AddComponent<HorrorAmbienceDirector>();
            var blender = go.AddComponent<DreadVolumeBlender>();
            blender.calmVolume = AddVolume("Calm Volume", 1f, 80f, 0f);
            blender.dreadVolume = AddVolume("Dread Volume", 0f, 14f, 0.45f);
            director.volumeBlender = blender;

            var walk = go.AddComponent<WalkthroughController>();
            walk.director = director;
            var ritual = go.AddComponent<RitualDirector>();
            ritual.director = director;
            ritual.walkthrough = walk;
            return director;
        }

        private static Volume AddVolume(string name, float weight, float meanFreePath, float vignette)
        {
            var go = new GameObject(name);
            var volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.weight = weight;
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, OutputFolder + "/" + name.Replace(' ', '_') + ".asset");
            volume.sharedProfile = profile;

            bool fog = TryAddOverride(profile, "Fog", ("enabled", true), ("meanFreePath", meanFreePath), ("maxFogDistance", 400f));
            bool vig = TryAddOverride(profile, "Vignette", ("intensity", vignette));
            if (!fog || !vig)
                Debug.LogWarning("[Frankenstein] Could not add every HDRP override to '" + name + "' (HDRP not present or a field changed). Add Fog and Vignette overrides to the profile by hand.");
            EditorUtility.SetDirty(profile);
            return volume;
        }

        /// <summary>Adds an HDRP override by type name and sets "value" on each named parameter field. Returns false instead of throwing when anything is missing.</summary>
        private static bool TryAddOverride(VolumeProfile profile, string typeName, params (string field, object value)[] values)
        {
            var type = Type.GetType(HdrpNamespace + "." + typeName + ", " + HdrpAssembly);
            if (type == null) return false;
            var component = profile.Add(type, true);
            if (component == null) return false;
            AssetDatabase.AddObjectToAsset(component, profile);
            bool ok = true;
            foreach (var (field, value) in values)
            {
                var parameterField = type.GetField(field);
                var parameter = parameterField != null ? parameterField.GetValue(component) as VolumeParameter : null;
                if (parameter == null) { ok = false; continue; }
                parameter.overrideState = true;
                var valueProperty = parameter.GetType().GetProperty("value");
                if (valueProperty == null) { ok = false; continue; }
                try { valueProperty.SetValue(parameter, Convert.ChangeType(value, valueProperty.PropertyType)); }
                catch (Exception ex) when (ex is InvalidCastException || ex is FormatException || ex is ArgumentException)
                {
                    Debug.LogWarning("[Frankenstein] Could not set " + typeName + "." + field + ": " + ex.Message);
                    ok = false;
                }
            }
            return ok;
        }

        private static FirstPersonExplorer AddPlayer(VillageBuilder builder, HorrorAmbienceDirector director)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            go.name = "Player";
            UnityEngine.Object.DestroyImmediate(go.GetComponent<CapsuleCollider>());
            go.transform.position = new Vector3(builder.width * builder.cellSize * 0.5f, 1.1f, -4f);

            var explorer = go.AddComponent<FirstPersonExplorer>();
            explorer.body = go.AddComponent<CharacterController>();
            explorer.director = director;
            explorer.bodyRenderer = go.GetComponent<Renderer>();
            explorer.cameraBridge = go.AddComponent<DlnkCameraModeBridge>();

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.07f, 0.08f, 0.1f);
            cam.farClipPlane = 500f;
            explorer.viewCamera = cam;

            var eye = new GameObject("Eye").transform;
            var raycaster = go.AddComponent<InteractionRaycaster>();
            raycaster.eye = eye;
            raycaster.director = director;
            explorer.interactor = raycaster;
            AddCandle(builder);
            return explorer;
        }

        private static void AddCandle(VillageBuilder builder)
        {
            var candle = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            candle.name = "Candle";
            candle.transform.position = new Vector3(builder.width * builder.cellSize * 0.5f + 2f, 0.4f, -2f);
            candle.transform.localScale = new Vector3(0.2f, 0.4f, 0.2f);
            var target = candle.AddComponent<InteractionTarget>();
            target.kind = Frankenstein.Core.InteractionKind.Candle;
            target.locationId = "the candle";
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            AssetDatabase.CreateFolder("Assets", path.Substring("Assets/".Length));
        }
    }
}
