'use strict';
// Tiny in-memory vector store over the knowledge-base documents.
// Documents are chunked, embedded through the EmbeddingProvider, and
// retrieved by cosine similarity. Retrieved chunks are returned with
// their source document and score so answers can cite them.
const { DOCS } = require('./knowledge');
const { getEmbeddingProvider, cosine } = require('./embeddings');

function chunkDoc(doc) {
  const sentences = doc.body.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < sentences.length; i += 2) {
    chunks.push(sentences.slice(i, i + 2).join(' '));
  }
  return chunks.map((text, i) => ({ docId: doc.id, docTitle: doc.title, chunkIndex: i, text }));
}

const provider = getEmbeddingProvider();
let indexPromise = null;

function getIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const chunks = DOCS.flatMap(chunkDoc);
      const vectors = await provider.embed(chunks.map(c => `${c.docTitle}. ${c.text}`));
      const entries = chunks.map((c, i) => ({ ...c, vector: vectors[i] }));
      return { entries, providerName: provider.name, providerModel: provider.model, docCount: DOCS.length, chunkCount: entries.length };
    })();
  }
  return indexPromise;
}

// Ranking = cosine similarity of embeddings + a small title-match boost
// (hybrid retrieval: a query naming a document, e.g. "late fee policy",
// should rank that policy first). The returned score is this relevance score.
async function retrieve(query, k = 3) {
  const index = await getIndex();
  const [qv] = await provider.embed([query]);
  const qTokens = [...new Set(provider.tokenize ? provider.tokenize(query) : query.toLowerCase().split(/\W+/))].filter(t => t.length > 2);
  return index.entries
    .map(e => {
      const title = e.docTitle.toLowerCase();
      const titleHits = qTokens.filter(t => title.includes(t)).length;
      const boost = Math.min(titleHits * 0.06, 0.15);
      return { docId: e.docId, docTitle: e.docTitle, chunkIndex: e.chunkIndex, text: e.text, score: Number((cosine(qv, e.vector) + boost).toFixed(3)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

async function indexStatus() {
  const index = await getIndex();
  return {
    provider: index.providerName,
    model: index.providerModel,
    documents: index.docCount,
    chunks: index.chunkCount,
    store: 'in-memory vector store (cosine similarity)',
    docs: DOCS.map(d => d.title),
  };
}

module.exports = { retrieve, indexStatus, chunkDoc };
