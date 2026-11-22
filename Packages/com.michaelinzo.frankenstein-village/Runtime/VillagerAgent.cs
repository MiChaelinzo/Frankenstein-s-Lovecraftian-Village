using System;
using System.Collections.Generic;
using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin villager body. Who the villager is, where they stand, how they behave, whether their lantern burns and what talking does all come
    /// from Core (VillagerRules.GenerateRoster, LocationAt, StandPoint, CarriesLitLantern, Talk); this component only follows the Core presence point,
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
        [Tooltip("Optional: the ritual stage the village has reached (0 to 5), fed to Core corruption. Set by the scene; Core decides what it means.")]
        public int ritualStage;
        [Tooltip("Lantern colour of a Corrupted or later villager (Core VillageSociety decides who; this is only the colour).")]
        public Color corruptedLanternColor = new Color(0.55f, 0.86f, 0.78f);
        public Light lantern;
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
                    _roster = VillagerRules.GenerateRoster(village.seed, village.Layout, village.width, village.depth);
                    if (rosterIndex >= 0 && rosterIndex < _roster.Count) _villager = _roster[rosterIndex];
                }
                return _villager;
            }
        }

        private int Tick { get { return clock != null ? clock.Tick : GameClock.SessionStartTick; } }
        private List<Villager> _roster;
        /// <summary>Corruption stage Core gives this villager tonight (None when the builder has no story data or the villager is a townsperson outside the story roster).</summary>
        public CorruptionStage Corruption
        {
            get
            {
                var society = village != null ? village.Society : null;
                if (society == null || Villager == null || rosterIndex >= society.Roster.Count) return CorruptionStage.None;
                int night = walkthrough != null ? walkthrough.NightIndex + 1 : 1;
                return society.CorruptionAt(rosterIndex, night, Dread, ritualStage);
            }
        }

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
            var presence = PresenceNow();
            bool visible = !presence.Gone && !presence.Indoors; // Core hides villagers who are vanished or indoors behind their door
            var stage = Corruption; // Core: a Missing villager has vanished
            bool gone = presence.Gone || stage == CorruptionStage.Missing;
            visible = visible && stage != CorruptionStage.Missing;
            if (_renderers != null) foreach (var r in _renderers) r.enabled = visible;
            if (lantern != null)
            {
                lantern.enabled = visible && VillagerRules.CarriesLitLantern(v, Tick);
                if (VillageSociety.ColdLine(stage)) lantern.color = corruptedLanternColor;
            }
            if (gone) return;
            // Core already walks the villager between stops (VillagerRules.PresenceAt), so the body follows its point instead of choosing a route.
            transform.position = village.CellToWorld(presence.X, presence.Z);
            if (presence.FaceDx != 0.0 || presence.FaceDz != 0.0) transform.rotation = Quaternion.Euler(0f, (float)Math.Atan2(presence.FaceDx, presence.FaceDz) * Mathf.Rad2Deg, 0f);
        }

        private VillagerPresence PresenceNow()
        {
            if (Villager == null || village == null) return new VillagerPresence { Gone = true };
            return VillagerRules.PresenceAt(_roster, Villager, Tick, Dread, village.Layout, village.width, village.depth, village.seed);
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

        /// <summary>
        /// Chat (C key) through Core VillagerRules.Chat. Changes no clue and no sanity. The caller supplies what the vigil still needs
        /// and maps HintId to wording (the hint wording lives in web/src/i18n.js, villagerui.chat.*); an empty HintId means the villager is
        /// not lucid and the usual Talk line applies. Compile checked only; runtime behaviour is Unverified in Unity.
        /// </summary>
        public VillagerChatResult Chat(int topic, int cluesLeft, int lampsLeft, int sanity)
        {
            var v = Villager;
            if (v == null) return new VillagerChatResult { HintId = "" };
            int night = walkthrough != null ? walkthrough.NightIndex + 1 : 1;
            return VillagerRules.Chat(village.seed, v, Tick, Dread, night, topic, cluesLeft, lampsLeft, sanity);
        }
    }
}
