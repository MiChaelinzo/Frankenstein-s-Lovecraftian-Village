using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class CampaignProperties
    {
        [Fact]
        public void Same_seed_gives_identical_campaign()
        {
            Property.ForAll((r, seed) =>
            {
                int s = r.Next(1000000) - 500000, n = 1 + r.Next(9);
                var a = CampaignGenerator.Generate(s, n);
                var b = CampaignGenerator.Generate(s, n);
                Assert.Equal(a.VillageName, b.VillageName);
                Assert.Equal(a.Nights.Select(x => $"{x.Title}|{x.DreadTargetPercent}|{x.Rumor}|{x.Lore}|{x.Weather}"),
                             b.Nights.Select(x => $"{x.Title}|{x.DreadTargetPercent}|{x.Rumor}|{x.Lore}|{x.Weather}"));
            });
        }

        [Fact]
        public void Dread_targets_strictly_rise_and_stay_in_range()
        {
            Property.ForAll((r, seed) =>
            {
                int n = 1 + r.Next(9);
                var c = CampaignGenerator.Generate(r.Next(2000000) - 1000000, n);
                Assert.Equal(n, c.Nights.Count);
                int prev = 0;
                foreach (var night in c.Nights)
                {
                    Assert.InRange(night.DreadTargetPercent, 1, 100);
                    Assert.True(night.DreadTargetPercent > prev, "dread must rise each night");
                    Assert.Equal(100 - night.DreadTargetPercent, night.SanityStart);
                    prev = night.DreadTargetPercent;
                }
            });
        }

        [Fact]
        public void Titles_are_unique_and_text_is_present_and_plain()
        {
            Property.ForAll((r, seed) =>
            {
                var c = CampaignGenerator.Generate(r.Next(2000000) - 1000000, 9);
                Assert.Equal(c.Nights.Count, c.Nights.Select(x => x.Title).Distinct().Count());
                Assert.False(string.IsNullOrWhiteSpace(c.VillageName));
                for (int i = 0; i < c.Nights.Count; i++)
                {
                    var night = c.Nights[i];
                    Assert.Equal(i + 1, night.Number);
                    Assert.False(string.IsNullOrWhiteSpace(night.Rumor));
                    Assert.False(string.IsNullOrWhiteSpace(night.Lore));
                    Assert.DoesNotContain('\u2014', night.Rumor + night.Lore + night.Title);
                    Assert.Contains(night.Weather, new[] { "clear", "rain", "fog" });
                    Assert.Contains(night.Sky, new[] { "dusk", "night", "witching" });
                }
            });
        }

        [Fact]
        public void Night_count_is_clamped_and_extreme_seeds_work()
        {
            Assert.Single(CampaignGenerator.Generate(1, -5).Nights);
            Assert.Equal(9, CampaignGenerator.Generate(1, 500).Nights.Count);
            foreach (var s in new[] { int.MinValue, int.MaxValue, 0 })
                Assert.Equal(5, CampaignGenerator.Generate(s).Nights.Count);
        }

        [Fact]
        public void Different_seeds_usually_give_different_villages()
        {
            var names = Enumerable.Range(1, 200).Select(s => CampaignGenerator.Generate(s).VillageName).Distinct().Count();
            Assert.True(names > 20);
        }
    }
}
