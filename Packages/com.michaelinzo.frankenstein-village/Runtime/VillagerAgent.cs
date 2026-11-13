using System.Collections.Generic;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin villager body. Who the villager is, where they stand, how they behave, whether their lantern burns and what talking does all come
    /// from Core (VillagerRules.GenerateRoster, LocationAt, StandPoint, CarriesLitLantern, Talk); this component only walks toward the Core point,
    /// hides the body when Core says Gone, toggles the lantern light and forwards talk effects to the vigil and sanity.
    /// InteractionRaycaster calls Talk when the villager is under the crosshair. Compile checked against original stubs only; runtime behaviour is Unverified in Unity.
    /// </summary>
    public sealed class VillagerAgent : MonoBehaviour
    {
        [Tooltip("Index into the Core roster for the village seed.")]
        public int rosterIndex;
        public VillageBuilder village;
        public DayNightDirector clock;
        public HorrorAmbienceDirector director;
        public ProgressionTracker tracker;
        public WalkthroughController walkthrough;
        public DreadHud hud;
        public Light lantern;
        [Tooltip("Walking pace in metres per second.")]
        [Min(0f)] public float walkSpeed = 1.2f;
        [Tooltip("Villager wording language, a key of Core VillagerStrings (en or fr).")]
        public string language = "en";

        private Villager _villager;
        private Renderer[] _renderers;

        /// <summary>The Core villager, or null when the roster has no entry at this index.</summary>
        public Villager Villager
        {
            get
            {
                if (_villager == null && village != null && village.Layout != null)
                {
                    List<Villager> roster = VillagerRules.GenerateRoster(village.seed, village.Layout);
                    if (rosterIndex >= 0 && rosterIndex < roster.Count) _villager = roster[rosterIndex];
                }
                return _villager;
            }
        }

        private int Tick { get { return clock != null ? clock.Tick : GameClock.SessionStartTick; } }
        private float Dread { get { return director != null ? director.Sanity.Dread : 0f; } }

        /// <summary>True while Core places the villager somewhere (not vanished).</summary>
        public bool Present { get { return Villager != null && VillagerRules.LocationAt(Villager, Tick, Dread).Kind != VillagerPlaceKind.Gone; } }

        private void Start()
        {
            _renderers = GetComponentsInChildren<Renderer>();
            var target = Target();
            if (target.HasValue) transform.position = target.Value;
        }

        private void Update()
        {
            var v = Villager;
            if (v == null) return;
            bool present = Present;
            if (_renderers != null) foreach (var r in _renderers) r.enabled = present;
            if (lantern != null) lantern.enabled = present && VillagerRules.CarriesLitLantern(v, Tick);
            if (!present) return;
            var target = Target();
            if (!target.HasValue) return;
            transform.position = Vector3.MoveTowards(transform.position, target.Value, walkSpeed * Time.deltaTime);
        }

        /// <summary>World point Core gives for this tick and dread, or null when the villager is gone.</summary>
        private Vector3? Target()
        {
            var v = Villager;
            if (v == null || village == null) return null;
            var place = VillagerRules.LocationAt(v, Tick, Dread);
            if (place.Kind == VillagerPlaceKind.Gone) return null;
            var pt = VillagerRules.StandPoint(v, place.Kind, village.Layout, village.width, village.depth, village.seed);
            return village.CellToWorld(pt.X, pt.Z);
        }

        /// <summary>Prompt text for the crosshair: the villager's name and role.</summary>
        public string Prompt()
        {
            var v = Villager;
            return v == null ? "" : v.Name + " (" + VillagerStrings.RoleName(language, v.Role) + ")";
        }

        /// <summary>
        /// Talks to the villager through Core VillagerRules.Talk, applies the clue (vigil) and sanity effect, and shows the Core line.
        /// Returns the Core result; Available is false when the villager is gone.
        /// </summary>
        public VillagerTalkResult Talk()
        {
            var v = Villager;
            if (v == null) return new VillagerTalkResult();
            int night = walkthrough != null ? walkthrough.NightIndex + 1 : 1;
            var campaign = walkthrough != null ? walkthrough.Campaign : null;
            var result = VillagerRules.Talk(village.seed, v, Tick, Dread, campaign, night);
            if (!result.Available) return result;
            if (result.YieldsClue && tracker != null)
            {
                ProgressionUpdate update;
                tracker.Session.RecordVigilClue(result.ClueId, out update);
                tracker.Publish(update);
            }
            if (director != null && result.SanityDelta != 0f) director.Sanity.Apply(result.SanityDelta);
            if (hud != null) hud.ShowMessage(v.Name + ": " + VillagerStrings.Line(language, v.Role, result.Behavior, result.LineVariant, v.Name));
            return result;
        }
    }
}
