'use strict';
// EmbeddingProvider abstraction (same pattern as SupportPilot):
//  - LocalHashEmbeddingProvider: deterministic, offline, zero-cost. Hashes
//    tokens into a fixed-dimension vector — good enough to demo retrieval.
//  - OpenAIEmbeddingProvider: real embeddings via the OpenAI API, used
//    automatically when OPENAI_API_KEY is set. No code changes needed.

class LocalHashEmbeddingProvider {
  constructor(dim = 256) { this.dim = dim; this.name = 'local-hash'; this.model = 'local-hash-256'; }
  tokenize(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  }
  hash(token) { // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return Math.abs(h);
  }
  embedOne(text) {
    const v = new Float32Array(this.dim);
    const tokens = this.tokenize(text);
    for (const tok of tokens) {
      v[this.hash(tok) % this.dim] += 1;
      v[this.hash(tok + '~') % this.dim] += 0.35; // second bucket smooths collisions
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    for (let i = 0; i < this.dim; i++) v[i] /= norm;
    return v;
  }
  async embed(texts) { return texts.map(t => this.embedOne(t)); }
}

class OpenAIEmbeddingProvider {
  constructor(apiKey) { this.apiKey = apiKey; this.name = 'openai'; this.model = 'text-embedding-3-small'; }
  async embed(texts) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
    const json = await res.json();
    return json.data.map(d => Float32Array.from(d.embedding));
  }
}

function getEmbeddingProvider() {
  if (process.env.OPENAI_API_KEY) return new OpenAIEmbeddingProvider(process.env.OPENAI_API_KEY);
  return new LocalHashEmbeddingProvider();
}

function cosine(a, b) {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // vectors are L2-normalised on the local path; OpenAI's are near-unit
}

module.exports = { getEmbeddingProvider, LocalHashEmbeddingProvider, OpenAIEmbeddingProvider, cosine };
