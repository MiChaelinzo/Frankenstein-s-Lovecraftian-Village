using System;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class InteractionProperties
    {
        [Fact]
        public void Range_accepts_exactly_finite_distances_from_zero_to_range()
        {
            Property.ForAll((r, seed) =>
            {
                float d = r.Next(41) * 0.25f;
                Assert.Equal(d <= InteractionRules.Range, InteractionRules.InRange(d));
                Assert.False(InteractionRules.InRange(-d - 0.001f));
            });
            Assert.True(InteractionRules.InRange(0f));
            Assert.True(InteractionRules.InRange(InteractionRules.Range));
            Assert.False(InteractionRules.InRange(float.NaN));
            Assert.False(InteractionRules.InRange(float.PositiveInfinity));
        }

        [Fact]
        public void Cooldown_is_ready_only_after_the_interval_and_never_on_a_backwards_clock()
        {
            Property.ForAll((r, seed) =>
            {
                float last = r.Next(400) * 0.25f;
                float gap = r.Next(9) * 0.25f;
                bool ready = InteractionRules.CooldownElapsed(last + gap, last);
                Assert.Equal(gap >= InteractionRules.Cooldown, ready);
                Assert.False(InteractionRules.CooldownElapsed(last - 1f, last));
            });
            Assert.True(InteractionRules.CooldownElapsed(0f, float.NaN));
            Assert.True(InteractionRules.CooldownElapsed(0f, float.NegativeInfinity));
            Assert.False(InteractionRules.CooldownElapsed(float.NaN, 0f));
        }

        [Fact]
        public void Sanity_delta_matches_the_shared_sanity_constants()
        {
            Assert.Equal(0f, InteractionRules.SanityDelta(InteractionKind.Door));
            Assert.Equal(-SanityModel.WhisperCost, InteractionRules.SanityDelta(InteractionKind.Whisper));
            Assert.Equal(-SanityModel.FocusCost, InteractionRules.SanityDelta(InteractionKind.Landmark));
            Assert.Equal(SanityModel.CandleRestore, InteractionRules.SanityDelta(InteractionKind.Candle));
        }

        [Fact]
        public void Every_catalog_category_maps_to_a_kind_and_unknown_categories_whisper()
        {
            Assert.Equal(InteractionKind.Door, InteractionRules.KindForCategory("House"));
            Assert.Equal(InteractionKind.Landmark, InteractionRules.KindForCategory("Landmark"));
            Assert.Equal(InteractionKind.Whisper, InteractionRules.KindForCategory("Prop"));
            Assert.Equal(InteractionKind.Whisper, InteractionRules.KindForCategory(null));
            Assert.Equal(InteractionKind.Whisper, InteractionRules.KindForCategory("anything else"));
        }

        [Fact]
        public void Door_messages_exist_and_differ_per_behavior()
        {
            var seen = new System.Collections.Generic.HashSet<string>();
            foreach (DoorBehavior b in Enum.GetValues(typeof(DoorBehavior)))
            {
                string text = InteractionRules.DoorMessage(b);
                Assert.False(string.IsNullOrWhiteSpace(text));
                Assert.True(seen.Add(text), "duplicate message for " + b);
            }
        }

        [Fact]
        public void Sanity_stays_in_range_for_any_interaction_sequence()
        {
            Property.ForAll((r, seed) =>
            {
                var sanity = new SanityModel(r.Next(101));
                for (int i = 0; i < 40; i++)
                {
                    sanity.Apply(InteractionRules.SanityDelta((InteractionKind)r.Next(4)));
                    Assert.InRange(sanity.Value, 0f, SanityModel.Max);
                }
            });
        }

        [Fact]
        public void Camera_cycle_visits_all_modes_when_calm_and_never_offers_top_down_at_abyss()
        {
            Property.ForAll((r, seed) =>
            {
                float dread = r.Next(1001) / 1000f;
                var mode = (CameraMode)r.Next(3);
                var next = InteractionRules.NextCamera(mode, dread);
                Assert.InRange((int)next, 0, 2);
                Assert.Equal(next, DreadBuildingPolicy.AllowedCamera(next, dread));
                Assert.Equal(next, InteractionRules.NextCamera(mode, dread));
                if (DreadThresholds.TierFor(dread) >= 3) Assert.NotEqual(CameraMode.TopDown, next);
            });
            Assert.Equal(CameraMode.ThirdPerson, InteractionRules.NextCamera(CameraMode.FirstPerson, 0f));
            Assert.Equal(CameraMode.TopDown, InteractionRules.NextCamera(CameraMode.ThirdPerson, 0f));
            Assert.Equal(CameraMode.FirstPerson, InteractionRules.NextCamera(CameraMode.TopDown, 0f));
            Assert.Equal(CameraMode.FirstPerson, InteractionRules.NextCamera(CameraMode.ThirdPerson, 0.95f));
        }
    }
}
