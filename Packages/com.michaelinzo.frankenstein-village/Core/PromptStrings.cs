using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// Engine-free table of the first-person interaction prompts. Keys and wording are the same as the
    /// view3d.prompt.* entries in web/src/i18n.js (the web table is the wording source; a test in
    /// tests/Frankenstein.Core.Tests parses that file and fails when any language here drifts from it).
    /// "{name}" is replaced with the place name. Unknown languages fall back to English.
    /// </summary>
    public static class PromptStrings
    {
        public const string DefaultLanguage = "en";
        public const string NamePlaceholder = "{name}";

        public static readonly string[] Keys =
        {
            "view3d.prompt.door", "view3d.prompt.whisper", "view3d.prompt.landmark", "view3d.prompt.candle",
        };

        public static readonly string[] Languages = { "en", "fr" };

        private static readonly Dictionary<string, string[]> Table = new Dictionary<string, string[]>
        {
            { "en", new[] { "Try the door of {name}", "Listen to {name}", "Study {name}", "Light the candle at {name}" } },
            { "fr", new[] { "Essayer la porte de {name}", "Ecouter {name}", "Etudier {name}", "Allumer la bougie de {name}" } },
        };

        /// <summary>
        /// Place-name keys mirrored from the loc.* entries of web/src/i18n.js. A location id maps to loc.&lt;id&gt; with
        /// spaces replaced by underscores; order matches <see cref="PlaceKeys"/>. A test fails if the two tables drift.
        /// </summary>
        public static readonly string[] PlaceKeys =
        {
            "loc.church", "loc.altar", "loc.well", "loc.the_walls", "loc.the_village",
        };

        private static readonly Dictionary<string, string[]> Places = new Dictionary<string, string[]>
        {
            { "en", new[] { "church", "altar", "well", "the walls", "the village" } },
            { "fr", new[] { "l'eglise", "l'autel", "le puits", "les murs", "le village" } },
        };

        /// <summary>The i18n key for an interaction kind. Order of <see cref="Keys"/> matches <see cref="InteractionKind"/>.</summary>
        public static string KeyFor(InteractionKind kind)
        {
            int index = (int)kind;
            return index >= 0 && index < Keys.Length ? Keys[index] : Keys[(int)InteractionKind.Whisper];
        }

        /// <summary>Raw template for a language and key, English when the language is unknown, null when the key is unknown.</summary>
        public static string Template(string language, string key)
        {
            int index = System.Array.IndexOf(Keys, key);
            if (index < 0) return null;
            string[] row;
            if (language == null || !Table.TryGetValue(language, out row)) row = Table[DefaultLanguage];
            return row[index];
        }

        /// <summary>The prompt for a kind and place, e.g. "Listen to the chapel". A null name becomes an empty string.</summary>
        public static string Prompt(string language, InteractionKind kind, string name)
        {
            return Template(language, KeyFor(kind)).Replace(NamePlaceholder, name ?? "");
        }

        /// <summary>
        /// Localised place name for a location id, mirroring locName in web/src/i18n-text.js: null or empty gives
        /// "the village", a known id (spaces become underscores) gives the translated name, an unknown id is returned
        /// unchanged. Unknown languages fall back to English.
        /// </summary>
        public static string PlaceName(string language, string id)
        {
            string[] row;
            if (language == null || !Places.TryGetValue(language, out row)) row = Places[DefaultLanguage];
            if (string.IsNullOrEmpty(id)) return row[System.Array.IndexOf(PlaceKeys, "loc.the_village")];
            string key = "loc." + id.Replace(' ', '_');
            int index = System.Array.IndexOf(PlaceKeys, key);
            return index < 0 ? id : row[index];
        }

        /// <summary>The prompt for a kind and raw location id, localising the place name via <see cref="PlaceName"/>.</summary>
        public static string PromptFor(string language, InteractionKind kind, string locationId)
        {
            return Prompt(language, kind, PlaceName(language, locationId));
        }
    }
}
