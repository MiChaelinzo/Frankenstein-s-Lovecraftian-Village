using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Horror Director (spec 161): ordered beats, bounded intensity, no spikes, quiet after an Omen, a cause for every non-quiet beat.</summary>
    public class HorrorDirectorTests
    {
        public const int ScenarioSteps = 160;

        /// <summary>A repeatable ten-minutes-per-step scenario: sanity erodes, stress and cult exposure wander, safe time comes in bursts. Shared with the golden file.</summary>
        public static DirectorInput[] Scenario(int seed, int steps)
        {
            var rng = new SeededRandom(seed ^ 0x161);
            var list = new DirectorInput[steps];
            for (int i = 0; i < steps; i++)
            {
                int fall = i * 1000 / steps;
                list[i] = new DirectorInput
                {
                    Tick = GameClock.SessionStartTick + i * 10,
                    Sanity = 1000 - fall - rng.Next(150),
                    Knowledge = fall / 2 + rng.Next(300),
                    Stress = rng.Next(700) + fall / 4,
                    SafeZoneTicks = rng.Next(4) == 0 ? rng.Next(150) : 0,
                    ClueProgress = rng.Next(600),
                    CultExposure = fall / 2 + rng.Next(500),
                    Encounters = rng.Next(5) == 0 ? rng.Next(5) : 0,
                };
            }
            return list;
        }

        public static List<DirectorState> Run(int seed, DirectorInput[] inputs)
        {
            var states = new List<DirectorState>();
            var s = HorrorDirector.Start();
            foreach (var x in inputs) { s = HorrorDirector.Step(seed, s, x); states.Add(s); }
            return states;
        }

        [Fact]
        public void Intensity_is_bounded_and_never_jumps_more_than_the_cap_over_many_seeds()
        {
            for (int seed = -40; seed < 200; seed++)
            {
                int prev = 0;
                foreach (var s in Run(seed, Scenario(seed, ScenarioSteps)))
                {
                    Assert.InRange(s.Intensity, 0, HorrorDirector.MaxIntensity);
                    Assert.True(System.Math.Abs(s.Intensity - prev) <= HorrorDirector.MaxStep, $"seed {seed}: step {prev} -> {s.Intensity}");
                    prev = s.Intensity;
                }
            }
        }

        [Fact]
        public void Worst_case_input_ramps_up_by_the_cap_and_is_quiet_when_calm()
        {
            var worst = new DirectorInput { Tick = 1190, Sanity = 0, Knowledge = 1000, Stress = 1000, CultExposure = 1000, Encounters = 9 };
            var s = HorrorDirector.Step(1, HorrorDirector.Start(), worst);
            Assert.Equal(HorrorDirector.MaxStep, s.Intensity);
            var calm = new DirectorInput { Tick = 300, Sanity = 1000, SafeZoneTicks = 500, ClueProgress = 1000 };
            Assert.Equal(0, HorrorDirector.Target(calm));
            Assert.Equal(DirectorBeat.Quiet, HorrorDirector.Step(1, HorrorDirector.Start(), calm).Beat);
            Assert.Equal(0, HorrorDirector.Target(new DirectorInput { Tick = 300 - GameClock.MinutesPerDay, Sanity = 5000, Stress = -9, Encounters = -2 }));
        }

        [Fact]
        public void Beats_follow_intensity_in_order_and_an_omen_is_followed_by_relief_then_quiet()
        {
            int omens = 0;
            for (int seed = 1; seed < 120; seed++)
            {
                var states = Run(seed, Scenario(seed, ScenarioSteps));
                for (int i = 0; i < states.Count; i++)
                {
                    var s = states[i];
                    if (s.Beat == DirectorBeat.Omen)
                    {
                        omens++;
                        Assert.True(s.Intensity >= HorrorDirector.OmenAt);
                        for (int k = 1; k <= HorrorDirector.QuietAfterOmen && i + k < states.Count; k++)
                            Assert.Equal(k == 1 ? DirectorBeat.Relief : DirectorBeat.Quiet, states[i + k].Beat);
                    }
                    else if (s.Beat == DirectorBeat.Pressure) Assert.InRange(s.Intensity, HorrorDirector.PressureAt, HorrorDirector.MaxIntensity);
                    else if (s.Beat == DirectorBeat.Unease) Assert.InRange(s.Intensity, HorrorDirector.UneaseAt, HorrorDirector.PressureAt - 1);
                }
            }
            Assert.True(omens > 10, "the scenario should reach omens often enough to test the quiet stretch");
        }

        [Fact]
        public void Every_non_quiet_beat_names_a_known_cause_and_quiet_names_none()
        {
            for (int seed = 1; seed < 60; seed++)
                foreach (var s in Run(seed, Scenario(seed, ScenarioSteps)))
                {
                    if (s.Beat == DirectorBeat.Quiet) Assert.Equal("", s.Cause);
                    else Assert.Contains(s.Cause, HorrorDirector.CauseIds);
                }
        }

        [Fact]
        public void Same_seed_and_input_give_the_same_run_and_the_seed_matters()
        {
            var a = Run(7, Scenario(7, ScenarioSteps)).Select(s => s.Intensity + ":" + s.Beat + ":" + s.Cause);
            Assert.Equal(a, Run(7, Scenario(7, ScenarioSteps)).Select(s => s.Intensity + ":" + s.Beat + ":" + s.Cause));
            var beats = new HashSet<string>();
            for (int seed = 1; seed < 30; seed++) beats.Add(string.Join("", Run(seed, Scenario(7, ScenarioSteps)).Select(s => (int)s.Beat)));
            Assert.True(beats.Count > 1, "the omen roll depends on the seed");
        }

        [Fact]
        public void Dominant_cause_reflects_the_strongest_pressure_and_ties_pick_the_earlier()
        {
            Assert.Equal("waning_sanity", HorrorDirector.DominantCause(new DirectorInput { Tick = 300, Sanity = 100 }));
            Assert.Equal("creature_sighting", HorrorDirector.DominantCause(new DirectorInput { Tick = 300, Sanity = 1000, Encounters = 3 }));
            Assert.Equal("nightfall", HorrorDirector.DominantCause(new DirectorInput { Tick = GameClock.SessionStartTick + 200, Sanity = 1000 }));
            Assert.Equal("waning_sanity", HorrorDirector.DominantCause(new DirectorInput { Tick = 300, Sanity = 1000 }));
        }

        [Fact]
        public void Dread_curve_maps_intensity_to_a_unit_level()
        {
            Assert.Equal(0f, DreadCurve.FromIntensity(-5));
            Assert.Equal(0.5f, DreadCurve.FromIntensity(500));
            Assert.Equal(1f, DreadCurve.FromIntensity(5000));
        }
    }
}
