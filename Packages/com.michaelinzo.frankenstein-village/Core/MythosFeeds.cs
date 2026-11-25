using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>The simulation as the investigation board and chat see it: the data, the run and the night the player is on.</summary>
    public sealed class MythosFeed
    {
        public MythosLibrary Library;
        public MythosState State;
        public int Night;

        public MythosNight Current { get { return State.AtNight(Night); } }
    }

    /// <summary>A thing the player can learn about the mythos. Heard from a villager it becomes an Event card, with the id as the statement id.</summary>
    public sealed class MythosStatement
    {
        public string Id;
        public MythosEventKind Kind;
        /// <summary>Roster index (secret, cult), omen index or missing person index, as in the event it came from.</summary>
        public int Subject;
        public int Night;
        public int Minute;
        /// <summary>Set for rumors: the rumor as of the feed night.</summary>
        public MythosRumor Rumor;
    }

    /// <summary>Statement ids, texts and the pressure the mythos puts on the player's standing. Pure and deterministic; wording never decides anything.</summary>
    public static class MythosRules
    {
        public const string IdPrefix = "mythos:";
        public const string SecretPrefix = "mythos:secret:", RumorPrefix = "mythos:rumor:", OmenPrefix = "mythos:omen:", CultPrefix = "mythos:cult:";
        /// <summary>In-world clock minute of each kind of statement on the timeline (all inside one day).</summary>
        public const int SecretMinute = 1260, CultMinute = 1320, OmenMinute = 1380, RumorMinute = 1200;
        /// <summary>Suspicion per mille an exposed secret and a cult tie each add to a villager.</summary>
        public const int ExposedSecretSuspicion = 150, CultTieSuspicion = 100;

        public static string SecretId(int villager) { return SecretPrefix + villager; }
        public static string RumorId(int night) { return RumorPrefix + night; }
        public static string OmenId(int night) { return OmenPrefix + night; }
        public static string CultId(int villager) { return CultPrefix + villager; }

        /// <summary>Every statement the mythos holds up to the feed night, in event order.</summary>
        public static List<MythosStatement> Statements(MythosFeed feed)
        {
            var list = new List<MythosStatement>();
            var current = feed.Current;
            if (current == null) return list;
            for (int night = 1; night <= current.Night; night++)
                foreach (var e in feed.State.AtNight(night).Events)
                {
                    switch (e.Kind)
                    {
                        case MythosEventKind.SecretExposed: list.Add(new MythosStatement { Id = SecretId(e.Subject), Kind = e.Kind, Subject = e.Subject, Night = e.Night, Minute = SecretMinute }); break;
                        case MythosEventKind.CosmicOmen: list.Add(new MythosStatement { Id = OmenId(e.Night), Kind = e.Kind, Subject = e.Other, Night = e.Night, Minute = OmenMinute }); break;
                        case MythosEventKind.CultFounded:
                        case MythosEventKind.CultJoined: list.Add(new MythosStatement { Id = CultId(e.Subject), Kind = e.Kind, Subject = e.Subject, Night = e.Night, Minute = CultMinute }); break;
                        default:
                            MythosRumor rumor = null;
                            foreach (var r in current.Rumors) if (r.Id == e.Night) rumor = r;
                            list.Add(new MythosStatement { Id = RumorId(e.Night), Kind = e.Kind, Subject = e.Other, Night = e.Night, Minute = RumorMinute, Rumor = rumor });
                            break;
                    }
                }
            return list;
        }

        /// <summary>Whether villager <paramref name="speaker"/> passes this rumor on distorted. A villager who does not hold the rumor is not counted as distorting it.</summary>
        public static bool IsDistorted(MythosRumor rumor, int speaker)
        {
            if (rumor == null) return false;
            foreach (var h in rumor.Holders) if (h.Villager == speaker) return !h.Truth;
            return false;
        }

        /// <summary>The statement a distorted rumor is contradicted by (the exposed secret or the omen it is about), or "" for a missing person rumor.</summary>
        public static string TruthStatementId(MythosRumor rumor)
        {
            if (rumor.Source == RumorSource.Secret) return SecretId(rumor.Subject);
            return rumor.Source == RumorSource.Cosmic ? OmenId(rumor.Night) : "";
        }

        /// <summary>The wording of a statement. <paramref name="distorted"/> only matters for rumors. A rumor with no authored line falls back to the story's own rumor for its night, stage and tier.</summary>
        public static string Text(MythosFeed feed, VillageStory story, MythosStatement s, bool distorted, string lang)
        {
            var lib = feed.Library;
            var vars = new Dictionary<string, string> { { "village", story.VillageName } };
            switch (s.Kind)
            {
                case MythosEventKind.SecretExposed:
                    vars["name"] = story.Roster[s.Subject].Name;
                    return VillageStory.Render(lib.Secrets[feed.State.SecretKind[s.Subject]].Text.Get(lang), vars);
                case MythosEventKind.CosmicOmen: return VillageStory.Render(lib.Omens[s.Subject].Text.Get(lang), vars);
                case MythosEventKind.CultFounded:
                case MythosEventKind.CultJoined:
                    vars["name"] = story.Roster[s.Subject].Name;
                    vars["cult"] = lib.Cults[CultDataIndexOf(feed, s.Subject)].Text.Get(lang);
                    return VillageStory.Render(lib.CultLine.Get(lang), vars);
                default: return RumorText(feed, story, s.Rumor, distorted, lang);
            }
        }

        private static int CultDataIndexOf(MythosFeed feed, int villager)
        {
            var current = feed.Current;
            for (int c = 0; c < current.CultMembers.Count; c++)
                if (current.CultMembers[c].Contains(villager)) return feed.State.Cults[c].DataIndex;
            return 0;
        }

        /// <summary>The secret kind or omen id a rumor tells ("" for a missing person), as in <see cref="MythosRumorLine.Ref"/>.</summary>
        public static string RumorRef(MythosFeed feed, MythosRumor rumor)
        {
            return rumor.Source == RumorSource.Secret ? feed.Library.Secrets[feed.State.SecretKind[rumor.Subject]].Id
                 : rumor.Source == RumorSource.Cosmic ? feed.Library.Omens[rumor.Subject].Id : "";
        }

        /// <summary>The line of a rumor: an authored line of its source and subject kind with the requested truth, picked by seed and night; else <see cref="VillageStory.RumorText"/>.</summary>
        public static string RumorText(MythosFeed feed, VillageStory story, MythosRumor rumor, bool distorted, string lang)
        {
            var eligible = new List<MythosRumorLine>();
            string refId = RumorRef(feed, rumor);
            foreach (var l in feed.Library.Rumors) if (l.Source == rumor.Source && l.Ref == refId && l.Truth == !distorted) eligible.Add(l);
            if (eligible.Count == 0) return story.RumorText(rumor.Night, rumor.Stage, rumor.Tier, lang);
            var line = eligible[new SeededRandom(story.Seed ^ MythosSimulation.RumorPickStream ^ (rumor.Night * VillageSociety.IndexStep)).Next(eligible.Count)];
            var vars = new Dictionary<string, string> { { "village", story.VillageName } };
            if (rumor.Source == RumorSource.Secret) vars["name"] = story.Roster[rumor.Subject].Name;
            if (rumor.Source == RumorSource.Missing) foreach (var kv in story.MissingVars(story.Missing[rumor.Subject], lang)) vars[kv.Key] = kv.Value;
            return VillageStory.Render(line.Text.Get(lang), vars);
        }
    }

    /// <summary>What the mythos does to the player's standing: villagers with an exposed secret or a cult tie are warier of everyone's questions, so their suspicion rises.</summary>
    public static class MythosSociety
    {
        /// <summary>Extra suspicion (per mille) of each villager after a night. A villager with both gets both.</summary>
        public static int[] SuspicionPressure(MythosNight night, int villagers)
        {
            var pressure = new int[villagers];
            if (night == null) return pressure;
            foreach (int v in night.Exposed) if (v >= 0 && v < villagers) pressure[v] += MythosRules.ExposedSecretSuspicion;
            foreach (var members in night.CultMembers) foreach (int v in members) if (v >= 0 && v < villagers) pressure[v] += MythosRules.CultTieSuspicion;
            return pressure;
        }
    }

    /// <summary>A mythos statement a villager told in a chat: the statement id and its wording.</summary>
    public sealed class MythosChatLine
    {
        public string Id;
        public string Text;
    }

    /// <summary>
    /// What a lucid villager can tell the player in a village chat (moved from the web client in round 28): the newest rumor they hold, the truth behind it when they started it,
    /// and a cult member among their links. Nothing for a suspicious, withheld or corrupted chat, so the player only learns what a villager could honestly say.
    /// Round 36 (spec 181): with a <see cref="RumorMutationLibrary"/> the rumor is told as it has drifted by the night, and the true account joins it at the knowledge tier gate.
    /// </summary>
    public static class MythosChat
    {
        public static List<MythosChatLine> Lines(VillageSociety society, MythosFeed feed, VillageStory story, int index, TrustTier tier, int night1, VillagerChatResult result, string lang, RumorMutationLibrary mutations = null, int knowledgeTier = 0)
        {
            var lines = new List<MythosChatLine>();
            if (society == null || feed == null || story == null || feed.Current == null) return lines;
            if (index < 0 || index >= society.Roster.Count) return lines;
            if (!result.Available || result.Behavior != VillagerBehavior.Normal || result.Withheld || tier == TrustTier.Suspicious) return lines;
            if (!(result.HintId == "village" || (tier == TrustTier.Trusting && !string.IsNullOrEmpty(result.HintId)))) return lines;
            var all = MythosRules.Statements(feed);
            var ids = new List<string>();
            MythosStatement rumor = null;
            foreach (var m in all)
            {
                if (m.Rumor == null || m.Night > night1) continue;
                foreach (var h in m.Rumor.Holders) if (h.Villager == index) { rumor = m; break; }
            }
            if (rumor != null)
            {
                ids.Add(rumor.Id);
                string truth = rumor.Rumor.Origin == index ? MythosRules.TruthStatementId(rumor.Rumor) : "";
                if (truth.Length > 0) ids.Add(truth);
            }
            var members = new HashSet<int>();
            foreach (var cult in feed.Current.CultMembers) foreach (int v in cult) members.Add(v);
            foreach (int j in MythosSimulation.Graph.Build(society).Neighbours[index])
            {
                if (!members.Contains(j) || !all.Exists(m => m.Id == MythosRules.CultId(j))) continue;
                ids.Add(MythosRules.CultId(j));
                break;
            }
            foreach (var id in ids)
            {
                var m = all.Find(x => x.Id == id);
                if (m == null) continue;
                string text = "";
                if (mutations != null && m.Rumor != null && id == m.Id)
                {
                    var asOf = feed.State.AtNight(Math.Min(night1, feed.Night));
                    text = RumorMutation.Text(mutations, m.Rumor, MythosRules.RumorRef(feed, m.Rumor), story.Seed, Math.Max(0, night1 - m.Night), RumorMutation.Exposure(asOf), knowledgeTier, lang);
                }
                if (text.Length == 0) text = MythosRules.Text(feed, story, m, MythosRules.IsDistorted(m.Rumor, index), lang);
                lines.Add(new MythosChatLine { Id = id, Text = text });
            }
            return lines;
        }
    }
}
