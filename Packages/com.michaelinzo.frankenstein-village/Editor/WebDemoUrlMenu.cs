// PARTIALLY VERIFIED: compile checked against original stubs. UNVERIFIED at runtime: never run in the Unity editor.
// The link text comes from Core WebShareLink, Verified by dotnet tests and golden parity with web/src/session.js.
using Frankenstein.Core;
using Frankenstein.Runtime;
using UnityEditor;
using UnityEngine;

namespace Frankenstein.Editor
{
    /// <summary>Copies a link to the browser demo that matches the open scene (same seed), for the side-by-side recording.</summary>
    public static class WebDemoUrlMenu
    {
        public const string DemoUrl = "https://frankensteinlovecraftianvillage.vercel.app/";

        [MenuItem("Tools/Frankenstein/Copy Matching Web Demo URL")]
        public static void Copy()
        {
            var builder = Object.FindFirstObjectByType<VillageBuilder>();
            var fly = Object.FindFirstObjectByType<VillageFlythroughCamera>();
            int seed = builder != null ? builder.seed : fly != null ? fly.seed : 1818;
            var options = new WebShareOptions
            {
                Seed = seed,
                Sanity = (int)SanityModel.Max,
                View3d = true,
                Cinematic = fly != null, // a scene with the showcase camera gets the web fly-through
            };
            string link = WebShareLink.Link(DemoUrl, options);
            GUIUtility.systemCopyBuffer = link;
            Debug.Log("[Frankenstein] Copied web demo URL: " + link);
        }
    }
}
