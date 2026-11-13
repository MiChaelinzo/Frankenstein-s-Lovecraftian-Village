using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>
    /// Engine-free villager wording (role names and dialogue). Keys and values are the same as the villager.* entries of
    /// web/src/i18n.js (the web table is the wording source; a test parses that file and fails when a language drifts).
    /// Lines are display only: the talk rules in <see cref="VillagerRules"/> never read them. Unknown languages fall back to English.
    /// </summary>
    public static class VillagerStrings
    {
        public const string DefaultLanguage = "en";
        /// <summary>Greeting variants per role (<see cref="VillagerRules.LineVariants"/>).</summary>
        public const int GreetingVariants = 2;

        public static readonly string[] Languages = { "en", "fr" };

        public static readonly string[] Keys =
        {
            "villager.role.fisher", "villager.role.priest", "villager.role.innkeeper", "villager.role.lamplighter",
            "villager.role.lighthouse_keeper", "villager.role.widow", "villager.role.child",
            "villager.greet.fisher.0", "villager.greet.fisher.1", "villager.greet.priest.0", "villager.greet.priest.1",
            "villager.greet.innkeeper.0", "villager.greet.innkeeper.1", "villager.greet.lamplighter.0", "villager.greet.lamplighter.1",
            "villager.greet.lighthouse_keeper.0", "villager.greet.lighthouse_keeper.1", "villager.greet.widow.0", "villager.greet.widow.1",
            "villager.greet.child.0", "villager.greet.child.1",
            "villager.phrase.fisher", "villager.phrase.priest", "villager.phrase.innkeeper", "villager.phrase.lamplighter",
            "villager.phrase.lighthouse_keeper", "villager.phrase.widow", "villager.phrase.child",
            "villager.window", "villager.sea", "villager.gone",
        };

        private static readonly Dictionary<string, string[]> Table = new Dictionary<string, string[]>
        {
            { "en", new[]
            {
                "Fisher", "Priest", "Innkeeper", "Lamplighter", "Lighthouse keeper", "Widow", "Child",
                "The nets come up empty, but heavy.", "I do not fish past the third buoy any more.",
                "The bells ring when no one pulls them.", "Pray quietly. The walls listen.",
                "There is always a room for you. Do not ask who had it before.", "The ale is fine. The cellar is not.",
                "I light them all and the dark still finds a way in.", "Count the lamps with me. Never mind the missing one.",
                "The light turns, but the sea does not look away.", "I stopped logging the ships. They stopped logging me.",
                "He went down to the water and came back different.", "Leave a candle in the window. Someone is out there.",
                "Do you hear the humming? The well sings to me.", "The grown-ups pretend not to see it.",
                "The tide is counting.", "He is not done listening.", "Another room, another name.", "Light, and light, and light.",
                "It turns and turns and turns.", "He is still down there.", "Do not whisper back.",
                "{name} stands at the window and does not blink.", "{name} faces the sea and does not answer.", "No one is there. The door is still warm.",
            } },
            { "fr", new[]
            {
                "Pecheur", "Pretre", "Aubergiste", "Allumeur de lanternes", "Gardien du phare", "Veuve", "Enfant",
                "Les filets remontent vides, mais lourds.", "Je ne peche plus au-dela de la troisieme bouee.",
                "Les cloches sonnent sans que personne ne les tire.", "Priez doucement. Les murs ecoutent.",
                "Il y a toujours une chambre pour vous. Ne demandez pas qui l'avait avant.", "La biere est bonne. La cave ne l'est pas.",
                "Je les allume toutes et l'obscurite trouve quand meme un passage.", "Comptez les lampes avec moi. Oubliez celle qui manque.",
                "Le feu tourne, mais la mer ne detourne pas le regard.", "J'ai cesse de noter les navires. Ils ont cesse de me noter.",
                "Il est descendu a l'eau et il est revenu different.", "Laissez une bougie a la fenetre. Quelqu'un est dehors.",
                "Vous entendez le bourdonnement? Le puits me chante.", "Les grands font semblant de ne pas le voir.",
                "La maree compte.", "Il n'a pas fini d'ecouter.", "Une autre chambre, un autre nom.", "De la lumiere, et de la lumiere, et de la lumiere.",
                "Elle tourne et tourne et tourne.", "Il est toujours la-bas.", "Ne chuchotez pas en retour.",
                "{name} se tient a la fenetre et ne cligne pas.", "{name} fait face a la mer et ne repond pas.", "Personne n'est la. La porte est encore chaude.",
            } },
        };

        public const string NamePlaceholder = "{name}";

        /// <summary>Raw template, English when the language is unknown, null when the key is unknown.</summary>
        public static string Template(string language, string key)
        {
            int index = System.Array.IndexOf(Keys, key);
            if (index < 0) return null;
            string[] row;
            if (language == null || !Table.TryGetValue(language, out row)) row = Table[DefaultLanguage];
            return row[index];
        }

        public static string RoleName(string language, VillagerRole role)
        {
            return Template(language, "villager.role." + VillagerRules.RoleIds[(int)role]);
        }

        /// <summary>
        /// The line a talk result shows, chosen only from the result's behavior and line variant plus the villager's role and name.
        /// Normal speech is a greeting, then the window, sea and phrase lines; a vanished villager gives the empty-house line.
        /// </summary>
        public static string Line(string language, VillagerRole role, VillagerBehavior behavior, int lineVariant, string villagerName)
        {
            string id = VillagerRules.RoleIds[(int)role];
            string key;
            switch (behavior)
            {
                case VillagerBehavior.AtWindow: key = "villager.window"; break;
                case VillagerBehavior.FacingSea: key = "villager.sea"; break;
                case VillagerBehavior.RepeatingPhrase: key = "villager.phrase." + id; break;
                case VillagerBehavior.Vanished: key = "villager.gone"; break;
                default: key = "villager.greet." + id + "." + (lineVariant == 0 ? 0 : 1); break;
            }
            return Template(language, key).Replace(NamePlaceholder, villagerName ?? "");
        }
    }
}
