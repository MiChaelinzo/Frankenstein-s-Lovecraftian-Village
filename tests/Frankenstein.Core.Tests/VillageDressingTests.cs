using System.Collections.Generic;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    public class VillageDressingTests
    {
        private static readonly int[] Seeds = { 1, 42, -7, 1818, 123456789 };

        [Fact]
        public void Compose_is_deterministic_never_enlarges_and_uses_every_village_kind()
        {
            foreach (var seed in Seeds)
            {
                var a = VillageDressing.Compose(seed, 24, 24, new List<PlacedPiece>());
                var b = VillageDressing.Compose(seed, 24, 24, new List<PlacedPiece>());
                Assert.Equal(a.Count, b.Count);
                for (int i = 0; i < a.Count; i++) { Assert.Equal(a[i].Kind, b[i].Kind); Assert.Equal(a[i].X, b[i].X); Assert.Equal(a[i].Z, b[i].Z); }
                Assert.All(a, it => Assert.InRange(it.Scale, 0.1, 1.0));
                foreach (var kind in new[] { "lighthouse", "chapel", "inn", "cottage_thatch", "crate_stack", "barrel", "gravestone", "fence_iron", "lamp" })
                    Assert.Contains(a, it => it.Kind == kind);
            }
        }

        [Fact]
        public void Market_stall_avoids_layout_pieces()
        {
            var blocker = new List<PlacedPiece> { new PlacedPiece { Id = "house_a", X = 10, Z = 10, SizeX = 4, SizeZ = 4 } };
            var items = VillageDressing.Compose(1818, 24, 24, blocker);
            foreach (var it in items.Where(i => i.Kind == "market_stall")) Assert.False(VillageDressing.OverlapsLayout(it, blocker, 0));
        }
    }
}
