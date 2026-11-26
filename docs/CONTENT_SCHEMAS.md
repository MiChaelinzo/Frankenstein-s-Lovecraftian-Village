# Content schemas

Quests, rumors and events can be authored as JSON, so people and AI agents can add many of them without touching code. Files live in `Packages/com.michaelinzo.frankenstein-village/Data/content/`. `python3 tools/validate_repo.py` (module `tools/content_schemas.py`) checks every `*.json` there. Errors name the file, the item and the field, for example `events.json: event 'x': field 'night': must be an integer 1..99`.

**Status: Verified** for the validator (`tools/test_content_schemas.py`) and for the loaders (Core `ContentLibrary`, `web/src/content.js`, golden key `content`). Both loaders enforce one effect rule: only `dread` and `sanity` keys, with integer values from -100 through 100. In play only events are used: the chronicle lists an authored event on its night when that night's new omen equals its `condition` and the player heard the omen. The checked-in `wrong_stars_night_3` event is reachable in the five-night seed 1818 campaign and has live browser coverage in English and French. Quests and rumors load but nothing consumes them yet, and event `effects` are parsed, never applied (not built). Copies of the files live in `web/data/content/` and `validate_repo.py` checks they match.

## File shape

Each file is `{ "version": 1, "quests": [...], "rumors": [...], "events": [...] }`. Any of the three lists may be present. Ids are lowercase snake_case (`^[a-z][a-z0-9_]*$`) and unique per kind across all files.

## Text

Every player facing text is `en` and `fr`, both required and non empty. No em dash (U+2014) anywhere. French in this repo is written without accents, like the existing data.

## Quest (`quests`)

| Field | Type | Constraint |
|---|---|---|
| `id` | string | unique, for example `missing_fisher_01` |
| `theory` | list of string | non empty, each `<template id>.<option id>` from `Data/theories.json`, for example `missing.dead` |
| `evidence` | list of string | non empty, each a statement id from `Data/statements.json` |
| `conclusions` | list | non empty. Each item: `theory` (one of this quest's `theory` ids), `en`, `fr` |

## Rumor (`rumors`)

| Field | Type | Constraint |
|---|---|---|
| `id` | string | unique |
| `truth` | bool | whether the first telling is the truth, as `truth` in `Data/mythos.json` rumors |
| `mutations` | list | non empty. Each item `{ "en", "fr" }`, ordered from the first telling to the most distorted, as the simulation distorts a rumor hop by hop |

## Event (`events`)

| Field | Type | Constraint |
|---|---|---|
| `id` | string | unique |
| `night` | int | 1..99 |
| `condition` | string | an omen id from `Data/mythos.json` (`tide_wrong`, `stars_wrong`, `bell_unrung`, `black_tide`) |
| `text` | object | `en` and `fr` |
| `effects` | object, optional | keys `dread` and `sanity` only, integers within -100..100 |

## Examples

See `Data/content/quests.json` (`missing_fisher_01`), `rumors.json` (`black_water_harbour`) and `events.json` (`wrong_stars_night_3`).

```json
{ "version": 1, "events": [ {
  "id": "wrong_stars_night_3", "night": 3, "condition": "stars_wrong",
  "text": { "en": "...", "fr": "..." }, "effects": { "dread": 5 } } ] }
```

## Adding content

1. Add items to a file in `Data/content/`. A new file needs `.meta` files: `python3 tools/gen_package_meta.py`.
2. Run `python3 tools/validate_repo.py` and `python3 tools/test_content_schemas.py`.
