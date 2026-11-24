using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>Where a statement comes from. Order is stable (golden data uses the integers).</summary>
    public enum StatementSource { Chat = 0, Journal = 1, Lore = 2, Clue = 3 }

    /// <summary>When an authored contradiction applies. CorruptedSpeaker: only once the speaker of statement B has reached <see cref="CorruptionStage.Corrupted"/>.</summary>
    public enum ContradictionNeeds { None = 0, CorruptedSpeaker = 1 }

    /// <summary>One authored statement of Data/statements.json. Role names a principal villager (empty for a statement any villager may make, the lies). Ref is the lore book id (Lore) or the Vigil clue id (Clue).</summary>
    public sealed class StatementData
    {
        public string Id;
        public StatementSource Source;
        public string Role = "";
        public string Ref = "";
        /// <summary>"" (nowhere in particular), <see cref="InvestigationRules.HomePlace"/> or a <see cref="VillageLandmarks.Ids"/> entry.</summary>
        public string Place = "";
        /// <summary>1-based night the statement is about; 0 means the night it was told.</summary>
        public int Night;
        /// <summary>Clock minute of the day (0 to <see cref="GameClock.MinutesPerDay"/> - 1).</summary>
        public int Minute;
        public LocalizedName Text;
        /// <summary>How sure the source is, in whole percent (0 to 100). Authored, or <see cref="InvestigationRules.DefaultConfidence"/> of the source when the file says nothing.</summary>
        public int Confidence;
    }

    /// <summary>An authored pair of statements that cannot both be true, with the reason the board shows.</summary>
    public sealed class ContradictionData
    {
        public string Id;
        public string A;
        public string B;
        public ContradictionNeeds Needs;
        public LocalizedName Reason;
        /// <summary>Knowledge tier at which the player sees the two statements are about different nights and the contradiction disappears. 0: never resolves.</summary>
        public int ResolvesAtKnowledge;
    }

    /// <summary>The parsed Data/statements.json. The same file is read by web/src/investigation.js.</summary>
    public sealed class StatementLibrary
    {
        public List<StatementData> Statements = new List<StatementData>();
        public List<ContradictionData> Contradictions = new List<ContradictionData>();

        public StatementData Find(string id)
        {
            foreach (var s in Statements) if (s.Id == id) return s;
            return null;
        }

        /// <summary>Parses the data file. Throws FormatException naming the offending entry when it is malformed or refers to an unknown statement.</summary>
        public static StatementLibrary Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("statements: root is not an object");
            var lib = new StatementLibrary();
            foreach (var o in Objects(root, "statements"))
            {
                var id = Str(o, "id", "statement");
                int source = Array.IndexOf(InvestigationRules.SourceIds, Str(o, "source", "statement " + id));
                if (source < 0) throw new FormatException("statements: " + id + " has an unknown source");
                if (lib.Find(id) != null) throw new FormatException("statements: duplicate id " + id);
                var s = new StatementData
                {
                    Id = id, Source = (StatementSource)source, Role = Opt(o, "role"), Ref = Opt(o, "ref"), Place = Opt(o, "place"),
                    Night = Int(o, "night", id), Minute = Int(o, "minute", id), Text = Text(o, "statement " + id),
                };
                s.Confidence = o.ContainsKey("confidence") ? Int(o, "confidence", id) : InvestigationRules.DefaultConfidence(s.Source);
                if (s.Confidence < 0 || s.Confidence > 100) throw new FormatException("statements: " + id + " has confidence outside 0 to 100");
                if (s.Role.Length > 0 && Array.IndexOf(VillagerRules.RoleIds, s.Role) < 0) throw new FormatException("statements: " + id + " has an unknown role");
                if (s.Place.Length > 0 && s.Place != InvestigationRules.HomePlace && Array.IndexOf(VillageLandmarks.Ids, s.Place) < 0) throw new FormatException("statements: " + id + " has an unknown place");
                if (s.Night < 0 || s.Minute < 0 || s.Minute >= GameClock.MinutesPerDay) throw new FormatException("statements: " + id + " has night or minute out of range");
                if (s.Source == StatementSource.Journal && s.Role.Length == 0) throw new FormatException("statements: " + id + " is a journal without a role");
                if ((s.Source == StatementSource.Lore || s.Source == StatementSource.Clue) && s.Ref.Length == 0) throw new FormatException("statements: " + id + " needs a ref");
                lib.Statements.Add(s);
            }
            foreach (var o in Objects(root, "contradictions"))
            {
                var id = Str(o, "id", "contradiction");
                int needs = Array.IndexOf(InvestigationRules.NeedsIds, Str(o, "needs", "contradiction " + id));
                if (needs < 0) throw new FormatException("statements: contradiction " + id + " has unknown needs");
                var c = new ContradictionData { Id = id, A = Str(o, "a", "contradiction " + id), B = Str(o, "b", "contradiction " + id), Needs = (ContradictionNeeds)needs, Reason = Text(o, "contradiction " + id) };
                if (c.A == c.B || lib.Find(c.A) == null || lib.Find(c.B) == null) throw new FormatException("statements: contradiction " + id + " refers to unknown or identical statements");
                if (o.ContainsKey("resolvesAt"))
                {
                    c.ResolvesAtKnowledge = Int(o, "resolvesAt", "contradiction " + id);
                    var a = lib.Find(c.A); var b = lib.Find(c.B);
                    if (c.ResolvesAtKnowledge < 1 || c.ResolvesAtKnowledge > KnowledgeLibrary.MaxTier) throw new FormatException("statements: contradiction " + id + " resolvesAt is outside 1 to the top knowledge tier");
                    if (a.Night < 1 || b.Night < 1 || a.Night == b.Night) throw new FormatException("statements: contradiction " + id + " resolvesAt needs statements about two different nights");
                }
                lib.Contradictions.Add(c);
            }
            return lib;
        }

        private static List<Dictionary<string, object>> Objects(Dictionary<string, object> o, string key)
        {
            var list = o.ContainsKey(key) ? o[key] as List<object> : null;
            if (list == null) throw new FormatException("statements: missing " + key + " array");
            var result = new List<Dictionary<string, object>>();
            foreach (var item in list)
            {
                var d = item as Dictionary<string, object>;
                if (d == null) throw new FormatException("statements: " + key + " holds a non-object");
                result.Add(d);
            }
            return result;
        }

        private static string Str(Dictionary<string, object> o, string key, string owner)
        {
            var s = o.ContainsKey(key) ? o[key] as string : null;
            if (string.IsNullOrEmpty(s)) throw new FormatException("statements: " + owner + " lacks " + key);
            return s;
        }

        private static string Opt(Dictionary<string, object> o, string key) { return o.ContainsKey(key) ? o[key] as string ?? "" : ""; }

        private static int Int(Dictionary<string, object> o, string key, string owner)
        {
            if (!o.ContainsKey(key) || !(o[key] is double)) throw new FormatException("statements: " + owner + " lacks " + key);
            return (int)(double)o[key];
        }

        private static LocalizedName Text(Dictionary<string, object> o, string owner)
        {
            var name = new LocalizedName();
            foreach (var lang in VillageNames.Languages)
            {
                var s = o.ContainsKey(lang) ? o[lang] as string : null;
                if (string.IsNullOrWhiteSpace(s)) throw new FormatException("statements: " + owner + " lacks " + lang + " text");
                name.Text[lang] = s;
            }
            return name;
        }
    }

    public enum BoardCardKind { Suspect = 0, Victim = 1, Location = 2, Clue = 3, Event = 4 }

    public enum BoardLinkKind { VillagerHome = 0, VillagerFamily = 1, VillagerJournal = 2, VillagerMissing = 3, LandmarkLegend = 4, ClueSubject = 5 }

    /// <summary>One statement a villager made in a chat. Night is the 1-based night it was heard.</summary>
    public struct HeardStatement
    {
        public int Villager;
        public string StatementId;
        public int Night;
    }

    /// <summary>Everything the player has found. The board reads it and never changes it.</summary>
    public sealed class InvestigationEvidence
    {
        /// <summary>Vigil clue ids found (read only; see <see cref="VigilRules"/>), such as "book@b39".</summary>
        public HashSet<string> ClueIds = new HashSet<string>();
        /// <summary>Lore book ids read, journals and missing person pages included.</summary>
        public HashSet<string> BooksRead = new HashSet<string>();
        /// <summary>Roster indices of villagers the player has talked to.</summary>
        public HashSet<int> Met = new HashSet<int>();
        public List<HeardStatement> Heard = new List<HeardStatement>();
    }

    /// <summary>A card of the board. Key is the roster index, missing index or layout piece as text, a landmark id, a clue id or a statement id. Unrevealed cards are known to the model but not shown.</summary>
    public sealed class BoardCard
    {
        public BoardCardKind Kind;
        public string Id;
        public string Key;
        public bool Revealed;
        /// <summary>A statement card whose speaker is corrupted, or a suspect card of a corrupted villager: their account is not to be trusted.</summary>
        public bool Invalidated;
    }

    public sealed class BoardLink
    {
        public BoardLinkKind Kind;
        public string From;
        public string To;
        public bool Revealed;
    }

    /// <summary>A contradiction marker on a pair of event cards. PairId is the authored pair.</summary>
    public sealed class BoardContradiction
    {
        public string PairId;
        public string CardA;
        public string CardB;
    }

    /// <summary>One revealed statement placed in in-world time.</summary>
    public sealed class TimelineEvent
    {
        public string StatementId;
        /// <summary>Roster index of the speaker, or -1 when unknown.</summary>
        public int Villager;
        public int Night;
        public int Minute;
    }

    public sealed class InvestigationBoard
    {
        public List<BoardCard> Cards = new List<BoardCard>();
        public List<BoardLink> Links = new List<BoardLink>();
        public List<BoardContradiction> Contradictions = new List<BoardContradiction>();
        public List<TimelineEvent> Timeline = new List<TimelineEvent>();
        /// <summary>Contradictions the player's knowledge has explained away (different nights). Not in <see cref="Contradictions"/>.</summary>
        public List<BoardContradiction> Resolutions = new List<BoardContradiction>();
        /// <summary>Evidence -> Confidence -> Belief for every revealed authored statement, in library order.</summary>
        public List<StatementScore> Scores = new List<StatementScore>();
    }

    /// <summary>Confidence is the source's own certainty; Belief is what the player should trust: confidence, less <see cref="InvestigationRules.InvalidatedPenalty"/> when the speaker is corrupted. Whole percent.</summary>
    public sealed class StatementScore
    {
        public string StatementId;
        public int Confidence;
        public int Belief;
    }

    /// <summary>
    /// The investigation board of one village: suspects, victims, locations, clues and events, linked by what the story and the lore already say, and revealed only as the player's
    /// evidence reaches them. Contradictions are never computed from wording: they come from authored pairs in Data/statements.json, and show once both statements are known.
    /// Read-only over the Vigil clue ids; the Vigil win and endings are untouched. Pure and deterministic.
    /// </summary>
    public static class InvestigationRules
    {
        public const string HomePlace = "home";
        /// <summary>Percent taken off a statement's belief when its speaker is corrupted.</summary>
        public const int InvalidatedPenalty = 30;

        /// <summary>Confidence of a statement the data file gives none: journals are written down, chats are spoken, lore is hearsay, clues are physical.</summary>
        public static int DefaultConfidence(StatementSource source)
        {
            switch (source)
            {
                case StatementSource.Journal: return 80;
                case StatementSource.Lore: return 65;
                case StatementSource.Clue: return 90;
                default: return 60;
            }
        }

        /// <summary>
        /// The knowledge sources the evidence has earned, as <see cref="KnowledgeLibrary.SourceIds"/> entries, one per item: "journal" per villager journal read (lore id j and two digits),
        /// "investigation" per clue id found, "mythos_event" per mythos statement heard. Counts only matter to the tier. Pure, so the knowledge tier is derived from evidence and needs no save of its own.
        /// </summary>
        public static List<string> KnowledgeSources(InvestigationEvidence e) { return KnowledgeSources(e, null); }

        /// <summary>
        /// As above; a found place clue (<see cref="PlaceLibrary"/>) earns the source its discovery names (ruins for the manor archives, cult_discovery for the cult records) instead of "investigation".
        /// With a null library the result is exactly the one without places.
        /// </summary>
        public static List<string> KnowledgeSources(InvestigationEvidence e, PlaceLibrary places)
        {
            var journals = new List<string>();
            foreach (var id in e.BooksRead) if (id.Length == 3 && id[0] == 'j' && id[1] >= '0' && id[1] <= '9' && id[2] >= '0' && id[2] <= '9') journals.Add(id);
            var clues = new List<string>(e.ClueIds);
            var mythosHeard = new List<string>();
            foreach (var h in e.Heard) if (h.StatementId.StartsWith(MythosRules.IdPrefix, StringComparison.Ordinal) && !mythosHeard.Contains(h.StatementId)) mythosHeard.Add(h.StatementId);
            var sources = new List<string>();
            for (int i = 0; i < journals.Count; i++) sources.Add("journal");
            foreach (var clue in clues) sources.Add(PlaceRulesSource(places, clue) ?? "investigation");
            for (int i = 0; i < mythosHeard.Count; i++) sources.Add("mythos_event");
            return sources;
        }

        private static string PlaceRulesSource(PlaceLibrary places, string clueId) { return VillagePlaces.SourceOfClue(places, clueId); }

        /// <summary>Belief in a statement, whole percent from 0 to 100: its confidence, less <see cref="InvalidatedPenalty"/> when its speaker is corrupted.</summary>
        public static int BeliefScore(int confidence, bool invalidated)
        {
            int b = confidence - (invalidated ? InvalidatedPenalty : 0);
            return b < 0 ? 0 : b > 100 ? 100 : b;
        }
        public static readonly string[] SourceIds = { "chat", "journal", "lore", "clue" };
        public static readonly string[] NeedsIds = { "none", "corrupted_speaker" };
        public const string SuspectPrefix = "suspect:", VictimPrefix = "victim:", HomePrefix = "location:home:", LandmarkPrefix = "location:landmark:", CluePrefix = "clue:", LegendPrefix = "clue:legend:", EventPrefix = "event:";

        public static string SuspectId(int villager) { return SuspectPrefix + villager; }
        public static string VictimId(int missing) { return VictimPrefix + missing; }
        public static string HomeId(int piece) { return HomePrefix + piece; }
        public static string LandmarkId(string landmark) { return LandmarkPrefix + landmark; }
        public static string ClueCardId(string clueId) { return CluePrefix + clueId; }
        public static string EventId(string statementId) { return EventPrefix + statementId; }

        /// <summary>Roster index of the villager with a role id, or -1. The first one wins, as the journals do.</summary>
        public static int VillagerOfRole(IList<Villager> roster, string role)
        {
            foreach (var v in roster) if (VillagerRules.RoleIds[(int)v.Role] == role) return v.Index;
            return -1;
        }

        private static LoreBook JournalOfRole(LoreLibrary lore, string role)
        {
            foreach (var b in lore.Books) if (b.Role == role) return b;
            return null;
        }

        private static LoreBook BookOfMissing(LoreLibrary lore, string missingId)
        {
            foreach (var b in lore.Books) if (b.Missing == missingId) return b;
            return null;
        }

        /// <summary>The corruption stage of a villager from the optional per-villager array.</summary>
        private static CorruptionStage StageOf(IList<CorruptionStage> corruption, int villager)
        {
            return corruption != null && villager >= 0 && villager < corruption.Count ? corruption[villager] : CorruptionStage.None;
        }

        private static bool Corrupted(CorruptionStage stage) { return (int)stage >= (int)CorruptionStage.Corrupted; }

        private static bool Read(InvestigationEvidence e, LoreBook b) { return b != null && e.BooksRead.Contains(b.Id); }

        private static int HeardIndex(InvestigationEvidence e, string statementId)
        {
            for (int i = 0; i < e.Heard.Count; i++) if (e.Heard[i].StatementId == statementId) return i;
            return -1;
        }

        /// <summary>The roster index of the speaker of a statement: the villager of its role, else the one it was heard from, else -1.</summary>
        public static int SpeakerOf(StatementData s, IList<Villager> roster, InvestigationEvidence e)
        {
            if (s.Role.Length > 0) return VillagerOfRole(roster, s.Role);
            int h = HeardIndex(e, s.Id);
            return h < 0 ? -1 : e.Heard[h].Villager;
        }

        /// <summary>Whether the evidence reveals a statement: heard in chat, its journal or lore page read, or its clue found.</summary>
        public static bool IsRevealed(StatementData s, LoreLibrary lore, InvestigationEvidence e)
        {
            switch (s.Source)
            {
                case StatementSource.Chat: return HeardIndex(e, s.Id) >= 0;
                case StatementSource.Journal: return Read(e, JournalOfRole(lore, s.Role));
                case StatementSource.Lore: return e.BooksRead.Contains(s.Ref);
                default: return e.ClueIds.Contains(s.Ref);
            }
        }

        /// <summary>Orders events by in-world time: night, then clock minute, then statement id (ordinal), then villager. A total order, so equal input gives equal output.</summary>
        public static List<TimelineEvent> OrderTimeline(IEnumerable<TimelineEvent> events)
        {
            var list = new List<TimelineEvent>(events);
            list.Sort((x, y) =>
            {
                int c = x.Night.CompareTo(y.Night);
                if (c == 0) c = x.Minute.CompareTo(y.Minute);
                if (c == 0) c = string.CompareOrdinal(x.StatementId, y.StatementId);
                if (c == 0) c = x.Villager.CompareTo(y.Villager);
                return c;
            });
            return list;
        }

        /// <summary>Builds the board for the current evidence. <paramref name="corruption"/> is the stage of each villager by roster index (null: nobody is corrupted).</summary>
        public static InvestigationBoard Build(VillageStory story, LoreLibrary lore, StatementLibrary statements, InvestigationEvidence evidence, IList<CorruptionStage> corruption)
        {
            return Build(story, lore, statements, evidence, corruption, null);
        }

        /// <summary>
        /// <see cref="Build(VillageStory, LoreLibrary, StatementLibrary, InvestigationEvidence, IList{CorruptionStage})"/> plus the mythos: an Event card for every mythos statement the player
        /// heard (exposed secrets, cult members, omens, rumors), on the timeline. A rumor the speaker passed on distorted is Invalidated and contradicts the statement it distorts once that one is known too.
        /// With a null <paramref name="mythos"/> the board is exactly the one without it.
        /// </summary>
        public static InvestigationBoard Build(VillageStory story, LoreLibrary lore, StatementLibrary statements, InvestigationEvidence evidence, IList<CorruptionStage> corruption, MythosFeed mythos)
        {
            return Build(story, lore, statements, evidence, corruption, mythos, 0);
        }

        /// <summary>
        /// As above plus the player's knowledge tier (<see cref="KnowledgeRules"/>). A contradiction with a ResolvesAtKnowledge at or below the tier is listed in Resolutions instead of Contradictions:
        /// the player has understood the two statements speak of different nights. At tier 0 the board is exactly the one without knowledge.
        /// </summary>
        public static InvestigationBoard Build(VillageStory story, LoreLibrary lore, StatementLibrary statements, InvestigationEvidence evidence, IList<CorruptionStage> corruption, MythosFeed mythos, int knowledge)
        {
            return Build(story, lore, statements, evidence, corruption, mythos, knowledge, null);
        }

        /// <summary>As above plus the places: a found place clue gets a Clue card linked to the landmark its place stands beside. With a null library the board is exactly the one without places.</summary>
        public static InvestigationBoard Build(VillageStory story, LoreLibrary lore, StatementLibrary statements, InvestigationEvidence evidence, IList<CorruptionStage> corruption, MythosFeed mythos, int knowledge, PlaceLibrary places)
        {
            var board = new InvestigationBoard();
            var roster = story.Roster;
            var cardIndex = new Dictionary<string, BoardCard>();
            Func<BoardCardKind, string, string, bool, BoardCard> addCard = (kind, id, key, revealed) =>
            {
                BoardCard existing;
                if (cardIndex.TryGetValue(id, out existing)) { existing.Revealed |= revealed; return existing; }
                var card = new BoardCard { Kind = kind, Id = id, Key = key, Revealed = revealed };
                cardIndex[id] = card;
                board.Cards.Add(card);
                return card;
            };
            Action<BoardLinkKind, string, string, bool> addLink = (kind, from, to, revealed) => board.Links.Add(new BoardLink { Kind = kind, From = from, To = to, Revealed = revealed });

            foreach (var v in roster)
            {
                var card = addCard(BoardCardKind.Suspect, SuspectId(v.Index), v.Index.ToString(), evidence.Met.Contains(v.Index));
                card.Invalidated = Corrupted(StageOf(corruption, v.Index));
            }
            for (int k = 0; k < story.Missing.Count; k++) addCard(BoardCardKind.Victim, VictimId(k), k.ToString(), false);

            foreach (var v in roster)
            {
                if (v.HomeIndex < 0) continue;
                string home = HomeId(v.HomeIndex);
                bool met = evidence.Met.Contains(v.Index);
                addCard(BoardCardKind.Location, home, v.HomeIndex.ToString(), met);
                addLink(BoardLinkKind.VillagerHome, SuspectId(v.Index), home, met);
            }
            foreach (var fam in story.Families)
                for (int a = 0; a < fam.Members.Count; a++)
                    for (int b = a + 1; b < fam.Members.Count; b++)
                        addLink(BoardLinkKind.VillagerFamily, SuspectId(fam.Members[a]), SuspectId(fam.Members[b]), evidence.Met.Contains(fam.Members[a]) && evidence.Met.Contains(fam.Members[b]));

            foreach (var book in lore.Books)
            {
                if (book.Role.Length == 0) continue;
                int owner = story.JournalOwner(book);
                if (owner < 0) continue;
                bool read = evidence.BooksRead.Contains(book.Id);
                addCard(BoardCardKind.Clue, ClueCardId(LoreBookRules.ClueIdPrefix + book.Id), book.Id, read);
                addLink(BoardLinkKind.VillagerJournal, SuspectId(owner), ClueCardId(LoreBookRules.ClueIdPrefix + book.Id), read);
            }
            for (int k = 0; k < story.Missing.Count; k++)
            {
                var m = story.Missing[k];
                var missingBook = BookOfMissing(lore, m.Id);
                bool bookRead = Read(evidence, missingBook);
                if (missingBook != null) addCard(BoardCardKind.Clue, ClueCardId(LoreBookRules.ClueIdPrefix + missingBook.Id), missingBook.Id, bookRead);
                foreach (int who in new[] { m.KinIndex, m.WitnessIndex })
                {
                    if (who < 0) continue;
                    bool journalRead = false;
                    foreach (var b in lore.Books) if (b.Role.Length > 0 && story.JournalOwner(b) == who && evidence.BooksRead.Contains(b.Id)) journalRead = true;
                    bool revealed = bookRead || journalRead;
                    addLink(BoardLinkKind.VillagerMissing, SuspectId(who), VictimId(k), revealed);
                    if (revealed) cardIndex[VictimId(k)].Revealed = true;
                }
            }

            foreach (var landmark in VillageLandmarks.Ids)
            {
                bool placeRead = false;
                foreach (var b in lore.Books) if (b.Place == landmark && evidence.BooksRead.Contains(b.Id)) placeRead = true;
                addCard(BoardCardKind.Location, LandmarkId(landmark), landmark, placeRead);
                string legend = null;
                foreach (var l in story.Library.Legends) if (l.Id == landmark) legend = l.Id;
                if (legend == null) continue;
                addCard(BoardCardKind.Clue, LegendPrefix + legend, legend, placeRead);
                addLink(BoardLinkKind.LandmarkLegend, LandmarkId(landmark), LegendPrefix + legend, placeRead);
            }

            var foundClues = new List<string>(evidence.ClueIds);
            foreach (var id in evidence.BooksRead) if (lore.Find(id) != null && lore.Find(id).Clue) foundClues.Add(LoreBookRules.ClueIdPrefix + id);
            foundClues.Sort(string.CompareOrdinal);
            var seenClues = new HashSet<string>();
            foreach (var clueId in foundClues)
            {
                if (!seenClues.Add(clueId)) continue;
                string cardId = ClueCardId(clueId);
                bool existed = cardIndex.ContainsKey(cardId);
                addCard(BoardCardKind.Clue, cardId, clueId, true);
                var placeClue = places == null ? null : places.FindByClue(clueId);
                if (!existed && placeClue != null)
                {
                    foreach (var pl in places.Places) if (pl.Discoveries.Contains(placeClue) && cardIndex.ContainsKey(LandmarkId(pl.Anchor))) addLink(BoardLinkKind.ClueSubject, cardId, LandmarkId(pl.Anchor), true);
                    continue;
                }
                if (existed || !clueId.StartsWith(LoreBookRules.ClueIdPrefix, StringComparison.Ordinal)) continue;
                var book = lore.Find(clueId.Substring(LoreBookRules.ClueIdPrefix.Length));
                if (book != null && cardIndex.ContainsKey(LandmarkId(book.Place))) addLink(BoardLinkKind.ClueSubject, cardId, LandmarkId(book.Place), true);
            }

            var revealedStatements = new HashSet<string>();
            var events = new List<TimelineEvent>();
            foreach (var s in statements.Statements)
            {
                if (!IsRevealed(s, lore, evidence)) continue;
                revealedStatements.Add(s.Id);
                int speaker = SpeakerOf(s, roster, evidence);
                int h = HeardIndex(evidence, s.Id);
                int night = s.Night > 0 ? s.Night : Math.Max(1, h >= 0 ? evidence.Heard[h].Night : 1);
                var card = addCard(BoardCardKind.Event, EventId(s.Id), s.Id, true);
                card.Invalidated = Corrupted(StageOf(corruption, speaker));
                board.Scores.Add(new StatementScore { StatementId = s.Id, Confidence = s.Confidence, Belief = BeliefScore(s.Confidence, card.Invalidated) });
                events.Add(new TimelineEvent { StatementId = s.Id, Villager = speaker, Night = night, Minute = s.Minute });
            }
            board.Timeline = OrderTimeline(events);

            foreach (var c in statements.Contradictions)
            {
                if (!revealedStatements.Contains(c.A) || !revealedStatements.Contains(c.B)) continue;
                if (c.Needs == ContradictionNeeds.CorruptedSpeaker && !Corrupted(StageOf(corruption, SpeakerOf(statements.Find(c.B), roster, evidence)))) continue;
                var pair = new BoardContradiction { PairId = c.Id, CardA = EventId(c.A), CardB = EventId(c.B) };
                if (c.ResolvesAtKnowledge > 0 && knowledge >= c.ResolvesAtKnowledge) board.Resolutions.Add(pair);
                else board.Contradictions.Add(pair);
            }
            if (mythos != null && mythos.Current != null) AddMythos(board, mythos, evidence, corruption, addCard, events);
            return board;
        }

        private static void AddMythos(InvestigationBoard board, MythosFeed mythos, InvestigationEvidence evidence, IList<CorruptionStage> corruption,
                                      Func<BoardCardKind, string, string, bool, BoardCard> addCard, List<TimelineEvent> events)
        {
            var heard = new HashSet<string>();
            foreach (var s in MythosRules.Statements(mythos))
            {
                int h = HeardIndex(evidence, s.Id);
                if (h < 0) continue;
                int speaker = evidence.Heard[h].Villager;
                var card = addCard(BoardCardKind.Event, EventId(s.Id), s.Id, true);
                card.Invalidated = Corrupted(StageOf(corruption, speaker)) || (s.Rumor != null && MythosRules.IsDistorted(s.Rumor, speaker));
                heard.Add(s.Id);
                events.Add(new TimelineEvent { StatementId = s.Id, Villager = speaker, Night = s.Night, Minute = s.Minute });
                if (s.Rumor == null || !MythosRules.IsDistorted(s.Rumor, speaker)) continue;
                string truth = MythosRules.TruthStatementId(s.Rumor);
                if (truth.Length > 0 && HeardIndex(evidence, truth) >= 0)
                    board.Contradictions.Add(new BoardContradiction { PairId = s.Id + "~" + truth, CardA = EventId(s.Id), CardB = EventId(truth) });
            }
            board.Timeline = OrderTimeline(events);
        }

        /// <summary>The text a card shows in a language, built from the story's own names (round 24 seeded names through <paramref name="nameLib"/> when given).</summary>
        public static string CardTitle(BoardCard card, VillageStory story, LoreLibrary lore, StatementLibrary statements, NameLibrary nameLib, string lang)
        {
            return CardTitle(card, story, lore, statements, nameLib, lang, null);
        }

        /// <summary>As above; an Event card of a mythos statement takes its wording from <paramref name="mythos"/>.</summary>
        public static string CardTitle(BoardCard card, VillageStory story, LoreLibrary lore, StatementLibrary statements, NameLibrary nameLib, string lang, MythosFeed mythos)
        {
            return CardTitle(card, story, lore, statements, nameLib, lang, mythos, null);
        }

        /// <summary>As above; a Clue card of a place clue shows the title of its discovery.</summary>
        public static string CardTitle(BoardCard card, VillageStory story, LoreLibrary lore, StatementLibrary statements, NameLibrary nameLib, string lang, MythosFeed mythos, PlaceLibrary places)
        {
            switch (card.Kind)
            {
                case BoardCardKind.Suspect: return story.Roster[int.Parse(card.Key)].Name;
                case BoardCardKind.Victim:
                    var m = story.Missing[int.Parse(card.Key)];
                    return story.Library.Missing[m.DataIndex].Given.Get(lang) + " " + story.Families[m.FamilyIndex].Surname;
                case BoardCardKind.Location:
                    if (card.Id.StartsWith(LandmarkPrefix, StringComparison.Ordinal))
                    {
                        var seeded = nameLib == null ? null : VillageNames.Landmark(nameLib, story.Seed, card.Key);
                        return seeded != null ? seeded.Get(lang) : VillageLandmarks.Name(card.Key, lang);
                    }
                    int piece = int.Parse(card.Key);
                    return story.PieceName(piece, lang, story.OwnerSurname(piece));
                case BoardCardKind.Clue:
                    if (card.Id.StartsWith(LegendPrefix, StringComparison.Ordinal))
                        foreach (var l in story.Library.Legends) if (l.Id == card.Key) return l.Title.Get(lang);
                    var placeClue = places == null ? null : places.FindByClue(card.Key);
                    if (placeClue != null) return placeClue.Title.Get(lang);
                    var book = lore.Find(card.Key.StartsWith(LoreBookRules.ClueIdPrefix, StringComparison.Ordinal) ? card.Key.Substring(LoreBookRules.ClueIdPrefix.Length) : card.Key);
                    return book == null ? card.Key : story.BookTitle(book, lang);
                default:
                    if (mythos != null && card.Key.StartsWith(MythosRules.IdPrefix, StringComparison.Ordinal))
                        foreach (var ms in MythosRules.Statements(mythos)) if (ms.Id == card.Key) return MythosRules.Text(mythos, story, ms, card.Invalidated, lang);
                    var s = statements.Find(card.Key);
                    return s == null ? card.Key : s.Text.Get(lang);
            }
        }
    }
}
