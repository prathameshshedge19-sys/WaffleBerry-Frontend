# Interface languages

English, German, French, Hindi and Marathi are available from the language bar
at the top of the home page and from the language selector in Help. The choice
is saved under `legarya:ui-language` in local storage, persists across pages and
reloads in the same browser, and synchronizes across open tabs. It is not an
account-level preference synchronized between devices.

`js/i18n.js` loads a static same-origin dictionary, updates the document language,
translates text nodes and accessible attributes, and observes dynamically
created UI. Original text is retained in weak maps so switching back to English
does not reconstruct forms or discard event handlers, drafts, file selections,
or application state. Placeholder captures preserve names, numbers, filenames
and codes. Named content regions and `translate="no"` / `data-i18n-skip` opt out.
Messages, saved memories, source excerpts, names and user-entered values are
content, not UI translations. There is no runtime translation API.

Native OS/browser dialogs (such as the file picker) use the device's language;
the file-selection control on the page is localized. Hindi and Marathi UI copy
uses Devanagari, including Help, Media and product names. Native language names
remain recognizable in every selector. Technical codes, file formats and URLs
retain their literal spelling.

Catalogs: `locales/{de,fr,hi,mr}.json`. `locales/source.json` records inventoried
public HTML and JavaScript UI literals. `locales/overrides.json` is the reviewed
terminology layer (language order: de, fr, hi, mr); it must be merged last when
regenerating catalogs. Add new user-facing strings to all four dictionaries.
Keep numbered placeholders unchanged. Prefer whole sentences rather than
splitting translatable copy around line breaks.

Build tooling uses optional Acorn and parse5 dependencies located through
`I18N_PARSER_ROOT`. `tools/extract-i18n.mjs` prints the UI inventory without
reading backend data. `tools/generate-translations.mjs` is an explicitly
authorized, build-time-only API tool: it accepts a credential environment path,
sends UI literals only to OpenAI with response storage disabled, checks every
placeholder, and writes generated build artifacts. It never embeds credentials
in the site. Runtime assets contain no key or service dependency. Generation
must not be run as part of page loading or deployment builds.

Validation: `tests/i18n.test.mjs` checks catalog coverage and placeholders;
`tests/i18n-browser.mjs` exercises all public pages, language persistence,
dynamic text, Help/tutorials, file selection, original-content protection,
switching back to English and mobile layout using isolated API fixtures.
