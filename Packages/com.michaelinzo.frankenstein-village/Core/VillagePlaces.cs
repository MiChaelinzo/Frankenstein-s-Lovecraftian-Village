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
        /// <summary>The clue id of an earlier discovery of the same place that must be on the board before this one can be found (a hidden landmark revealed by a lead), or "" when it is always findable.</summary>
        public string Requires = "";
        /// <summary>A knowledge benefit (such as dimensional_gateways) the explorer's tier must unlock, and a reality distortion effect (such as door_appearing) that must be among tonight's effects (<see cref="RealityDistortion"/>); "" for none. Both gate <see cref="VillagePlaces.Revealed(PlaceDiscovery, ICollection{string}, KnowledgeLibrary, int, int, int)"/>.</summary>
        public string RequiresBenefit = "", RequiresEffect = "";
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
        /// <summary>Whether an abandoned hunting trail leads from the nearest lit path to the entrance (<see cref="VillagePlaces.HuntingTrail"/>).</summary>
        public bool HuntingTrail;
        /// <summary>Whether the rooms are a seeded room graph (<see cref="PlaceGraph"/>) instead of the authored Rooms; the discoveries then name the graph roles (<see cref="PlaceGraph.Roles"/>) as their room.</summary>
        public bool Procedural;
        /// <summary>Lantern markers in the local frame, from the deepest point out to the entrance: the way back (<see cref="VillagePlaces.LanternGap"/> apart at most). Empty for a place without them.</summary>
        public List<double[]> Lanterns = new List<double[]>();
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
                if (o.ContainsKey("huntingTrail"))
                {
                    if (!(o["huntingTrail"] is bool)) throw new FormatException("places: " + who + " huntingTrail must be true or false");
                    p.HuntingTrail = (bool)o["huntingTrail"];
                }
                if (o.ContainsKey("procedural"))
                {
                    if (!(o["procedural"] is bool)) throw new FormatException("places: " + who + " procedural must be true or false");
                    p.Procedural = (bool)o["procedural"];
                }
                if (o.ContainsKey("lanterns"))
                {
                    foreach (var r in Objects(o, "lanterns")) p.Lanterns.Add(new[] { Num(r, "x", who + " lantern"), Num(r, "z", who + " lantern") });
                    double[] prev = null;
                    foreach (var l in p.Lanterns)
                    {
                        if (prev != null && Dist(prev[0], prev[1], l[0], l[1]) > VillagePlaces.LanternGap) throw new FormatException("places: " + who + " lanterns are more than " + VillagePlaces.LanternGap + " m apart");
                        prev = l;
                    }
                    if (prev != null && Dist(prev[0], prev[1], p.EntranceX, p.EntranceZ) > VillagePlaces.LanternGap) throw new FormatException("places: " + who + " lantern trail does not reach the entrance");
                }
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
                    if (r.ContainsKey("requires"))
                    {
                        d.Requires = r["requires"] as string ?? "";
                        bool known = false;
                        foreach (var earlier in p.Discoveries) if (earlier.ClueId == d.Requires) known = true;
                        if (!known) throw new FormatException("places: " + who + " discovery " + d.Id + " requires unknown earlier clue " + d.Requires);
                    }
                    if (r.ContainsKey("requiresBenefit")) d.RequiresBenefit = Str(r, "requiresBenefit", who + " discovery");
                    if (r.ContainsKey("requiresEffect")) d.RequiresEffect = Str(r, "requiresEffect", who + " discovery");
                    if (p.Procedural && Array.IndexOf(PlaceGraph.Roles, d.Room) < 0) throw new FormatException("places: " + who + " discovery " + d.Id + " names a room that is no graph role: " + d.Room);
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

        private static double Dist(double x0, double z0, double x1, double z1) { return Math.Sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0)); }

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

    /// <summary>One room of a <see cref="PlaceGraph"/>: its cell, its centre in the place's local frame (whole metres), its depth in the spanning tree, the cell it was reached from (-1 for the entrance) and its role.</summary>
    public sealed class PlaceGraphRoom
    {
        public int Cell, X, Z, Depth, Parent;
        public string Role = PlaceGraph.ChamberRole;
    }

    /// <summary>
    /// The seeded room graph of a procedural place (the catacomb interior): rooms on a 3 by 3 grid of cells, grown from the entrance cell by random frontier picks (so it is a connected tree), plus at most one loop edge. Integer cell maths and
    /// <see cref="SeededRandom"/> only, so the same seed always gives the same graph. The three deepest rooms become the prison, the dimensional tear and the forbidden texts; every room has a path back to the entrance room.
    /// </summary>
    public sealed class PlaceGraph
    {
        public const int Cols = 3, Rows = 3, Pitch = 3, MinRooms = 6, EntranceCell = 1;
        public const double RoomHalf = 1.2, CorridorHalf = 0.5;
        public const string EntranceRole = "entrance", ChamberRole = "chamber", PrisonRole = "prison", TearRole = "tear", TextsRole = "texts";
        /// <summary>The roles discoveries may name as their room.</summary>
        public static readonly string[] Roles = { TextsRole, TearRole, PrisonRole };

        public List<PlaceGraphRoom> Rooms = new List<PlaceGraphRoom>();
        /// <summary>Pairs of cells joined by a corridor: the tree edges in growth order, then the loop edge when there is one.</summary>
        public List<int[]> Edges = new List<int[]>();
        public int Loops;

        public PlaceGraphRoom RoomAt(int cell) { foreach (var r in Rooms) if (r.Cell == cell) return r; return null; }
        public PlaceGraphRoom RoomWithRole(string role) { foreach (var r in Rooms) if (r.Role == role) return r; return null; }

        private bool HasEdge(int a, int b) { foreach (var e in Edges) if ((e[0] == a && e[1] == b) || (e[0] == b && e[1] == a)) return true; return false; }

        private static IEnumerable<int> Neighbours(int cell)
        {
            int c = cell % Cols, r = cell / Cols;
            if (r > 0) yield return cell - Cols;
            if (c < Cols - 1) yield return cell + 1;
            if (r < Rows - 1) yield return cell + Cols;
            if (c > 0) yield return cell - 1;
        }

        private void Add(int cell, int parent, int depth)
        {
            Rooms.Add(new PlaceGraphRoom { Cell = cell, X = (cell % Cols - 1) * Pitch, Z = (1 - cell / Cols) * Pitch, Depth = depth, Parent = parent });
        }

        /// <summary>The graph of one village; <paramref name="index"/> is the place's index, so places draw different streams.</summary>
        public static PlaceGraph Generate(int seed, int index)
        {
            var rng = new SeededRandom(seed ^ VillagePlaces.GraphStream ^ (index * VillageSociety.IndexStep));
            int target = MinRooms + rng.Next(Cols * Rows - MinRooms + 1);
            var g = new PlaceGraph();
            var present = new bool[Cols * Rows];
            g.Add(EntranceCell, -1, 0); present[EntranceCell] = true;
            while (g.Rooms.Count < target)
            {
                var candidates = new List<int[]>();
                foreach (var room in g.Rooms) foreach (var n in Neighbours(room.Cell)) if (!present[n]) candidates.Add(new[] { room.Cell, n });
                var pick = candidates[rng.Next(candidates.Count)];
                g.Edges.Add(pick);
                g.Add(pick[1], pick[0], g.RoomAt(pick[0]).Depth + 1);
                present[pick[1]] = true;
            }
            var loops = new List<int[]>();
            for (int a = 0; a < present.Length; a++)
            {
                if (!present[a]) continue;
                foreach (var b in Neighbours(a)) if (b > a && present[b] && !g.HasEdge(a, b)) loops.Add(new[] { a, b });
            }
            bool addLoop = rng.Next(2) == 1;
            if (addLoop && loops.Count > 0) { g.Edges.Add(loops[rng.Next(loops.Count)]); g.Loops = 1; }
            g.AssignRoles();
            return g;
        }

        /// <summary>The entrance room, then the deepest rooms in turn (ties by lowest cell) become the prison, the tear and the texts.</summary>
        private void AssignRoles()
        {
            RoomAt(EntranceCell).Role = EntranceRole;
            foreach (var role in new[] { PrisonRole, TearRole, TextsRole })
            {
                PlaceGraphRoom best = null;
                foreach (var r in Rooms)
                {
                    if (r.Role != ChamberRole) continue;
                    if (best == null || r.Depth > best.Depth || (r.Depth == best.Depth && r.Cell < best.Cell)) best = r;
                }
                best.Role = role;
            }
        }

        /// <summary>Every room can be reached from the entrance room along the corridors.</summary>
        public bool Connected()
        {
            var seen = new HashSet<int> { EntranceCell };
            var queue = new Queue<int>();
            queue.Enqueue(EntranceCell);
            while (queue.Count > 0)
            {
                int cell = queue.Dequeue();
                foreach (var e in Edges)
                {
                    int other = e[0] == cell ? e[1] : e[1] == cell ? e[0] : -1;
                    if (other >= 0 && seen.Add(other)) queue.Enqueue(other);
                }
            }
            return seen.Count == Rooms.Count;
        }

        /// <summary>The cells from <paramref name="cell"/> back to the entrance room (both included), each pair joined by a corridor; empty when the cell is not a room.</summary>
        public List<int> PathBack(int cell)
        {
            var path = new List<int>();
            var room = RoomAt(cell);
            while (room != null) { path.Add(room.Cell); room = room.Parent < 0 ? null : RoomAt(room.Parent); }
            return path;
        }

        /// <summary>One line that names the whole graph for a seed, for debugging and for the golden file: rooms (cell, centre, depth, role) then corridors.</summary>
        public string Dump(int seed)
        {
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            var sb = new System.Text.StringBuilder();
            sb.Append("catacomb seed=").Append(seed.ToString(inv)).Append(" rooms=").Append(Rooms.Count.ToString(inv)).Append(" loops=").Append(Loops.ToString(inv)).Append(" |");
            foreach (var r in Rooms) sb.Append(" c").Append(r.Cell.ToString(inv)).Append("@(").Append(r.X.ToString(inv)).Append(',').Append(r.Z.ToString(inv)).Append(")d").Append(r.Depth.ToString(inv)).Append(' ').Append(r.Role).Append(';');
            sb.Append(" |");
            foreach (var e in Edges) sb.Append(' ').Append(e[0].ToString(inv)).Append('-').Append(e[1].ToString(inv));
            return sb.ToString();
        }

        private static PlacePart Box(string id, double x0, double x1, double z0, double z1, double y0, double y1, double r, double g, double b, int glow, int tier)
        {
            return new PlacePart { Id = id, X0 = x0, X1 = x1, Z0 = z0, Z1 = z1, Y0 = y0, Y1 = y1, Taper = 1.0, Color = new[] { r, g, b }, Glow = glow, Tier = tier };
        }

        /// <summary>
        /// The room graph's own geometry in the local frame, in a fixed order: floors, corridor floors and role markers (tier 0), pillars (tier 1), corridor lintels and embers (tier 2). Counted against the place's budget by
        /// <see cref="VillagePlaces.TotalTriangles"/>.
        /// </summary>
        public List<PlacePart> Parts()
        {
            var parts = new List<PlacePart>();
            foreach (var r in Rooms) parts.Add(Box("floor_" + r.Cell, r.X - RoomHalf, r.X + RoomHalf, r.Z - RoomHalf, r.Z + RoomHalf, 0.0, 0.04, 0.11, 0.1, 0.12, 0, 0));
            foreach (var e in Edges) { var c = Corridor(e, "corridor_", 0.0, 0.04, 0.09, 0.08, 0.1, 0); parts.Add(c); }
            foreach (var r in Rooms)
            {
                if (r.Role == TextsRole) parts.Add(Box("lectern_" + r.Cell, r.X - 0.3, r.X + 0.3, r.Z + 0.5, r.Z + 1.0, 0.0, 0.9, 0.2, 0.15, 0.1, 0, 0));
                else if (r.Role == TearRole) parts.Add(Box("tear_" + r.Cell, r.X - 0.5, r.X + 0.5, r.Z + 0.75, r.Z + 0.85, 0.2, 2.2, 0.35, 0.9, 0.8, 1, 0));
                else if (r.Role == PrisonRole) parts.Add(Box("cage_" + r.Cell, r.X + 0.35, r.X + 0.95, r.Z - 0.95, r.Z - 0.35, 0.0, 1.8, 0.1, 0.1, 0.12, 0, 0));
            }
            foreach (var r in Rooms)
            {
                parts.Add(Box("pillar_a_" + r.Cell, r.X - 1.1, r.X - 0.85, r.Z - 1.1, r.Z - 0.85, 0.0, 2.4, 0.18, 0.17, 0.19, 0, 1));
                parts.Add(Box("pillar_b_" + r.Cell, r.X + 0.85, r.X + 1.1, r.Z + 0.85, r.Z + 1.1, 0.0, 2.4, 0.18, 0.17, 0.19, 0, 1));
            }
            foreach (var e in Edges) parts.Add(Corridor(e, "lintel_", 1.9, 2.1, 0.16, 0.15, 0.17, 2));
            foreach (var r in Rooms) parts.Add(Box("ember_" + r.Cell, r.X - 0.95, r.X - 0.8, r.Z + 0.8, r.Z + 0.95, 0.0, 0.2, 0.9, 0.5, 0.2, 1, 2));
            return parts;
        }

        private PlacePart Corridor(int[] e, string prefix, double y0, double y1, double r, double g, double b, int tier)
        {
            var a = RoomAt(e[0]); var c = RoomAt(e[1]);
            string id = prefix + e[0] + "_" + e[1];
            if (a.X == c.X) return Box(id, a.X - CorridorHalf, a.X + CorridorHalf, Math.Min(a.Z, c.Z) + RoomHalf, Math.Max(a.Z, c.Z) - RoomHalf, y0, y1, r, g, b, 0, tier);
            return Box(id, Math.Min(a.X, c.X) + RoomHalf, Math.Max(a.X, c.X) - RoomHalf, a.Z - CorridorHalf, a.Z + CorridorHalf, y0, y1, r, g, b, 0, tier);
        }
    }

    /// <summary>Where a place stands in one village: its centre, the cardinal direction its front door faces, and the world points of the way in and the ways back.</summary>
    public sealed class PlacePlacement
    {
        public string Id;
        public double X, Z, FaceX, FaceZ, Radius;
        /// <summary>Outside the front door (the way in), just inside it, the hidden hatch, and where the tunnel comes up.</summary>
        public double[] Entrance, Door, Hatch, TunnelExit;
        /// <summary>The seeded room graph of a procedural place (<see cref="PlaceData.Procedural"/>), or null.</summary>
        public PlaceGraph Graph;
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
        public const string Manor = "manor", Forest = "forest", Catacomb = "catacomb";
        public const int PlaceStream = 0x504c43, TrailStream = 0x545241, GraphStream = 0x475248;
        /// <summary>Metres kept between the footprint and an anchor landmark's own disc, extra metres per further ring, rings tried, and the longest walk from the entrance point to the inside of the door.</summary>
        public const double Gap = 2.0, RingStep = 4.0, MaxDoorWalk = 6.0;
        /// <summary>Longest gap between lantern markers (and from the last one to the entrance), metres; the longest reach from a lantern to a discovery; spacing, sideways offset and longest length of the hunting trail markers.</summary>
        public const double LanternGap = 4.0, LanternReach = 4.0, TrailSpacing = 3.0, TrailSide = 1.4, MaxTrailLength = 36.0;
        public const int RingCount = 6, DirectionCount = 8, Tiers = 3;
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

        private static int PlaceIndex(string id) { return id == Manor ? 1 : id == Forest ? 2 : id == Catacomb ? 3 : 4; }

        /// <summary>The placement of a place at a given centre and facing, with every point of the way in and back worked out. No validation: see <see cref="Check"/>.</summary>
        public static PlacePlacement Build(PlaceData data, int seed, int gridW, int gridD, double x, double z, double faceX, double faceZ)
        {
            var p = new PlacePlacement { Id = data.Id, X = x, Z = z, FaceX = faceX, FaceZ = faceZ, Radius = data.Radius };
            p.Entrance = ToWorld(p, data.EntranceX, data.EntranceZ);
            p.Door = ToWorld(p, data.DoorX, data.DoorZ);
            p.Hatch = ToWorld(p, data.HatchX, data.HatchZ);
            if (data.Procedural) p.Graph = PlaceGraph.Generate(seed, PlaceIndex(data.Id));
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

        /// <summary>Triangles at a tier of the authored parts plus the parts of the placement's room graph (<see cref="PlaceGraph.Parts"/>).</summary>
        public static int TotalTriangles(PlaceData data, PlacePlacement p, int tier)
        {
            int total = Triangles(data, tier);
            if (p != null && p.Graph != null) foreach (var part in p.Graph.Parts()) if (part.Tier <= tier) total += TrianglesOf(part);
            return total;
        }

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
            for (int t = 0; t < Tiers; t++) if (TotalTriangles(data, p, t) > data.Budget[t]) return "over the triangle budget at tier " + t;
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

        /// <summary>The lantern markers of a placed place in the world frame, from the deepest point out to the entrance. Following them in order leads back to <see cref="PlacePlacement.Entrance"/>.</summary>
        public static List<double[]> LanternPoints(PlaceData data, PlacePlacement p)
        {
            var list = new List<double[]>();
            foreach (var l in data.Lanterns) list.Add(ToWorld(p, l[0], l[1]));
            return list;
        }

        /// <summary>
        /// The marker points of an abandoned hunting trail: from the point of the lit paths (<see cref="VillageLandmarks.Paths"/>) nearest the entrance, a straight line to the entrance, a marker every
        /// <see cref="TrailSpacing"/> m (at most <see cref="MaxTrailLength"/> m of it, the end nearest the place), only inside the walkable world. Empty for a place without a trail.
        /// </summary>
        public static List<double[]> HuntingTrail(PlaceData data, PlacePlacement p, int seed, int gridW, int gridD)
        {
            var pts = new List<double[]>();
            if (!data.HuntingTrail) return pts;
            double best = double.MaxValue, bx = 0.0, bz = 0.0, ex = p.Entrance[0], ez = p.Entrance[1];
            foreach (var path in VillageLandmarks.Paths(seed, gridW, gridD))
                for (int i = 0; i + 1 < path.Points.Count; i++)
                {
                    double x0 = path.Points[i][0], z0 = path.Points[i][1], sx = path.Points[i + 1][0] - x0, sz = path.Points[i + 1][1] - z0, len2 = sx * sx + sz * sz;
                    double t = len2 < 1e-9 ? 0.0 : Math.Max(0.0, Math.Min(1.0, ((ex - x0) * sx + (ez - z0) * sz) / len2));
                    double qx = x0 + sx * t, qz = z0 + sz * t, d = (ex - qx) * (ex - qx) + (ez - qz) * (ez - qz);
                    if (d < best) { best = d; bx = qx; bz = qz; }
                }
            double dx = ex - bx, dz = ez - bz, length = Math.Sqrt(dx * dx + dz * dz);
            if (length < 1e-9) return pts;
            dx /= length; dz /= length;
            double start = Math.Max(0.0, length - MaxTrailLength);
            for (int n = 0; start + n * TrailSpacing < length - TrailSpacing * 0.5; n++)
            {
                double s = start + n * TrailSpacing, x = bx + dx * s, z = bz + dz * s;
                if (PointInBounds(seed, gridW, gridD, x, z)) pts.Add(new[] { x, z });
            }
            return pts;
        }

        /// <summary>The hunting trail as dressing items: a rock and a stump in turn, a little to alternate sides of the line, so the trail reads as old blazes and cairns (existing kinds, with their collision).</summary>
        public static List<DressingItem> TrailDressing(PlaceData data, PlacePlacement p, int seed, int gridW, int gridD)
        {
            var items = new List<DressingItem>();
            var pts = HuntingTrail(data, p, seed, gridW, gridD);
            for (int n = 0; n < pts.Count; n++)
            {
                double side = (n % 2 == 0 ? 1.0 : -1.0) * TrailSide;
                double dx = p.Entrance[0] - pts[n][0], dz = p.Entrance[1] - pts[n][1], len = Math.Sqrt(dx * dx + dz * dz);
                if (len < 1e-9) continue;
                items.Add(new DressingItem { Kind = n % 2 == 0 ? "rock" : "stump", X = pts[n][0] - dz / len * side, Y = 0.0, Z = pts[n][1] + dx / len * side, Yaw = n * 0.7, Scale = 1.0 });
            }
            return items;
        }

        /// <summary>Whether a discovery can be found: it needs no earlier clue, or that clue is already on the board (<paramref name="clueIds"/>).</summary>
        public static bool Revealed(PlaceDiscovery d, ICollection<string> clueIds)
        {
            return d.Requires.Length == 0 || (clueIds != null && clueIds.Contains(d.Requires));
        }

        /// <summary>The world point of a discovery.</summary>
        public static double[] DiscoveryPoint(PlacePlacement p, PlaceDiscovery d)
        {
            if (p.Graph != null) { var room = p.Graph.RoomWithRole(d.Room); if (room != null) return ToWorld(p, room.X, room.Z); }
            return ToWorld(p, d.X, d.Z);
        }

        /// <summary>
        /// Whether a discovery can be found at a knowledge <paramref name="tier"/> on a <paramref name="night"/>: the clue it requires is on the board, the tier unlocks the benefit it names and the effect it names is among that night's
        /// reality distortions (a dimensional tear shows only to someone who knows eldritch science, and only on nights the village warps that way).
        /// </summary>
        public static bool Revealed(PlaceDiscovery d, ICollection<string> clueIds, KnowledgeLibrary lib, int seed, int night, int tier)
        {
            if (!Revealed(d, clueIds)) return false;
            if (d.RequiresBenefit.Length > 0 && (lib == null || !KnowledgeRules.HasBenefit(lib, tier, d.RequiresBenefit))) return false;
            if (d.RequiresEffect.Length > 0 && (lib == null || !RealityDistortion.For(lib, seed, night, tier).Contains(d.RequiresEffect))) return false;
            return true;
        }

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
