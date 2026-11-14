using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Weather is a pure function of (seed, day): deterministic, varied, persistent across days, and lightning only comes with storms.</summary>
    public class WeatherTests
    {
        [Fact]
        public void Same_seed_and_day_give_the_same_weather_and_every_name_is_known()
        {
            for (int seed = -50; seed < 50; seed += 7)
                for (int day = -10; day < 60; day++)
                {
                    string w = GameClock.WeatherForDay(seed, day);
                    Assert.Equal(w, GameClock.WeatherForDay(seed, day));
                    Assert.Contains(w, GameClock.WeatherNames);
                    Assert.Equal(GameClock.WeatherNames[GameClock.WeatherIndexForDay(seed, day)], w);
                }
        }

        [Fact]
        public void Every_condition_occurs_over_a_long_run_and_spells_sometimes_repeat()
        {
            var seen = new HashSet<string>();
            int repeats = 0, days = 400;
            for (int day = 0; day < days; day++)
            {
                seen.Add(GameClock.WeatherForDay(1818, day));
                if (day > 0 && GameClock.WeatherForDay(1818, day) == GameClock.WeatherForDay(1818, day - 1)) repeats++;
            }
            Assert.Equal(GameClock.WeatherNames.Length, seen.Count);
            Assert.True(repeats > days / 8, "weather should persist across days more often than chance alone");
        }

        [Fact]
        public void Lightning_is_storm_only_and_precipitation_rises_with_the_sky()
        {
            Assert.Equal(new[] { "storm" }, GameClock.WeatherNames.Where(GameClock.HasLightning).ToArray());
            Assert.Equal(0, GameClock.PrecipitationPercent("clear"));
            Assert.True(GameClock.PrecipitationPercent("drizzle") < GameClock.PrecipitationPercent("rain"));
            Assert.True(GameClock.PrecipitationPercent("rain") < GameClock.PrecipitationPercent("storm"));
            Assert.Equal(0, GameClock.PrecipitationPercent("nonsense"));
        }

        [Fact]
        public void Story_has_a_phrase_for_every_weather()
        {
            Assert.Equal(GameClock.WeatherNames.Length, StorySequencer.WeatherPhrases.Length);
        }
    }
}
