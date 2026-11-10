using System;
using System.Collections.Generic;
using System.Text;

namespace Frankenstein.Core
{
    /// <summary>
    /// Pure name matching used by the Editor auto-binder to pair catalog ids with prefab names
    /// from an imported pack. Deterministic and independent of candidate order.
    /// </summary>
    public static class PrefabNameMatcher
    {
        private static readonly string[][] AliasGroups =
        {
            new[] { "house", "home", "cottage", "hut", "cabin" },
            new[] { "church", "chapel", "cathedral", "temple" },
            new[] { "well", "fountain" },
            new[] { "tree", "dead", "trunk" },
            new[] { "altar", "shrine" },
        };

        public const int ExactScore = 1000;
        public const int TokenScore = 10;
        public const int AliasScore = 3;

        /// <summary>Lowercase word tokens. Splits on non-alphanumerics and camelCase, drops pure-number tokens.</summary>
        public static List<string> Tokenize(string name)
        {
            var tokens = new List<string>();
            if (string.IsNullOrEmpty(name)) return tokens;
            var cur = new StringBuilder();
            char prev = ' ';
            foreach (char c in name)
            {
                if (!char.IsLetterOrDigit(c)) { Flush(cur, tokens); prev = ' '; continue; }
                if (char.IsUpper(c) && char.IsLower(prev)) Flush(cur, tokens);
                else if (prev != ' ' && char.IsDigit(c) != char.IsDigit(prev)) Flush(cur, tokens);
                cur.Append(char.ToLowerInvariant(c));
                prev = c;
            }
            Flush(cur, tokens);
            return tokens;
        }

        private static void Flush(StringBuilder cur, List<string> tokens)
        {
            if (cur.Length == 0) return;
            string t = cur.ToString();
            cur.Clear();
            foreach (char ch in t) if (!char.IsDigit(ch)) { tokens.Add(t); return; }
        }

        public static string Normalize(string name) => string.Join("_", Tokenize(name));

        /// <summary>0 means no relation. An exact normalized match scores far above any partial overlap.</summary>
        public static int Score(string id, string candidate)
        {
            var a = Tokenize(id);
            var b = Tokenize(candidate);
            if (a.Count == 0 || b.Count == 0) return 0;
            if (string.Join("_", a) == string.Join("_", b)) return ExactScore;

            int score = 0;
            var seen = new HashSet<string>();
            foreach (var t in a)
            {
                if (!seen.Add(t)) continue;
                if (b.Contains(t)) { score += TokenScore; continue; }
                foreach (var u in b)
                    if (SameGroup(t, u)) { score += AliasScore; break; }
            }
            return score;
        }

        private static bool SameGroup(string x, string y)
        {
            foreach (var g in AliasGroups)
                if (Array.IndexOf(g, x) >= 0 && Array.IndexOf(g, y) >= 0) return true;
            return false;
        }

        /// <summary>Best candidate above zero, ties broken by ordinal name order. Null when nothing matches.</summary>
        public static string Best(string id, IEnumerable<string> candidates)
        {
            string best = null;
            int bestScore = 0;
            if (candidates == null) return null;
            foreach (var c in candidates)
            {
                if (c == null) continue;
                int s = Score(id, c);
                if (s <= 0) continue;
                if (s > bestScore || (s == bestScore && string.CompareOrdinal(c, best) < 0)) { best = c; bestScore = s; }
            }
            return best;
        }
    }
}
