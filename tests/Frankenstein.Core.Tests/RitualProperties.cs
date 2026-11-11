using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class RitualProperties
    {
        private static Ritual Make(SeededRandom r, int n) => RitualChain.Generate(CampaignGenerator.Generate(r.Next(2000000) - 1000000, n));

        [Fact]
        public void Same_seed_gives_identical_ritual()
        {
            Property.ForAll((r, seed) =>
            {
                int s = r.Next(1000000) - 500000, n = 1 + r.Next(9);
                var a = RitualChain.Generate(CampaignGenerator.Generate(s, n));
                var b = RitualChain.Generate(CampaignGenerator.Generate(s, n));
                Assert.Equal(a.Name, b.Name);
                Assert.Equal(a.Stages.Select(RitualChain.Describe), b.Stages.Select(RitualChain.Describe));
            });
        }

        [Fact]
        public void Stages_and_thresholds_rise_monotonically_within_bounds()
        {
            Property.ForAll((r, seed) =>
            {
                int n = 1 + r.Next(9);
                var camp = CampaignGenerator.Generate(r.Next(2000000) - 1000000, n);
                var ritual = RitualChain.Generate(camp);
                Assert.Equal(n, ritual.Stages.Count);
                int prevT = 0, prevName = -1;
                for (int i = 0; i < n; i++)
                {
                    var st = ritual.Stages[i];
                    Assert.Equal(i, st.Index);
                    Assert.Equal(i + 1, st.NightNumber);
                    Assert.InRange(st.DreadThresholdPercent, 1, 100);
                    Assert.True(st.DreadThresholdPercent > prevT);
                    Assert.True(st.DreadThresholdPercent <= camp.Nights[i].DreadTargetPercent);
                    int nameIdx = System.Array.IndexOf(RitualChain.StageNames, st.Name);
                    Assert.True(nameIdx >= 0);
                    if (n > 1) Assert.True(nameIdx > prevName, "stage names advance");
                    prevT = st.DreadThresholdPercent;
                    prevName = nameIdx;
                }
            });
        }

        [Fact]
        public void Stages_link_to_the_nights_omen_beat()
        {
            Property.ForAll((r, seed) =>
            {
                var camp = CampaignGenerator.Generate(r.Next(2000000) - 1000000, 1 + r.Next(9));
                var beats = StorySequencer.Build(camp);
                foreach (var st in RitualChain.Generate(camp).Stages)
                {
                    Assert.Equal("omen", beats[st.BeatIndex].Kind);
                    Assert.Equal(st.NightNumber, beats[st.BeatIndex].NightNumber);
                    var parts = st.OmenId.Split('.');
                    Assert.Equal(beats[st.BeatIndex].Text, StorySequencer.Omens[int.Parse(parts[0])][int.Parse(parts[1])]);
                    Assert.DoesNotContain('\u2014', st.Name + st.Sigil);
                }
            });
        }

        [Fact]
        public void StageForDread_is_monotonic_and_handles_null()
        {
            Assert.Equal(-1, RitualChain.StageForDread(null, 50));
            Assert.Empty(RitualChain.Generate(null).Stages);
            var ritual = RitualChain.Generate(CampaignGenerator.Generate(1818, 5));
            int prev = -1;
            for (int d = 0; d <= 100; d++)
            {
                int s = RitualChain.StageForDread(ritual, d);
                Assert.True(s >= prev);
                prev = s;
            }
            Assert.Equal(4, prev);
        }

        [Fact]
        public void Progress_effective_is_max_and_night_sets_a_floor()
        {
            Property.ForAll((r, seed) =>
            {
                int n = 1 + r.Next(9);
                var ritual = RitualChain.Generate(CampaignGenerator.Generate(r.Next(2000000) - 1000000, n));
                int night = r.Next(n + 3), dread = r.Next(101);
                var p = RitualChain.Progress(ritual, night, dread);
                Assert.Equal(System.Math.Max(p.Scheduled, p.DreadReached), p.Effective);
                Assert.True(p.Effective >= p.Scheduled);
                Assert.InRange(p.Effective, -1, n - 1);
                Assert.Equal(p.DreadReached < p.Scheduled ? "behind" : p.DreadReached > p.Scheduled ? "ahead" : "on", p.Pace);
                var more = RitualChain.Progress(ritual, night, System.Math.Min(100, dread + 1 + r.Next(20)));
                Assert.True(more.Effective >= p.Effective, "effective stage is monotonic in dread");
                Assert.True(RitualChain.Progress(ritual, night + 1, dread).Effective >= p.Effective, "and in night");
            });
        }

        [Fact]
        public void Night_four_at_sanity_eighty_reports_both_stages()
        {
            var ritual = RitualChain.Generate(CampaignGenerator.Generate(1818, 5));
            var p = RitualChain.Progress(ritual, 4, 20); // sanity 80 means 20% dread
            Assert.Equal(3, p.Scheduled);
            Assert.True(p.DreadReached < 3);
            Assert.Equal(3, p.Effective);
            Assert.Equal("behind", p.Pace);
            Assert.Equal(-1, RitualChain.ScheduledStageForNight(null, 2));
            Assert.Equal(-1, RitualChain.ScheduledStageForNight(ritual, 0));
            Assert.Equal(4, RitualChain.ScheduledStageForNight(ritual, 99));
        }

        [Fact]
        public void Ritual_story_and_campaign_stay_consistent()
        {
            Property.ForAll((r, seed) =>
            {
                int n = 1 + r.Next(9);
                var camp = CampaignGenerator.Generate(r.Next(2000000) - 1000000, n);
                var ritual = RitualChain.Generate(camp);
                var beats = StorySequencer.Build(camp);
                int prev = 0;
                for (int i = 0; i < n; i++)
                {
                    var st = ritual.Stages[i];
                    var night = camp.Nights[i];
                    var beat = beats[st.BeatIndex];
                    Assert.Equal("omen", beat.Kind);
                    Assert.Equal(night.Number, beat.NightNumber);
                    var parts = st.OmenId.Split('.');
                    Assert.Equal(StorySequencer.TierForPercent(night.DreadTargetPercent), int.Parse(parts[0]));
                    Assert.Equal(beat.Text, StorySequencer.Omens[int.Parse(parts[0])][int.Parse(parts[1])]);
                    Assert.True(st.DreadThresholdPercent <= night.DreadTargetPercent);
                    Assert.True(st.DreadThresholdPercent > prev);
                    prev = st.DreadThresholdPercent;
                    Assert.Equal(i, RitualChain.ScheduledStageForNight(ritual, night.Number));
                    // at the night's own target dread the dread-reached stage is at least this stage
                    Assert.True(RitualChain.StageForDread(ritual, night.DreadTargetPercent) >= i);
                }
            });
        }

        [Fact]
        public void SaveState_round_trips_and_clamps()
        {
            Property.ForAll((r, seed) =>
            {
                int n = 1 + r.Next(9);
                var ritual = RitualChain.Generate(CampaignGenerator.Generate(r.Next(2000000) - 1000000, n));
                var saved = RitualSaveState.From(ritual, r.Next(n + 3), r.Next(101));
                var back = RitualSaveState.Parse(saved.Serialize());
                Assert.NotNull(back);
                Assert.Equal(saved.Serialize(), back.Serialize());
                var wild = new RitualSaveState { Seed = 5, NightNumber = r.Next(2000) - 1000, Stage = r.Next(2000) - 1000 }.Clamped(n);
                Assert.InRange(wild.NightNumber, 1, n);
                Assert.InRange(wild.Stage, -1, n - 1);
            });
            Assert.Null(RitualSaveState.Parse(null));
            Assert.Null(RitualSaveState.Parse("ritual1;1;2"));
            Assert.Null(RitualSaveState.Parse("ritual2;1;2;3"));
            Assert.Null(RitualSaveState.Parse("ritual1;a;2;3"));
            var none = new RitualSaveState { NightNumber = 7, Stage = 4 }.Clamped(0);
            Assert.Equal(1, none.NightNumber);
            Assert.Equal(-1, none.Stage);
        }
    }
}
