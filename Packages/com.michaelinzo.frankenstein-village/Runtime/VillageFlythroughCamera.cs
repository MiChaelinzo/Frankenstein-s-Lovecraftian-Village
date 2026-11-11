// PARTIALLY VERIFIED: compile checked against original stubs (tests/UnityCompileCheck). UNVERIFIED at runtime: never run in Unity.
// The path itself is Core FlythroughPath, Verified by dotnet tests and golden parity with web/src/cinematic.js.
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin MonoBehaviour: drives this object's transform along Core FlythroughPath so a Unity take matches the
    /// web "?view=3d&amp;cinematic=1" fly-through for the same seed, grid and beat durations. Elapsed time advances by
    /// Time.deltaTime only (a Unity Recorder with a fixed frame rate gives identical frames on every take); there is no
    /// UnityEngine.Random and no clock. Core yaw 0 looks down -Z, Unity heading 0 looks down +Z, hence heading = 180 - yaw.
    /// </summary>
    public sealed class VillageFlythroughCamera : MonoBehaviour
    {
        [Tooltip("Optional. When set, seed, grid size and cell size are read from it so the path hugs the built village.")]
        public VillageBuilder villageBuilder;
        public int seed = 1818;
        public int gridWidth = 24;
        public int gridDepth = 24;
        public float cellSize = 6f;
        [Tooltip("Beat durations in milliseconds, same meaning as the web story beats. Core adds a 2 s tail.")]
        public float[] beatDurationsMs = { 6000f, 6000f, 6000f, 6000f, 6000f };
        [Tooltip("Hold one still viewpoint, like the web reduced-motion setting.")]
        public bool reducedMotion;
        public bool playOnStart = true;
        [Tooltip("Restart after the take ends. Leave off when recording one take.")]
        public bool loop;

        /// <summary>Seconds into the take.</summary>
        public float Elapsed { get; private set; }
        public bool Playing { get; private set; }
        /// <summary>True once the take reached its end (never true while looping).</summary>
        public bool Finished { get; private set; }

        /// <summary>Total take length in seconds, from Core.</summary>
        public float TotalSeconds { get { return (float)(FlythroughPath.TotalMs(ToDoubles()) / 1000.0); } }

        private void Start() { if (playOnStart) Play(); }

        [ContextMenu("Play Take")]
        public void Play()
        {
            Elapsed = 0f;
            Finished = false;
            Playing = true;
            Evaluate(0f);
        }

        public void Stop() { Playing = false; }

        private void Update()
        {
            if (!Playing) return;
            Elapsed += Time.deltaTime;
            float total = TotalSeconds;
            if (Elapsed >= total)
            {
                if (loop) Elapsed = 0f;
                else { Elapsed = total; Playing = false; Finished = true; }
            }
            Evaluate(Elapsed);
        }

        /// <summary>Places the camera at elapsed seconds t. Pure function of the fields and t.</summary>
        public void Evaluate(float seconds)
        {
            int w = gridWidth, d = gridDepth;
            double cell = cellSize;
            int s = seed;
            if (villageBuilder != null) { w = villageBuilder.width; d = villageBuilder.depth; cell = villageBuilder.cellSize; s = villageBuilder.seed; }
            FlyCamera cam = FlythroughPath.Camera(seconds * 1000.0, ToDoubles(), w, d, s, reducedMotion, cell);
            Vector3 origin = villageBuilder != null ? villageBuilder.transform.position : Vector3.zero;
            const double RadToDeg = 180.0 / System.Math.PI;
            float heading = (float)(180.0 - cam.Yaw * RadToDeg);
            float pitchDown = (float)(-cam.Pitch * RadToDeg);
            transform.SetPositionAndRotation(origin + new Vector3((float)cam.X, (float)cam.Y, (float)cam.Z), Quaternion.Euler(pitchDown, heading, 0f));
        }

        private double[] ToDoubles()
        {
            var ds = new double[beatDurationsMs == null ? 0 : beatDurationsMs.Length];
            for (int i = 0; i < ds.Length; i++) ds[i] = beatDurationsMs[i];
            return ds;
        }
    }
}
