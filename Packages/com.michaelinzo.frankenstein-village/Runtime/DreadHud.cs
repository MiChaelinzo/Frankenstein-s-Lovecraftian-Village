using Frankenstein.Core;
using UnityEngine;
using UnityEngine.UI;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Minimal UGUI readout: a quiet corner line for sanity and dread tier, a faint prompt and a
    /// fading narration line. No flashes, no shake, no sound. All numbers come from Core.
    /// </summary>
    public sealed class DreadHud : MonoBehaviour
    {
        public const float MessageSeconds = 5f;

        public HorrorAmbienceDirector director;
        public Text status;
        public Text prompt;
        public Text message;

        private float _messageUntil;

        /// <summary>Builds the canvas and three text lines in code so no UI prefab is needed.</summary>
        public static DreadHud Create(HorrorAmbienceDirector director)
        {
            var root = new GameObject("Dread HUD");
            var canvas = root.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var hud = root.AddComponent<DreadHud>();
            hud.director = director;
            hud.status = MakeText(root.transform, "Status", TextAnchor.UpperLeft, new Vector2(0f, 1f), new Vector2(16f, -16f), 0.55f);
            hud.prompt = MakeText(root.transform, "Prompt", TextAnchor.MiddleCenter, new Vector2(0.5f, 0.45f), Vector2.zero, 0.5f);
            hud.message = MakeText(root.transform, "Message", TextAnchor.LowerCenter, new Vector2(0.5f, 0f), new Vector2(0f, 64f), 0.85f);
            return hud;
        }

        private static Text MakeText(Transform parent, string name, TextAnchor align, Vector2 anchor, Vector2 offset, float alpha)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var rect = go.AddComponent<RectTransform>();
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.pivot = anchor;
            rect.anchoredPosition = offset;
            rect.sizeDelta = new Vector2(720f, 40f);
            var text = go.AddComponent<Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = 18;
            text.alignment = align;
            text.color = new Color(0.78f, 0.8f, 0.76f, alpha);
            text.raycastTarget = false;
            return text;
        }

        public void SetPrompt(string text) { if (prompt != null) prompt.text = text; }

        public void ShowMessage(string text)
        {
            if (message == null) return;
            message.text = text;
            _messageUntil = Time.time + MessageSeconds;
        }

        private void Update()
        {
            if (director != null && status != null)
            {
                float dread = director.Sanity.Dread;
                status.text = "Sanity " + Mathf.RoundToInt(director.Sanity.Value) + "   " +
                              DreadThresholds.TierNames[DreadThresholds.TierFor(dread)] + " " + DreadThresholds.Percent(dread) + "%";
            }
            if (message != null && Time.time > _messageUntil) message.text = "";
        }
    }
}
