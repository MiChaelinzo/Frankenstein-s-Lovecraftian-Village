using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>One item from Data/items.json: what it is, how it stacks, what using it does and its texts per language.</summary>
    public sealed class ItemDef
    {
        public string Id;
        public string Kind;
        /// <summary>One of <see cref="ItemRules.Effects"/>: sanity (restores <see cref="Amount"/>), fuel (refills the lantern by <see cref="Amount"/>), ward (kept for warding) or none.</summary>
        public string Effect;
        public int Amount;
        /// <summary>Most items one slot holds.</summary>
        public int Stack;
        /// <summary>Relative chance to be found in the village.</summary>
        public int Weight;
        /// <summary>True when the first pickup counts as a vigil clue.</summary>
        public bool Clue;
        public Dictionary<string, string> Names = new Dictionary<string, string>();
        public Dictionary<string, string> Texts = new Dictionary<string, string>();
    }

    /// <summary>The parsed item data file. The same file is read by web/src/inventory.js; a drift test compares the two copies.</summary>
    public sealed class ItemCatalog
    {
        public List<ItemDef> Items = new List<ItemDef>();

        public ItemDef Find(string id)
        {
            foreach (var d in Items) if (d.Id == id) return d;
            return null;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending item when the data is malformed.</summary>
        public static ItemCatalog Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            var list = root != null && root.ContainsKey("items") ? root["items"] as List<object> : null;
            if (list == null) throw new FormatException("items: missing items array");
            var cat = new ItemCatalog();
            var seen = new HashSet<string>();
            foreach (var entry in list)
            {
                var o = entry as Dictionary<string, object>;
                if (o == null) throw new FormatException("items: entry is not an object");
                var d = new ItemDef { Id = Str(o, "id", "?") };
                if (!seen.Add(d.Id)) throw new FormatException("items: duplicate id " + d.Id);
                d.Kind = Str(o, "kind", d.Id);
                if (Array.IndexOf(ItemRules.Kinds, d.Kind) < 0) throw new FormatException("items: " + d.Id + " has unknown kind " + d.Kind);
                d.Effect = Str(o, "effect", d.Id);
                if (Array.IndexOf(ItemRules.Effects, d.Effect) < 0) throw new FormatException("items: " + d.Id + " has unknown effect " + d.Effect);
                d.Amount = Int(o, "amount", d.Id);
                d.Stack = Int(o, "stack", d.Id);
                d.Weight = Int(o, "weight", d.Id);
                if (d.Stack < 1 || d.Stack > ItemRules.MaxStack) throw new FormatException("items: " + d.Id + " has a stack outside 1.." + ItemRules.MaxStack);
                if (d.Weight < 1) throw new FormatException("items: " + d.Id + " needs a weight of at least 1");
                if ((d.Effect == "sanity" || d.Effect == "fuel") != (d.Amount > 0)) throw new FormatException("items: " + d.Id + " needs a positive amount exactly for the sanity and fuel effects");
                d.Clue = o.ContainsKey("clue") && o["clue"] is bool && (bool)o["clue"];
                foreach (var lang in ItemRules.Languages)
                {
                    var t = o.ContainsKey(lang) ? o[lang] as Dictionary<string, object> : null;
                    if (t == null) throw new FormatException("items: " + d.Id + " lacks language " + lang);
                    d.Names[lang] = Str(t, "name", d.Id);
                    d.Texts[lang] = Str(t, "text", d.Id);
                }
                cat.Items.Add(d);
            }
            return cat;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("items: " + owner + " lacks " + key);
            return s;
        }

        private static int Int(Dictionary<string, object> o, string key, string owner)
        {
            if (!o.ContainsKey(key) || !(o[key] is double)) throw new FormatException("items: " + owner + " lacks number " + key);
            return (int)(double)o[key];
        }
    }

    /// <summary>A number of one item in one slot.</summary>
    public struct ItemStack
    {
        public string Id;
        public int Count;
    }

    /// <summary>What using an item did. When <see cref="Used"/> is false <see cref="Reason"/> says why: unknown, missing, none, ward, full.</summary>
    public struct ItemUseResult
    {
        public bool Used;
        public string Reason;
        public int SanityDelta;
        public int FuelDelta;
    }

    /// <summary>
    /// A row of slots with stacking, plus the lantern fuel when it is the player's. Add fills existing stacks first, then free slots; nothing is ever lost silently:
    /// Add and Move return how many items really moved.
    /// </summary>
    public sealed class Inventory
    {
        public readonly int Capacity;
        public readonly List<ItemStack> Slots = new List<ItemStack>();
        /// <summary>Lantern fuel, 0..<see cref="ItemRules.FuelMax"/>. Only the player's inventory uses it.</summary>
        public int Fuel = ItemRules.FuelStart;

        public Inventory(int capacity) { Capacity = capacity; }

        public int Count(string id)
        {
            int n = 0;
            foreach (var s in Slots) if (s.Id == id) n += s.Count;
            return n;
        }

        /// <summary>How many more of <paramref name="id"/> fit: the room left in its stacks plus the free slots.</summary>
        public int Room(ItemCatalog cat, string id)
        {
            var d = cat.Find(id);
            if (d == null) return 0;
            int room = (Capacity - Slots.Count) * d.Stack;
            foreach (var s in Slots) if (s.Id == id) room += d.Stack - s.Count;
            return room;
        }

        /// <summary>Adds up to <paramref name="count"/> items and returns how many fit.</summary>
        public int Add(ItemCatalog cat, string id, int count)
        {
            var d = cat.Find(id);
            if (d == null || count <= 0) return 0;
            int left = count;
            for (int i = 0; i < Slots.Count && left > 0; i++)
            {
                if (Slots[i].Id != id) continue;
                int put = Math.Min(left, d.Stack - Slots[i].Count);
                if (put > 0) { Slots[i] = new ItemStack { Id = id, Count = Slots[i].Count + put }; left -= put; }
            }
            while (left > 0 && Slots.Count < Capacity)
            {
                int put = Math.Min(left, d.Stack);
                Slots.Add(new ItemStack { Id = id, Count = put });
                left -= put;
            }
            return count - left;
        }

        /// <summary>Removes up to <paramref name="count"/> items, last stacks first, and returns how many were removed.</summary>
        public int Remove(string id, int count)
        {
            int left = count;
            for (int i = Slots.Count - 1; i >= 0 && left > 0; i--)
            {
                if (Slots[i].Id != id) continue;
                int take = Math.Min(left, Slots[i].Count);
                left -= take;
                if (take == Slots[i].Count) Slots.RemoveAt(i);
                else Slots[i] = new ItemStack { Id = id, Count = Slots[i].Count - take };
            }
            return Math.Max(0, count) - Math.Max(0, left);
        }

        /// <summary>Moves up to <paramref name="count"/> items from one inventory to another and returns how many moved.</summary>
        public static int Move(ItemCatalog cat, Inventory from, Inventory to, string id, int count)
        {
            int n = Math.Min(Math.Min(count, from.Count(id)), to.Room(cat, id));
            if (n <= 0) return 0;
            int moved = to.Add(cat, id, n);
            from.Remove(id, moved);
            return moved;
        }

        /// <summary>Burns lantern fuel, never below zero.</summary>
        public void BurnFuel(int amount) { Fuel = Math.Max(0, Fuel - Math.Max(0, amount)); }

        /// <summary>
        /// Uses one item. Sanity items restore <see cref="ItemDef.Amount"/> through <paramref name="sanity"/> and are refused at full sanity; fuel items refill the lantern and are
        /// refused when it is full; ward items and items with no effect are kept. A used item is consumed.
        /// </summary>
        public ItemUseResult Use(ItemCatalog cat, string id, SanityModel sanity)
        {
            var d = cat.Find(id);
            if (d == null) return Refuse("unknown");
            if (Count(id) <= 0) return Refuse("missing");
            if (d.Effect == "ward" || d.Effect == "none") return Refuse(d.Effect);
            if (d.Effect == "sanity")
            {
                if (sanity == null || sanity.Value >= SanityModel.Max) return Refuse("full");
                float before = sanity.Value;
                sanity.Apply(d.Amount);
                Remove(id, 1);
                return new ItemUseResult { Used = true, Reason = "", SanityDelta = (int)Math.Round(sanity.Value - before) };
            }
            if (Fuel >= ItemRules.FuelMax) return Refuse("full");
            int fuelBefore = Fuel;
            Fuel = Math.Min(ItemRules.FuelMax, Fuel + d.Amount);
            Remove(id, 1);
            return new ItemUseResult { Used = true, Reason = "", FuelDelta = Fuel - fuelBefore };
        }

        private static ItemUseResult Refuse(string reason) { return new ItemUseResult { Used = false, Reason = reason }; }

        /// <summary>Slots as "id:count" joined by commas (empty for no slots).</summary>
        public string SlotsText()
        {
            var sb = new StringBuilder();
            for (int i = 0; i < Slots.Count; i++) sb.Append(i > 0 ? "," : "").Append(Slots[i].Id).Append(':').Append(Slots[i].Count.ToString(CultureInfo.InvariantCulture));
            return sb.ToString();
        }

        /// <summary>Parses <see cref="SlotsText"/>. False when an id is unknown, a count is outside 1..stack or there are more slots than <see cref="Capacity"/>; nothing changes then.</summary>
        public bool TrySetSlots(ItemCatalog cat, string text)
        {
            var parsed = new List<ItemStack>();
            if (!string.IsNullOrEmpty(text))
                foreach (var part in text.Split(','))
                {
                    var bits = part.Split(':');
                    int n;
                    if (bits.Length != 2 || !int.TryParse(bits[1], NumberStyles.None, CultureInfo.InvariantCulture, out n)) return false;
                    var d = cat.Find(bits[0]);
                    if (d == null || n < 1 || n > d.Stack) return false;
                    parsed.Add(new ItemStack { Id = d.Id, Count = n });
                }
            if (parsed.Count > Capacity) return false;
            Slots.Clear();
            Slots.AddRange(parsed);
            return true;
        }
    }

    /// <summary>An item lying on the ground in one village.</summary>
    public struct ItemSpawn
    {
        public string ItemId;
        public int Count;
        public double X;
        public double Z;
    }

    /// <summary>A chest in front of a house. The lodging chest stands by the bed, where sleeping is allowed.</summary>
    public sealed class ItemChest
    {
        public int HouseIndex;
        public bool Lodging;
        public double X;
        public double Z;
        public Inventory Contents = new Inventory(ItemRules.ChestSlots);
    }

    /// <summary>
    /// Engine-free item rules. A village holds <see cref="ItemRules.GroundCount"/> items on the street fronts, one lodging chest and up to <see cref="ItemRules.FoundChests"/> found chests, all
    /// seeded: the same seed, grid, layout and item data always give the same items and chests. Keys, letters and trinkets (stack 1) occur once per village. The player's changes
    /// (picked up items, chest contents) live in this object and round-trip through <see cref="Serialize"/> and <see cref="TryRestore"/>.
    /// </summary>
    public sealed class ItemWorld
    {
        public readonly List<ItemSpawn> Ground = new List<ItemSpawn>();
        public readonly List<ItemChest> Chests = new List<ItemChest>();
        public readonly HashSet<int> Picked = new HashSet<int>();

        public ItemChest Lodging
        {
            get { foreach (var c in Chests) if (c.Lodging) return c; return null; }
        }

        /// <summary>Places the items and chests of one village; an empty world when there are no buildings or no data.</summary>
        public static ItemWorld Create(int seed, int gridW, int gridD, IList<PlacedPiece> layout, ItemCatalog cat)
        {
            var world = new ItemWorld();
            if (cat == null || cat.Items.Count == 0 || layout == null || gridW <= 0 || gridD <= 0) return world;
            var solids = LoreBookRules.SolidProps(LoreBookRules.AllDressing(seed, gridW, gridD, layout));
            var order = new List<int>();
            for (int i = 0; i < layout.Count; i++) if (VillageStreets.IsBuilding(layout[i].SizeX, layout[i].SizeZ)) order.Add(i);
            if (order.Count == 0) return world;
            var rng = new SeededRandom(seed ^ ItemRules.SpawnSalt);
            for (int i = order.Count - 1; i > 0; i--) { int j = rng.Next(i + 1); int tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
            int lodgingAt = 0;
            for (int i = 0; i < order.Count; i++) if (layout[order[i]].Id.StartsWith("house", StringComparison.Ordinal)) { lodgingAt = i; break; }
            int lodgingHouse = order[lodgingAt];
            order.RemoveAt(lodgingAt);
            order.Insert(0, lodgingHouse);
            var taken = new List<double[]>();
            var usedUnique = new HashSet<string>();
            for (int k = 0; k < order.Count && world.Chests.Count < 1 + ItemRules.FoundChests; k++)
            {
                var spot = FreeSpot(order[k], layout, ItemRules.ChestLateral, solids, taken, seed, gridW, gridD);
                if (spot == null) continue;
                var chest = new ItemChest { HouseIndex = order[k], Lodging = k == 0, X = spot[0], Z = spot[1] };
                if (chest.Lodging) foreach (var id in ItemRules.LodgingStock) chest.Contents.Add(cat, id, 1);
                else for (int n = 0; n < ItemRules.FoundChestStacks; n++) { var s = PickItem(rng, cat, usedUnique); if (s.ItemId != null) chest.Contents.Add(cat, s.ItemId, s.Count); }
                taken.Add(spot);
                world.Chests.Add(chest);
            }
            int start = Math.Min(order.Count - 1, 1 + ItemRules.FoundChests);
            for (int n = 0; n < ItemRules.GroundCount; n++)
            {
                var s = PickItem(rng, cat, usedUnique);
                double[] spot = null;
                for (int t = 0; t < order.Count && spot == null; t++)
                    spot = FreeSpot(order[(start + n + t) % order.Count], layout, ItemRules.ItemLateral, solids, taken, seed, gridW, gridD);
                if (spot == null) break;
                taken.Add(spot);
                s.X = spot[0]; s.Z = spot[1];
                world.Ground.Add(s);
            }
            return world;
        }

        private static double[] FreeSpot(int house, IList<PlacedPiece> layout, double[] laterals, List<DressingItem> solids, List<double[]> taken, int seed, int gridW, int gridD)
        {
            foreach (var c in LoreBookRules.FrontSpots(layout[house], laterals))
            {
                if (LoreBookRules.IsBlocked(c[0], c[1], layout, solids, seed, gridW, gridD)) continue;
                bool crowded = false;
                foreach (var t in taken) if (Math.Abs(t[0] - c[0]) < ItemRules.Spacing && Math.Abs(t[1] - c[1]) < ItemRules.Spacing) { crowded = true; break; }
                if (!crowded) return c;
            }
            return null;
        }

        /// <summary>One weighted item; unique items (stack 1) are never picked twice for one village. Draws one number for the item and one for the count.</summary>
        private static ItemSpawn PickItem(SeededRandom rng, ItemCatalog cat, HashSet<string> usedUnique)
        {
            int total = 0;
            foreach (var d in cat.Items) if (d.Stack > 1 || !usedUnique.Contains(d.Id)) total += d.Weight;
            if (total <= 0) return new ItemSpawn();
            int r = rng.Next(total);
            foreach (var d in cat.Items)
            {
                if (d.Stack == 1 && usedUnique.Contains(d.Id)) continue;
                if (r < d.Weight)
                {
                    if (d.Stack == 1) usedUnique.Add(d.Id);
                    int count = d.Stack == 1 ? 1 : 1 + rng.Next(ItemRules.MaxFoundCount);
                    return new ItemSpawn { ItemId = d.Id, Count = Math.Min(count, d.Stack) };
                }
                r -= d.Weight;
            }
            return new ItemSpawn();
        }

        /// <summary>Picks up a ground item whole. Returns the number picked up: 0 when it is gone, unknown or does not fit in the player's slots (nothing changes then).</summary>
        public int PickUp(int index, Inventory player, ItemCatalog cat)
        {
            if (index < 0 || index >= Ground.Count || Picked.Contains(index)) return 0;
            var s = Ground[index];
            if (player.Room(cat, s.ItemId) < s.Count) return 0;
            int added = player.Add(cat, s.ItemId, s.Count);
            Picked.Add(index);
            return added;
        }

        /// <summary>Whether sleeping is allowed now: at dusk or at night.</summary>
        public static bool CanSleep(int tick)
        {
            var phase = GameClock.PhaseAt(tick);
            return phase == DayPhase.Dusk || phase == DayPhase.Night;
        }

        /// <summary>Clock minutes from <paramref name="tick"/> to the next dawn.</summary>
        public static int MinutesToMorning(int tick)
        {
            return GameClock.MinutesPerDay - GameClock.Wrap(tick);
        }

        /// <summary>The state as one string: "inv1;fuel;player slots;picked indices;chest slots separated by /". Parsed again by <see cref="TryRestore"/>.</summary>
        public string Serialize(Inventory player)
        {
            var picked = new List<int>(Picked);
            picked.Sort();
            var sb = new StringBuilder("inv1;");
            sb.Append(player.Fuel.ToString(CultureInfo.InvariantCulture)).Append(';').Append(player.SlotsText()).Append(';');
            for (int i = 0; i < picked.Count; i++) sb.Append(i > 0 ? "." : "").Append(picked[i].ToString(CultureInfo.InvariantCulture));
            sb.Append(';');
            for (int i = 0; i < Chests.Count; i++) sb.Append(i > 0 ? "/" : "").Append(Chests[i].Contents.SlotsText());
            return sb.ToString();
        }

        /// <summary>Restores a <see cref="Serialize"/> string for this village. False (and no change) when it does not fit this village's items and chests.</summary>
        public bool TryRestore(string text, Inventory player, ItemCatalog cat)
        {
            if (string.IsNullOrEmpty(text)) return false;
            var parts = text.Split(';');
            int fuel;
            if (parts.Length != 5 || parts[0] != "inv1" || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out fuel) || fuel > ItemRules.FuelMax) return false;
            var chestParts = parts[4].Split('/');
            if (chestParts.Length != Math.Max(1, Chests.Count) || (Chests.Count == 0 && parts[4].Length > 0)) return false;
            var picked = new HashSet<int>();
            if (parts[3].Length > 0)
                foreach (var p in parts[3].Split('.'))
                {
                    int idx;
                    if (!int.TryParse(p, NumberStyles.None, CultureInfo.InvariantCulture, out idx) || idx >= Ground.Count || !picked.Add(idx)) return false;
                }
            var nextPlayer = new Inventory(player.Capacity);
            if (!nextPlayer.TrySetSlots(cat, parts[2])) return false;
            var chestSlots = new List<Inventory>();
            for (int i = 0; i < Chests.Count; i++)
            {
                var c = new Inventory(Chests[i].Contents.Capacity);
                if (!c.TrySetSlots(cat, chestParts[i])) return false;
                chestSlots.Add(c);
            }
            player.Fuel = fuel;
            player.Slots.Clear(); player.Slots.AddRange(nextPlayer.Slots);
            Picked.Clear(); foreach (var i in picked) Picked.Add(i);
            for (int i = 0; i < Chests.Count; i++) { Chests[i].Contents.Slots.Clear(); Chests[i].Contents.Slots.AddRange(chestSlots[i].Slots); }
            return true;
        }
    }

    /// <summary>Named constants of the item system.</summary>
    public static class ItemRules
    {
        public static readonly string[] Kinds = { "supply", "food", "tea", "ward", "key", "letter", "trinket", "seed" };
        public static readonly string[] Effects = { "sanity", "fuel", "ward", "none" };
        public static readonly string[] Languages = { "en", "fr" };
        public const int MaxStack = 99;
        public const int PlayerSlots = 12;
        public const int ChestSlots = 8;
        public const int FuelMax = 100;
        public const int FuelStart = 60;
        /// <summary>Lantern fuel burnt by lighting one candle.</summary>
        public const int CandleFuelCost = 5;
        /// <summary>Sanity regained by a night's sleep in the lodging bed.</summary>
        public const int SleepSanityRestore = 10;
        public const int SpawnSalt = 0x17E45;
        public const int GroundCount = 10;
        public const int FoundChests = 3;
        public const int FoundChestStacks = 3;
        /// <summary>A found stack holds 1 to this many items.</summary>
        public const int MaxFoundCount = 2;
        /// <summary>Metres between two items or chests on the street fronts.</summary>
        public const double Spacing = 0.9;
        /// <summary>Metres along the wall from the middle of a house front: items and chests sit between the lore books (0, +/-1.5).</summary>
        public static readonly double[] ItemLateral = { 0.75, -0.75, 2.25, -2.25 };
        public static readonly double[] ChestLateral = { 0.75, -0.75, 2.25, -2.25 };
        /// <summary>What the lodging chest always holds: a welcome for travellers.</summary>
        public static readonly string[] LodgingStock = { "bread", "tea", "lantern_oil" };
        public const string ClueIdPrefix = "item@";
    }
}
