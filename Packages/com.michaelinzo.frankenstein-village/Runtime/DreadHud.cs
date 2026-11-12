using System;
using Frankenstein.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Minimal UGUI readout: a quiet corner line for sanity and dread tier, a faint prompt and a
    /// fading narration line. No flashes, no shake, no sound. All numbers come from Core. It also holds the vigil objective
    /// line, a quiet Endure button and the ending panel; VigilDirector fills them with Core VigilStrings text.
    /// </summary>
    public sealed class DreadHud : MonoBehaviour
    {
        public const float MessageSeconds = 5f;

        public HorrorAmbienceDirector director;
        public Text status;
        public Text prompt;
        public Text message;
        public Text objective;
        public Button endureButton;
        public Text endureLabel;
        public GameObject endingPanel;
        public Text endingTitle;
        public Text endingBody;

        /// <summary>Raised when the player presses the Endure button.</summary>
        public event Action EndureRequested;

        private const float EndingPanelAlpha = 0.88f;
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
            hud.objective = MakeText(root.transform, "Objective", TextAnchor.UpperLeft, new Vector2(0f, 1f), new Vector2(16f, -40f), 0.55f);
            hud.BuildEndureButton(root.transform);
            hud.BuildEndingPanel(root.transform);
            EnsureEventSystem();
            return hud;
        }

        /// <summary>Makes sure clicks reach the Endure button: adds an EventSystem with the Input System UI module when none exists.</summary>
        public static void EnsureEventSystem()
        {
            if (UnityEngine.Object.FindFirstObjectByType<EventSystem>() != null) return;
            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
            go.AddComponent<InputSystemUIInputModule>();
        }

        private void BuildEndureButton(Transform parent)
        {
            var go = new GameObject("Endure Button");
            go.transform.SetParent(parent, false);
            var rect = go.AddComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0.5f, 0f);
            rect.anchoredPosition = new Vector2(0f, 120f);
            rect.sizeDelta = new Vector2(280f, 36f);
            go.AddComponent<Image>().color = new Color(0.05f, 0.07f, 0.08f, 0.7f);
            endureButton = go.AddComponent<Button>();
            endureButton.onClick.AddListener(() => { if (EndureRequested != null) EndureRequested(); });
            endureLabel = MakeText(go.transform, "Label", TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), Vector2.zero, 0.85f);
            endureLabel.rectTransform.sizeDelta = rect.sizeDelta;
            go.SetActive(false);
        }

        private void BuildEndingPanel(Transform parent)
        {
            endingPanel = new GameObject("Vigil Ending");
            endingPanel.transform.SetParent(parent, false);
            var rect = endingPanel.AddComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0.5f, 0.5f);
            rect.sizeDelta = new Vector2(760f, 360f);
            endingPanel.AddComponent<Image>().color = new Color(0.02f, 0.03f, 0.04f, EndingPanelAlpha);
            endingTitle = MakeText(endingPanel.transform, "Title", TextAnchor.UpperCenter, new Vector2(0.5f, 1f), new Vector2(0f, -24f), 1f);
            endingTitle.fontSize = 28;
            endingBody = MakeText(endingPanel.transform, "Body", TextAnchor.UpperCenter, new Vector2(0.5f, 1f), new Vector2(0f, -80f), 0.9f);
            endingBody.rectTransform.sizeDelta = new Vector2(700f, 260f);
            endingPanel.SetActive(false);
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

        public void SetObjective(string text) { if (objective != null) objective.text = text; }

        /// <summary>Shows the Endure button with a label, or hides it. Only shown when Core says the night can be endured.</summary>
        public void SetEndure(bool visible, string label)
        {
            if (endureButton == null) return;
            endureButton.gameObject.SetActive(visible);
            if (visible && endureLabel != null) endureLabel.text = label;
        }

        public void ShowEnding(string title, string body)
        {
            if (endingPanel == null) return;
            endingTitle.text = title;
            endingBody.text = body;
            endingPanel.SetActive(true);
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
