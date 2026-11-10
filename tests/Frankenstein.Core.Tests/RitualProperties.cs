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
    }
}
