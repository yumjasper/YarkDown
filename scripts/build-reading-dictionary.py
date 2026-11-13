import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://github.com/ahpxex/open-dictionary/releases/download/v2.0/distribution.jsonl.gz'
SOURCE_SHA256 = '69af69cdc685b5dce465613d1cc8fffb598eb46714f57cf73bd6606c2ceb7e43'
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.tools/open-dictionary-v2.jsonl.gz'
output = ROOT / 'packages/desktop/static/reading-dictionary'
output.mkdir(parents=True, exist_ok=True)
if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
    raise ValueError('Open Dictionary v2.0 checksum mismatch')


def key(word):
    word = re.sub(r'\s+', ' ', word.replace('’', "'").lower().strip())
    return word if re.fullmatch(r"[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){0,7}", word) else None


prefixes = {'noun': 'n.', 'verb': 'v.', 'adj': 'adj.', 'adv': 'adv.',
            'name': 'prop.', 'det': 'det.', 'prep': 'prep.', 'pron': 'pron.',
            'conj': 'conj.', 'intj': 'intj.', 'num': 'num.', 'phrase': ''}
priorities = {'core': 0, 'common': 1, 'rare': 2}
entries, notes, forms = {}, {}, {}
raw_rows = 0
with gzip.open(source, 'rt', encoding='utf-8') as stream:
    for line in stream:
        row = json.loads(line)
        raw_rows += 1
        if row['schema_version'] != 'distribution_entry_v5' or row['definition_language']['code'] != 'zh-Hans':
            raise ValueError('Unsupported dictionary contract')
        word = key(row['normalized_headword'])
        if not word:
            continue
        candidates, phonetic = [], ''
        for group in row['pos_groups']:
            pronunciations = group.get('pronunciations', [])
            if not phonetic:
                phonetic = next((p['ipa'] for p in pronunciations if p.get('ipa')), '')
            for form in group.get('forms', []):
                name = key(form['text'])
                if name and name != word and ' ' not in name:
                    # Do not turn periphrastic forms (more generative) into word aliases.
                    forms.setdefault(name, []).append(word)
            for meaning in group['meanings']:
                gloss = (meaning.get('short_gloss') or meaning['learner_explanation']).strip()
                explanation = meaning['learner_explanation'].strip()
                priority = meaning['priority']
                if priority not in priorities or not explanation:
                    raise ValueError('Invalid meaning: ' + word)
                candidates.append((priorities[priority], prefixes.get(group['pos'], ''), gloss, explanation, priority))
        candidates.sort(key=lambda item: item[0])
        senses, details, seen = [], [], set()
        for _, prefix, gloss, explanation, priority in candidates:
            sense = prefix + ' ' + gloss if prefix else gloss
            identity = (sense, explanation)
            if identity in seen:
                continue
            seen.add(identity)
            senses.append(sense)
            details.append([explanation, priority])
        if senses:
            entries[word] = [phonetic, senses]
            notes[word] = details
aliases = {}
for form, lemmas in forms.items():
    valid = list(dict.fromkeys(lemma for lemma in lemmas if lemma in entries))
    # Some prefixed entries repeat an unprefixed verb's forms upstream.
    # Prefer the sole unprefixed lemma, but leave genuinely ambiguous forms unset.
    unprefixed = [lemma for lemma in valid if '-' not in lemma and ' ' not in lemma]
    if len(unprefixed) == 1:
        aliases[form] = unprefixed[0]
    elif len(valid) == 1:
        aliases[form] = valid[0]
# Keep the established common-word filter separate from dictionary definitions.
# This frozen list is corpus ranking data, not a retained ECDICT definition fallback.
common_path = output / 'common-words.json'
if not common_path.exists():
    with gzip.open(output / 'dictionary.json.gz', 'rt', encoding='utf-8') as stream:
        common = json.load(stream)['common']
    common_path.write_text(json.dumps({'source': 'ECDICT BNC ranking (MIT), frozen frequency filter only',
                                      'common': common}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
common = json.loads(common_path.read_text(encoding='utf-8'))['common']
if len(set(common)) != 1000:
    raise ValueError('Expected 1000 common lemmas')
data = {'entries': entries, 'aliases': aliases, 'common': common,
        'generalSource': 'Open Dictionary v2.0 / Wiktionary', 'generalNotes': notes,
        'wholeGlosses': True}
encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
with (output / 'dictionary.json.gz').open('wb') as target:
    with gzip.GzipFile(filename='', mode='wb', fileobj=target, mtime=0) as compressed:
        compressed.write(encoded)
metadata = {'source': SOURCE_URL, 'release': 'v2.0', 'publishedAt': '2026-08-05',
            'sourceSha256': SOURCE_SHA256, 'rawRows': raw_rows, 'entries': len(entries),
            'aliases': len(aliases), 'commonWords': len(common), 'license': 'CC BY-SA 4.0',
            'changes': 'ASCII English words and up to eight-word phrases; preserve every meaning and learner explanation, dotted POS prefixes and core/common/rare ordering; omit examples and relations from compact reading index; unique inflection aliases only. Static upstream-generated definitions; no runtime LLM. BNC common list remains a separate frozen MIT frequency filter.'}
(output / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=False, indent=2))
