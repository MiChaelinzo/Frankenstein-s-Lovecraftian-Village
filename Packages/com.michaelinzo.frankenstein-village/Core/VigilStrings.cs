using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// Engine-free vigil wording for the Unity HUD and ending panel. Keys and values are the same as the vigil.* entries of
    /// web/src/i18n.js (the web table is the wording source; a test in tests/Frankenstein.Core.Tests parses that file and
    /// fails when any language here drifts from it). "{name}"-style placeholders are filled by <see cref="Format"/>.
    /// Unknown languages fall back to English.
    /// </summary>
    public static class VigilStrings
    {
        public const string DefaultLanguage = "en";

        public static readonly string[] Languages = { "en", "fr" };

        public static readonly string[] Keys =
        {
            "vigil.ending.hollowing",
            "vigil.ending.name_spoken",
            "vigil.ending.dawn",
            "vigil.ending.fever",
            "vigil.ending.witness",
            "vigil.ending.vessel",
            "vigil.title.hollowing",
            "vigil.title.name_spoken",
            "vigil.title.dawn",
            "vigil.title.fever",
            "vigil.title.witness",
            "vigil.title.vessel",
            "vigil.rank.0",
            "vigil.rank.1",
            "vigil.rank.2",
            "vigil.rank.3",
            "vigil.rank.4",
            "vigil.objective",
            "vigil.endure",
            "vigil.finish",
            "vigil.endure.ready",
            "vigil.lock",
            "vigil.night",
            "vigil.creep",
            "vigil.end.score",
            "vigil.end.name",
            "vigil.end.stats",
            "vigil.endure.day",
            "vigil.dawn.missed",
        };

        private static readonly Dictionary<string, string[]> Table = new Dictionary<string, string[]>
        {
            { "en", new[]
            {
                "They found you at the water's edge in the morning, kneeling, and none of them could say whose face you wore.",
                "You said the name aloud and the sea went quiet, as one does for a creditor who has finally been paid.",
                "The sun came up on a village that remembered nothing. You walked out before it could remember you.",
                "You left with the name half spoken. It still moves your lips, in your sleep, in the wrong language.",
                "You watched the ritual finish and kept your mind. The village will never forgive you for having seen.",
                "The ritual closed around you like a hand. Something wears your shape and walks home in your place.",
                "Hollowed",
                "The Name Spoken",
                "Dawn Without Memory",
                "The Fever Name",
                "The Witness",
                "The Vessel",
                "Forgotten",
                "Watcher",
                "Keeper",
                "Reader",
                "Namer",
                "Night {night} of {nights}: clues {clues}/{target}, lanterns lit {lit}/{lamps}, the name: {name}",
                "Endure the night (E)",
                "End the vigil (E)",
                "Enough has been heard. The night can be endured.",
                "The vigil binds you. End it to tamper.",
                "Night {night} begins. The village remembers you.",
                "The dark takes {n} from you as night {night} begins.",
                "Score {score}, rank {rank}",
                "The name: {name}",
                "Clues {clues}, lanterns {lanterns}, nights endured {nights}/{total}, ritual stage {stage}/{stages}, sanity {sanity}.",
                "The night has not fallen. Endure the night once dusk comes.",
                "Dawn comes and the name is still unheard. The night does not count (sanity -{n}); the clues stay. Watch again at dusk."
            } },
            { "fr", new[]
            {
                "On vous a trouve au bord de l'eau au matin, a genoux, et nul ne put dire quel visage vous portiez.",
                "Vous avez dit le nom a voix haute et la mer s'est tue, comme se tait un creancier enfin paye.",
                "Le soleil s'est leve sur un village qui ne se souvenait de rien. Vous etes parti avant qu'il ne se souvienne de vous.",
                "Vous etes parti avec le nom a demi prononce. Il remue encore vos levres, dans votre sommeil, dans la mauvaise langue.",
                "Vous avez vu le rituel s'acheve et garde la raison. Le village ne vous pardonnera jamais d'avoir vu.",
                "Le rituel s'est referme sur vous comme une main. Quelque chose porte votre forme et rentre chez vous a votre place.",
                "Evide",
                "Le nom prononce",
                "Aube sans memoire",
                "Le nom de fievre",
                "Le temoin",
                "Le receptacle",
                "Oublie",
                "Guetteur",
                "Gardien",
                "Lecteur",
                "Nommeur",
                "Nuit {night} sur {nights} : indices {clues}/{target}, lanternes allumees {lit}/{lamps}, le nom : {name}",
                "Endurer la nuit (E)",
                "Finir la veillee (E)",
                "On en a assez entendu. La nuit peut etre enduree.",
                "La veillee vous lie. Finissez-la pour y toucher.",
                "La nuit {night} commence. Le village se souvient de vous.",
                "Le noir vous prend {n} au debut de la nuit {night}.",
                "Score {score}, rang {rank}",
                "Le nom : {name}",
                "Indices {clues}, lanternes {lanterns}, nuits endurees {nights}/{total}, etape du rituel {stage}/{stages}, raison {sanity}.",
                "La nuit n'est pas tombee. Endurez la nuit quand le crepuscule viendra.",
                "L'aube vient et le nom reste inentendu. La nuit ne compte pas (raison -{n}); les indices restent. Veillez a nouveau au crepuscule."
            } },
        };

        /// <summary>Raw template for a language and key, English when the language is unknown, null when the key is unknown.</summary>
        public static string Template(string language, string key)
        {
            int index = System.Array.IndexOf(Keys, key);
            if (index < 0) return null;
            string[] row;
            if (language == null || !Table.TryGetValue(language, out row)) row = Table[DefaultLanguage];
            return row[index];
        }

        /// <summary>Replaces each "{token}" in the template with its value. Pairs are token, value, token, value.</summary>
        public static string Format(string template, params object[] pairs)
        {
            if (template == null) return "";
            for (int i = 0; i + 1 < pairs.Length; i += 2)
                template = template.Replace("{" + pairs[i] + "}", System.Convert.ToString(pairs[i + 1], System.Globalization.CultureInfo.InvariantCulture));
            return template;
        }

        /// <summary>Localised ending title, e.g. "The Name Spoken". Unknown ids return the id.</summary>
        public static string Title(string language, string endingId) { return Template(language, "vigil.title." + endingId) ?? endingId; }

        /// <summary>Localised epitaph of an ending. Unknown ids return an empty string.</summary>
        public static string Epitaph(string language, string endingId) { return Template(language, "vigil.ending." + endingId) ?? ""; }

        /// <summary>Localised rank name for a rank index (0..4). Out of range returns an empty string.</summary>
        public static string Rank(string language, int rank) { return Template(language, "vigil.rank." + rank) ?? ""; }

        /// <summary>The objective line for the running vigil: night, clues, lanterns and the masked name.</summary>
        public static string Objective(string language, VigilState vigil)
        {
            return Format(Template(language, "vigil.objective"),
                "night", vigil.Night, "nights", vigil.NightsTotal, "clues", vigil.NightClues, "target", vigil.ClueTarget,
                "lit", vigil.NightLanterns, "lamps", VigilRules.LampsPerNight, "name", vigil.RevealedName);
        }

        /// <summary>The score line of the ending panel, e.g. "Score 1840, rank Reader".</summary>
        public static string ScoreLine(string language, VigilOutcome outcome)
        {
            return Format(Template(language, "vigil.end.score"), "score", outcome.Score, "rank", Rank(language, outcome.Rank));
        }

        /// <summary>
        /// The ending panel body, one line each: epitaph, the revealed name, the score line, the run statistics and the shareable
        /// result code. stageCount is the number of ritual stages of the village (shown as "stage n/m").
        /// </summary>
        public static string EndingBody(string language, VigilState vigil, VigilOutcome outcome, int stageCount)
        {
            var lines = new List<string>
            {
                Epitaph(language, outcome.EndingId),
                Format(Template(language, "vigil.end.name"), "name", vigil.RevealedName),
                ScoreLine(language, outcome),
                Format(Template(language, "vigil.end.stats"),
                    "clues", outcome.Clues, "lanterns", outcome.Lanterns, "nights", outcome.NightsEndured, "total", vigil.NightsTotal,
                    "stage", System.Math.Max(0, vigil.RitualStage + 1), "stages", stageCount, "sanity", outcome.Sanity),
                outcome.Code,
            };
            return string.Join("\n", lines);
        }
    }
}
