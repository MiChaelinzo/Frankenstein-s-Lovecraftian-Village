using System;
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
        public void Round37_dim_step_is_zero_at_gentle_and_under_reduced_motion_and_never_a_jump()
        {
            foreach (int brightness in new[] { 0, -20, -30, -90 })
                for (int ms = -500; ms <= 13000; ms += 100)
                {
                    Assert.Equal(0, HorrorDirector.DimStep(brightness, ms, new AmbientSettings { IntensityScale = HorrorDirector.GentleScale }));
                    Assert.Equal(0, HorrorDirector.DimStep(brightness, ms, new AmbientSettings { IntensityScale = 1500, ReducedMotion = true }));
                }
            var standard = new AmbientSettings { IntensityScale = 1000 };
            Assert.Equal(0, HorrorDirector.DimStep(0, 3000, standard));
            Assert.Equal(0, HorrorDirector.DimStep(-30, 0, standard));
            Assert.Equal(30, HorrorDirector.DimStep(-30, 3000, standard));
            Assert.Equal(HorrorDirector.MaxBrightnessStep, HorrorDirector.DimStep(-900, 3000, standard));
            Assert.Equal(0, HorrorDirector.DimStep(-30, HorrorDirector.DimRiseMs + HorrorDirector.DimHoldMs + HorrorDirector.DimFallMs, standard));
            int previous = 0;
            for (int ms = 0; ms <= 13000; ms += 50)
            {
                int now = HorrorDirector.DimStep(-30, ms, standard);
                Assert.InRange(now, 0, HorrorDirector.MaxBrightnessStep);
                Assert.True(Math.Abs(now - previous) <= 2, "no jump between 50 ms steps at " + ms);
                previous = now;
            }
        }

        [Fact]
        public void Dominant_cause_reflects_the_strongest_pressure_and_ties_pick_the_earlier()
        {
            Assert.Equal("waning_sanity", HorrorDirector.DominantCause(new DirectorInput { Tick = 300, Sanity = 100 }));
            Assert.Equal("creature_sighting", HorrorDirector.DominantCause(new DirectorInput { Tick = 300, Sanity = 1000, Encounters = 3 }));
            Assert.Equal("nightfall", HorrorDirector.DominantCause(new DirectorInput { Tick = GameClock.SessionStartTick + 200, Sanity = 1000 }));
            Assert.Equal("waning_sanity", HorrorDirector.DominantCause(new DirectorInput { Tick = 300, Sanity = 1000 }));
        }

        /// <summary>Director 2.0 scenario: the base scenario plus a tracked safe-zone abuse, a knowledge tier from knowledge and a remembered villager every few steps. Shared with the golden file.</summary>
        public static List<(int Step, AmbientBeat Beat)> BeatRun(int seed, int scale, bool reduced, List<int> abuseOut = null, List<DirectorState> statesOut = null)
        {
            var result = new List<(int, AmbientBeat)>();
            var s = HorrorDirector.Start();
            int abuse = 0, last = HorrorDirector.NoBeatYet;
            var inputs = Scenario(seed, ScenarioSteps);
            for (int i = 0; i < inputs.Length; i++)
            {
                var x = inputs[i];
                abuse = HorrorDirector.NextSafeZoneAbuse(abuse, i % 10 < 6 ? HorrorDirector.CampingTicks : 0);
                abuseOut?.Add(abuse);
                x.SafeZoneAbuse = abuse;
                x.KnowledgeTier = System.Math.Min(5, x.Knowledge / 200);
                x.RememberedVillager = i % 7 == 0 ? i % 5 + 1 : 0;
                s = HorrorDirector.Step(seed, s, x);
                statesOut?.Add(s);
                var b = HorrorDirector.PickAmbientBeat(seed, s, x, last, new AmbientSettings { IntensityScale = scale, ReducedMotion = reduced });
                if (b.Emitted) { last = x.Tick; result.Add((i, b)); }
            }
            return result;
        }

        [Fact]
        public void Safe_zone_abuse_grows_while_camping_decays_after_and_stays_bounded()
        {
            int a = 0;
            for (int i = 0; i < 200; i++) { a = HorrorDirector.NextSafeZoneAbuse(a, HorrorDirector.CampingTicks); Assert.InRange(a, 0, HorrorDirector.SafeZoneAbuseCap); }
            Assert.Equal(HorrorDirector.SafeZoneAbuseCap, a);
            Assert.Equal(HorrorDirector.SafeZoneAbuseCap - HorrorDirector.AbuseDecayPerStep, HorrorDirector.NextSafeZoneAbuse(a, HorrorDirector.CampingTicks - 1));
            for (int i = 0; i < 200; i++) a = HorrorDirector.NextSafeZoneAbuse(a, 0);
            Assert.Equal(0, a);
            Assert.Equal(0, HorrorDirector.NextSafeZoneAbuse(-50, 0));
        }

        [Fact]
        public void Abuse_adds_pressure_and_a_new_cause_but_leaves_the_old_target_untouched()
        {
            var calm = new DirectorInput { Tick = 300, Sanity = 1000 };
            var camped = calm; camped.SafeZoneAbuse = 1000;
            Assert.Equal(0, HorrorDirector.Target(calm));
            Assert.Equal(HorrorDirector.AbuseWeightPercent * 10, HorrorDirector.Target(camped));
            Assert.Equal("safe_zone_abuse", HorrorDirector.DominantCause(camped));
            Assert.True(HorrorDirector.CauseHolds("safe_zone_abuse", camped));
            Assert.False(HorrorDirector.CauseHolds("safe_zone_abuse", calm));
            Assert.False(HorrorDirector.CauseHolds("omen_passed", camped));
        }

        [Fact]
        public void Every_ambient_beat_has_a_known_cause_that_holds_and_the_gates_are_met()
        {
            int emitted = 0;
            var kinds = new HashSet<string>();
            for (int seed = 1; seed < 80; seed++)
            {
                var inputs = Scenario(seed, ScenarioSteps);
                foreach (var (step, b) in BeatRun(seed, 1000, false))
                {
                    emitted++; kinds.Add(b.Id);
                    Assert.Contains(b.Id, HorrorDirector.BeatIds);
                    Assert.Equal(HorrorDirector.BeatCause(b.Id), b.Cause);
                    Assert.Contains(b.Cause, HorrorDirector.CauseIds);
                    Assert.NotEqual("omen_passed", b.Cause);
                    if (b.Id == "npc_sighting") Assert.InRange(b.Villager, 0, 4); else Assert.Equal(-1, b.Villager);
                }
            }
            Assert.True(emitted > 50, "beats should appear often enough to test");
            Assert.True(kinds.Count >= 6, "most beat kinds should be reachable: " + string.Join(",", kinds));
        }

        [Fact]
        public void Ambient_beats_are_deterministic_and_the_seed_matters()
        {
            string Key(int seed) => string.Join("|", BeatRun(seed, 1000, false).Select(t => t.Step + t.Beat.Id));
            Assert.Equal(Key(7), Key(7));
            Assert.NotEqual(Key(7), Key(8));
        }

        [Fact]
        public void Ambient_beat_volume_and_dimming_stay_in_bounds_at_every_intensity()
        {
            foreach (int scale in new[] { 600, 1000, 1500, 99999 })
                for (int seed = 1; seed < 40; seed++)
                    foreach (var (_, b) in BeatRun(seed, scale, false))
                    {
                        Assert.InRange(b.Volume, 0, HorrorDirector.MaxCueVolume);
                        Assert.InRange(b.Brightness, -HorrorDirector.MaxBrightnessStep, 0);
                    }
        }

        [Fact]
        public void Reduced_motion_drops_props_and_dimming_but_gentle_skips_every_beat()
        {
            int propsStandard = 0, emittedReduced = 0;
            for (int seed = 1; seed < 40; seed++)
            {
                propsStandard += BeatRun(seed, 1500, false).Count(t => t.Beat.Prop);
                foreach (var (_, b) in BeatRun(seed, 1500, true)) { emittedReduced++; Assert.False(b.Prop); Assert.Equal(0, b.Brightness); }
                Assert.Empty(BeatRun(seed, HorrorDirector.GentleScale, false));
                Assert.Empty(BeatRun(seed, 0, false));
            }
            Assert.True(propsStandard > 0);
            Assert.True(emittedReduced > 0);
        }

        [Fact]
        public void Ambient_beats_respect_the_rate_limit_and_never_fall_in_the_quiet_after_an_omen()
        {
            for (int seed = 1; seed < 60; seed++)
            {
                var inputs = Scenario(seed, ScenarioSteps);
                var states = new List<DirectorState>();
                int prev = HorrorDirector.NoBeatYet;
                var beats = BeatRun(seed, 1000, false, null, states);
                foreach (var (step, b) in beats)
                {
                    if (prev != HorrorDirector.NoBeatYet) Assert.True(inputs[step].Tick - prev >= HorrorDirector.MinBeatGapTicks);
                    prev = inputs[step].Tick;
                    Assert.Equal(0, states[step].QuietLeft);
                    Assert.True(states[step].Beat == DirectorBeat.Unease || states[step].Beat == DirectorBeat.Pressure);
                }
            }
        }

        [Fact]
        public void An_ambient_beat_needs_a_cause_that_holds_a_tier_and_a_remembered_villager()
        {
            var x = new DirectorInput { Tick = GameClock.SessionStartTick + 200, Sanity = 1000 }; // night pressure only
            var pressure = new DirectorState { Intensity = 400, Beat = DirectorBeat.Pressure };
            var std = new AmbientSettings { IntensityScale = 1000 };
            bool bell = false;
            for (int seed = 0; seed < 200 && !bell; seed++) { var b = HorrorDirector.PickAmbientBeat(seed, pressure, x, HorrorDirector.NoBeatYet, std); if (b.Emitted) { Assert.Equal("distant_bell", b.Id); bell = true; } }
            Assert.True(bell, "night alone allows only the bell");
            var calm = new DirectorInput { Tick = 300, Sanity = 1000 };
            for (int seed = 0; seed < 200; seed++) Assert.False(HorrorDirector.PickAmbientBeat(seed, pressure, calm, HorrorDirector.NoBeatYet, std).Emitted);
            var omen = new DirectorState { Intensity = 700, Beat = DirectorBeat.Omen, QuietLeft = 10 };
            for (int seed = 0; seed < 200; seed++) Assert.False(HorrorDirector.PickAmbientBeat(seed, omen, x, HorrorDirector.NoBeatYet, std).Emitted);
            var sane = new DirectorInput { Tick = 300, Sanity = 0, KnowledgeTier = 0 };
            for (int seed = 0; seed < 300; seed++) { var b = HorrorDirector.PickAmbientBeat(seed, pressure, sane, HorrorDirector.NoBeatYet, std); if (b.Emitted) Assert.NotEqual("npc_sighting", b.Id); }
            sane.RememberedVillager = 3; sane.KnowledgeTier = 1;
            bool npc = false;
            for (int seed = 0; seed < 300; seed++) { var b = HorrorDirector.PickAmbientBeat(seed, pressure, sane, HorrorDirector.NoBeatYet, std); if (b.Id == "npc_sighting") { npc = true; Assert.Equal(2, b.Villager); } }
            Assert.True(npc);
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
