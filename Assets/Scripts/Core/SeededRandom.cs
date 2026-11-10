namespace Frankenstein.Core
{
    /// <summary>Deterministic xorshift32 RNG so layouts match across Unity and plain .NET.</summary>
    public sealed class SeededRandom
    {
        private uint _state;

        public SeededRandom(int seed)
        {
            _state = (uint)seed * 2654435761u + 0x9E3779B9u;
            if (_state == 0) _state = 0x1234ABCDu;
        }

        public uint NextUInt()
        {
            _state ^= _state << 13;
            _state ^= _state >> 17;
            _state ^= _state << 5;
            return _state;
        }

        /// <summary>Returns an int in [0, maxExclusive).</summary>
        public int Next(int maxExclusive)
        {
            if (maxExclusive <= 0) return 0;
            return (int)(NextUInt() % (uint)maxExclusive);
        }
    }
}
