using System;

namespace Frankenstein.Core
{
    /// <summary>Pluggable narration source. Swap in an AI-backed provider without touching game code.</summary>
    public interface INarrationProvider
    {
        string Narrate(string locationId, float dread);
    }

    /// <summary>Offline provider used by default and as a fallback when an AI provider fails.</summary>
    public sealed class StaticNarrationProvider : INarrationProvider
    {
        private static readonly string[] Calm = { "The village sleeps beneath a pale moon." };
        private static readonly string[] Uneasy = { "Something watches from the windows of {0}." };
        private static readonly string[] Dire = { "The stones of {0} whisper your name." };

        public string Narrate(string locationId, float dread)
        {
            var pool = dread < 0.34f ? Calm : dread < 0.67f ? Uneasy : Dire;
            return string.Format(pool[0], locationId ?? "the village");
        }
    }

    /// <summary>Wraps a primary (e.g. AI) provider and never lets it throw or return empty text.</summary>
    public sealed class SafeNarrationProvider : INarrationProvider
    {
        private readonly INarrationProvider _primary;
        private readonly INarrationProvider _fallback;

        /// <summary>Message of the last primary provider failure, or null. Callers (Runtime) may log it; Core never swallows silently.</summary>
        public string LastError { get; private set; }

        public SafeNarrationProvider(INarrationProvider primary, INarrationProvider fallback)
        {
            _primary = primary;
            _fallback = fallback ?? new StaticNarrationProvider();
        }

        public string Narrate(string locationId, float dread)
        {
            try
            {
                var text = _primary?.Narrate(locationId, dread);
                if (!string.IsNullOrWhiteSpace(text)) { LastError = null; return text; }
                LastError = "primary narration provider returned blank text";
            }
            catch (Exception ex) { LastError = ex.GetType().Name + ": " + ex.Message; }
            return _fallback.Narrate(locationId, dread);
        }
    }
}
