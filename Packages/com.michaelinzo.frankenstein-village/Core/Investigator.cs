using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    public struct RouteCell
    {
        public int X;
        public int Z;
    }

    /// <summary>A sanity hit: the investigator came within range of an omen site.</summary>
    public struct InvestigatorHit
    {
        public int Tick;        // route index at which the hit happened
        public int X;
        public int Z;
        public string SiteId;   // piece id of the omen site
        public int SanityLoss;  // 3..7
    }

    /// <summary>
    /// A seeded investigator who walks a lantern route between village pieces, one cell per tick, and loses sanity
    /// the first time they pass near an omen site. Engine-free, integer-only, SeededRandom keyed on the seed.
    /// </summary>
    public sealed class Investigator
    {
        public const int MaxWaypoints = 10;
        public const int OmenRange = 2; // Chebyshev distance in cells

        public static readonly string[] OmenSiteIds = { "altar", "well", "church", "dead_tree" };

        public List<RouteCell> Route { get; private set; } = new List<RouteCell>();
        public int Tick { get; private set; }
        private readonly List<PlacedPiece> sites = new List<PlacedPiece>();
        private readonly bool[] visited;
        private readonly SeededRandom rng;

        public Investigator(List<PlacedPiece> layout, int width, int depth, int seed)
        {
            rng = new SeededRandom(seed ^ 0x1abe11);
            if (layout == null || layout.Count == 0 || width <= 0 || depth <= 0) { visited = new bool[0]; return; }
            foreach (var p in layout)
                if (Array.IndexOf(OmenSiteIds, p.Id) >= 0) sites.Add(p);
            visited = new bool[sites.Count];
            Route = BuildRoute(layout, width, depth, rng);
        }

        private static RouteCell Center(PlacedPiece p) => new RouteCell { X = p.X + p.SizeX / 2, Z = p.Z + p.SizeZ / 2 };

        public static List<RouteCell> BuildRoute(List<PlacedPiece> layout, int width, int depth, SeededRandom rng)
        {
            var route = new List<RouteCell>();
            int count = Math.Min(MaxWaypoints, layout.Count);
            var used = new bool[layout.Count];
            int cur = rng.Next(layout.Count);
            used[cur] = true;
            var pos = Center(layout[cur]);
            route.Add(pos);
            for (int w = 1; w < count; w++)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < layout.Count; i++)
                {
                    if (used[i]) continue;
                    var c = Center(layout[i]);
                    int d = Math.Abs(c.X - pos.X) + Math.Abs(c.Z - pos.Z);
                    if (d < bestDist) { bestDist = d; best = i; }
                }
                if (best < 0) break;
                used[best] = true;
                var target = Center(layout[best]);
                while (pos.X != target.X) { pos.X += Math.Sign(target.X - pos.X); route.Add(Clamp(pos, width, depth)); }
                while (pos.Z != target.Z) { pos.Z += Math.Sign(target.Z - pos.Z); route.Add(Clamp(pos, width, depth)); }
            }
            return route;
        }

        private static RouteCell Clamp(RouteCell c, int width, int depth) =>
            new RouteCell { X = Math.Max(0, Math.Min(width - 1, c.X)), Z = Math.Max(0, Math.Min(depth - 1, c.Z)) };

        public bool Finished => Tick >= Route.Count;

        public RouteCell Position => Route.Count == 0 ? default : Route[Math.Min(Tick, Route.Count - 1)];

        /// <summary>Advance one cell. Returns true and fills hit when the new cell is the first one in range of an omen site.</summary>
        public bool Step(out InvestigatorHit hit)
        {
            hit = default;
            if (Finished) return false;
            var cell = Route[Tick];
            int at = Tick++;
            for (int i = 0; i < sites.Count; i++)
            {
                if (visited[i]) continue;
                var c = Center(sites[i]);
                if (Math.Max(Math.Abs(c.X - cell.X), Math.Abs(c.Z - cell.Z)) > OmenRange) continue;
                visited[i] = true;
                hit = new InvestigatorHit { Tick = at, X = cell.X, Z = cell.Z, SiteId = sites[i].Id, SanityLoss = 3 + rng.Next(5) };
                return true;
            }
            return false;
        }

        /// <summary>Walk the whole route and collect every hit.</summary>
        public static List<InvestigatorHit> Simulate(List<PlacedPiece> layout, int width, int depth, int seed)
        {
            var inv = new Investigator(layout, width, depth, seed);
            var hits = new List<InvestigatorHit>();
            while (!inv.Finished) if (inv.Step(out var h)) hits.Add(h);
            return hits;
        }

        public static string Describe(InvestigatorHit h) => "tick " + h.Tick + " at " + h.X + "," + h.Z + " " + h.SiteId + " -" + h.SanityLoss;
    }
}
