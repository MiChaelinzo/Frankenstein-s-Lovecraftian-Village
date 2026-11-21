using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>A crop from Data/homestead.json. Eldritch crops thrive on dread; plain crops are thinned by it unless a scarecrow stands.</summary>
    public sealed class CropDef
    {
        public string Id;
        /// <summary>"normal" or "eldritch".</summary>
        public string Kind;
        public string SeedItem;
        public string HarvestItem;
        public int GrowDays;
        public int Yield;
        public Dictionary<string, string> Names = new Dictionary<string, string>();
        public Dictionary<string, string> Texts = new Dictionary<string, string>();
    }

    /// <summary>A placeable structure: fence, trough, scarecrow or coop. Its slot on the plot is its index in the data file.</summary>
    public sealed class StructureDef
    {
        public string Id;
        /// <summary>Timber items it costs.</summary>
        public int Cost;
        public Dictionary<string, string> Names = new Dictionary<string, string>();
        public Dictionary<string, string> Texts = new Dictionary<string, string>();
    }

    /// <summary>A farm animal or a tamed pet. It is adopted by feeding it its food once; after that it needs food (feed) and its shelter structure.</summary>
    public sealed class ResidentDef
    {
        public string Id;
        /// <summary>"animal" or "pet".</summary>
        public string Group;
        public string FoodItem;
        /// <summary>The structure id that shelters it.</summary>
        public string Shelter;
        /// <summary>Days a feeding lasts.</summary>
        public int FedDays;
        /// <summary>How many sanity points its mood moves each day (content adds, distressed takes away).</summary>
        public int Sanity;
        /// <summary>The item it produces, or empty.</summary>
        public string Produce;
        public int Every;
        public int Cap;
        /// <summary>How many of it the renderer shows (a flock of hens is one resident).</summary>
        public int Count;
        public Dictionary<string, string> Names = new Dictionary<string, string>();
        public Dictionary<string, string> Texts = new Dictionary<string, string>();
    }

    /// <summary>The parsed homestead data file. web/src/homestead.js reads the same file; a drift test compares the two copies.</summary>
    public sealed class HomesteadCatalog
    {
        public List<CropDef> Crops = new List<CropDef>();
        public List<StructureDef> Structures = new List<StructureDef>();
        public List<ResidentDef> Residents = new List<ResidentDef>();
        /// <summary>What a new homestead hands the player: { item id, count }.</summary>
        public List<ItemStack> Starter = new List<ItemStack>();

        public CropDef FindCrop(string id) { foreach (var c in Crops) if (c.Id == id) return c; return null; }
        public StructureDef FindStructure(string id) { foreach (var s in Structures) if (s.Id == id) return s; return null; }
        public ResidentDef FindResident(string id) { foreach (var r in Residents) if (r.Id == id) return r; return null; }
        public int StructureIndex(string id) { for (int i = 0; i < Structures.Count; i++) if (Structures[i].Id == id) return i; return -1; }
        public int ResidentIndex(string id) { for (int i = 0; i < Residents.Count; i++) if (Residents[i].Id == id) return i; return -1; }

        /// <summary>Parses the data file against the item data. Throws FormatException naming the offending entry when the data is malformed.</summary>
        public static HomesteadCatalog Parse(string json, ItemCatalog items)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("homestead: not an object");
            var cat = new HomesteadCatalog();
            foreach (var e in List(root, "starter"))
            {
                var o = Obj(e, "starter");
                string item = Str(o, "item", "starter");
                int count = Int(o, "count", "starter");
                if (items.Find(item) == null || count < 1) throw new FormatException("homestead: starter has unknown item " + item + " or a count below 1");
                cat.Starter.Add(new ItemStack { Id = item, Count = count });
            }
            foreach (var e in List(root, "crops"))
            {
                var o = Obj(e, "crops");
                var c = new CropDef { Id = Str(o, "id", "crops") };
                if (cat.FindCrop(c.Id) != null) throw new FormatException("homestead: duplicate crop " + c.Id);
                c.Kind = Str(o, "kind", c.Id);
                if (Array.IndexOf(HomesteadRules.CropKinds, c.Kind) < 0) throw new FormatException("homestead: " + c.Id + " has unknown kind " + c.Kind);
                c.SeedItem = Str(o, "seed", c.Id);
                c.HarvestItem = Str(o, "harvest", c.Id);
                if (items.Find(c.SeedItem) == null || items.Find(c.HarvestItem) == null) throw new FormatException("homestead: " + c.Id + " names an unknown item");
                c.GrowDays = Int(o, "growDays", c.Id);
                c.Yield = Int(o, "yield", c.Id);
                if (c.GrowDays < 2 || c.GrowDays > HomesteadRules.MaxGrowDays) throw new FormatException("homestead: " + c.Id + " needs growDays in 2.." + HomesteadRules.MaxGrowDays);
                if (c.Yield < 1 || c.Yield > HomesteadRules.MaxYield) throw new FormatException("homestead: " + c.Id + " needs a yield in 1.." + HomesteadRules.MaxYield);
                Texts(o, c.Id, c.Names, c.Texts);
                cat.Crops.Add(c);
            }
            foreach (var e in List(root, "structures"))
            {
                var o = Obj(e, "structures");
                var s = new StructureDef { Id = Str(o, "id", "structures") };
                if (cat.FindStructure(s.Id) != null) throw new FormatException("homestead: duplicate structure " + s.Id);
                s.Cost = Int(o, "cost", s.Id);
                if (s.Cost < 1 || s.Cost > HomesteadRules.MaxCost) throw new FormatException("homestead: " + s.Id + " needs a cost in 1.." + HomesteadRules.MaxCost);
                Texts(o, s.Id, s.Names, s.Texts);
                cat.Structures.Add(s);
            }
            if (cat.Structures.Count > HomesteadRules.StructureSlots) throw new FormatException("homestead: more than " + HomesteadRules.StructureSlots + " structures");
            foreach (var e in List(root, "animals"))
            {
                var o = Obj(e, "animals");
                var r = new ResidentDef { Id = Str(o, "id", "animals") };
                if (cat.FindResident(r.Id) != null) throw new FormatException("homestead: duplicate animal " + r.Id);
                r.Group = Str(o, "group", r.Id);
                if (Array.IndexOf(HomesteadRules.ResidentGroups, r.Group) < 0) throw new FormatException("homestead: " + r.Id + " has unknown group " + r.Group);
                r.FoodItem = Str(o, "food", r.Id);
                r.Shelter = Str(o, "shelter", r.Id);
                if (items.Find(r.FoodItem) == null) throw new FormatException("homestead: " + r.Id + " names an unknown food");
                if (cat.FindStructure(r.Shelter) == null) throw new FormatException("homestead: " + r.Id + " names an unknown shelter " + r.Shelter);
                r.FedDays = Int(o, "fedDays", r.Id);
                r.Sanity = Int(o, "sanity", r.Id);
                r.Every = Int(o, "every", r.Id);
                r.Cap = Int(o, "cap", r.Id);
                r.Count = Int(o, "count", r.Id);
                r.Produce = o.ContainsKey("produce") ? o["produce"] as string ?? "" : "";
                if (r.FedDays < 1 || r.FedDays > HomesteadRules.MaxFedDays) throw new FormatException("homestead: " + r.Id + " needs fedDays in 1.." + HomesteadRules.MaxFedDays);
                if (r.Sanity < 0 || r.Sanity > HomesteadRules.MaxMoodSanity) throw new FormatException("homestead: " + r.Id + " needs sanity in 0.." + HomesteadRules.MaxMoodSanity);
                if (r.Count < 1 || r.Count > HomesteadRules.MaxFlock) throw new FormatException("homestead: " + r.Id + " needs count in 1.." + HomesteadRules.MaxFlock);
                if (r.Produce.Length > 0 && (items.Find(r.Produce) == null || r.Every < 1 || r.Cap < 1)) throw new FormatException("homestead: " + r.Id + " has a bad produce, every or cap");
                if (r.Produce.Length == 0 && (r.Every != 0 || r.Cap != 0)) throw new FormatException("homestead: " + r.Id + " produces nothing but has every or cap");
                Texts(o, r.Id, r.Names, r.Texts);
                cat.Residents.Add(r);
            }
            if (cat.Residents.Count > HomesteadRules.MaxResidents) throw new FormatException("homestead: more than " + HomesteadRules.MaxResidents + " animals");
            if (cat.Crops.Count == 0 || cat.Structures.Count == 0 || cat.Residents.Count == 0) throw new FormatException("homestead: crops, structures and animals must not be empty");
            return cat;
        }

        private static List<object> List(Dictionary<string, object> o, string key)
        {
            var l = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (l == null) throw new FormatException("homestead: missing " + key + " array");
            return l;
        }

        private static Dictionary<string, object> Obj(object e, string owner)
        {
            var o = e as Dictionary<string, object>;
            if (o == null) throw new FormatException("homestead: " + owner + " entry is not an object");
            return o;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("homestead: " + owner + " lacks " + key);
            return s;
        }

        private static int Int(Dictionary<string, object> o, string key, string owner)
        {
            if (!o.ContainsKey(key) || !(o[key] is double)) throw new FormatException("homestead: " + owner + " lacks number " + key);
            return (int)(double)o[key];
        }

        private static void Texts(Dictionary<string, object> o, string id, Dictionary<string, string> names, Dictionary<string, string> texts)
        {
            foreach (var lang in ItemRules.Languages)
            {
                var t = o.ContainsKey(lang) ? o[lang] as Dictionary<string, object> : null;
                if (t == null) throw new FormatException("homestead: " + id + " lacks language " + lang);
                names[lang] = Str(t, "name", id);
                texts[lang] = Str(t, "text", id);
            }
        }
    }

    /// <summary>
    /// Where the homestead stands: a yard of <see cref="HomesteadRules.BedCount"/> beds, <see cref="HomesteadRules.StructureSlots"/> structure slots and spots for the residents, in front of the
    /// lodging house (or behind it when the front is blocked). All points are kept clear of walls and solid props. The search is seeded by the layout only, so the same village always gives the same plot.
    /// </summary>
    public sealed class HomesteadPlot
    {
        public bool Exists;
        /// <summary>The plot origin and its unit axes in the world: side runs along the house wall, dir runs away from the beds toward the structures.</summary>
        public double OriginX, OriginZ, SideX, SideZ, DirX, DirZ;
        public readonly List<double[]> Beds = new List<double[]>();
        public readonly List<double[]> Slots = new List<double[]>();
        public readonly List<double[]> ResidentSpots = new List<double[]>();

        /// <summary>The world point at (a metres to the side, b metres forward) of the plot origin.</summary>
        public double[] At(double a, double b) { return new[] { OriginX + SideX * a + DirX * b, OriginZ + SideZ * a + DirZ * b }; }

        /// <summary>Finds the plot beside the lodging house. An empty plot (Exists false) when there is no lodging house or no free spot.</summary>
        public static HomesteadPlot Create(int seed, int gridW, int gridD, IList<PlacedPiece> layout, ItemWorld items)
        {
            var plot = new HomesteadPlot();
            var lodging = items == null ? null : items.Lodging;
            if (lodging == null || layout == null || lodging.HouseIndex < 0 || lodging.HouseIndex >= layout.Count) return plot;
            var house = layout[lodging.HouseIndex];
            var solids = LoreBookRules.SolidProps(LoreBookRules.AllDressing(seed, gridW, gridD, layout));
            double yaw = VillageStreets.FacingYaw(house.Facing), dirX = Math.Sin(yaw), dirZ = Math.Cos(yaw), sideX = Math.Cos(yaw), sideZ = -Math.Sin(yaw);
            double half = (house.Facing % 2 == 0 ? house.SizeZ : house.SizeX) * VillageDressing.Cell / 2;
            double cx = (house.X + house.SizeX / 2.0) * VillageDressing.Cell, cz = (house.Z + house.SizeZ / 2.0) * VillageDressing.Cell;
            foreach (int flip in HomesteadRules.PlotSides)
                foreach (double ahead in HomesteadRules.PlotAhead)
                    foreach (double lateral in HomesteadRules.PlotLateral)
                    {
                        double reach = half + (flip > 0 ? LoreBookRules.HouseBookOffset : 0.0) + ahead;
                        var cand = new HomesteadPlot
                        {
                            OriginX = cx + flip * dirX * reach + sideX * lateral, OriginZ = cz + flip * dirZ * reach + sideZ * lateral,
                            SideX = sideX, SideZ = sideZ, DirX = flip * dirX, DirZ = flip * dirZ,
                        };
                        cand.Fill();
                        if (cand.AllFree(layout, solids, seed, gridW, gridD)) { cand.Exists = true; return cand; }
                    }
            return plot;
        }

        private void Fill()
        {
            for (int row = 0; row < HomesteadRules.BedRows; row++)
                for (int col = 0; col < HomesteadRules.BedCols; col++)
                    Beds.Add(At((col - 1) * HomesteadRules.BedSpacing, row * HomesteadRules.BedSpacing));
            for (int i = 0; i < HomesteadRules.StructureSlots; i++) Slots.Add(At((i - 1.5) * HomesteadRules.SlotSpacing, HomesteadRules.SlotForward));
            for (int i = 0; i < HomesteadRules.MaxResidents; i++) ResidentSpots.Add(At((i - (HomesteadRules.MaxResidents - 1) / 2.0) * HomesteadRules.ResidentSpacing, HomesteadRules.ResidentForward));
        }

        private bool AllFree(IList<PlacedPiece> layout, List<DressingItem> solids, int seed, int gridW, int gridD)
        {
            var points = new List<double[]>(Beds);
            points.AddRange(Slots);
            points.AddRange(ResidentSpots);
            foreach (var o in CorruptionGrowth.PlotEdgeOffsets()) points.Add(At(o[0], o[1]));
            foreach (var p in points) if (LoreBookRules.IsBlocked(p[0], p[1], layout, solids, seed, gridW, gridD)) return false;
            return true;
        }
    }

    /// <summary>Which crop stands in a bed and the village day it was planted. An empty CropId means an empty bed.</summary>
    public struct BedState
    {
        public string CropId;
        public int PlantedDay;
    }

    /// <summary>An adopted animal or pet: when it was last fed and the village day its produce was last collected.</summary>
    public struct ResidentState
    {
        public string DefId;
        public int FedTick;
        public int CollectDay;
    }

    /// <summary>The result of one homestead action. <see cref="Reason"/> is empty on success, otherwise why it was refused; <see cref="Count"/> is the number of items moved.</summary>
    public struct HomesteadResult
    {
        public string Reason;
        public int Count;
        public bool Ok { get { return Reason.Length == 0; } }
    }

    /// <summary>
    /// The player's homestead: claimed once, then beds, structures and residents. Everything depends on village time (GameClock ticks and days), the corruption growth level and the
    /// player's inventory, never on frame time, so the same actions at the same ticks always give the same results. Harvest and produce go into the player's <see cref="Inventory"/>.
    /// Serialises into one short string (<see cref="Serialize"/>) for the session save.
    /// </summary>
    public sealed class Homestead
    {
        public readonly HomesteadCatalog Catalog;
        public readonly HomesteadPlot Plot;
        public bool Claimed;
        public int LastSanityDay;
        public readonly BedState[] Beds = new BedState[HomesteadRules.BedCount];
        public readonly HashSet<string> Built = new HashSet<string>();
        public readonly List<ResidentState> Residents = new List<ResidentState>();

        public Homestead(HomesteadCatalog catalog, HomesteadPlot plot)
        {
            Catalog = catalog;
            Plot = plot ?? new HomesteadPlot();
            for (int i = 0; i < Beds.Length; i++) Beds[i] = new BedState { CropId = "" };
        }

        public bool Available { get { return Catalog != null && Plot.Exists; } }

        // ---- crops ----

        /// <summary>-1 for an empty bed, 0 just planted, 1 sprouting, 2 ripe.</summary>
        public int StageOf(int bed, int tick)
        {
            if (bed < 0 || bed >= Beds.Length || Beds[bed].CropId.Length == 0) return -1;
            var crop = Catalog.FindCrop(Beds[bed].CropId);
            if (crop == null) return -1;
            int days = GameClock.DayNumber(tick) - Beds[bed].PlantedDay;
            if (days >= crop.GrowDays) return HomesteadRules.StageRipe;
            return days >= 1 ? HomesteadRules.StageSprout : HomesteadRules.StagePlanted;
        }

        /// <summary>What a ripe crop gives at a corruption growth level: eldritch crops give one more once the village is afraid, plain crops one less unless a scarecrow stands.</summary>
        public int YieldAt(CropDef crop, int level)
        {
            int y = crop.Yield;
            if (level < HomesteadRules.BlightLevel) return y;
            if (crop.Kind == "eldritch") return y + HomesteadRules.EldritchBonus;
            return Built.Contains(HomesteadRules.ScarecrowId) ? y : Math.Max(1, y - 1);
        }

        public HomesteadResult Plant(int bed, string cropId, int tick, Inventory player)
        {
            if (!Claimed || !Available) return Refuse("unclaimed");
            var crop = Catalog.FindCrop(cropId);
            if (crop == null) return Refuse("unknown");
            if (bed < 0 || bed >= Beds.Length) return Refuse("bed");
            if (Beds[bed].CropId.Length > 0) return Refuse("occupied");
            if (player.Count(crop.SeedItem) < 1) return Refuse("noseed");
            player.Remove(crop.SeedItem, 1);
            Beds[bed] = new BedState { CropId = crop.Id, PlantedDay = GameClock.DayNumber(tick) };
            return new HomesteadResult { Reason = "", Count = 1 };
        }

        /// <summary>Harvests a ripe bed: the crop and one seed back go to the player. Nothing changes when they do not both fit.</summary>
        public HomesteadResult Harvest(int bed, int tick, int level, Inventory player, ItemCatalog items)
        {
            if (!Claimed || !Available) return Refuse("unclaimed");
            if (bed < 0 || bed >= Beds.Length) return Refuse("bed");
            int stage = StageOf(bed, tick);
            if (stage < 0) return Refuse("empty");
            if (stage < HomesteadRules.StageRipe) return Refuse("growing");
            var crop = Catalog.FindCrop(Beds[bed].CropId);
            int amount = YieldAt(crop, level);
            var trial = Copy(player);
            if (trial.Add(items, crop.HarvestItem, amount) < amount || trial.Add(items, crop.SeedItem, HomesteadRules.SeedBack) < HomesteadRules.SeedBack) return Refuse("full");
            player.Add(items, crop.HarvestItem, amount);
            player.Add(items, crop.SeedItem, HomesteadRules.SeedBack);
            Beds[bed] = new BedState { CropId = "" };
            return new HomesteadResult { Reason = "", Count = amount };
        }

        // ---- claim and structures ----

        /// <summary>Claims the plot and hands over the starter bundle. Nothing changes when the bundle does not fit in the satchel.</summary>
        public HomesteadResult Claim(int tick, Inventory player, ItemCatalog items)
        {
            if (!Available) return Refuse("noplot");
            if (Claimed) return Refuse("claimed");
            var trial = Copy(player);
            foreach (var s in Catalog.Starter) if (trial.Add(items, s.Id, s.Count) < s.Count) return Refuse("full");
            foreach (var s in Catalog.Starter) player.Add(items, s.Id, s.Count);
            Claimed = true;
            LastSanityDay = GameClock.DayNumber(tick);
            return new HomesteadResult { Reason = "", Count = Catalog.Starter.Count };
        }

        public HomesteadResult Build(string structureId, Inventory player)
        {
            if (!Claimed || !Available) return Refuse("unclaimed");
            var s = Catalog.FindStructure(structureId);
            if (s == null) return Refuse("unknown");
            if (Built.Contains(s.Id)) return Refuse("built");
            if (player.Count(HomesteadRules.BuildItem) < s.Cost) return Refuse("notimber");
            player.Remove(HomesteadRules.BuildItem, s.Cost);
            Built.Add(s.Id);
            return new HomesteadResult { Reason = "", Count = s.Cost };
        }

        // ---- animals and pets ----

        public int ResidentIndexOf(string defId) { for (int i = 0; i < Residents.Count; i++) if (Residents[i].DefId == defId) return i; return -1; }
        public bool Owns(string defId) { return ResidentIndexOf(defId) >= 0; }
        public bool Sheltered(ResidentDef def) { return Built.Contains(def.Shelter); }

        /// <summary>How fed an adopted animal is, 0..100: it falls evenly over its fed days (one day longer with a trough).</summary>
        public int FedPercent(ResidentDef def, int fedTick, int tick)
        {
            int span = (def.FedDays + (Built.Contains(HomesteadRules.TroughId) ? 1 : 0)) * GameClock.MinutesPerDay;
            int elapsed = Math.Min(span, Math.Max(0, tick - fedTick));
            return 100 - elapsed * 100 / span;
        }

        /// <summary>"content", "uneasy" or "distressed" from how fed and housed it is; an unhoused animal is distressed once the village is afraid (corruption level at or above the blight level).</summary>
        public string Mood(ResidentDef def, int fedTick, int tick, int level)
        {
            int fed = FedPercent(def, fedTick, tick);
            bool housed = Sheltered(def);
            int score = (fed >= HomesteadRules.FedGood ? 1 : fed == 0 ? -1 : 0) + (housed ? 1 : -1) + (!housed && level >= HomesteadRules.BlightLevel ? -1 : 0);
            return score >= 1 ? "content" : score <= -1 ? "distressed" : "uneasy";
        }

        /// <summary>Feeds an animal its food; the first feeding adopts it. Refused while it is still nearly full.</summary>
        public HomesteadResult Feed(string defId, int tick, Inventory player)
        {
            if (!Claimed || !Available) return Refuse("unclaimed");
            var def = Catalog.FindResident(defId);
            if (def == null) return Refuse("unknown");
            int at = ResidentIndexOf(defId);
            if (at >= 0 && FedPercent(def, Residents[at].FedTick, tick) >= HomesteadRules.FedFull) return Refuse("full");
            if (player.Count(def.FoodItem) < 1) return Refuse("nofood");
            player.Remove(def.FoodItem, 1);
            if (at < 0) { Residents.Add(new ResidentState { DefId = defId, FedTick = tick, CollectDay = GameClock.DayNumber(tick) }); return new HomesteadResult { Reason = "", Count = 1 }; }
            Residents[at] = new ResidentState { DefId = defId, FedTick = tick, CollectDay = Residents[at].CollectDay };
            return new HomesteadResult { Reason = "", Count = 0 };
        }

        /// <summary>How much produce waits: one per <see cref="ResidentDef.Every"/> village days since the last collection, at most <see cref="ResidentDef.Cap"/>. Nothing while it is unhoused or starving.</summary>
        public int ProduceReady(ResidentDef def, ResidentState state, int tick)
        {
            if (def.Produce.Length == 0 || !Sheltered(def) || FedPercent(def, state.FedTick, tick) == 0) return 0;
            return Math.Min(def.Cap, Math.Max(0, GameClock.DayNumber(tick) - state.CollectDay) / def.Every);
        }

        public HomesteadResult Collect(string defId, int tick, Inventory player, ItemCatalog items)
        {
            if (!Claimed || !Available) return Refuse("unclaimed");
            var def = Catalog.FindResident(defId);
            int at = ResidentIndexOf(defId);
            if (def == null || at < 0) return Refuse("notowned");
            if (def.Produce.Length == 0) return Refuse("noproduce");
            int n = ProduceReady(def, Residents[at], tick);
            if (n < 1) return Refuse("notready");
            if (Copy(player).Add(items, def.Produce, n) < n) return Refuse("full");
            player.Add(items, def.Produce, n);
            Residents[at] = new ResidentState { DefId = defId, FedTick = Residents[at].FedTick, CollectDay = GameClock.DayNumber(tick) };
            return new HomesteadResult { Reason = "", Count = n };
        }

        /// <summary>
        /// The sanity the residents' moods give for a new village day: content ones add their sanity weight, distressed ones take it away, capped at <see cref="HomesteadRules.DailySanityCap"/> either way.
        /// Applied once per day number: a second call on the same day (or an earlier one) returns 0. Returns 0 until the plot is claimed.
        /// </summary>
        public int DailySanity(int tick, int level)
        {
            int day = GameClock.DayNumber(tick);
            if (!Claimed || day <= LastSanityDay) return 0;
            LastSanityDay = day;
            int sum = 0;
            foreach (var r in Residents)
            {
                var def = Catalog.FindResident(r.DefId);
                string mood = Mood(def, r.FedTick, tick, level);
                sum += mood == "content" ? def.Sanity : mood == "distressed" ? -def.Sanity : 0;
            }
            return Math.Max(-HomesteadRules.DailySanityCap, Math.Min(HomesteadRules.DailySanityCap, sum));
        }

        // ---- save string ----

        /// <summary>"hs1;claimed;lastSanityDay;beds;built structure ids;residents". Beds are "crop.plantedDay" or "-" joined by commas, residents "id.fedTick.collectDay" joined by commas.</summary>
        public string Serialize()
        {
            var inv = CultureInfo.InvariantCulture;
            var sb = new StringBuilder("hs1;");
            sb.Append(Claimed ? "1" : "0").Append(';').Append(LastSanityDay.ToString(inv)).Append(';');
            for (int i = 0; i < Beds.Length; i++) sb.Append(i > 0 ? "," : "").Append(Beds[i].CropId.Length == 0 ? "-" : Beds[i].CropId + "." + Beds[i].PlantedDay.ToString(inv));
            sb.Append(';');
            bool first = true;
            foreach (var s in Catalog.Structures) if (Built.Contains(s.Id)) { sb.Append(first ? "" : ".").Append(s.Id); first = false; }
            sb.Append(';');
            for (int i = 0; i < Residents.Count; i++) sb.Append(i > 0 ? "," : "").Append(Residents[i].DefId).Append('.').Append(Residents[i].FedTick.ToString(inv)).Append('.').Append(Residents[i].CollectDay.ToString(inv));
            return sb.ToString();
        }

        /// <summary>Restores a <see cref="Serialize"/> string. False (and no change) when it names an unknown crop, structure or animal, repeats one, or has a negative or oversized number.</summary>
        public bool TryRestore(string text)
        {
            if (string.IsNullOrEmpty(text) || !Available) return false;
            var parts = text.Split(';');
            int lastDay;
            if (parts.Length != 6 || parts[0] != "hs1" || (parts[1] != "0" && parts[1] != "1") || !Number(parts[2], out lastDay)) return false;
            var beds = parts[3].Split(',');
            if (beds.Length != Beds.Length) return false;
            var nextBeds = new BedState[Beds.Length];
            for (int i = 0; i < beds.Length; i++)
            {
                if (beds[i] == "-") { nextBeds[i] = new BedState { CropId = "" }; continue; }
                var bits = beds[i].Split('.');
                int day;
                if (bits.Length != 2 || Catalog.FindCrop(bits[0]) == null || !Number(bits[1], out day)) return false;
                nextBeds[i] = new BedState { CropId = bits[0], PlantedDay = day };
            }
            var built = new HashSet<string>();
            if (parts[4].Length > 0)
                foreach (var id in parts[4].Split('.')) if (Catalog.FindStructure(id) == null || !built.Add(id)) return false;
            var residents = new List<ResidentState>();
            if (parts[5].Length > 0)
                foreach (var entry in parts[5].Split(','))
                {
                    var bits = entry.Split('.');
                    int fed, collect;
                    if (bits.Length != 3 || Catalog.FindResident(bits[0]) == null || !Number(bits[1], out fed) || !Number(bits[2], out collect)) return false;
                    foreach (var r in residents) if (r.DefId == bits[0]) return false;
                    residents.Add(new ResidentState { DefId = bits[0], FedTick = fed, CollectDay = collect });
                }
            Claimed = parts[1] == "1";
            LastSanityDay = lastDay;
            Array.Copy(nextBeds, Beds, Beds.Length);
            Built.Clear(); foreach (var id in built) Built.Add(id);
            Residents.Clear(); Residents.AddRange(residents);
            return true;
        }

        private static bool Number(string s, out int n)
        {
            return int.TryParse(s, NumberStyles.None, CultureInfo.InvariantCulture, out n) && n <= HomesteadRules.MaxSavedNumber;
        }

        private static Inventory Copy(Inventory source)
        {
            var c = new Inventory(source.Capacity);
            c.Slots.AddRange(source.Slots);
            return c;
        }

        private static HomesteadResult Refuse(string reason) { return new HomesteadResult { Reason = reason, Count = 0 }; }
    }

    /// <summary>Named constants of the homestead.</summary>
    public static class HomesteadRules
    {
        public static readonly string[] CropKinds = { "normal", "eldritch" };
        public static readonly string[] ResidentGroups = { "animal", "pet" };
        public const int BedCols = 3, BedRows = 2, BedCount = BedCols * BedRows;
        public const int StructureSlots = 4;
        public const int MaxResidents = 6;
        public const int MaxFlock = 3;
        public const int MaxGrowDays = 8, MaxYield = 4, MaxCost = 6, MaxFedDays = 4, MaxMoodSanity = 3;
        public const int StagePlanted = 0, StageSprout = 1, StageRipe = 2;
        /// <summary>Corruption growth level (see <see cref="CorruptionGrowth.Level"/>) from which the village counts as afraid.</summary>
        public const int BlightLevel = 3;
        public const int EldritchBonus = 1;
        /// <summary>Seeds a harvest gives back.</summary>
        public const int SeedBack = 1;
        public const int FedGood = 50, FedFull = 90;
        public const int DailySanityCap = 6;
        /// <summary>Largest number a save string may hold (days and ticks), so a forged string cannot overflow.</summary>
        public const int MaxSavedNumber = 100000000;
        public const string BuildItem = "timber";
        public const string ScarecrowId = "scarecrow";
        public const string TroughId = "trough";
        /// <summary>Metres between beds, between structure slots and between resident spots, and how far forward the slots and the residents stand from the plot origin.</summary>
        public const double BedSpacing = 1.1, SlotSpacing = 1.5, ResidentSpacing = 1.2, SlotForward = 2.6, ResidentForward = 3.9;
        /// <summary>Plot search order: in front of the lodging house (1) then behind it (-1), how far beyond the wall, and how far along it (metres).</summary>
        public static readonly int[] PlotSides = { 1, -1 };
        public static readonly double[] PlotAhead = { 2.2, 3.4, 5.0 };
        public static readonly double[] PlotLateral = { 0.0, 4.0, -4.0, 8.0, -8.0, 12.0, -12.0 };
    }
}
