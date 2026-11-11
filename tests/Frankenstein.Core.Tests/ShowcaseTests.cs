using System;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Fly-through path and web share link rules. Cross-language parity lives in GoldenParity ("flythrough", "shareLinks").</summary>
    public class ShowcaseTests
    {
        private static readonly double[] Beats = { 3000, 4000, 2500 };

        [Fact]
        public void Timeline_picks_beats_and_ends_after_the_tail()
        {
            Assert.Equal(0, FlythroughPath.Frame(2999, Beats).Beat);
            Assert.Equal(1, FlythroughPath.Frame(3000, Beats).Beat);
            Assert.Equal(2, FlythroughPath.Frame(7000, Beats).Beat);
            Assert.Equal(9500 + FlythroughPath.TailMs, FlythroughPath.TotalMs(Beats));
            Assert.False(FlythroughPath.Frame(9500, Beats).Done);
            Assert.True(FlythroughPath.Frame(9500 + FlythroughPath.TailMs, Beats).Done);
            Assert.True(FlythroughPath.Frame(5, new double[0]).Done);
        }

        [Fact]
        public void Camera_is_deterministic_finite_and_still_when_reduced()
        {
            for (int seed = -3; seed <= 3; seed++)
                for (double t = -5; t < 12000; t += 437)
                {
                    var a = FlythroughPath.Camera(t, Beats, 24, 24, seed);
                    var b = FlythroughPath.Camera(t, Beats, 24, 24, seed);
                    Assert.Equal(a, b);
                    foreach (var v in new[] { a.X, a.Y, a.Z, a.Yaw, a.Pitch }) Assert.False(double.IsNaN(v) || double.IsInfinity(v));
                    Assert.True(a.Y > 4.6);
                    Assert.Equal(FlythroughPath.Camera(0, Beats, 24, 24, seed, true), FlythroughPath.Camera(t, Beats, 24, 24, seed, true));
                }
        }

        [Fact]
        public void Different_seeds_open_on_different_bearings()
        {
            Assert.NotEqual(FlythroughPath.Camera(0, Beats, 24, 24, 1), FlythroughPath.Camera(0, Beats, 24, 24, 2));
        }

        [Fact]
        public void Share_link_omits_defaults_and_writes_night_one_based()
        {
            Assert.Equal("#seed=1818&sanity=100&night=1", WebShareLink.Hash(new WebShareOptions { Seed = 1818, Sanity = 100, Night = 0, Theme = "auto", Cam = "third" }));
            Assert.Equal("#seed=-7&sanity=55&night=3&theme=bricks&cam=top&floor=1",
                WebShareLink.Hash(new WebShareOptions { Seed = -7, Sanity = 55, Night = 2, Theme = "bricks", Cam = "top", Floor = 1 }));
        }

        [Fact]
        public void Share_link_clamps_drops_invalid_values_and_appends_flags()
        {
            Assert.Equal("#seed=1&sanity=100&night=9&floor=8&view=3d&cinematic=1&lang=fr",
                WebShareLink.Hash(new WebShareOptions { Seed = 1, Sanity = 999, Night = 99, Floor = 50, Theme = "Bad Theme", Cam = "zzz", View3d = true, Cinematic = true, Lang = "fr" }));
            Assert.Equal("#seed=1&sanity=0&night=1&story=1&beat=3&meshes=1&intro=0&tour=1",
                WebShareLink.Hash(new WebShareOptions { Seed = 1, Sanity = -4, Night = -2, Story = true, Beat = 3, Meshes = true, SkipIntro = true, Tour = true, Lang = "en" }));
            Assert.Equal("./#seed=1&sanity=1&night=1", WebShareLink.Link("", new WebShareOptions { Seed = 1, Sanity = 1 }));
        }
    }
}
