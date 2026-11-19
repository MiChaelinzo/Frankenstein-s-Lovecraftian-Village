using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>One creature kind from Data/creatures.json: where and when it appears, how far its dread reaches and how it moves.</summary>
    public sealed class CreatureDef
    {
        public string Id;
        /// <summary>One of <see cref="CreatureRules.Habitats"/>: shore, fog, harbour, cliffs.</summary>
        public string Habitat;
        /// <summary>One of <see cref="CreatureRules.PhaseRules"/>: night, dusk_night or any.</summary>
        public string Phase;
        /// <summary>"fog" (fog or mist weather) or "" (any weather).</summary>
        public string Weather;
        /// <summary>Least dread, in percent, at which this kind appears.</summary>
        public int MinDread;
        /// <summary>Most of this kind present at once.</summary>
        public int Max;
        /// <summary>Sanity lost per second at point blank; it falls off linearly to zero at <see cref="Range"/>.</summary>
        public double Drain;
        public double Range;
        public bool NeedsLos;
        public double Speed;
        /// <summary>It walks toward a player closer than this; 0 for a creature that only hovers.</summary>
        public double Hunt;
        /// <summary>Height above the ground in metres, for the renderers; 0 walks.</summary>
        public double Height;
        public Dictionary<string, string> Names = new Dictionary<string, string>();
        public Dictionary<string, string> Texts = new Dictionary<string, string>();
    }

    /// <summary>The parsed creature data file. The same file is read by web/src/creatures.js; a drift test compares the two copies.</summary>
    public sealed class CreatureCatalog
    {
        public List<CreatureDef> Defs = new List<CreatureDef>();

        public CreatureDef Find(string id)
        {
            foreach (var d in Defs) if (d.Id == id) return d;
            return null;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending creature when the data is malformed.</summary>
        public static CreatureCatalog Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            var list = root != null && root.ContainsKey("creatures") ? root["creatures"] as List<object> : null;
            if (list == null) throw new FormatException("creatures: missing creatures array");
            var cat = new CreatureCatalog();
            var seen = new HashSet<string>();
            foreach (var entry in list)
            {
                var o = entry as Dictionary<string, object>;
                if (o == null) throw new FormatException("creatures: entry is not an object");
                var d = new CreatureDef { Id = Str(o, "id", "?") };
                if (!seen.Add(d.Id)) throw new FormatException("creatures: duplicate id " + d.Id);
                d.Habitat = Str(o, "habitat", d.Id);
                if (Array.IndexOf(CreatureRules.Habitats, d.Habitat) < 0) throw new FormatException("creatures: " + d.Id + " has unknown habitat " + d.Habitat);
                d.Phase = Str(o, "phase", d.Id);
                if (Array.IndexOf(CreatureRules.PhaseRules, d.Phase) < 0) throw new FormatException("creatures: " + d.Id + " has unknown phase rule " + d.Phase);
                d.Weather = o.ContainsKey("weather") && o["weather"] is string ? (string)o["weather"] : "";
                if (d.Weather != "" && d.Weather != "fog") throw new FormatException("creatures: " + d.Id + " has unknown weather rule " + d.Weather);
                d.MinDread = (int)Num(o, "minDread", d.Id);
                d.Max = (int)Num(o, "max", d.Id);
                d.Drain = Num(o, "drain", d.Id);
                d.Range = Num(o, "range", d.Id);
                d.Speed = Num(o, "speed", d.Id);
                d.Hunt = Num(o, "hunt", d.Id);
                d.Height = Num(o, "height", d.Id);
                d.NeedsLos = o.ContainsKey("los") && o["los"] is bool && (bool)o["los"];
                if (d.MinDread < 0 || d.MinDread > 100) throw new FormatException("creatures: " + d.Id + " has minDread outside 0..100");
                if (d.Max < 1 || d.Max > CreatureRules.MaxCreatures) throw new FormatException("creatures: " + d.Id + " has max outside 1.." + CreatureRules.MaxCreatures);
                if (d.Drain <= 0 || d.Drain > CreatureRules.MaxDrainPerSecond) throw new FormatException("creatures: " + d.Id + " has drain outside (0.." + CreatureRules.MaxDrainPerSecond + "]");
                if (d.Range <= 0 || d.Range > CreatureRules.TelegraphRange) throw new FormatException("creatures: " + d.Id + " has range outside (0.." + CreatureRules.TelegraphRange + "]");
                if (d.Speed < 0 || d.Hunt < 0 || d.Height < 0) throw new FormatException("creatures: " + d.Id + " has a negative speed, hunt or height");
                foreach (var lang in CreatureRules.Languages)
                {
                    var t = o.ContainsKey(lang) ? o[lang] as Dictionary<string, object> : null;
                    if (t == null) throw new FormatException("creatures: " + d.Id + " lacks language " + lang);
                    d.Names[lang] = Str(t, "name", d.Id);
                    d.Texts[lang] = Str(t, "text", d.Id);
                }
                cat.Defs.Add(d);
            }
            return cat;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("creatures: " + owner + " lacks " + key);
            return s;
        }

        private static double Num(Dictionary<string, object> o, string key, string owner)
        {
            if (!o.ContainsKey(key) || !(o[key] is double)) throw new FormatException("creatures: " + owner + " lacks number " + key);
            return (double)o[key];
        }
    }

    /// <summary>One creature in the world: its seeded home and where it is now.</summary>
    public sealed class Creature
    {
        public string DefId;
        public double HomeX, HomeZ, X, Z;
    }

    /// <summary>A salt line (<see cref="Kind"/> "salt", a segment A to B) or a chalk sigil ("sigil", a circle at A with <see cref="CreatureRules.SigilRadius"/>). It lasts until <see cref="ExpiresTick"/>.</summary>
    public sealed class Ward
    {
        public string Kind;
        public double AX, AZ, BX, BZ;
        public int ExpiresTick;
    }

    /// <summary>What one simulation step did. Drain is the sanity to take off (a positive number), FuelBurn the whole lantern fuel units used, Telegraph 0..1 how close the nearest creature is (for fog, flicker and audio).</summary>
    public struct CreatureStep
    {
        public double Drain;
        public int FuelBurn;
        public double Telegraph;
        public int Nearest;
        public bool Pushed;
        public bool Blocked;
    }

    /// <summary>
    /// The creatures of one village and the player's counterplay. Spawns are seeded and bounded; Step moves them, applies the wards and returns the sanity drain.
    /// Everything is deterministic for the same inputs in the same order. The 3D and 2D views, the audio and the Unity hook only read this state.
    /// </summary>
    public sealed class CreatureEncounter
    {
        public readonly List<Creature> Creatures = new List<Creature>();
        public readonly List<Ward> Wards = new List<Ward>();
        public int FlareUntilTick = -1;
        public int FlareReadyTick;
        public double FuelDebt;

        /// <summary>The creatures that appear for this phase, weather and dread (0..1), at their seeded homes. <paramref name="blocked"/> (may be null) says whether a point is inside a building or prop.</summary>
        public static CreatureEncounter Spawn(int seed, int gridW, int gridD, int tick, double dread, string weather, CreatureCatalog cat, Func<double, double, bool> blocked)
        {
            var enc = new CreatureEncounter { _cat = cat };
            if (cat == null || gridW <= 0 || gridD <= 0) return enc;
            int dreadPercent = (int)Math.Floor(Math.Max(0.0, Math.Min(1.0, double.IsNaN(dread) ? 0.0 : dread)) * 100.0 + 1e-9);
            for (int k = 0; k < cat.Defs.Count; k++)
            {
                var def = cat.Defs[k];
                if (!IsActive(def, tick, dreadPercent, weather)) continue;
                int count = Math.Max(1, 1 + (def.Max - 1) * dreadPercent / 100);
                var rng = new SeededRandom(seed ^ CreatureRules.HomeSalt ^ (k * CreatureRules.KindStep));
                for (int i = 0; i < def.Max; i++)
                {
                    double x, z;
                    Home(def, rng, seed, gridW, gridD, blocked, out x, out z);
                    if (i >= count || enc.Creatures.Count >= CreatureRules.MaxCreatures) continue;
                    enc.Creatures.Add(new Creature { DefId = def.Id, HomeX = x, HomeZ = z, X = x, Z = z });
                }
            }
            return enc;
        }

        /// <summary>Whether a kind appears at this tick, dread percent and weather.</summary>
        public static bool IsActive(CreatureDef def, int tick, int dreadPercent, string weather)
        {
            var phase = GameClock.PhaseAt(tick);
            bool phaseOk = def.Phase == "any" || (def.Phase == "night" && phase == DayPhase.Night) || (def.Phase == "dusk_night" && (phase == DayPhase.Dusk || phase == DayPhase.Night));
            bool weatherOk = def.Weather == "" || weather == "fog" || weather == "mist";
            return phaseOk && weatherOk && dreadPercent >= def.MinDread;
        }

        private static void Home(CreatureDef def, SeededRandom rng, int seed, int gridW, int gridD, Func<double, double, bool> blocked, out double x, out double z)
        {
            double w = gridW * VillageDressing.Cell, d = gridD * VillageDressing.Cell;
            double shore = VillageDressing.ShoreLength(seed, gridW, gridD);
            x = 0; z = 0;
            if (def.Habitat == "shore")
            {
                double u = CreatureRules.ShoreMargin + rng.Next(1000) / 1000.0 * Math.Max(0.0, shore - 2 * CreatureRules.ShoreMargin);
                VillageDressing.CoastToWorld(seed, gridW, gridD, u, CreatureRules.ShoreV, out x, out z);
            }
            else if (def.Habitat == "harbour")
            {
                double u = VillageDressing.DockU(seed, gridW, gridD) + (rng.Next(2001) - 1000) / 1000.0 * CreatureRules.HarbourSpread;
                VillageDressing.CoastToWorld(seed, gridW, gridD, u, CreatureRules.HarbourV, out x, out z);
            }
            else if (def.Habitat == "cliffs")
            {
                var all = VillageLandmarks.All(seed, gridW, gridD);
                var cliffs = all[0];
                double a = rng.Next(1000) / 1000.0 * 2.0 * Math.PI, r = Math.Sqrt(rng.Next(1000) / 1000.0) * cliffs.Radius * CreatureRules.CliffSpread;
                x = cliffs.X + Math.Cos(a) * r; z = cliffs.Z + Math.Sin(a) * r;
            }
            else
            {
                for (int t = 0; t < CreatureRules.HomeTries; t++)
                {
                    x = rng.Next(1000) / 1000.0 * w; z = rng.Next(1000) / 1000.0 * d;
                    if (blocked == null || !blocked(x, z)) break;
                }
            }
        }

        // ---------- counterplay ----------

        /// <summary>Lays a salt line across the way the player faces (heading hx, hz; (0,1) when zero). Uses one salt; returns "" or the reason: missing.</summary>
        public string PlaceSalt(Inventory player, double px, double pz, double hx, double hz, int tick)
        {
            double len = Math.Sqrt(hx * hx + hz * hz);
            if (len < 1e-9) { hx = 0; hz = 1; len = 1; }
            hx /= len; hz /= len;
            if (player.Remove("salt", 1) < 1) return "missing";
            double cx = px + hx * CreatureRules.SaltAhead, cz = pz + hz * CreatureRules.SaltAhead, half = CreatureRules.SaltLength / 2.0;
            AddWard(new Ward { Kind = "salt", AX = cx - hz * half, AZ = cz + hx * half, BX = cx + hz * half, BZ = cz - hx * half, ExpiresTick = tick + CreatureRules.SaltMinutes });
            return "";
        }

        /// <summary>Draws a chalk sigil under the player. Uses one sigil chalk; returns "" or the reason: missing.</summary>
        public string PlaceSigil(Inventory player, double px, double pz, int tick)
        {
            if (player.Remove("sigil_chalk", 1) < 1) return "missing";
            AddWard(new Ward { Kind = "sigil", AX = px, AZ = pz, BX = px, BZ = pz, ExpiresTick = tick + CreatureRules.SigilMinutes });
            return "";
        }

        private void AddWard(Ward w)
        {
            Wards.Add(w);
            while (Wards.Count > CreatureRules.MaxWards) Wards.RemoveAt(0);
        }

        /// <summary>The last resort: a flare burns lantern fuel for a short, strong push. Returns "" or the reason: fuel, cooldown.</summary>
        public string UseFlare(Inventory player, int tick)
        {
            if (tick < FlareReadyTick) return "cooldown";
            if (player.Fuel < CreatureRules.FlareFuelCost) return "fuel";
            player.BurnFuel(CreatureRules.FlareFuelCost);
            FlareUntilTick = tick + CreatureRules.FlareMinutes;
            FlareReadyTick = tick + CreatureRules.FlareCooldownMinutes;
            return "";
        }

        public bool FlareActive(int tick) { return tick < FlareUntilTick; }

        public bool InSigil(double x, double z)
        {
            foreach (var w in Wards)
                if (w.Kind == "sigil" && Dist(x, z, w.AX, w.AZ) <= CreatureRules.SigilRadius) return true;
            return false;
        }

        /// <summary>Whether a salt line lies between the two points.</summary>
        public bool SaltBetween(double ax, double az, double bx, double bz)
        {
            foreach (var w in Wards) if (w.Kind == "salt" && SegmentsCross(ax, az, bx, bz, w.AX, w.AZ, w.BX, w.BZ)) return true;
            return false;
        }

        // ---------- simulation ----------

        /// <summary>
        /// Advances every creature by <paramref name="dt"/> seconds with the player at (px, pz) and <paramref name="fuel"/> lantern fuel. The lantern pushes creatures within
        /// <see cref="CreatureRules.LanternRange"/> back and burns fuel; a flare does the same with a wider reach; a salt line stops creatures crossing and breaks their gaze;
        /// a sigil keeps them out and shelters the player. Drain only comes from a creature in range, with line of sight when its kind needs it, and not held off by a counter.
        /// </summary>
        public CreatureStep Step(double dt, double px, double pz, int tick, int fuel, Func<double, double, bool> blocked)
        {
            var result = new CreatureStep { Nearest = -1 };
            if (!(dt > 0)) return result;
            Wards.RemoveAll(w => tick >= w.ExpiresTick);
            bool lanternLit = fuel > 0, flare = FlareActive(tick), sheltered = InSigil(px, pz);
            double drain = 0, fuelUse = 0, nearest = double.MaxValue;
            for (int i = 0; i < Creatures.Count; i++)
            {
                var c = Creatures[i];
                var def = CatalogDef(c);
                double d = Dist(px, pz, c.X, c.Z);
                bool lanternPush = lanternLit && d <= CreatureRules.LanternRange, flarePush = flare && d <= CreatureRules.FlareRange;
                double nx = c.X, nz = c.Z;
                if (lanternPush || flarePush)
                {
                    double push = (flarePush ? CreatureRules.FlarePush : CreatureRules.LanternPush) * dt;
                    Toward(ref nx, ref nz, px, pz, -push);
                    if (lanternPush) fuelUse += CreatureRules.LanternFuelPerSecond * dt;
                    result.Pushed = true;
                }
                else if (def.Hunt > 0 && d <= def.Hunt && !sheltered)
                {
                    double stop = Math.Max(0.0, d - CreatureRules.CloseStop);
                    Toward(ref nx, ref nz, px, pz, Math.Min(def.Speed * dt, stop));
                }
                else if (c.X != c.HomeX || c.Z != c.HomeZ)
                {
                    double back = Dist(c.X, c.Z, c.HomeX, c.HomeZ);
                    Toward(ref nx, ref nz, c.HomeX, c.HomeZ, Math.Min(Math.Max(def.Speed, CreatureRules.ReturnSpeed) * dt, back));
                }
                if (SaltBetween(c.X, c.Z, nx, nz)) { nx = c.X; nz = c.Z; result.Blocked = true; }
                double home = Dist(nx, nz, c.HomeX, c.HomeZ);
                if (home > CreatureRules.Leash) { nx = c.HomeX + (nx - c.HomeX) * CreatureRules.Leash / home; nz = c.HomeZ + (nz - c.HomeZ) * CreatureRules.Leash / home; }
                foreach (var w in Wards)
                {
                    if (w.Kind != "sigil") continue;
                    double s = Dist(nx, nz, w.AX, w.AZ);
                    if (s < CreatureRules.SigilRadius) { double k = s < 1e-9 ? 0.0 : CreatureRules.SigilRadius / s; nx = s < 1e-9 ? w.AX + CreatureRules.SigilRadius : w.AX + (nx - w.AX) * k; nz = s < 1e-9 ? w.AZ : w.AZ + (nz - w.AZ) * k; }
                }
                c.X = nx; c.Z = nz;
                d = Dist(px, pz, c.X, c.Z);
                if (d < nearest) { nearest = d; result.Nearest = i; }
                bool held = sheltered || (lanternLit && d <= CreatureRules.LanternRange) || (flare && d <= CreatureRules.FlareRange) || SaltBetween(c.X, c.Z, px, pz);
                if (d <= def.Range && !held && (!def.NeedsLos || HasLineOfSight(c.X, c.Z, px, pz, blocked)))
                    drain += def.Drain * (1.0 - d / def.Range) * dt;
            }
            result.Drain = Math.Min(drain, CreatureRules.MaxDrainPerSecond * dt);
            FuelDebt += fuelUse;
            int burn = (int)Math.Floor(FuelDebt);
            FuelDebt -= burn;
            result.FuelBurn = Math.Min(burn, Math.Max(0, fuel));
            result.Telegraph = result.Nearest < 0 ? 0.0 : Math.Max(0.0, Math.Min(1.0, 1.0 - nearest / CreatureRules.TelegraphRange));
            return result;
        }

        private CreatureCatalog _cat;
        private CreatureDef CatalogDef(Creature c) { return _cat.Find(c.DefId); }

        /// <summary>Samples the segment every <see cref="CreatureRules.LosStep"/> metres, ends excluded; a null predicate means open ground.</summary>
        public static bool HasLineOfSight(double ax, double az, double bx, double bz, Func<double, double, bool> blocked)
        {
            if (blocked == null) return true;
            double len = Dist(ax, az, bx, bz);
            int n = (int)Math.Floor(len / CreatureRules.LosStep);
            for (int i = 1; i <= n; i++)
            {
                double t = i * CreatureRules.LosStep / len;
                if (t >= 1.0) break;
                if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
            }
            return true;
        }

        public static double Dist(double ax, double az, double bx, double bz)
        {
            double dx = ax - bx, dz = az - bz;
            return Math.Sqrt(dx * dx + dz * dz);
        }

        private static void Toward(ref double x, ref double z, double tx, double tz, double amount)
        {
            double dx = tx - x, dz = tz - z, len = Math.Sqrt(dx * dx + dz * dz);
            if (len < 1e-9) return;
            x += dx / len * amount; z += dz / len * amount;
        }

        private static double Cross(double ax, double az, double bx, double bz, double cx, double cz) { return (bx - ax) * (cz - az) - (bz - az) * (cx - ax); }

        /// <summary>Proper crossing of two segments (touching ends do not count).</summary>
        public static bool SegmentsCross(double ax, double az, double bx, double bz, double cx, double cz, double dx, double dz)
        {
            double d1 = Cross(ax, az, bx, bz, cx, cz), d2 = Cross(ax, az, bx, bz, dx, dz), d3 = Cross(cx, cz, dx, dz, ax, az), d4 = Cross(cx, cz, dx, dz, bx, bz);
            return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
        }

        /// <summary>The golden line of one creature: id and position to 3 decimals.</summary>
        public string Describe(Creature c)
        {
            return c.DefId + "@" + Math.Round(c.X, 3).ToString("0.###", CultureInfo.InvariantCulture) + "," + Math.Round(c.Z, 3).ToString("0.###", CultureInfo.InvariantCulture);
        }
    }

    /// <summary>Named constants of the creature system. Distances are metres, times seconds or game minutes as named.</summary>
    public static class CreatureRules
    {
        public static readonly string[] Habitats = { "shore", "fog", "harbour", "cliffs" };
        public static readonly string[] PhaseRules = { "night", "dusk_night", "any" };
        public static readonly string[] Languages = { "en", "fr" };
        /// <summary>Most creatures in the world at once, all kinds together.</summary>
        public const int MaxCreatures = 8;
        /// <summary>Most sanity lost per second however many creatures reach the player.</summary>
        public const double MaxDrainPerSecond = 2.0;
        public const int HomeSalt = 0x5EA70;
        public const int KindStep = 0x9E37;
        public const int HomeTries = 12;
        public const double ShoreMargin = 3.0, ShoreV = -1.4, HarbourV = -1.6, HarbourSpread = 10.0, CliffSpread = 0.8;
        /// <summary>A creature never strays further than this from its home.</summary>
        public const double Leash = 26.0;
        public const double CloseStop = 1.2, ReturnSpeed = 1.0;
        public const double LosStep = 1.0;
        public const double TelegraphRange = 30.0;
        public const double LanternRange = 7.0, LanternPush = 3.0, LanternFuelPerSecond = 0.5;
        public const double FlareRange = 16.0, FlarePush = 7.0;
        public const int FlareFuelCost = 30, FlareMinutes = 20, FlareCooldownMinutes = 120;
        public const double SaltLength = 6.0, SaltAhead = 1.5, SigilRadius = 4.0;
        public const int SaltMinutes = 180, SigilMinutes = 360, MaxWards = 6;
    }
}
