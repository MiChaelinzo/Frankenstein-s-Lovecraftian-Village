using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>A rectangular room of a place in the place's local frame (right, forward), metres.</summary>
    public sealed class PlaceRoom
    {
        public string Id;
        public double X, Z, HalfX, HalfZ;
        public bool Contains(double x, double z) { return Math.Abs(x - X) <= HalfX && Math.Abs(z - Z) <= HalfZ; }
    }

    /// <summary>One authored prop of a place, in the local frame. The kind is an existing dressing kind, so collision and meshes come from <see cref="VillageDressing"/>.</summary>
    public sealed class PlaceProp
    {
        public string Kind;
        public double X, Z, Yaw;
    }

    /// <summary>
    /// One procedural box (a frustum when Taper is not 1) of the place's own geometry, in the local frame with heights in metres. Tier is the lowest graphics tier that draws it
    /// (0 low, 1 medium, 2 high). A part costs <see cref="VillagePlaces.TrianglesOf"/> triangles, so the budget can be checked without a renderer.
    /// </summary>
    public sealed class PlacePart
    {
        public string Id;
        public double X0, X1, Z0, Z1, Y0, Y1, Taper;
        public double[] Color = new double[3];
        public int Glow, Tier;
    }

    /// <summary>
    /// Something to find inside a place. Finding it records ClueId as a board clue (<see cref="InvestigationEvidence.ClueIds"/>), which earns Source knowledge
    /// (<see cref="InvestigationRules.KnowledgeSources(InvestigationEvidence, PlaceLibrary)"/>), may be a lead on a missing person (Lead) and reveals the authored StatementId
    /// (a Clue statement in Data/statements.json) as theory evidence.
    /// </summary>
    public sealed class PlaceDiscovery
    {
        public string Id, Room, ClueId, Source, StatementId;
        public double X, Z;
        public bool Lead;
        public LocalizedName Title, Text;
    }

    /// <summary>The authored data of one place (Data/places.json).</summary>
    public sealed class PlaceData
    {
        public string Id, Anchor, TunnelBenefit, TunnelExitsTo;
        public double Radius;
        public LocalizedName Name, TunnelFound;
        /// <summary>Triangle budget of the place's own geometry at the low, medium and high graphics tier.</summary>
        public int[] Budget = new int[3];
        /// <summary>Local points: outside the front door, just inside it, and the hidden hatch.</summary>
        public double EntranceX, EntranceZ, DoorX, DoorZ, HatchX, HatchZ;
        public Dictionary<string, LocalizedName> Prompts = new Dictionary<string, LocalizedName>();
        public List<PlaceRoom> Rooms = new List<PlaceRoom>();
        public List<PlaceProp> Props = new List<PlaceProp>();
        public List<PlacePart> Parts = new List<PlacePart>();
        public List<PlaceDiscovery> Discoveries = new List<PlaceDiscovery>();

        public PlaceRoom Room(string id) { foreach (var r in Rooms) if (r.Id == id) return r; return null; }
    }

    /// <summary>The parsed Data/places.json. The same file is read by web/src/places.js; a drift test compares the two copies.</summary>
    public sealed class PlaceLibrary
    {
        public const string CluePrefix = "place@";
        public static readonly string[] PromptIds = { "enter", "leave", "hatch", "sealed" };

        public List<PlaceData> Places = new List<PlaceData>();

        public PlaceData Find(string id) { foreach (var p in Places) if (p.Id == id) return p; return null; }

        /// <summary>The discovery that records <paramref name="clueId"/>, or null when no place does.</summary>
        public PlaceDiscovery FindByClue(string clueId)
        {
            foreach (var p in Places) foreach (var d in p.Discoveries) if (d.ClueId == clueId) return d;
            return null;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending field when it is malformed.</summary>
        public static PlaceLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("places: root is not an object");
            var lib = new PlaceLibrary();
            foreach (var o in Objects(root, "places"))
            {
                var p = new PlaceData { Id = Str(o, "id", "place") };
                string who = "place " + p.Id;
                if (lib.Find(p.Id) != null) throw new FormatException("places: duplicate place id " + p.Id);
                p.Anchor = Str(o, "anchor", who);
                if (Array.IndexOf(VillageLandmarks.Ids, p.Anchor) < 0) throw new FormatException("places: " + who + " has unknown anchor landmark " + p.Anchor);
                p.Radius = Num(o, "radius", who);
                if (p.Radius <= 0.0) throw new FormatException("places: " + who + " radius must be above 0");
                p.Name = Text(o, who);
                var budget = Sub(o, "budget", who);
                string[] tierIds = { "low", "medium", "high" };
                for (int t = 0; t < 3; t++)
                {
                    p.Budget[t] = (int)Num(budget, tierIds[t], who + " budget");
                    if (p.Budget[t] <= 0 || (t > 0 && p.Budget[t] < p.Budget[t - 1])) throw new FormatException("places: " + who + " budget must be above 0 and not fall with the tier");
                }
                var entrance = Sub(o, "entrance", who); p.EntranceX = Num(entrance, "x", who + " entrance"); p.EntranceZ = Num(entrance, "z", who + " entrance");
                var door = Sub(o, "door", who); p.DoorX = Num(door, "x", who + " door"); p.DoorZ = Num(door, "z", who + " door");
                var prompts = Sub(o, "prompts", who);
                foreach (var id in PromptIds) p.Prompts[id] = Text(Sub(prompts, id, who + " prompts"), who + " prompt " + id);
                var tunnel = Sub(o, "tunnel", who);
                var hatch = Sub(tunnel, "hatch", who + " tunnel"); p.HatchX = Num(hatch, "x", who + " hatch"); p.HatchZ = Num(hatch, "z", who + " hatch");
                p.TunnelBenefit = Str(tunnel, "requiresBenefit", who + " tunnel");
                p.TunnelExitsTo = Str(tunnel, "exitsTo", who + " tunnel");
                if (Array.IndexOf(VillageLandmarks.Ids, p.TunnelExitsTo) < 0) throw new FormatException("places: " + who + " tunnel exits to unknown landmark " + p.TunnelExitsTo);
                p.TunnelFound = Text(Sub(tunnel, "found", who + " tunnel"), who + " tunnel found");
                foreach (var r in Objects(o, "rooms"))
                {
                    var room = new PlaceRoom { Id = Str(r, "id", who + " room"), X = Num(r, "x", who + " room"), Z = Num(r, "z", who + " room"), HalfX = Num(r, "halfX", who + " room"), HalfZ = Num(r, "halfZ", who + " room") };
                    if (p.Room(room.Id) != null) throw new FormatException("places: " + who + " lists room " + room.Id + " twice");
                    if (room.HalfX <= 0.0 || room.HalfZ <= 0.0) throw new FormatException("places: " + who + " room " + room.Id + " needs a positive size");
                    p.Rooms.Add(room);
                }
                if (p.Rooms.Count == 0) throw new FormatException("places: " + who + " needs rooms");
                foreach (var r in Objects(o, "props")) p.Props.Add(new PlaceProp { Kind = Str(r, "kind", who + " prop"), X = Num(r, "x", who + " prop"), Z = Num(r, "z", who + " prop"), Yaw = Num(r, "yaw", who + " prop") });
                foreach (var r in Objects(o, "parts"))
                {
                    var part = new PlacePart
                    {
                        Id = Str(r, "id", who + " part"), X0 = Num(r, "x0", who + " part"), X1 = Num(r, "x1", who + " part"), Z0 = Num(r, "z0", who + " part"), Z1 = Num(r, "z1", who + " part"),
                        Y0 = Num(r, "y0", who + " part"), Y1 = Num(r, "y1", who + " part"), Taper = Num(r, "taper", who + " part"), Glow = (int)Num(r, "glow", who + " part"), Tier = (int)Num(r, "tier", who + " part"),
                    };
                    var color = r.ContainsKey("color") ? r["color"] as List<object> : null;
                    if (color == null || color.Count != 3) throw new FormatException("places: " + who + " part " + part.Id + " needs a color of three numbers");
                    for (int c = 0; c < 3; c++) { if (!(color[c] is double)) throw new FormatException("places: " + who + " part " + part.Id + " has a non-number color"); part.Color[c] = (double)color[c]; }
                    if (part.X1 <= part.X0 || part.Z1 <= part.Z0 || part.Y1 <= part.Y0) throw new FormatException("places: " + who + " part " + part.Id + " has an empty box");
                    if (part.Tier < 0 || part.Tier > 2) throw new FormatException("places: " + who + " part " + part.Id + " tier must be 0 to 2");
                    if (part.Taper < 0.0) throw new FormatException("places: " + who + " part " + part.Id + " taper must not be negative");
                    p.Parts.Add(part);
                }
                foreach (var r in Objects(o, "discoveries"))
                {
                    var d = new PlaceDiscovery
                    {
                        Id = Str(r, "id", who + " discovery"), Room = Str(r, "room", who + " discovery"), X = Num(r, "x", who + " discovery"), Z = Num(r, "z", who + " discovery"),
                        ClueId = Str(r, "clue", who + " discovery"), Source = Str(r, "source", who + " discovery"), StatementId = Str(r, "statement", who + " discovery"),
                        Title = Text(r, who + " discovery"), Text = Text(Sub(r, "text", who + " discovery"), who + " discovery text"),
                    };
                    if (!r.ContainsKey("lead") || !(r["lead"] is bool)) throw new FormatException("places: " + who + " discovery " + d.Id + " lacks lead");
                    d.Lead = (bool)r["lead"];
                    if (!d.ClueId.StartsWith(CluePrefix, StringComparison.Ordinal)) throw new FormatException("places: " + who + " discovery " + d.Id + " clue must start with " + CluePrefix);
                    if (lib.FindByClue(d.ClueId) != null) throw new FormatException("places: duplicate clue id " + d.ClueId);
                    if (KnowledgeLibrary.SourceIndex(d.Source) < 0) throw new FormatException("places: " + who + " discovery " + d.Id + " has unknown knowledge source " + d.Source);
                    var room = p.Room(d.Room);
                    if (room == null) throw new FormatException("places: " + who + " discovery " + d.Id + " names unknown room " + d.Room);
                    if (!room.Contains(d.X, d.Z)) throw new FormatException("places: " + who + " discovery " + d.Id + " lies outside its room");
                    p.Discoveries.Add(d);
                }
                if (p.Discoveries.Count == 0) throw new FormatException("places: " + who + " needs discoveries");
                lib.Places.Add(p);
            }
            if (lib.Places.Count == 0) throw new FormatException("places: places must not be empty");
            return lib;
        }

        private static List<Dictionary<string, object>> Objects(Dictionary<string, object> o, string key)
        {
            var list = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (list == null) throw new FormatException("places: missing " + key + " array");
            var result = new List<Dictionary<string, object>>();
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException("places: " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static Dictionary<string, object> Sub(Dictionary<string, object> o, string key, string owner)
        {
            var d = o.ContainsKey(key) ? o[key] as Dictionary<string, object> : null;
            if (d == null) throw new FormatException("places: " + owner + " lacks " + key + " object");
            return d;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("places: " + owner + " lacks " + key);
            return s;
        }

        private static double Num(Dictionary<string, object> o, string key, string owner)
        {
            if (!o.ContainsKey(key) || !(o[key] is double)) throw new FormatException("places: " + owner + " lacks number " + key);
            return (double)o[key];
        }

        private static LocalizedName Text(Dictionary<string, object> o, string owner)
        {
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = o.ContainsKey(lang) ? o[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("places: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    /// <summary>Where a place stands in one village: its centre, the cardinal direction its front door faces, and the world points of the way in and the ways back.</summary>
    public sealed class PlacePlacement
    {
        public string Id;
        public double X, Z, FaceX, FaceZ, Radius;
        /// <summary>Outside the front door (the way in), just inside it, the hidden hatch, and where the tunnel comes up.</summary>
        public double[] Entrance, Door, Hatch, TunnelExit;
    }

    /// <summary>The two ways out of a place: back through the front door, or down the tunnel.</summary>
    public enum PlaceExit { Door = 0, Tunnel = 1 }

    /// <summary>
    /// Round 31, spec 164: places of the wider world you can walk into and back out of. Each place is placed beside its anchor landmark by the seed alone (same seed and grid, same place),
    /// inside the walkable world, clear of every landmark, of the city and of the other places, with a front door that is the way in and a way back that returns to the very point you entered from.
    /// Engine-free and deterministic; the web renderer mirrors it (web/src/places.js, golden checked). Verified by tests only; no Unity run.
    /// </summary>
    public static class VillagePlaces
    {
        public const string Manor = "manor";
        public const int PlaceStream = 0x504c43, TrailStream = 0x545241;
        /// <summary>Metres kept between the footprint and an anchor landmark's own disc, extra metres per further ring, rings tried, and the longest walk from the entrance point to the inside of the door.</summary>
        public const double Gap = 2.0, RingStep = 4.0, MaxDoorWalk = 6.0;
        public const int RingCount = 4, DirectionCount = 8, Tiers = 3;
        private static readonly double Diag = Math.Sqrt(0.5);
        private static readonly double[][] Directions =
        {
            new[] { 1.0, 0.0 }, new[] { Diag, Diag }, new[] { 0.0, 1.0 }, new[] { -Diag, Diag }, new[] { -1.0, 0.0 }, new[] { -Diag, -Diag }, new[] { 0.0, -1.0 }, new[] { Diag, -Diag },
        };

        /// <summary>A point in the place's local frame (right, forward) as a world point.</summary>
        public static double[] ToWorld(PlacePlacement p, double lx, double lz)
        {
            return new[] { p.X + p.FaceZ * lx + p.FaceX * lz, p.Z - p.FaceX * lx + p.FaceZ * lz };
        }

        /// <summary>
        /// Places <paramref name="data"/> in the village of <paramref name="seed"/>. Candidates lie on rings around the anchor landmark, from the seed's own start direction; the first one
        /// that <see cref="Check"/> accepts wins. <paramref name="placed"/> holds the places already standing. Throws InvalidOperationException when nothing fits.
        /// </summary>
        public static PlacePlacement Place(PlaceData data, int seed, int gridW, int gridD, IList<PlacePlacement> placed)
        {
            Landmark anchor = default(Landmark);
            bool found = false;
            foreach (var l in VillageLandmarks.All(seed, gridW, gridD)) if (l.Id == data.Anchor) { anchor = l; found = true; }
            if (!found) throw new InvalidOperationException("places: " + data.Id + " has no anchor landmark " + data.Anchor);
            int index = PlaceIndex(data.Id);
            int start = new SeededRandom(seed ^ PlaceStream ^ (index * VillageSociety.IndexStep)).Next(DirectionCount);
            string last = "";
            for (int ring = 0; ring < RingCount; ring++)
            {
                double dist = anchor.Radius + data.Radius + Gap + ring * RingStep;
                for (int k = 0; k < DirectionCount; k++)
                {
                    var dir = Directions[(start + k) % DirectionCount];
                    double x = anchor.X + dir[0] * dist, z = anchor.Z + dir[1] * dist;
                    double tx = anchor.X - x, tz = anchor.Z - z; // the door faces the anchor, on the nearer axis
                    double fx = 0.0, fz = 0.0;
                    if (Math.Abs(tx) >= Math.Abs(tz)) fx = tx < 0 ? -1.0 : 1.0; else fz = tz < 0 ? -1.0 : 1.0;
                    var p = Build(data, seed, gridW, gridD, x, z, fx, fz);
                    last = Check(data, p, seed, gridW, gridD, placed);
                    if (last.Length == 0) return p;
                }
            }
            throw new InvalidOperationException("places: " + data.Id + " fits nowhere around " + data.Anchor + " (last failure: " + last + ")");
        }

        private static int PlaceIndex(string id) { return id == Manor ? 1 : 2; }

        /// <summary>The placement of a place at a given centre and facing, with every point of the way in and back worked out. No validation: see <see cref="Check"/>.</summary>
        public static PlacePlacement Build(PlaceData data, int seed, int gridW, int gridD, double x, double z, double faceX, double faceZ)
        {
            var p = new PlacePlacement { Id = data.Id, X = x, Z = z, FaceX = faceX, FaceZ = faceZ, Radius = data.Radius };
            p.Entrance = ToWorld(p, data.EntranceX, data.EntranceZ);
            p.Door = ToWorld(p, data.DoorX, data.DoorZ);
            p.Hatch = ToWorld(p, data.HatchX, data.HatchZ);
            Landmark target = default(Landmark);
            foreach (var l in VillageLandmarks.All(seed, gridW, gridD)) if (l.Id == data.TunnelExitsTo) target = l;
            double dx = x - target.X, dz = z - target.Z, len = Math.Sqrt(dx * dx + dz * dz);
            if (len < 1e-9) { dx = 1.0; dz = 0.0; len = 1.0; }
            p.TunnelExit = new[] { target.X + dx / len * target.Radius * 0.5, target.Z + dz / len * target.Radius * 0.5 };
            return p;
        }

        /// <summary>Whether a point lies inside the walkable world (<see cref="VillageDressing.WalkBounds"/>).</summary>
        public static bool PointInBounds(int seed, int gridW, int gridD, double x, double z)
        {
            VillageDressing.WalkBounds(seed, gridW, gridD, out double minX, out double maxX, out double minZ, out double maxZ);
            return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
        }

        /// <summary>Whether the whole footprint (the disc of the place's radius) and every point of the way in and back lie inside the walkable world.</summary>
        public static bool InBounds(PlacePlacement p, int seed, int gridW, int gridD)
        {
            VillageDressing.WalkBounds(seed, gridW, gridD, out double minX, out double maxX, out double minZ, out double maxZ);
            if (p.X - p.Radius < minX || p.X + p.Radius > maxX || p.Z - p.Radius < minZ || p.Z + p.Radius > maxZ) return false;
            foreach (var pt in new[] { p.Entrance, p.Door, p.Hatch, p.TunnelExit }) if (!PointInBounds(seed, gridW, gridD, pt[0], pt[1])) return false;
            return true;
        }

        /// <summary>The id of the first landmark whose disc the footprint overlaps, or null.</summary>
        public static string OverlappingLandmark(PlacePlacement p, int seed, int gridW, int gridD)
        {
            foreach (var l in VillageLandmarks.All(seed, gridW, gridD))
            {
                double dx = p.X - l.X, dz = p.Z - l.Z;
                if (Math.Sqrt(dx * dx + dz * dz) < l.Radius + p.Radius) return l.Id;
            }
            return null;
        }

        /// <summary>Whether the footprint overlaps the city grid (the rectangle from the origin to the grid size in metres).</summary>
        public static bool OverlapsCity(PlacePlacement p, int gridW, int gridD)
        {
            double w = gridW * VillageDressing.Cell, d = gridD * VillageDressing.Cell;
            double nx = Math.Max(0.0, Math.Max(-p.X, p.X - w)), nz = Math.Max(0.0, Math.Max(-p.Z, p.Z - d));
            return Math.Sqrt(nx * nx + nz * nz) < p.Radius;
        }

        /// <summary>The id of the first already placed place whose footprint overlaps this one, or null.</summary>
        public static string OverlappingPlace(PlacePlacement p, IList<PlacePlacement> placed)
        {
            if (placed == null) return null;
            foreach (var o in placed)
            {
                if (o.Id == p.Id) continue;
                double dx = p.X - o.X, dz = p.Z - o.Z;
                if (Math.Sqrt(dx * dx + dz * dz) < o.Radius + p.Radius) return o.Id;
            }
            return null;
        }

        /// <summary>Enter: the walker goes from the entrance point to just inside the door.</summary>
        public static double[] Enter(PlacePlacement p) { return p.Door; }

        /// <summary>Leave by <paramref name="exit"/>: back through the door to the entrance point, or up the tunnel to where it comes out.</summary>
        public static double[] Leave(PlacePlacement p, PlaceExit exit) { return exit == PlaceExit.Tunnel ? p.TunnelExit : p.Entrance; }

        /// <summary>The way back exists: entering and leaving by the door returns to the entrance point, and the door is a short walk from it.</summary>
        public static bool RoundTrip(PlacePlacement p)
        {
            var inside = Enter(p);
            var back = Leave(p, PlaceExit.Door);
            if (back[0] != p.Entrance[0] || back[1] != p.Entrance[1]) return false;
            double dx = p.Entrance[0] - inside[0], dz = p.Entrance[1] - inside[1];
            double walk = Math.Sqrt(dx * dx + dz * dz);
            return walk > 0.0 && walk <= MaxDoorWalk;
        }

        /// <summary>Triangles of the place's own geometry at a graphics tier (0 low, 1 medium, 2 high): 8 per box side set plus 2 for a top.</summary>
        public static int Triangles(PlaceData data, int tier)
        {
            int total = 0;
            foreach (var part in data.Parts) if (part.Tier <= tier) total += TrianglesOf(part);
            return total;
        }

        /// <summary>The four sides (8 triangles) and, unless the part is a pyramid, the top (2).</summary>
        public static int TrianglesOf(PlacePart part) { return part.Taper > 0.0 ? 10 : 8; }

        public static bool WithinBudget(PlaceData data, int tier) { return Triangles(data, tier) <= data.Budget[tier]; }

        /// <summary>
        /// Why a placement is not acceptable, or "" when it is: out of bounds, overlap with a landmark, the city or another place, or no way back (the round trip fails or a tier is over budget).
        /// </summary>
        public static string Check(PlaceData data, PlacePlacement p, int seed, int gridW, int gridD, IList<PlacePlacement> placed)
        {
            if (!InBounds(p, seed, gridW, gridD)) return "out of bounds";
            string landmark = OverlappingLandmark(p, seed, gridW, gridD);
            if (landmark != null) return "overlaps landmark " + landmark;
            if (OverlapsCity(p, gridW, gridD)) return "overlaps the city";
            string other = OverlappingPlace(p, placed);
            if (other != null) return "overlaps place " + other;
            if (!RoundTrip(p)) return "no way back";
            for (int t = 0; t < Tiers; t++) if (!WithinBudget(data, t)) return "over the triangle budget at tier " + t;
            return "";
        }

        /// <summary>The props of a placed place as dressing items (existing kinds with their collision), world frame, yaw turned to the facing.</summary>
        public static List<DressingItem> Dressing(PlaceData data, PlacePlacement p)
        {
            var items = new List<DressingItem>();
            double yaw = Math.Atan2(p.FaceX, p.FaceZ);
            foreach (var prop in data.Props)
            {
                var w = ToWorld(p, prop.X, prop.Z);
                items.Add(new DressingItem { Kind = prop.Kind, X = w[0], Y = 0.0, Z = w[1], Yaw = yaw + prop.Yaw, Scale = 1.0 });
            }
            return items;
        }

        /// <summary>The world point of a discovery.</summary>
        public static double[] DiscoveryPoint(PlacePlacement p, PlaceDiscovery d) { return ToWorld(p, d.X, d.Z); }

        /// <summary>The hidden tunnel opens once the knowledge tier unlocks the benefit the place names (secret_paths, from Forbidden Texts).</summary>
        public static bool TunnelOpen(PlaceData data, KnowledgeLibrary lib, int tier) { return KnowledgeRules.HasBenefit(lib, tier, data.TunnelBenefit); }

        /// <summary>The knowledge source a place clue earns, or null when the clue id belongs to no place.</summary>
        public static string SourceOfClue(PlaceLibrary lib, string clueId)
        {
            if (lib == null) return null;
            var d = lib.FindByClue(clueId);
            return d == null ? null : d.Source;
        }

        /// <summary>The missing person (index into the story's missing list, -1 when there are none) whose trail a place's lead belongs to: chosen by the seed, so the same village always points at the same person.</summary>
        public static int TrailMissing(int seed, string placeId, int missingCount)
        {
            if (missingCount <= 0) return -1;
            return new SeededRandom(seed ^ TrailStream ^ (PlaceIndex(placeId) * VillageSociety.IndexStep)).Next(missingCount);
        }

        /// <summary>The leads the found place clues give on one missing person: one per found Lead discovery whose trail ends at that person.</summary>
        public static int LeadsFor(PlaceLibrary lib, ICollection<string> clueIds, int seed, int missingCount, int missingIndex)
        {
            if (lib == null || clueIds == null) return 0;
            int leads = 0;
            foreach (var place in lib.Places)
            {
                if (TrailMissing(seed, place.Id, missingCount) != missingIndex) continue;
                foreach (var d in place.Discoveries) if (d.Lead && clueIds.Contains(d.ClueId)) leads++;
            }
            return leads;
        }
    }
}
