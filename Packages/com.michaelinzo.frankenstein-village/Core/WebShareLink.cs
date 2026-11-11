using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Frankenstein.Core
{
    /// <summary>Everything a shared web link can carry. Night, floor and beat are 0-based here; the link writes night 1-based.</summary>
    public struct WebShareOptions
    {
        public int Seed;
        public int Sanity;
        public int Night;
        public string Theme;   // null or "auto" omits it
        public string Cam;     // "auto", "first", "third", "top"; "third" (the default) is omitted
        public int Floor;
        public bool Story;     // adds story=1&beat=N
        public int Beat;
        public bool View3d;    // view=3d
        public bool Cinematic; // cinematic=1
        public bool Meshes;    // meshes=1
        public bool SkipIntro; // intro=0
        public bool Tour;      // tour=1
        public string Lang;    // null or "en" omits it
    }

    /// <summary>
    /// Builds the hash fragment the browser demo parses. The first part mirrors sessionHash in web/src/session.js
    /// (night 1-based, default theme, cam and floor omitted); the flags use only parameters web/src/app.js reads
    /// (view, cinematic, meshes, intro, tour, story, beat, lang). Parity is checked through the "shareLinks" golden section.
    /// </summary>
    public static class WebShareLink
    {
        private static readonly Regex ThemePattern = new Regex("^[a-z0-9_-]{1,32}$", RegexOptions.CultureInvariant);
        private static readonly string[] Cameras = { "auto", "first", "third", "top" };

        private static int Clamp(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

        /// <summary>Hash fragment with the leading '#'.</summary>
        public static string Hash(WebShareOptions o)
        {
            var inv = CultureInfo.InvariantCulture;
            var sb = new StringBuilder("#seed=");
            sb.Append(o.Seed.ToString(inv)).Append("&sanity=").Append(Clamp(o.Sanity, 0, 100).ToString(inv))
              .Append("&night=").Append((Clamp(o.Night, 0, 8) + 1).ToString(inv));
            if (o.Theme != null && o.Theme != "auto" && ThemePattern.IsMatch(o.Theme)) sb.Append("&theme=").Append(o.Theme);
            if (o.Cam != null && o.Cam != "third" && System.Array.IndexOf(Cameras, o.Cam) >= 0) sb.Append("&cam=").Append(o.Cam);
            int floor = Clamp(o.Floor, 0, 8);
            if (floor != 0) sb.Append("&floor=").Append(floor.ToString(inv));
            if (o.Story) sb.Append("&story=1&beat=").Append(Clamp(o.Beat, 0, 99).ToString(inv));
            if (o.View3d) sb.Append("&view=3d");
            if (o.Cinematic) sb.Append("&cinematic=1");
            if (o.Meshes) sb.Append("&meshes=1");
            if (o.SkipIntro) sb.Append("&intro=0");
            if (o.Tour) sb.Append("&tour=1");
            if (!string.IsNullOrEmpty(o.Lang) && o.Lang != "en") sb.Append("&lang=").Append(o.Lang);
            return sb.ToString();
        }

        /// <summary>Base page plus the hash. The base is used as given ("./" when empty); never carries ?pack.</summary>
        public static string Link(string baseUrl, WebShareOptions o)
        {
            return (string.IsNullOrEmpty(baseUrl) ? "./" : baseUrl) + Hash(o);
        }
    }
}
