using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>The seven village roles. Order is stable; the roster has exactly one villager per role.</summary>
    public enum VillagerRole { Fisher = 0, Priest = 1, Innkeeper = 2, Lamplighter = 3, LighthouseKeeper = 4, Widow = 5, Child = 6 }

    /// <summary>How a villager meets the player. Seeded from two candidates per role.</summary>
    public enum VillagerDisposition { Kind = 0, Wary = 1, Haunted = 2, Closed = 3 }

    /// <summary>What dread does to a villager, in escalating order. Vanished only happens at Abyss.</summary>
    public enum VillagerBehavior { Normal = 0, AtWindow = 1, FacingSea = 2, RepeatingPhrase = 3, Vanished = 4 }

    /// <summary>Kinds of place a villager can be. Home and Workplace point at a layout piece; Square and Shore do not; Gone means vanished.</summary>
    public enum VillagerPlaceKind { Home = 0, Workplace = 1, Square = 2, Shore = 3, Gone = 4 }

    public struct VillagerPlace
    {
        public VillagerPlaceKind Kind;
        /// <summary>Index into the layout list, or -1 when the place is not a layout piece (or the layout was empty).</summary>
        public int PieceIndex;
    }

    /// <summary>Where a villager stands, in cell coordinates (fractional), and the unit direction they face in (x, z).</summary>
    public struct VillagerStandPoint
    {
        public double X;
        public double Z;
        public double FaceDx;
        public double FaceDz;
    }

    public sealed class Villager
    {
        public int Index;
        public string Name;
        public VillagerRole Role;
        public VillagerDisposition Disposition;
        public int HomeIndex;
        public int WorkIndex;
    }

    /// <summary>
    /// Result of talking. Holds no display text except the campaign rumor, which is Core text, so
    /// nothing a narrator or translator produces can change a clue or a sanity cost. Wording comes from <see cref="VillagerStrings"/>.
    /// </summary>
    public struct VillagerTalkResult
    {
        public bool Available;
        public VillagerBehavior Behavior;
        public bool YieldsClue;
        /// <summary>Stable id of the clue source, "villager_&lt;index&gt;". Empty when no clue.</summary>
        public string ClueId;
        public float SanityDelta;
        public int LineVariant;
        public string Rumor;
    }

    /// <summary>
    /// Engine-free villagers: a seeded roster placed on the village layout, a daily routine across <see cref="GameClock"/>, and the
    /// way dread bends that routine. Same seed, layout, tick and dread always give the same result; nothing here is random beyond the seed.
    /// Behavior has causes: the dark (dusk and night) deepens what dread starts, haunted villagers react one step earlier,
    /// and at Abyss the village takes them.
    /// </summary>
    public static class VillagerRules
    {
        public const int RoleCount = 7;
        public const int LineVariants = VillagerStrings.GreetingVariants;
        /// <summary>Levels daylight takes off the behavior severity (the village looks normal by day).</summary>
        public const int DaylightRelief = 2;
        /// <summary>Dread at which villagers turn to face the sea (between Uneasy and Dire).</summary>
        public const float FacingSeaDread = 0.5f;
        public const int MaxVisibleSeverity = (int)VillagerBehavior.RepeatingPhrase;

        public static readonly string[] RoleIds = { "fisher", "priest", "innkeeper", "lamplighter", "lighthouse_keeper", "widow", "child" };
        public static readonly string[] DispositionNames = { "kind", "wary", "haunted", "closed" };
        public static readonly string[] BehaviorNames = { "normal", "at_window", "facing_sea", "repeating_phrase", "vanished" };
        public static readonly string[] BehaviorCauses = { "routine", "watching_the_lights", "the_tide_calls", "the_name_in_the_water", "taken_by_the_deep" };
        public static readonly string[] PlaceKindNames = { "home", "workplace", "square", "shore", "gone" };

        private static readonly string[] FirstNames =
        {
            "Ansel", "Brigid", "Corwin", "Dorcas", "Edmund", "Faye", "Gideon", "Hester", "Ignatius", "Jonah", "Keziah", "Lucan", "Mirabel", "Nehemiah",
        };
        private static readonly string[] LastNames =
        {
            "Marsh", "Thorne", "Grimsby", "Wickham", "Salter", "Pike", "Ashby", "Crowe", "Dunmore", "Hallow", "Reeve", "Tallow",
        };

        // Two seeded candidates per role.
        private static readonly VillagerDisposition[][] Dispositions =
        {
            new[] { VillagerDisposition.Wary, VillagerDisposition.Kind },
            new[] { VillagerDisposition.Kind, VillagerDisposition.Haunted },
            new[] { VillagerDisposition.Kind, VillagerDisposition.Wary },
            new[] { VillagerDisposition.Wary, VillagerDisposition.Haunted },
            new[] { VillagerDisposition.Haunted, VillagerDisposition.Closed },
            new[] { VillagerDisposition.Haunted, VillagerDisposition.Closed },
            new[] { VillagerDisposition.Kind, VillagerDisposition.Wary },
        };

        private static readonly string[][] WorkPieceIds =
        {
            new string[0], new[] { "church", "altar" }, new[] { "house_a", "house_b" }, new[] { "well" },
            new string[0], new[] { "dead_tree", "altar" }, new string[0],
        };

        // Where each role is at dawn, day, dusk, night. Workplace falls back to home when the layout has no matching piece.
        private static readonly VillagerPlaceKind[][] Routines =
        {
            new[] { VillagerPlaceKind.Shore, VillagerPlaceKind.Shore, VillagerPlaceKind.Square, VillagerPlaceKind.Home },
            new[] { VillagerPlaceKind.Workplace, VillagerPlaceKind.Workplace, VillagerPlaceKind.Workplace, VillagerPlaceKind.Home },
            new[] { VillagerPlaceKind.Home, VillagerPlaceKind.Workplace, VillagerPlaceKind.Workplace, VillagerPlaceKind.Workplace },
            new[] { VillagerPlaceKind.Workplace, VillagerPlaceKind.Home, VillagerPlaceKind.Square, VillagerPlaceKind.Workplace },
            new[] { VillagerPlaceKind.Home, VillagerPlaceKind.Home, VillagerPlaceKind.Shore, VillagerPlaceKind.Shore },
            new[] { VillagerPlaceKind.Home, VillagerPlaceKind.Workplace, VillagerPlaceKind.Home, VillagerPlaceKind.Home },
            new[] { VillagerPlaceKind.Home, VillagerPlaceKind.Square, VillagerPlaceKind.Home, VillagerPlaceKind.Home },
        };

        /// <summary>One villager per role, names unique, homes on house pieces and workplaces on matching pieces of the layout.</summary>
        public static List<Villager> GenerateRoster(int seed, IList<PlacedPiece> layout)
        {
            var rng = new SeededRandom(seed ^ 0x7a11e6);
            var roster = new List<Villager>();
            var houses = PiecesWithPrefix(layout, "house");
            var taken = new HashSet<string>();
            for (int r = 0; r < RoleCount; r++)
            {
                string name;
                do { name = FirstNames[rng.Next(FirstNames.Length)] + " " + LastNames[rng.Next(LastNames.Length)]; }
                while (!taken.Add(name));

                var disposition = Dispositions[r][rng.Next(2)];
                int home = Pick(houses.Count > 0 ? houses : AllPieces(layout), rng);
                int work = -1;
                var role = (VillagerRole)r;
                if (role == VillagerRole.Innkeeper)
                {
                    var others = new List<int>(houses);
                    others.Remove(home);
                    work = Pick(others.Count > 0 ? others : houses, rng);
                }
                else
                {
                    foreach (var id in WorkPieceIds[r])
                    {
                        var matches = PiecesWithPrefix(layout, id);
                        if (matches.Count == 0) continue;
                        work = Pick(matches, rng);
                        break;
                    }
                }
                if (work < 0) work = home;
                roster.Add(new Villager { Index = r, Name = name, Role = role, Disposition = disposition, HomeIndex = home, WorkIndex = work });
            }
            return roster;
        }

        private static List<int> PiecesWithPrefix(IList<PlacedPiece> layout, string prefix)
        {
            var list = new List<int>();
            for (int i = 0; i < layout.Count; i++)
                if (layout[i].Id != null && layout[i].Id.StartsWith(prefix, StringComparison.Ordinal)) list.Add(i);
            return list;
        }

        private static List<int> AllPieces(IList<PlacedPiece> layout)
        {
            var list = new List<int>();
            for (int i = 0; i < layout.Count; i++) list.Add(i);
            return list;
        }

        // Always consumes one roll so the stream does not depend on the layout contents.
        private static int Pick(List<int> candidates, SeededRandom rng)
        {
            int roll = rng.Next(Math.Max(1, candidates.Count));
            return candidates.Count == 0 ? -1 : candidates[roll];
        }

        /// <summary>The routine slot (kind only) for a villager in a phase.</summary>
        public static VillagerPlaceKind ScheduledKind(Villager v, DayPhase phase)
        {
            return Routines[(int)v.Role][(int)phase];
        }

        /// <summary>Where the routine puts the villager at this tick, before dread changes anything.</summary>
        public static VillagerPlace ScheduledPlace(Villager v, int tick)
        {
            return Resolve(v, ScheduledKind(v, GameClock.PhaseAt(tick)));
        }

        private static VillagerPlace Resolve(Villager v, VillagerPlaceKind kind)
        {
            switch (kind)
            {
                case VillagerPlaceKind.Home: return new VillagerPlace { Kind = kind, PieceIndex = v.HomeIndex };
                case VillagerPlaceKind.Workplace: return new VillagerPlace { Kind = kind, PieceIndex = v.WorkIndex };
                default: return new VillagerPlace { Kind = kind, PieceIndex = -1 };
            }
        }

        /// <summary>
        /// Severity ladder from dread alone: window at Uneasy, sea at <see cref="FacingSeaDread"/>, phrase at Dire, vanished at Abyss.
        /// </summary>
        public static int DreadSeverity(float dread)
        {
            float d = DreadThresholds.Sanitize(dread);
            int tier = DreadThresholds.TierFor(d);
            if (tier >= 3) return (int)VillagerBehavior.Vanished;
            if (tier >= 2) return (int)VillagerBehavior.RepeatingPhrase;
            if (d >= FacingSeaDread) return (int)VillagerBehavior.FacingSea;
            if (tier >= 1) return (int)VillagerBehavior.AtWindow;
            return (int)VillagerBehavior.Normal;
        }

        /// <summary>
        /// Behavior at a tick and dread. Never decreases as dread rises at a fixed tick. Haunted villagers react one level earlier,
        /// daylight takes <see cref="DaylightRelief"/> levels off, and Abyss vanishes everyone at any hour.
        /// </summary>
        public static VillagerBehavior BehaviorAt(Villager v, int tick, float dread)
        {
            int s = DreadSeverity(dread);
            if (s >= (int)VillagerBehavior.Vanished) return VillagerBehavior.Vanished;
            if (v.Disposition == VillagerDisposition.Haunted && s > 0) s = Math.Min(MaxVisibleSeverity, s + 1);
            if (GameClock.IsDaylight(GameClock.PhaseAt(tick))) s = Math.Max(0, s - DaylightRelief);
            return (VillagerBehavior)s;
        }

        /// <summary>Why the behavior happens (see <see cref="BehaviorCauses"/>).</summary>
        public static string CauseOf(VillagerBehavior behavior) { return BehaviorCauses[(int)behavior]; }

        /// <summary>
        /// Where the villager is. Window and sea behaviors move them to their window (home) or the shore; the phrase keeps them at
        /// their routine place; Vanished is Gone.
        /// </summary>
        public static VillagerPlace LocationAt(Villager v, int tick, float dread)
        {
            switch (BehaviorAt(v, tick, dread))
            {
                case VillagerBehavior.Vanished: return new VillagerPlace { Kind = VillagerPlaceKind.Gone, PieceIndex = -1 };
                case VillagerBehavior.AtWindow: return Resolve(v, VillagerPlaceKind.Home);
                case VillagerBehavior.FacingSea: return Resolve(v, VillagerPlaceKind.Shore);
                default: return ScheduledPlace(v, tick);
            }
        }

        // ---------- where a villager stands inside the place (the web mirror is standingPoint in web/src/villager-view.js) ----------
        /// <summary>Cells in front of a building's south wall.</summary>
        public const double FrontOffset = 0.45;
        /// <summary>Cells; villagers in the square stand on a ring around the grid centre.</summary>
        public const double SquareRadius = 1.6;
        /// <summary>Cells from the grid edge on the coast side.</summary>
        public const double ShoreInset = 0.6;
        /// <summary>Cells kept between a villager and the grid edge.</summary>
        public const double EdgeMargin = 0.3;

        /// <summary>Which side the sea lies on for a seed: 0 west (-x), 1 east (+x), 2 north (-z). Same roll as the web coast.</summary>
        public static int CoastSide(int seed) { return new SeededRandom(seed ^ 0x2f6b).Next(3); }

        /// <summary>
        /// The point a villager stands at for a place kind. Home and workplace: in front of the building, spread by index, facing it.
        /// Shore: along the coast edge, facing the sea. Square (and a missing piece): a ring around the grid centre, facing inward. Gone has no point (the square is returned).
        /// </summary>
        public static VillagerStandPoint StandPoint(Villager v, VillagerPlaceKind kind, IList<PlacedPiece> layout, int gridW, int gridD, int seed)
        {
            double spread = ((v.Index % 3) - 1) * 0.6;
            if (kind == VillagerPlaceKind.Home || kind == VillagerPlaceKind.Workplace)
            {
                int i = kind == VillagerPlaceKind.Home ? v.HomeIndex : v.WorkIndex;
                if (layout != null && i >= 0 && i < layout.Count)
                {
                    var p = layout[i];
                    return new VillagerStandPoint { X = ClampCell(p.X + p.SizeX / 2.0 + spread, gridW), Z = ClampCell(p.Z + p.SizeZ + FrontOffset, gridD), FaceDx = 0, FaceDz = -1 };
                }
            }
            if (kind == VillagerPlaceKind.Shore)
            {
                int side = CoastSide(seed);
                double dx = side == 0 ? -1 : side == 1 ? 1 : 0, dz = side == 2 ? -1 : 0, along = 0.2 + 0.6 * (v.Index / 6.0);
                double x = dx == 0 ? gridW * along : dx < 0 ? ShoreInset : gridW - ShoreInset;
                double z = dz == 0 ? gridD * along : ShoreInset;
                return new VillagerStandPoint { X = x, Z = z, FaceDx = dx, FaceDz = dz };
            }
            double angle = (v.Index / 7.0) * Math.PI * 2;
            return new VillagerStandPoint { X = gridW / 2.0 + Math.Cos(angle) * SquareRadius, Z = gridD / 2.0 + Math.Sin(angle) * SquareRadius, FaceDx = 0.0 - Math.Cos(angle), FaceDz = 0.0 - Math.Sin(angle) }; // 0.0 - x never yields -0, so golden JSON round-trips
        }

        private static double ClampCell(double v, int max) { return Math.Max(EdgeMargin, Math.Min(max - EdgeMargin, v)); }

        /// <summary>
        /// Talking to a villager. Clue and sanity come from <see cref="VigilRules.VillagerTalkCountsAsClue"/> and
        /// <see cref="InteractionRules.TalkSanityDelta"/>; the rumor is the campaign rumor for the night (clamped).
        /// A vanished villager cannot be talked to. Display wording is not an input, so AI text cannot change this result.
        /// </summary>
        public static VillagerTalkResult Talk(int seed, Villager v, int tick, float dread, Campaign campaign, int night)
        {
            var behavior = BehaviorAt(v, tick, dread);
            var result = new VillagerTalkResult { Behavior = behavior, ClueId = "", Rumor = "" };
            if (behavior == VillagerBehavior.Vanished) return result;
            result.Available = true;
            result.YieldsClue = VigilRules.VillagerTalkCountsAsClue(v.Disposition, behavior);
            if (result.YieldsClue) result.ClueId = "villager_" + v.Index;
            result.SanityDelta = InteractionRules.TalkSanityDelta(behavior, result.YieldsClue);
            result.LineVariant = new SeededRandom(seed ^ (v.Index * 7919) ^ (night * 31)).Next(LineVariants);
            if (campaign != null && campaign.Nights.Count > 0)
            {
                int n = Math.Max(1, Math.Min(campaign.Nights.Count, night));
                result.Rumor = campaign.Nights[n - 1].Rumor;
            }
            return result;
        }
    }
}
