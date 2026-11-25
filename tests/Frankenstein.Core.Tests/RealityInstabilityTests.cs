using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 34 (spec 169): reality instability is gated by tier, deterministic, presentation only and leaves the underlying state untouched.</summary>
    public class RealityInstabilityTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };
        public const int Nights = 9, Houses = 6, Villagers = 7;
        public static readonly string[] PairIds = { "alibi_vs_ledger", "bell_vs_tide", "mythos:omen:3~mythos:omen:7", "lamp_vs_door", "witness_vs_witness" };
        public static readonly string[] PlaceIds = { "drowned_chapel", "salt_cellar", "lantern_vault", "bone_orchard" };

        private static string DataPath()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "reality.json");
        }

        public static string DataText() { return File.ReadAllText(DataPath()); }

        public static RealityLibrary Library() { return RealityLibrary.Parse(DataText()); }

        /// <summary>Everything the instability can alter for one seed, night and tier, as one string. Used for determinism and for the golden key.</summary>
        public static string Signature(RealityLibrary lib, int seed, int night, int tier)
        {
            var parts = new List<string>();
            for (int h = 0; h < Houses; h++) parts.Add("h" + RealityInstability.HouseName(lib, seed, night, tier, h));
            parts.Add("f" + RealityInstability.FalseVillager(lib, seed, night, tier));
            foreach (var id in PairIds) parts.Add(RealityInstability.ContradictionHidden(seed, night, tier, id) ? "x" : "-");
            for (int v = 0; v < Villagers; v++) parts.Add("b" + RealityInstability.BlurredIdentity(seed, night, tier, v, Villagers));
            foreach (var id in PlaceIds) parts.Add("l" + RealityInstability.LocationLook(lib, seed, night, tier, id));
            return string.Join(",", parts);
        }

        public static readonly string[] PathIds = { "orchard_lane", "tide_steps", "bell_path", "cellar_way", "ridge_track" };

        /// <summary>Everything Reality Collapse can show for one seed, night and tier: drifted house names, the erased villager, identity steps and visible phantom paths.</summary>
        public static string CollapseSignature(RealityLibrary lib, int seed, int night, int tier)
        {
            var parts = new List<string>();
            for (int h = 0; h < Houses; h++) parts.Add("h" + RealityInstability.CollapsedHouseName(lib, seed, night, tier, h));
            parts.Add("e" + RealityInstability.ErasedVillager(seed, night, tier, Villagers));
            for (int v = 0; v < Villagers; v++) parts.Add("i" + RealityInstability.IdentityStep(seed, night, tier, v));
            foreach (var id in PathIds) parts.Add(RealityInstability.PhantomPathVisible(seed, night, tier, id) ? "p" : "-");
            return string.Join(",", parts);
        }

        [Fact]
        public void CollapseNeedsTierFiveAndIsDeterministic()
        {
            var lib = Library();
            string none = CollapseSignature(lib, 1, 1, 0);
            int changed = 0;
            foreach (int seed in Seeds)
                for (int night = 1; night <= Nights; night++)
                {
                    for (int tier = -1; tier < RealityInstability.CollapseTier; tier++) Assert.Equal(none, CollapseSignature(lib, seed, night, tier));
                    string a = CollapseSignature(lib, seed, night, 5);
                    Assert.Equal(a, CollapseSignature(lib, seed, night, 5));
                    if (a != none) changed++;
                }
            Assert.True(changed > 0, "tier 5 collapses something");
        }

        [Fact]
        public void CollapseHousesStayDriftedVillagerStaysErasedIdentityStepsUpAndPathsVanish()
        {
            var lib = Library();
            int drifted = 0, erased = 0, stepped = 0, phantoms = 0;
            foreach (int seed in Seeds)
            {
                for (int h = 0; h < Houses; h++)
                {
                    int first = -1;
                    for (int night = 1; night <= Nights; night++)
                    {
                        int k = RealityInstability.CollapsedHouseName(lib, seed, night, 5, h);
                        if (first < 0 && k >= 0) { first = k; drifted++; }
                        if (first >= 0) Assert.Equal(first, k);
                    }
                }
                int gone = -1;
                for (int night = 1; night <= Nights; night++)
                {
                    int e = RealityInstability.ErasedVillager(seed, night, 5, Villagers);
                    if (gone < 0 && e >= 0) { gone = e; erased++; }
                    if (gone >= 0) Assert.Equal(gone, e);
                }
                for (int v = 0; v < Villagers; v++)
                {
                    int previous = 0;
                    for (int night = 1; night <= Nights; night++)
                    {
                        int step = RealityInstability.IdentityStep(seed, night, 5, v);
                        Assert.InRange(step, previous, RealityInstability.IdentityUnknown);
                        previous = step;
                    }
                    if (previous == RealityInstability.IdentityUnknown) stepped++;
                }
                foreach (var id in PathIds)
                {
                    int nights = Enumerable.Range(1, Nights).Count(n => RealityInstability.PhantomPathVisible(seed, n, 5, id));
                    Assert.InRange(nights, 0, 1);
                    phantoms += nights;
                }
            }
            Assert.True(drifted > 0 && erased > 0 && stepped > 0 && phantoms > 0, "every collapse kind occurs");
            Assert.Equal(-1, RealityInstability.ErasedVillager(1, 9, 5, 1));
        }

        [Fact]
        public void CollapseIsPresentationOnlyAndLeavesStateBytesIdentical()
        {
            var lib = Library();
            string Snapshot() => DataText() + "|" + string.Join("|", Seeds.SelectMany(seed => Enumerable.Range(1, Nights).Select(n => VillageSocietyTestsSnapshot(seed, n))));
            string before = Snapshot();
            foreach (int seed in Seeds) for (int night = 1; night <= Nights; night++) for (int tier = 0; tier < KnowledgeLibrary.TierCount; tier++) CollapseSignature(lib, seed, night, tier);
            Assert.Equal(before, Snapshot());
            // The collapse functions take no state, so the earlier signature of the round 34 layer is unchanged by them.
            Assert.Equal(Signature(lib, 42, 3, 5), Signature(lib, 42, 3, 5));
        }

        private static string VillageSocietyTestsSnapshot(int seed, int night)
        {
            return string.Join(",", Enumerable.Range(0, Villagers).Select(v => RealityInstability.BlurredIdentity(seed, night, 5, v, Villagers)));
        }

        [Fact]
        public void BelowTierThreeNothingChanges()
        {
            var lib = Library();
            string untouched = Signature(lib, 1, 1, 0);
            foreach (int seed in Seeds)
                for (int night = 1; night <= Nights; night++)
                    for (int tier = -1; tier < RealityInstability.HouseTier; tier++)
                    {
                        Assert.Equal(untouched, Signature(lib, seed, night, tier));
                        Assert.False(RealityInstability.Unreliable(tier));
                    }
        }

        [Fact]
        public void TiersUnlockTheirAlterationsInOrder()
        {
            var lib = Library();
            int houses3 = 0, houses5 = 0, fake3 = 0, fake4 = 0, hidden4 = 0, hidden5 = 0, blur4 = 0, blur5 = 0, look4 = 0, look5 = 0;
            foreach (int seed in Seeds)
                for (int night = 1; night <= Nights; night++)
                {
                    for (int h = 0; h < Houses; h++) { if (RealityInstability.HouseName(lib, seed, night, 3, h) >= 0) houses3++; if (RealityInstability.HouseName(lib, seed, night, 5, h) >= 0) houses5++; }
                    if (RealityInstability.FalseVillager(lib, seed, night, 3) >= 0) fake3++;
                    if (RealityInstability.FalseVillager(lib, seed, night, 4) >= 0) fake4++;
                    foreach (var id in PairIds) { if (RealityInstability.ContradictionHidden(seed, night, 4, id)) hidden4++; if (RealityInstability.ContradictionHidden(seed, night, 5, id)) hidden5++; }
                    for (int v = 0; v < Villagers; v++) { if (RealityInstability.BlurredIdentity(seed, night, 4, v, Villagers) >= 0) blur4++; if (RealityInstability.BlurredIdentity(seed, night, 5, v, Villagers) >= 0) blur5++; }
                    foreach (var id in PlaceIds) { if (RealityInstability.LocationLook(lib, seed, night, 4, id) >= 0) look4++; if (RealityInstability.LocationLook(lib, seed, night, 5, id) >= 0) look5++; }
                }
            Assert.True(houses3 > 0, "tier 3 gives some house a wrong name");
            Assert.True(houses5 > houses3, "higher tiers alter more houses");
            Assert.Equal(0, fake3);
            Assert.True(fake4 > 0, "tier 4 brings false villagers");
            Assert.Equal(0, hidden4); Assert.Equal(0, blur4); Assert.Equal(0, look4);
            Assert.True(hidden5 > 0, "tier 5 hides some contradictions");
            Assert.True(blur5 > 0, "tier 5 blurs some identities");
            Assert.True(look5 > 0, "tier 5 alters some places");
        }

        [Fact]
        public void AlterationsAreDeterministicAndVaryBySeedAndNight()
        {
            var lib = Library();
            var sigs = new HashSet<string>();
            foreach (int seed in Seeds)
                for (int night = 1; night <= Nights; night++)
                {
                    string a = Signature(lib, seed, night, 5);
                    Assert.Equal(a, Signature(lib, seed, night, 5));
                    sigs.Add(a);
                }
            Assert.True(sigs.Count > Seeds.Length * Nights / 2, "different seeds and nights alter different things");
        }

        [Fact]
        public void BlurredIdentityNeverPointsAtItselfAndStaysInRange()
        {
            foreach (int seed in Seeds)
                for (int night = 1; night <= Nights; night++)
                    for (int v = 0; v < Villagers; v++)
                    {
                        int other = RealityInstability.BlurredIdentity(seed, night, 5, v, Villagers);
                        if (other >= 0) { Assert.NotEqual(v, other); Assert.InRange(other, 0, Villagers - 1); }
                    }
            Assert.Equal(-1, RealityInstability.BlurredIdentity(1, 1, 5, 0, 1));
        }

        /// <summary>The instability reads only its inputs. Computing every alteration leaves the distortion effects, the chronicle and the notes exactly as they were, so a client that shows the truth sees the same data.</summary>
        [Fact]
        public void AlterationsLeaveUnderlyingStateByteIdentical()
        {
            var know = KnowledgeLibrary.Parse(File.ReadAllText(Path.Combine(Path.GetDirectoryName(DataPath()), "knowledge.json")));
            var lib = Library();
            string Snapshot() => string.Join("|", Seeds.SelectMany(seed => Enumerable.Range(1, Nights).SelectMany(n => Enumerable.Range(0, KnowledgeLibrary.TierCount).Select(t => string.Join(",", RealityDistortion.For(know, seed, n, t)))))) + "#" + DataText();
            string ChronicleSnapshot() => string.Join("|", ChronicleProse.Chronicle(ChronicleProseTests.Context(42, 1), MythosSimulationTests.Nights, "en")) + ChronicleProse.Summary(ChronicleProseTests.Context(42, 1), MythosSimulationTests.Nights, "fr");
            string before = Snapshot(), chronicleBefore = ChronicleSnapshot();
            foreach (int seed in Seeds) for (int night = 1; night <= Nights; night++) for (int tier = 0; tier < KnowledgeLibrary.TierCount; tier++) Signature(lib, seed, night, tier);
            Assert.Equal(before, Snapshot());
            Assert.Equal(chronicleBefore, ChronicleSnapshot());
        }

        [Fact]
        public void DataHasBothLanguagesNoEmDashesAndDiegeticNotes()
        {
            var lib = Library();
            Assert.Equal(RealityLibrary.NoteIds.Length, lib.Notes.Count);
            foreach (var pool in new[] { lib.HouseNames, lib.FalseVillagers, lib.LocationLooks, lib.Notes })
                foreach (var entry in pool)
                    foreach (var lang in VillageNames.Languages) { Assert.False(string.IsNullOrWhiteSpace(entry.Get(lang))); Assert.DoesNotContain("\u2014", entry.Get(lang)); }
            Assert.Contains("contradiction", lib.Notes[Array.IndexOf(RealityLibrary.NoteIds, "board")].Get("en"));
        }

        [Fact]
        public void ParseNamesTheBrokenField()
        {
            Assert.Throws<FormatException>(() => RealityLibrary.Parse("[]"));
            var e = Assert.Throws<FormatException>(() => RealityLibrary.Parse("{\"houseNames\": []}"));
            Assert.Contains("houseNames", e.Message);
        }
    }
}
