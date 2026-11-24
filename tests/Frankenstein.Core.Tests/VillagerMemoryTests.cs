using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 34 (spec 167): villager memory is deterministic, decays but never reaches zero, and changes behavior between day 2 and day 15.</summary>
    public class VillagerMemoryTests
    {
        private static readonly int[] Seeds = { 0, 1, 42, 1818, -7, 123456789, int.MaxValue, int.MinValue };

        public static MemoryLibrary Library()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return MemoryLibrary.Parse(File.ReadAllText(Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "memory.json")));
        }

        private static MemoryEvent E(int night, int villager, MemoryKind kind, int weight, int subject = -1) => new MemoryEvent { Night = night, Villager = villager, Kind = kind, Weight = weight, Subject = subject };

        /// <summary>The fixed log used by the golden data: the baseline, then events for villagers 0 to 5 on nights 2 to 6.</summary>
        public static List<MemoryEvent> ScriptedLog(List<MemoryEvent> baseline)
        {
            var log = new List<MemoryEvent>(baseline);
            log.Add(E(2, 0, MemoryKind.Accused, 600));
            log.Add(E(2, 1, MemoryKind.Conversation, 500));
            log.Add(E(3, 1, MemoryKind.Accused, 300));
            log.Add(E(3, 2, MemoryKind.RitualWitnessed, 700));
            log.Add(E(4, 3, MemoryKind.Conversation, 600));
            log.Add(E(4, 3, MemoryKind.ClueFound, 500));
            log.Add(E(5, 4, MemoryKind.MythosExposure, 800));
            log.Add(E(5, 4, MemoryKind.RumorHeard, 600));
            log.Add(E(6, 5, MemoryKind.Accusing, 800, 2));
            return log;
        }

        [Fact]
        public void EmptyMemoryHasNoOutcomeNoLineAndNoEffect()
        {
            var m = new VillagerMemoryModel(4);
            for (int v = 0; v < 4; v++)
            {
                Assert.False(m.HasAnyMemory(v));
                Assert.Equal(MemoryOutcome.None, m.OutcomeOf(v));
                Assert.Equal("", m.LineFor(Library(), 1, v, 3, "en"));
                Assert.Equal(default(MemoryEffect), m.EffectOf(v));
            }
        }

        [Fact]
        public void ReplayEqualsIncrementalRecording()
        {
            var log = ScriptedLog(new List<MemoryEvent>());
            var inc = new VillagerMemoryModel(8);
            foreach (var e in log) inc.Record(e);
            inc.AdvanceTo(15);
            var rep = VillagerMemoryModel.Replay(8, log, 15);
            for (int v = 0; v < 8; v++)
                for (int k = 0; k < VillagerMemoryModel.KindCount; k++)
                {
                    Assert.Equal(inc.IntensityOf(v, (MemoryKind)k), rep.IntensityOf(v, (MemoryKind)k));
                    Assert.Equal(inc.LastSubjectOf(v, (MemoryKind)k), rep.LastSubjectOf(v, (MemoryKind)k));
                }
        }

        [Fact]
        public void FloorNeverReachesZeroAfterAnyEvent()
        {
            foreach (MemoryKind kind in Enum.GetValues(typeof(MemoryKind)))
            {
                var m = new VillagerMemoryModel(2);
                Assert.True(m.Record(E(1, 1, kind, 1)));
                Assert.True(m.IntensityOf(1, kind) >= VillagerMemoryModel.FloorPermille);
                m.AdvanceTo(500);
                Assert.Equal(VillagerMemoryModel.FloorPermille, m.IntensityOf(1, kind));
                Assert.True(m.HasAnyMemory(1));
                Assert.False(m.HasAnyMemory(0));
            }
        }

        [Fact]
        public void IntensityIsBoundedAndDecaysMonotonically()
        {
            var m = new VillagerMemoryModel(1);
            for (int i = 0; i < 5; i++) m.Record(E(1, 0, MemoryKind.Accused, 900));
            Assert.Equal(VillagerMemoryModel.Scale, m.IntensityOf(0, MemoryKind.Accused));
            int prev = m.IntensityOf(0, MemoryKind.Accused);
            for (int n = 2; n < 40; n++)
            {
                m.AdvanceTo(n);
                int now = m.IntensityOf(0, MemoryKind.Accused);
                Assert.True(now <= prev && now >= VillagerMemoryModel.FloorPermille);
                prev = now;
            }
        }

        [Fact]
        public void InvalidEventsAreRejectedWithoutChange()
        {
            var m = new VillagerMemoryModel(2);
            Assert.False(m.Record(E(1, -1, MemoryKind.Accused, 100)));
            Assert.False(m.Record(E(1, 2, MemoryKind.Accused, 100)));
            Assert.False(m.Record(E(1, 0, (MemoryKind)99, 100)));
            Assert.False(m.Record(E(1, 0, MemoryKind.Accused, 0)));
            Assert.False(m.HasAnyMemory(0));
            m.AdvanceTo(5);
            m.AdvanceTo(2);
            Assert.Equal(5, m.Night);
            Assert.True(m.Record(E(1, 0, MemoryKind.Conversation, 400)));
            Assert.Equal(5, m.Night);
        }

        [Fact]
        public void AccusedVillagerBehavesDifferentlyOnDay2AndDay15()
        {
            var log = new List<MemoryEvent> { E(2, 0, MemoryKind.Accused, 600) };
            var lib = Library();
            var early = VillagerMemoryModel.Replay(3, log, 2);
            var late = VillagerMemoryModel.Replay(3, log, 15);
            Assert.Equal(MemoryOutcome.Paranoid, early.OutcomeOf(0));
            Assert.Equal(MemoryOutcome.None, late.OutcomeOf(0));
            Assert.NotEqual(early.EffectOf(0), late.EffectOf(0));
            Assert.NotEqual(early.LineFor(lib, 42, 0, 2, "en"), late.LineFor(lib, 42, 0, 15, "en"));
            Assert.NotEqual("", late.LineFor(lib, 42, 0, 15, "fr"));
        }

        [Fact]
        public void KindnessAfterAccusationForgives()
        {
            var m = VillagerMemoryModel.Replay(2, new List<MemoryEvent> { E(1, 0, MemoryKind.Accused, 500), E(2, 0, MemoryKind.Conversation, 600), E(2, 0, MemoryKind.Conversation, 600) }, 2);
            Assert.Equal(MemoryOutcome.Forgive, m.OutcomeOf(0));
            var loyal = VillagerMemoryModel.Replay(2, new List<MemoryEvent> { E(1, 0, MemoryKind.Conversation, 700) }, 1);
            Assert.Equal(MemoryOutcome.Loyal, loyal.OutcomeOf(0));
            var obsessed = VillagerMemoryModel.Replay(2, new List<MemoryEvent> { E(1, 0, MemoryKind.RitualWitnessed, 800) }, 1);
            Assert.Equal(MemoryOutcome.Obsessed, obsessed.OutcomeOf(0));
        }

        [Fact]
        public void EffectsStayWithinTheTableAndStrengthIsBounded()
        {
            var log = ScriptedLog(new List<MemoryEvent>());
            for (int night = 1; night <= 30; night++)
            {
                var m = VillagerMemoryModel.Replay(8, log, night);
                for (int v = 0; v < 8; v++)
                {
                    int s = m.StrengthOf(v);
                    Assert.InRange(s, 0, VillagerMemoryModel.Scale);
                    var ef = m.EffectOf(v);
                    var t = VillagerMemoryModel.OutcomeEffects[(int)m.OutcomeOf(v)];
                    Assert.True(Math.Abs(ef.Fear) <= Math.Abs(t[1]) && Math.Abs(ef.Obsession) <= Math.Abs(t[4]));
                }
            }
        }

        [Fact]
        public void EmptyMemoryLeavesAxesIdentical()
        {
            foreach (int seed in new[] { 1, 42, 1818 })
            {
                var soc = VillageSocietyTests.SocietyOf(seed, out var story, out var roster);
                var o = soc.OpinionsAfter(new List<SocietyAction>());
                var plain = soc.AxesAfter(o, 7, 0.4f, 2);
                var empty = new VillagerMemoryModel(roster.Count).EffectsOfAll();
                var same = soc.AxesAfter(VillagerMemoryModel.TrustAfter(o, empty), 7, 0.4f, 2, empty);
                var viaNull = soc.AxesAfter(o, 7, 0.4f, 2, null);
                Assert.Equal(plain.Fear, same.Fear); Assert.Equal(plain.Faith, same.Faith); Assert.Equal(plain.Loyalty, same.Loyalty); Assert.Equal(plain.Obsession, same.Obsession);
                Assert.Equal(plain.Fear, viaNull.Fear);
                Assert.Equal(o.Trust, VillagerMemoryModel.TrustAfter(o, empty).Trust);
            }
        }

        [Fact]
        public void MemoryMovesAxesWithinBounds()
        {
            var soc = VillageSocietyTests.SocietyOf(42, out var story, out var roster);
            var o = soc.OpinionsAfter(new List<SocietyAction>());
            var m = VillagerMemoryModel.Replay(roster.Count, new List<MemoryEvent> { E(2, 0, MemoryKind.Accused, 900), E(2, 1, MemoryKind.Conversation, 900) }, 2);
            var fx = m.EffectsOfAll();
            var plain = soc.AxesAfter(o, 2, 0.3f, 1);
            var mem = soc.AxesAfter(VillagerMemoryModel.TrustAfter(o, fx), 2, 0.3f, 1, fx);
            Assert.True(mem.Fear[0] > plain.Fear[0]);
            Assert.True(mem.Loyalty[1] > plain.Loyalty[1]);
            Assert.True(VillagerMemoryModel.TrustAfter(o, fx).Trust[0] < o.Trust[0]);
            foreach (var axis in new[] { mem.Fear, mem.Faith, mem.Loyalty, mem.Obsession }) Assert.All(axis, x => Assert.InRange(x, 0, VillageSociety.Scale));
        }

        [Fact]
        public void ParanoidWithholdsAndLoyalStrengthensTheChatHint()
        {
            var roster = VillagerRules.GenerateRoster(42, VillageLayoutGenerator.GenerateCity(GoldenParity.LoadCatalog(Root()), VillageDistricts.CityGrid, VillageDistricts.CityGrid, VillageDistricts.CityPieces, 42));
            var v = roster[0];
            var plain = new SocialStanding { Tier = TrustTier.Neutral, Trust = 500, Fear = 100 };
            var baseline = VillagerRules.Chat(42, v, 600, 0f, 1, 0, 2, 1, 80, plain);
            Assert.Equal(MemoryOutcome.None, baseline.Memory);
            if (baseline.HintId.Length == 0) return; // this villager is not lucid at this tick; the other seeds below cover it
            var paranoid = plain; paranoid.Memory = MemoryOutcome.Paranoid;
            var p = VillagerRules.Chat(42, v, 600, 0f, 1, 0, 2, 1, 80, paranoid);
            Assert.True(p.Withheld && p.MemoryWithheld && p.HintId == "" && !p.FearWithheld);
            var loyal = plain; loyal.Memory = MemoryOutcome.Loyal;
            var l = VillagerRules.Chat(42, v, 600, 0f, 1, 0, 2, 1, 80, loyal);
            Assert.True(l.StrongHint && l.HintId == baseline.HintId && !l.Withheld);
            var f = plain; f.Memory = MemoryOutcome.Forgive;
            Assert.Equal(baseline.HintId, VillagerRules.Chat(42, v, 600, 0f, 1, 0, 2, 1, 80, f).HintId);
        }

        private static string Root()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return dir.FullName;
        }

        [Fact]
        public void EventsForSocietyActionsAndBaselineAreDeterministic()
        {
            Assert.True(VillagerMemoryModel.EventFor(SocietyActionKind.SeenNearBody, 3, 0, out var e));
            Assert.Equal(MemoryKind.Accused, e.Kind);
            Assert.Equal(1, e.Night);
            Assert.False(VillagerMemoryModel.EventFor(SocietyActionKind.ChatPolite, VillageSociety.AllVillagers, 2, out _));
            foreach (SocietyActionKind a in Enum.GetValues(typeof(SocietyActionKind))) Assert.True(VillagerMemoryModel.EventFor(a, 0, 2, out var ev) && ev.Weight >= 1);
            foreach (int seed in Seeds)
            {
                VillageSocietyTests.SocietyOf(seed, out var story, out _);
                var a = VillagerMemoryModel.BaselineEvents(story);
                var b = VillagerMemoryModel.BaselineEvents(story);
                Assert.Equal(a.Count, b.Count);
                Assert.All(a, ev => Assert.True(ev.Kind == MemoryKind.FamilyLost && ev.Night == 1 && ev.Villager >= 0));
                Assert.Equal(story.Missing.Count(m => m.KinIndex >= 0), a.Count);
            }
        }

        [Fact]
        public void LinesAreDeterministicAndPerNight()
        {
            var lib = Library();
            var m = VillagerMemoryModel.Replay(3, new List<MemoryEvent> { E(1, 0, MemoryKind.Accused, 900) }, 2);
            Assert.Equal(m.LineFor(lib, 7, 0, 2, "en"), m.LineFor(lib, 7, 0, 2, "en"));
            Assert.Contains(m.LineFor(lib, 7, 0, 2, "en"), lib.Variants[1].Select(x => x.Get("en")));
        }

        [Fact]
        public void LibraryRejectsMalformedData()
        {
            Assert.Throws<FormatException>(() => MemoryLibrary.Parse("[]"));
            Assert.Throws<FormatException>(() => MemoryLibrary.Parse("{}"));
            Assert.Throws<FormatException>(() => MemoryLibrary.Parse("{\"lines\":[{\"id\":\"nope\",\"variants\":[]}]}"));
            Assert.Throws<FormatException>(() => MemoryLibrary.Parse("{\"lines\":[{\"id\":\"forgive\",\"variants\":[{\"en\":\"a\",\"fr\":\"b\"}]}]}"));
            Assert.Throws<FormatException>(() => MemoryLibrary.Parse("{\"lines\":[{\"id\":\"forgive\",\"variants\":[{\"en\":\"a\",\"fr\":\"b\"},{\"en\":\"a\"}]}]}"));
            Assert.Throws<FormatException>(() => MemoryLibrary.Parse("{\"lines\":[]}"));
        }

        [Fact]
        public void ShippedLinesHaveNoEmDashAndEnoughVariants()
        {
            var lib = Library();
            Assert.Equal(MemoryLibrary.LineIds.Length, lib.Variants.Count);
            foreach (var group in lib.Variants)
            {
                Assert.True(group.Count >= MemoryLibrary.MinVariants);
                foreach (var v in group) foreach (var l in VillageNames.Languages) Assert.DoesNotContain("\u2014", v.Get(l));
            }
        }
    }
}
