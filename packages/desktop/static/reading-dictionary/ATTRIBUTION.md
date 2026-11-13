# YarkText reading dictionary attribution

The adapted Open Dictionary data in `dictionary.json.gz` and the combined `reading-bundle.json.gz` is distributed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0). The combined dictionary data is shared under the same license; application source code remains under its existing license. No endorsement is implied.

- English Wiktionary contributors: https://en.wiktionary.org/ (source dictionary, CC BY-SA 4.0 / GFDL).
- Wiktextract: https://github.com/tatuylonen/wiktextract (extraction tool).
- Open Dictionary by ahpx: https://github.com/ahpxex/open-dictionary, v2.0 published 2026-08-05. Data source: https://github.com/ahpxex/open-dictionary/releases/tag/v2.0. See OPEN-DICTIONARY-LICENSE.md and CC-BY-SA-4.0.txt.
- YarkText adaptations: select ASCII English lookup words and phrases of up to eight words; retain all selected meanings and learner explanations, preserve POS and core/common/rare priorities; omit examples, relation graphs and memory hooks from the compact reading index; compile unique inflection aliases and phrase indexes; combine with computing/AI and chemistry terminology; display simplified Chinese through OpenCC. Runtime lookup is entirely offline and uses no LLM or API.
- NAER computing and chemistry academic terminology: https://data.gov.tw/dataset/15416 and https://data.gov.tw/dataset/14845. Open Government Data License 1.0; see NAER-LICENSE.txt and scientific-metadata.json.
- JingHao-Leon AI/LLM Glossary: https://github.com/JingHao-Leon/ai-llm-glossary. MIT; see AI-GLOSSARY-LICENSE.txt.
- YarkText research terms: project-maintained computing/AI and chemistry meanings, MIT.
- The separate frozen BNC common-word ranking list in common-words.json originates from ECDICT, https://github.com/skywind3000/ECDICT, MIT (see LICENSE). It is only a frequency filter: no ECDICT translations are retained as a definition fallback.
- OpenCC code and data licenses are retained in OPENCC-LICENSE.txt, OPENCC-APACHE-LICENSE.txt and OPENCC-DATA-NOTICES.txt.

Rebuildable compact data and checksums are included in the repository under packages/desktop/static/reading-dictionary. Changes and source hashes are recorded in metadata.json, scientific-metadata.json and bundle-metadata.json.
