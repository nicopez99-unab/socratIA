import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

interface SourceChunk {
  name: string;
  page?: number;
  text: string;
}

interface CachedSource {
  modifiedAt: number;
  size: number;
  chunks: SourceChunk[];
}

const SOURCES_DIRECTORY = path.join(process.cwd(), 'fuentes');
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.txt']);
const MAX_CHUNK_LENGTH = 1800;
const CHUNK_OVERLAP = 200;
const MAX_CONTEXT_CHUNKS = 8;
const sourceCache = new Map<string, CachedSource>();

export async function listSourceNames(): Promise<string[]> {
  const entries = await readdir(SOURCES_DIRECTORY, { withFileTypes: true });

  return entries
    .filter(
      (entry) =>
        entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'es'));
}

export async function getRelevantSourceContext(query: string): Promise<string> {
  const names = await listSourceNames();
  const chunks: SourceChunk[] = [];

  for (const name of names) {
    chunks.push(...(await loadSource(name)));
  }

  if (names.length > 0 && chunks.length === 0) {
    throw new Error('Los archivos de fuentes/ no contienen texto que se pueda consultar.');
  }

  const queryTerms = getQueryTerms(query);

  const relevantChunks = chunks
    .map((chunk, index) => ({
      chunk,
      index,
      score: queryTerms.reduce(
        (score, term) => score + (normalize(chunk.text).includes(term) ? 1 : 0),
        0
      ),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, MAX_CONTEXT_CHUNKS);

  if (relevantChunks.length === 0) {
    return '';
  }

  return relevantChunks
    .map(({ chunk }) => {
      const location = chunk.page ? `, página ${chunk.page}` : '';
      return `[Fuente: ${chunk.name}${location}]\n${chunk.text}`;
    })
    .join('\n\n');
}

async function loadSource(name: string): Promise<SourceChunk[]> {
  const filePath = path.join(SOURCES_DIRECTORY, name);
  const fileInfo = await stat(filePath);
  const cached = sourceCache.get(filePath);

  if (cached?.modifiedAt === fileInfo.mtimeMs && cached.size === fileInfo.size) {
    return cached.chunks;
  }

  const fileBuffer = await readFile(filePath);
  const extension = path.extname(name).toLowerCase();
  let chunks: SourceChunk[];

  if (extension === '.txt') {
    chunks = splitText(fileBuffer.toString('utf8')).map((text) => ({ name, text }));
  } else {
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const result = await parser.getText();
      chunks = result.pages
        .filter((page) => page.text.trim().length > 0)
        .flatMap((page) =>
          splitText(page.text).map((text) => ({ name, page: page.num, text }))
        );
    } finally {
      await parser.destroy();
    }

    if (chunks.length === 0) {
      throw new Error(`El PDF "${name}" no contiene texto legible. Si es un escaneo, aplica OCR primero.`);
    }
  }

  sourceCache.set(filePath, {
    modifiedAt: fileInfo.mtimeMs,
    size: fileInfo.size,
    chunks,
  });
  return chunks;
}

function splitText(text: string): string[] {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];

  for (let start = 0; start < normalizedText.length; ) {
    let end = Math.min(start + MAX_CHUNK_LENGTH, normalizedText.length);
    if (end < normalizedText.length) {
      const lastSpace = normalizedText.lastIndexOf(' ', end);
      if (lastSpace > start + MAX_CHUNK_LENGTH / 2) {
        end = lastSpace;
      }
    }

    chunks.push(normalizedText.slice(start, end).trim());
    if (end === normalizedText.length) {
      break;
    }
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks.filter(Boolean);
}

function getQueryTerms(query: string): string[] {
  const ignoredTerms = new Set([
    'algo',
    'como',
    'cual',
    'cuando',
    'donde',
    'esto',
    'esta',
    'estas',
    'este',
    'estos',
    'para',
    'pero',
    'porque',
    'sobre',
    'tambien',
    'tengo',
    'tiene',
    'tienen',
    'puede',
    'puedes',
    'quiero',
  ]);

  return [...new Set(normalize(query).match(/[a-z0-9]{3,}/g) ?? [])].filter(
    (term) => !ignoredTerms.has(term)
  );
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
