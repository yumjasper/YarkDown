import { app } from 'electron'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import {
  analyzeVocabulary,
  isReadingDomain,
  type ReadingDictionary
} from '../../shared/readingVocabulary'
import type { ReadingResult, VocabularyAnalysis } from '../../shared/types/reading'
import { simplifyVocabulary } from './readingChinese'

const decompress = promisify(gunzip)
let dictionary: Promise<ReadingDictionary> | undefined
const loadDictionary = (): Promise<ReadingDictionary> => {
  dictionary ??= readFile(
    path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'static/reading-dictionary/reading-bundle.json.gz'
    )
  )
    .then((buffer) => decompress(buffer))
    .then((buffer) => {
      const data = JSON.parse(buffer.toString('utf8')) as ReadingDictionary
      if (
        data.format !== 3 ||
        !data.entries ||
        !data.aliases ||
        !data.packedTerms ||
        !data.domains ||
        !data.sources ||
        !data.phraseLengths ||
        !data.generalSource ||
        !data.generalNotes ||
        !data.wholeGlosses ||
        data.domains.some((domain) => !['computing', 'chemistry'].includes(domain)) ||
        data.common?.length !== 1000
      )
        throw new Error('Unsupported reading dictionary bundle')
      return data
    })
    .catch((error) => {
      dictionary = undefined
      throw error
    })
  return dictionary
}
export const readVocabulary = async(
  source: unknown,
  domain: unknown = 'general'
): Promise<ReadingResult<VocabularyAnalysis>> => {
  if (typeof source !== 'string' || source.length > 30000)
    return { ok: false, error: '原文限 30,000 字符。 / Source limit: 30,000 characters.' }
  if (!isReadingDomain(domain)) return { ok: false, error: '学科设置无效。 / Invalid subject.' }
  try {
    return {
      ok: true,
      data: simplifyVocabulary(analyzeVocabulary(source, await loadDictionary(), domain))
    }
  } catch {
    return {
      ok: false,
      error:
        '离线词库无法加载，请检查安装资源后重试。 / The offline dictionary could not be loaded. Check installation resources and retry.'
    }
  }
}
