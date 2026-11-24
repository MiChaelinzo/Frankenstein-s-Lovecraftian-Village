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
        /// <summary>The four-tier upgrade path (spec 166), from the optional "manifestations" array. See <see cref="CreatureTiers"/>.</summary>
        public List<ManifestationDef> Manifestations = new List<ManifestationDef>();

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
            var tiers = root.ContainsKey("manifestations") ? root["manifestations"] as List<object> : null;
            if (tiers != null) cat.Manifestations = ManifestationDef.ParseAll(tiers, seen);
            return cat;
        }

        internal static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("creatures: " + owner + " lacks " + key);
            return s;
        }

        internal static double Num(Dictionary<string, object> o, string key, string owner)
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

        /// <summary>The creatures that appear for this phase, weather and dread (0..1), at their seeded homes. <paramref name="blocked"/> (may be null) says whether a point is inside a building or prop. No home lies within a place of <paramref name="places"/> (footprint plus <see cref="VillagePlaces.ObstacleMargin"/>); a home that would is drawn again, up to <see cref="CreatureRules.HomeTries"/> times.</summary>
        public static CreatureEncounter Spawn(int seed, int gridW, int gridD, int tick, double dread, string weather, CreatureCatalog cat, Func<double, double, bool> blocked, IList<PlacePlacement> places = null)
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
                    Home(def, rng, seed, gridW, gridD, blocked, places, out x, out z);
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

        private static void Home(CreatureDef def, SeededRandom rng, int seed, int gridW, int gridD, Func<double, double, bool> blocked, IList<PlacePlacement> places, out double x, out double z)
        {
            double w = gridW * VillageDressing.Cell, d = gridD * VillageDressing.Cell;
            double shore = VillageDressing.ShoreLength(seed, gridW, gridD);
            x = 0; z = 0;
            for (int t = 0; t < CreatureRules.HomeTries; t++)
            {
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
                    var cliffs = VillageLandmarks.All(seed, gridW, gridD)[0];
                    double a = rng.Next(1000) / 1000.0 * 2.0 * Math.PI, r = Math.Sqrt(rng.Next(1000) / 1000.0) * cliffs.Radius * CreatureRules.CliffSpread;
                    x = cliffs.X + Math.Cos(a) * r; z = cliffs.Z + Math.Sin(a) * r;
                }
                else
                {
                    x = rng.Next(1000) / 1000.0 * w; z = rng.Next(1000) / 1000.0 * d;
                }
                bool open = !VillagePlaces.InsideAnyPlace(places, x, z) && (def.Habitat != "fog" || blocked == null || !blocked(x, z));
                if (open) break;
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

namespace Frankenstein.Core
{
    /// <summary>
    /// One manifestation of the creature upgrade path (spec 166) from the "manifestations" array of Data/creatures.json. Tier 1 is human-adjacent, 2 a corrupted villager,
    /// 3 a reality-breaker, 4 a cosmic glimpse. Every entry names the narrative cause (one of <see cref="HorrorDirector.CauseIds"/>) that lets it appear.
    /// </summary>
    public sealed class ManifestationDef
    {
        public string Id;
        public int Tier;
        public int MinDread;
        /// <summary>"night", "dusk_night" or "any".</summary>
        public string Phase;
        /// <summary>Least <see cref="CorruptionStage"/> (0..4) any villager must have reached.</summary>
        public int Society;
        /// <summary>Least knowledge tier (0..5, <see cref="KnowledgeLibrary.MaxTier"/>).</summary>
        public int Knowledge;
        /// <summary>Least number of cosmic omens the Mythos simulation has produced.</summary>
        public int Omens;
        /// <summary>"village" (the player is outside every place), "place" (inside one) or "any".</summary>
        public string Context;
        /// <summary>Percent chance per day phase that an unlocked entry appears.</summary>
        public int Chance;
        public string Cause;
        /// <summary>"warded" (salt, sigil, flare and lantern turn it), "avoided" (only distance helps) or "witnessed" (nothing helps; it is only seen).</summary>
        public string Ward;
        public Dictionary<string, string> Names = new Dictionary<string, string>();
        public Dictionary<string, string> Texts = new Dictionary<string, string>();
        /// <summary>What the investigator writes down afterwards. It records the sighting and explains nothing.</summary>
        public Dictionary<string, string> Witness = new Dictionary<string, string>();

        internal static List<ManifestationDef> ParseAll(List<object> list, HashSet<string> seen)
        {
            var result = new List<ManifestationDef>();
            foreach (var entry in list)
            {
                var o = entry as Dictionary<string, object>;
                if (o == null) throw new FormatException("manifestations: entry is not an object");
                var d = new ManifestationDef { Id = CreatureCatalog.Str(o, "id", "?") };
                if (!seen.Add(d.Id)) throw new FormatException("manifestations: duplicate id " + d.Id);
                d.Tier = (int)CreatureCatalog.Num(o, "tier", d.Id);
                if (d.Tier < 1 || d.Tier > CreatureTiers.TierCount) throw new FormatException("manifestations: " + d.Id + " has tier outside 1.." + CreatureTiers.TierCount);
                d.MinDread = (int)CreatureCatalog.Num(o, "minDread", d.Id);
                if (d.MinDread < 0 || d.MinDread > 100) throw new FormatException("manifestations: " + d.Id + " has minDread outside 0..100");
                d.Phase = CreatureCatalog.Str(o, "phase", d.Id);
                if (Array.IndexOf(CreatureRules.PhaseRules, d.Phase) < 0) throw new FormatException("manifestations: " + d.Id + " has unknown phase rule " + d.Phase);
                d.Society = (int)CreatureCatalog.Num(o, "society", d.Id);
                if (d.Society < 0 || d.Society > (int)CorruptionStage.Missing) throw new FormatException("manifestations: " + d.Id + " has society outside 0..4");
                d.Knowledge = (int)CreatureCatalog.Num(o, "knowledge", d.Id);
                if (d.Knowledge < 0 || d.Knowledge > KnowledgeLibrary.MaxTier) throw new FormatException("manifestations: " + d.Id + " has knowledge outside 0.." + KnowledgeLibrary.MaxTier);
                d.Omens = (int)CreatureCatalog.Num(o, "omens", d.Id);
                if (d.Omens < 0) throw new FormatException("manifestations: " + d.Id + " has negative omens");
                d.Context = CreatureCatalog.Str(o, "context", d.Id);
                if (Array.IndexOf(CreatureTiers.Contexts, d.Context) < 0) throw new FormatException("manifestations: " + d.Id + " has unknown context " + d.Context);
                d.Chance = (int)CreatureCatalog.Num(o, "chance", d.Id);
                if (d.Chance < 1 || d.Chance > 100) throw new FormatException("manifestations: " + d.Id + " has chance outside 1..100");
                d.Cause = CreatureCatalog.Str(o, "cause", d.Id);
                if (Array.IndexOf(HorrorDirector.CauseIds, d.Cause) < 0 || d.Cause == "omen_passed") throw new FormatException("manifestations: " + d.Id + " has unknown cause " + d.Cause);
                d.Ward = CreatureCatalog.Str(o, "ward", d.Id);
                if (Array.IndexOf(CreatureTiers.WardKinds, d.Ward) < 0) throw new FormatException("manifestations: " + d.Id + " has unknown ward kind " + d.Ward);
                foreach (var lang in CreatureRules.Languages)
                {
                    var t = o.ContainsKey(lang) ? o[lang] as Dictionary<string, object> : null;
                    if (t == null) throw new FormatException("manifestations: " + d.Id + " lacks language " + lang);
                    d.Names[lang] = CreatureCatalog.Str(t, "name", d.Id);
                    d.Texts[lang] = CreatureCatalog.Str(t, "text", d.Id);
                    d.Witness[lang] = CreatureCatalog.Str(t, "witness", d.Id);
                }
                result.Add(d);
            }
            for (int t = 1; t <= CreatureTiers.TierCount; t++)
            {
                bool any = false;
                foreach (var d in result) if (d.Tier == t) any = true;
                if (!any) throw new FormatException("manifestations: tier " + t + " has no entry");
            }
            return result;
        }
    }

    /// <summary>What the player is, knows and stands in at one moment. The caller fills it from the society, the knowledge state and the Mythos run; Core reads nothing else.</summary>
    public struct TierContext
    {
        public int Seed, GridW, GridD, Tick;
        public int DreadPercent;
        /// <summary>Highest <see cref="CorruptionStage"/> (as int) any villager has reached, and that villager's roster index (-1 when none).</summary>
        public int SocietyStage, CorruptedVillager;
        public int KnowledgeTier;
        public int CosmicOmens;
        /// <summary>Id of the place the player is inside, "" in the village.</summary>
        public string PlaceId;
        /// <summary>Tick of the last tier 4 glimpse, or a negative number when there was none.</summary>
        public int LastGlimpseTick;
        public bool ReducedMotion;
    }

    /// <summary>One appearance. Seconds is 0 for tiers 1 to 3 (they linger while the player is near) and the capped exposure for tier 4. Cause is always one the HorrorDirector accepted.</summary>
    public sealed class Appearance
    {
        public string DefId;
        public int Tier;
        public string Cause;
        /// <summary>Roster index of the villager a tier 2 or tier 3 villager appearance wears, else -1.</summary>
        public int Subject = -1;
        public string PlaceId = "";
        public double X, Z;
        public double Seconds;
        /// <summary>Reduced motion: the figure does not drift or flicker; it is simply there, then not.</summary>
        public bool Still;
        public string Ward;
    }

    /// <summary>
    /// The creature upgrade path (spec 166): four tiers unlocked by state, never by a timer alone. Tier 1 needs dread, tier 2 a corrupted villager,
    /// tier 3 forbidden knowledge (reality distortion) and tier 4 a late knowledge tier plus a cosmic omen. Selection is seeded and made once per day phase, so the
    /// same inputs give the same appearances. Each appearance carries a narrative cause that <see cref="HorrorDirector.CauseHolds"/> must accept, or it is dropped.
    /// No tier chases; tier 4 shows for at most <see cref="MaxGlimpseSeconds"/> and then rests for <see cref="GlimpseCooldownTicks"/>.
    /// </summary>
    public static class CreatureTiers
    {
        public const int TierCount = 4;
        public const int TierSalt = 0x544952, StateStep = 40503;
        public const int PositionTries = 12;
        public const double GlimpseSeconds = 3.0, GlimpseReducedSeconds = 2.0, MaxGlimpseSeconds = 4.0;
        /// <summary>Two days of ticks (minutes) between tier 4 glimpses.</summary>
        public const int GlimpseCooldownTicks = 2 * GameClock.MinutesPerDay;
        public const string WitnessPrefix = "witness@";
        public static readonly string[] Contexts = { "village", "place", "any" };
        public static readonly string[] WardKinds = { "warded", "avoided", "witnessed" };
        public static readonly string[] WardActions = { "salt", "sigil", "flare", "lantern" };

        /// <summary>The director input a context stands for, used to check every cause. Sanity falls with dread, cult exposure rises with the corruption stage, knowledge with its tier.</summary>
        public static DirectorInput DirectorInputFor(TierContext c)
        {
            return new DirectorInput { Tick = c.Tick, Sanity = 1000 - Math.Max(0, Math.Min(100, c.DreadPercent)) * 10, Knowledge = c.KnowledgeTier * 200, CultExposure = c.SocietyStage * 250 };
        }

        /// <summary>The most corrupted villager at this moment: the highest stage and the first roster index holding it. Stage 0 and index -1 when nobody has reached Uneasy.</summary>
        public static int MostCorrupted(VillageSociety society, int night, float dread, int ritualStage, out int index)
        {
            int best = 0; index = -1;
            for (int i = 0; i < society.Roster.Count; i++)
            {
                int s = (int)society.CorruptionAt(i, night, dread, ritualStage);
                if (s > best) { best = s; index = i; }
            }
            return best;
        }

        /// <summary>Whether the context meets every unlock condition of the entry. The cooldown of tier 4 is part of it.</summary>
        public static bool Unlocked(ManifestationDef def, TierContext c)
        {
            var phase = GameClock.PhaseAt(c.Tick);
            bool phaseOk = def.Phase == "any" || (def.Phase == "night" && phase == DayPhase.Night) || (def.Phase == "dusk_night" && (phase == DayPhase.Dusk || phase == DayPhase.Night));
            bool inPlace = !string.IsNullOrEmpty(c.PlaceId);
            bool contextOk = def.Context == "any" || (def.Context == "place" ? inPlace : !inPlace);
            bool cooled = def.Tier != 4 || c.LastGlimpseTick < 0 || c.Tick - c.LastGlimpseTick >= GlimpseCooldownTicks;
            bool subjectOk = def.Tier != 2 || c.CorruptedVillager >= 0;
            return phaseOk && contextOk && cooled && subjectOk && c.DreadPercent >= def.MinDread && c.SocietyStage >= def.Society && c.KnowledgeTier >= def.Knowledge && c.CosmicOmens >= def.Omens;
        }

        /// <summary>
        /// The appearances for the current day phase, at most one per tier, in tier order. <paramref name="places"/> (may be null) keeps village spawns out of place footprints.
        /// An entry whose cause the director does not accept is left out and named in <paramref name="rejected"/> (may be null).
        /// </summary>
        public static List<Appearance> Select(TierContext c, CreatureCatalog cat, IList<PlacePlacement> places, List<string> rejected = null)
        {
            var result = new List<Appearance>();
            if (cat == null || cat.Manifestations.Count == 0 || c.GridW <= 0 || c.GridD <= 0) return result;
            int day = c.Tick >= 0 ? c.Tick / GameClock.MinutesPerDay : -1 - (-c.Tick - 1) / GameClock.MinutesPerDay;
            int slot = day * GameClock.PhaseCount + (int)GameClock.PhaseAt(c.Tick);
            var input = DirectorInputFor(c);
            for (int tier = 1; tier <= TierCount; tier++)
            {
                var eligible = new List<ManifestationDef>();
                foreach (var d in cat.Manifestations) if (d.Tier == tier && Unlocked(d, c)) eligible.Add(d);
                if (eligible.Count == 0) continue;
                var rng = new SeededRandom(c.Seed ^ TierSalt ^ (slot * StateStep) ^ (tier * CreatureRules.KindStep));
                var def = eligible[rng.Next(eligible.Count)];
                if (rng.Next(100) >= def.Chance) continue;
                if (!HorrorDirector.CauseHolds(def.Cause, input))
                {
                    if (rejected != null) rejected.Add(def.Id + ": cause " + def.Cause + " does not hold");
                    continue;
                }
                var a = new Appearance { DefId = def.Id, Tier = tier, Cause = def.Cause, Ward = def.Ward, Still = c.ReducedMotion };
                if (tier == 2 || def.Id == "doubled_villager") a.Subject = c.CorruptedVillager;
                if (def.Context == "place") a.PlaceId = c.PlaceId ?? "";
                else Position(rng, c, places, a);
                a.Seconds = tier == 4 ? (c.ReducedMotion ? GlimpseReducedSeconds : GlimpseSeconds) : 0.0;
                result.Add(a);
            }
            return result;
        }

        private static void Position(SeededRandom rng, TierContext c, IList<PlacePlacement> places, Appearance a)
        {
            double w = c.GridW * VillageDressing.Cell, d = c.GridD * VillageDressing.Cell;
            double x = 0, z = 0;
            for (int t = 0; t < PositionTries; t++)
            {
                x = rng.Next(1000) / 1000.0 * w; z = rng.Next(1000) / 1000.0 * d;
                if (!VillagePlaces.InsideAnyPlace(places, x, z)) break;
            }
            a.X = x; a.Z = z;
        }

        /// <summary>Whether the appearance is still on screen after <paramref name="elapsedSeconds"/>. Tier 4 ends at its capped exposure; the others last while the caller keeps them.</summary>
        public static bool Visible(Appearance a, double elapsedSeconds)
        {
            return a.Tier != 4 || (elapsedSeconds >= 0 && elapsedSeconds < Math.Min(a.Seconds, MaxGlimpseSeconds));
        }

        /// <summary>Whether a ward action turns the appearance away. Only tier 1 is warded; tier 2 is avoided by distance and tiers 3 and 4 are only witnessed.</summary>
        public static bool WardTurns(Appearance a, string action)
        {
            return a.Ward == "warded" && Array.IndexOf(WardActions, action) >= 0;
        }

        /// <summary>The investigation clue id recorded when the appearance is witnessed.</summary>
        public static string WitnessClueId(string defId) { return WitnessPrefix + defId; }

        public static bool IsWitnessClue(string clueId) { return clueId != null && clueId.StartsWith(WitnessPrefix, StringComparison.Ordinal); }
    }
}
