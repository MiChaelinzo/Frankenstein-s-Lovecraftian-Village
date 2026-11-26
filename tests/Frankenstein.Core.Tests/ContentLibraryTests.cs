using System;
using System.IO;
using System.Linq;
using Frankenstein.Core;
using Xunit;

namespace Frankenstein.Core.Tests
{
    /// <summary>Round 37 (spec 179): the authored content files load, fail loudly when malformed and equal the JavaScript port (golden key "content").</summary>
    public class ContentLibraryTests
    {
        public static string FileText(string name)
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tools", "validate_repo.py"))) dir = dir.Parent;
            return File.ReadAllText(Path.Combine(dir.FullName, "Packages", "com.michaelinzo.frankenstein-village", "Data", "content", name));
        }

        public static ContentLibrary Library() { return ContentLibrary.Parse(FileText("quests.json"), FileText("rumors.json"), FileText("events.json")); }

        /// <summary>Every parsed field in one line per item, so the golden file pins the whole library.</summary>
        public static string[] Signature(ContentLibrary lib)
        {
            return lib.Quests.Select(q => "quest|" + q.Id + "|" + string.Join(",", q.Theory) + "|" + string.Join(",", q.Evidence) + "|" + string.Join("~", q.Conclusions.Select(c => c.Key + "=" + c.Value.Get("en") + "/" + c.Value.Get("fr"))))
                .Concat(lib.Rumors.Select(r => "rumor|" + r.Id + "|" + r.Truth + "|" + string.Join("~", r.Mutations.Select(m => m.Get("en") + "/" + m.Get("fr")))))
                .Concat(lib.Events.Select(e => "event|" + e.Id + "|" + e.Night + "|" + e.Condition + "|" + e.Text.Get("en") + "/" + e.Text.Get("fr") + "|" + string.Join(",", e.Effects.Select(f => f.Key + "=" + f.Value))))
                .ToArray();
        }

        [Fact]
        public void TheAuthoredFilesLoadWithEveryField()
        {
            var lib = Library();
            Assert.Equal("missing_fisher_01", lib.Quests.Single().Id);
            Assert.Equal(new[] { "missing.dead", "missing.displaced" }, lib.Quests[0].Theory);
            Assert.Contains("never touched", lib.Quests[0].Conclusions["missing.dead"].Get("en"));
            Assert.True(lib.Rumors.Single().Truth);
            Assert.Equal(3, lib.Rumors[0].Mutations.Count);
            var e = lib.Events.Single();
            Assert.Equal(3, e.Night);
            Assert.Equal("stars_wrong", e.Condition);
            Assert.Equal(5, e.Effects["dread"]);
            Assert.Equal(Signature(lib), Signature(Library()));
        }

        [Fact]
        public void EventsAreToldOnTheirNightAndOmenOnly()
        {
            var lib = Library();
            Assert.Single(lib.EventsFor(3, "stars_wrong"));
            Assert.Empty(lib.EventsFor(2, "stars_wrong"));
            Assert.Empty(lib.EventsFor(3, "tide_wrong"));
            Assert.Empty(lib.EventsFor(3, ""));
        }

        [Fact]
        public void AnAbsentFileIsAnEmptyList()
        {
            var lib = ContentLibrary.Parse(null, "", FileText("events.json"));
            Assert.Empty(lib.Quests);
            Assert.Empty(lib.Rumors);
            Assert.Single(lib.Events);
        }

        [Theory]
        [InlineData("{ \"version\": 2, \"events\": [] }", "events.json: field 'version': must be 1")]
        [InlineData("{ \"version\": 1, \"events\": [ { \"id\": \"a\", \"night\": 0, \"condition\": \"x\", \"text\": { \"en\": \"a\", \"fr\": \"b\" } } ] }", "event 'a': field 'night'")]
        [InlineData("{ \"version\": 1, \"events\": [ { \"id\": \"a\", \"night\": 3, \"condition\": \"x\", \"text\": { \"en\": \"a\" } } ] }", "event 'a': field 'text.fr': missing or empty")]
        [InlineData("{ \"version\": 1, \"events\": [ { \"id\": \"a\", \"night\": 3, \"condition\": \"x\", \"text\": { \"en\": \"a\", \"fr\": \"b\" } }, { \"id\": \"a\", \"night\": 3, \"condition\": \"x\", \"text\": { \"en\": \"a\", \"fr\": \"b\" } } ] }", "duplicate id")]
        [InlineData("{ \"version\": 1, \"events\": [ { \"id\": \"a\", \"night\": 3, \"condition\": \"x\", \"text\": { \"en\": \"a\", \"fr\": \"b\" }, \"effects\": { \"dread\": 1.5 } } ] }", "field 'effects.dread': must be an integer within +-100")]
        [InlineData("{ \"version\": 1, \"events\": [ { \"id\": \"a\", \"night\": 3, \"condition\": \"x\", \"text\": { \"en\": \"a\", \"fr\": \"b\" }, \"effects\": { \"dread\": 101 } } ] }", "field 'effects.dread': must be an integer within +-100")]
        [InlineData("{ \"version\": 1, \"events\": [ { \"id\": \"a\", \"night\": 3, \"condition\": \"x\", \"text\": { \"en\": \"a\", \"fr\": \"b\" }, \"effects\": { \"sanity\": -101 } } ] }", "field 'effects.sanity': must be an integer within +-100")]
        [InlineData("{ \"version\": 1, \"events\": [ { \"id\": \"a\", \"night\": 3, \"condition\": \"x\", \"text\": { \"en\": \"a\", \"fr\": \"b\" }, \"effects\": { \"gold\": 1 } } ] }", "field 'effects.gold': unknown effect")]
        public void MalformedEventsNameTheFileItemAndField(string json, string expected)
        {
            var ex = Assert.Throws<FormatException>(() => ContentLibrary.Parse(null, null, json));
            Assert.Contains(expected, ex.Message);
        }

        [Fact]
        public void MalformedQuestsAndRumorsAreRejected()
        {
            Assert.Throws<FormatException>(() => ContentLibrary.Parse("{ \"version\": 1, \"quests\": [ { \"id\": \"q\", \"theory\": [\"a.b\"], \"evidence\": [\"s\"], \"conclusions\": [ { \"theory\": \"a.c\", \"en\": \"x\", \"fr\": \"y\" } ] } ] }", null, null));
            Assert.Throws<FormatException>(() => ContentLibrary.Parse(null, "{ \"version\": 1, \"rumors\": [ { \"id\": \"r\", \"truth\": \"yes\", \"mutations\": [ { \"en\": \"x\", \"fr\": \"y\" } ] } ] }", null));
            Assert.Throws<FormatException>(() => ContentLibrary.Parse(null, "{ \"version\": 1, \"rumors\": [ { \"id\": \"r\", \"truth\": true, \"mutations\": [] } ] }", null));
        }
    }
}
