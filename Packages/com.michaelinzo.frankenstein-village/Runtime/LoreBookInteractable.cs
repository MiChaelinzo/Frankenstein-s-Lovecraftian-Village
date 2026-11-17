using Frankenstein.Core;
using UnityEngine;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin lore book. Which books exist, where they lie and what reading does come from Core (LoreBookRules.Place, LoreBookRules.Read);
    /// this component only remembers whether this book was read and returns the Core result for the caller to forward to the vigil and sanity.
    /// Page text comes from Data/lore_books.json (LoreLibrary). Compile checked only; runtime behaviour is Unverified in Unity.
    /// </summary>
    public sealed class LoreBookInteractable : MonoBehaviour
    {
        public string bookId;
        public bool WasRead { get; private set; }

        /// <summary>Reads the book through Core. Only the first reading has effects.</summary>
        public LoreReadResult Read(LoreLibrary library)
        {
            var result = LoreBookRules.Read(library == null ? null : library.Find(bookId), WasRead);
            WasRead = WasRead || result.FirstRead;
            return result;
        }
    }
}
