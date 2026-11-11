using System;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Casts a ray from the player's eye, then forwards the hit to existing Core rules: door omens
    /// through DlnkDoorOmenBridge, narration through HorrorAmbienceDirector, sanity cost through
    /// InteractionRules. Distance and cooldown decisions are Core; this class only measures them.
    /// Code-complete, unverified in Unity (compile checked against original stubs only).
    /// </summary>
    public sealed class InteractionRaycaster : MonoBehaviour
    {
        public Transform eye;
        public HorrorAmbienceDirector director;
        public DreadHud hud;
        [Tooltip("Prompt language, a key of Core PromptStrings (en or fr). Unknown values fall back to English.")]
        public string language = PromptStrings.DefaultLanguage;

        /// <summary>Raised after a successful interaction with the kind that was used.</summary>
        public event Action<InteractionKind> Interacted;

        private float _lastUse = float.NegativeInfinity;

        /// <summary>The target under the crosshair this frame, or null.</summary>
        public InteractionTarget Focus { get; private set; }

        private void Update()
        {
            Focus = Probe();
            if (hud != null) hud.SetPrompt(Focus != null ? "E  " + PromptStrings.Prompt(language, Focus.kind, Focus.locationId) : "");
        }

        /// <summary>Returns the in-range target in front of the eye, or null.</summary>
        public InteractionTarget Probe()
        {
            if (eye == null) return null;
            RaycastHit hit;
            if (!Physics.Raycast(eye.position, eye.forward, out hit, InteractionRules.Range)) return null;
            if (!InteractionRules.InRange(hit.distance)) return null;
            return hit.collider.GetComponentInParent<InteractionTarget>();
        }

        /// <summary>Uses the focused target if the cooldown allows. Returns true when something happened.</summary>
        public bool TryInteract()
        {
            if (director == null || !InteractionRules.CooldownElapsed(Time.time, _lastUse)) return false;
            var target = Focus != null ? Focus : Probe();
            if (target == null) return false;
            _lastUse = Time.time;

            float dread = director.Sanity.Dread;
            string text;
            if (target.kind == InteractionKind.Door)
            {
                var behavior = target.door != null ? target.door.TryOpen(dread) : DoorBehavior.Normal;
                text = InteractionRules.DoorMessage(behavior);
            }
            else
            {
                text = director.Describe(target.locationId);
            }
            director.Sanity.Apply(InteractionRules.SanityDelta(target.kind));
            if (hud != null) hud.ShowMessage(text);
            if (Interacted != null) Interacted(target.kind);
            return true;
        }
    }
}
