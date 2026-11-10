using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class StoryProperties
    {
        private static Campaign Random(SeededRandom r, out int nights)
        {
            nights = 1 + r.Next(9);
            return CampaignGenerator.Generate(r.Next(2000000) - 1000000, nights);
        }

        private static string Flat(System.Collections.Generic.List<StoryBeat> beats) =>
            string.Join("\n", beats.Select(b => $"{b.Index}|{b.NightNumber}|{b.Kind}|{b.Text}|{b.DreadPercent}|{b.DurationMs}"));

        [Fact]
        public void Same_campaign_gives_identical_story()
        {
            Property.ForAll((r, seed) =>
            {
                var c = Random(r, out _);
                Assert.Equal(Flat(StorySequencer.Build(c)), Flat(StorySequencer.Build(c)));
            });
        }

        [Fact]
        public void Beats_are_ordered_contiguous_and_each_night_starts_with_one_title()
        {
            Property.ForAll((r, seed) =>
            {
                var c = Random(r, out int nights);
                var beats = StorySequencer.Build(c);
                Assert.Equal(nights * 5, beats.Count);
                for (int i = 0; i < beats.Count; i++) Assert.Equal(i, beats[i].Index);
                for (int n = 1; n <= nights; n++)
                {
                    var mine = beats.Where(b => b.NightNumber == n).ToList();
                    Assert.Equal(new[] { "title", "rumor", "lore", "omen", "weather" }, mine.Select(b => b.Kind).ToArray());
                    Assert.Equal(1, mine.Count(b => b.Kind == "title"));
                    Assert.Equal((n - 1) * 5, mine[0].Index);
                    Assert.Equal((n - 1) * 5, StorySequencer.NightStart(beats, n));
                }
                Assert.Equal(0, StorySequencer.NightStart(beats, -3));
                Assert.Equal((nights - 1) * 5, StorySequencer.NightStart(beats, 99));
            });
        }

        [Fact]
        public void Dread_never_decreases_text_is_plain_and_durations_are_bounded()
        {
            Property.ForAll((r, seed) =>
            {
                var beats = StorySequencer.Build(Random(r, out _));
                int prev = 0;
                foreach (var b in beats)
                {
                    Assert.True(b.DreadPercent >= prev);
                    prev = b.DreadPercent;
                    Assert.False(string.IsNullOrWhiteSpace(b.Text));
                    Assert.DoesNotContain('\u2014', b.Text);
                    Assert.InRange(b.DurationMs, StorySequencer.MinDurationMs, StorySequencer.MaxDurationMs);
                    Assert.Equal(StorySequencer.BeatDurationMs(b.Text.Length), b.DurationMs);
                }
            });
        }

        [Fact]
        public void Omen_text_comes_from_the_dread_tier_of_its_night()
        {
            Property.ForAll((r, seed) =>
            {
                foreach (var b in StorySequencer.Build(Random(r, out _)).Where(x => x.Kind == "omen"))
                    Assert.Contains(b.Text, StorySequencer.Omens[StorySequencer.TierForPercent(b.DreadPercent)]);
            });
        }

        [Fact]
        public void Navigation_clamps_and_next_previous_are_inverse_inside_range()
        {
            Property.ForAll((r, seed) =>
            {
                int count = 1 + r.Next(60);
                Assert.Equal(0, StorySequencer.Clamp(-5, count));
                Assert.Equal(count - 1, StorySequencer.Clamp(count + 50, count));
                Assert.Equal(0, StorySequencer.Clamp(7, 0));
                Assert.Equal(count - 1, StorySequencer.Next(count - 1, count));
                Assert.Equal(0, StorySequencer.Previous(0, count));
                for (int i = 0; i < count - 1; i++) Assert.Equal(i, StorySequencer.Previous(StorySequencer.Next(i, count), count));
                for (int i = 1; i < count; i++) Assert.Equal(i, StorySequencer.Next(StorySequencer.Previous(i, count), count));
            });
        }

        [Fact]
        public void Duration_formula_is_monotonic_with_min_and_max()
        {
            Assert.Equal(StorySequencer.MinDurationMs, StorySequencer.BeatDurationMs(0));
            Assert.Equal(StorySequencer.MinDurationMs, StorySequencer.BeatDurationMs(-10));
            Assert.Equal(StorySequencer.MaxDurationMs, StorySequencer.BeatDurationMs(100000));
            int prev = 0;
            for (int len = 0; len < 400; len++)
            {
                int d = StorySequencer.BeatDurationMs(len);
                Assert.True(d >= prev);
                prev = d;
            }
        }

        [Fact]
        public void Null_campaign_gives_empty_story()
        {
            Assert.Empty(StorySequencer.Build(null));
        }
    }
}
