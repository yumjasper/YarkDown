import csv
import gzip
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.tools'
OUTPUT = ROOT / 'packages/desktop/static/reading-dictionary'
REVISION = 'abc74818e14884f0e28fe6465c2328c68f9aae53'
terms = {}
sources = []

def key(word):
    word = re.sub(r'\s+', ' ', word.replace('–', '-').replace('’', "'").strip().lower())
    return word if re.fullmatch(r"[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){0,7}", word) and len(word) > 1 else None

def add(word, meaning, domain, source, definition=''):
    normalized = key(word)
    if not normalized or not re.search('[\u3400-\u9fff]', meaning):
        return
    item = {'meaning': meaning.strip(), 'domain': domain, 'source': source}
    if definition:
        item['definition'] = definition
    bucket = terms.setdefault(normalized, [])
    if item not in bucket:
        bucket.append(item)

for domain, dataset in [('computing', 15416), ('chemistry', 14845)]:
    path = SOURCE / ('naer-' + domain + '.csv')
    data = path.read_bytes()
    with path.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    if not rows or '英文名稱' not in rows[0] or '中文名稱' not in rows[0]:
        raise ValueError('Not a terminology CSV: ' + str(path))
    for row in rows:
        for english in row['英文名稱'].split(';'):
            add(english, row['中文名稱'], domain, 'NAER')
    sources.append({'name': 'National Academy for Educational Research: ' + domain, 'url': 'https://data.gov.tw/dataset/' + str(dataset), 'license': 'Open Government Data License 1.0', 'sha256': hashlib.sha256(data).hexdigest(), 'rawRows': len(rows)})

for path in sorted((SOURCE / 'modern-ai/docs').glob('*.md')):
    text = path.read_text(encoding='utf-8')
    for block in re.split(r'^### ', text, flags=re.M)[1:]:
        heading = block.splitlines()[0].strip()
        match = re.search(r'\*\*英文\*\*：([^|\n]+)', block)
        if not match:
            continue
        english = match.group(1).strip()
        chinese = re.match(r'([\u3400-\u9fff]+)', heading)
        parenthetical = re.search(r'（([\u3400-\u9fff]+)）', heading)
        if not chinese and not parenthetical:
            continue
        meaning = (chinese or parenthetical).group(1)
        paragraph = block.split('\n\n')
        definition = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', paragraph[1]).strip() if len(paragraph) > 1 else ''
        for name in re.split(r'\s*/\s*', english):
            acronym = re.search(r'\(([^)]+)\)', name)
            add(re.sub(r'\s*\([^)]*\)', '', name), meaning, 'computing', 'AI/LLM Glossary', definition)
            if acronym:
                add(acronym.group(1), meaning, 'computing', 'AI/LLM Glossary', definition)
sources.append({'name': 'JingHao-Leon AI/LLM Glossary', 'url': 'https://github.com/JingHao-Leon/ai-llm-glossary', 'revision': REVISION, 'license': 'MIT'})

curated = json.loads((OUTPUT / 'research-overrides.json').read_text(encoding='utf-8'))
for word, items in curated['entries'].items():
    existing = terms.pop(word, [])
    for item in items:
        if item['domain'] in ('computing', 'chemistry'):
            add(word, item['meaning'], item['domain'], 'YarkText research terms')
    if word in terms:
        terms[word].extend(existing)
sources.append({'name': curated['source'], 'license': 'MIT', 'notes': 'Project-maintained meanings; not attributed to NAER or the AI/LLM glossary.'})
encoded = json.dumps({'terms': terms}, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
with (OUTPUT / 'scientific.json.gz').open('wb') as stream:
    with gzip.GzipFile(filename='', fileobj=stream, mode='wb', mtime=0) as compressed:
        compressed.write(encoded)
counts = Counter(item['domain'] for entries in terms.values() for item in entries)
metadata = {'termKeys': len(terms), 'sensesByDomain': dict(counts), 'sources': sources,
            'changes': 'Normalized English lookup keys; retain original traditional Chinese NAER meanings; select at most 8-word ASCII terms; add source/domain metadata and project-maintained priorities. Metadata update dates are not represented as dictionary publication dates.'}
(OUTPUT / 'scientific-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(OUTPUT / 'AI-GLOSSARY-LICENSE.txt').write_bytes((SOURCE / 'modern-ai-license.txt').read_bytes())
license_html = (SOURCE / 'naer-license.html').read_text(encoding='utf-8')
english = license_html[license_html.index('Open Government Data License, version 1.0'):]
english = re.sub('<[^>]+>', ' ', english)
english = english.split('Exhibit - Attribution')[0]
(OUTPUT / 'NAER-LICENSE.txt').write_text('National Academy for Educational Research, retrieved 2026-11-13\nComputing and chemistry academic terminology.\nSource datasets and checksums: scientific-metadata.json\nhttps://data.gov.tw/license\nOpen data used under Open Government Data License 1.0; no endorsement implied.\n\n' + english, encoding='utf-8')
print(json.dumps({'termKeys': len(terms), 'sensesByDomain': dict(counts)}, ensure_ascii=False))
