import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ChatResponse, ProviderInfo, McpStatus, RagStatus } from '../services/api.service';

interface Msg { role: 'user' | 'assistant'; text: string; res?: ChatResponse; }

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>AI Assistant</h1>
    <p class="subtitle">Ask about the business in plain English. Data questions are answered by tools on an <strong>MCP server</strong> running live SQL; policy &amp; how-to questions are answered by <strong>RAG</strong> over the knowledge base, with citations.</p>

    <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap">
      <label class="small muted" for="provider">Model provider</label>
      <select id="provider" class="provider-select" [ngModel]="providerId()" (ngModelChange)="providerId.set($event)">
        @for (p of providers(); track p.id) {
          <option [value]="p.id">{{ p.name }} — {{ p.model }} ({{ p.live ? 'Live' : 'Demo mode' }})</option>
        }
      </select>
      @if (selectedProvider(); as sp) { <span class="small muted">{{ sp.note }}</span> }
    </div>

    @if (selectedProvider() && !selectedProvider()!.live) {
      <div class="demo-banner">🧪 <strong>Demo mode</strong> — no API key is set for this provider, so a deterministic demo engine routes your question to the same MCP tools / RAG index and composes the answer from the real results. Add <span class="mono">OPENAI_API_KEY</span>, <span class="mono">ANTHROPIC_API_KEY</span> or <span class="mono">XAI_API_KEY</span> and the provider goes live with real tool calling — no code changes.</div>
    }
    @if (selectedProvider()?.live) {
      <div class="live-banner">🟢 <strong>Live</strong> — {{ selectedProvider()!.name }} ({{ selectedProvider()!.model }}) is performing real tool calling against the MCP server and knowledge base.</div>
    }

    <div class="chat-layout">
      <div>
        <div class="panel" style="min-height: 320px">
          @if (!messages().length) {
            <p class="muted">Try one of these:</p>
          }
          @for (m of messages(); track $index) {
            <div class="msg {{ m.role }}">
              <div class="bubble">{{ m.text }}</div>
              @if (m.res; as r) {
                <div class="trace">
                  <span class="pill info">{{ pathLabel(r.trace.path) }}</span>
                  <span class="pill gray">{{ r.trace.provider.name }} · {{ r.trace.provider.mode }}</span>
                  @for (c of r.trace.citations; track $index) {
                    <span class="cite-chip" [title]="c.chunk">📄 {{ c.doc }} · {{ c.score }}</span>
                  }
                  @if (r.trace.fallback) { <div class="small" style="color:#9c6d00; margin-top:4px">{{ r.trace.fallback }}</div> }
                  @if (r.trace.toolCalls.length) {
                    <details>
                      <summary>Trace — {{ r.trace.toolCalls.length }} tool call(s)</summary>
                      @for (t of r.trace.toolCalls; track $index) {
                        <div style="margin-top:6px">
                          <span class="tool-name">{{ t.via === 'mcp' ? 'MCP' : 'RAG' }} · {{ t.name }}</span>
                          @if (t.server) { <span class="muted small"> via {{ t.server }}</span> }
                          @if (t.args) { <div class="mono muted">args: {{ stringify(t.args) }}</div> }
                          @if (t.sql) { <pre>{{ t.sql }}</pre> }
                        </div>
                      }
                    </details>
                  }
                </div>
              }
            </div>
          }
          @if (busy()) { <div class="muted small">Thinking — querying the MCP tools / knowledge base…</div> }
        </div>

        <div style="margin: 4px 0 10px">
          @for (q of suggestions; track q) { <button class="chip-btn" (click)="ask(q)">{{ q }}</button> }
        </div>
        <div class="chat-input-row">
          <input type="text" placeholder="Ask about invoices, expenses, customers, or policies…"
                 [ngModel]="draft()" (ngModelChange)="draft.set($event)" (keyup.enter)="send()" />
          <button class="btn" (click)="send()" [disabled]="busy() || !draft().trim()">Ask</button>
        </div>
        @if (error()) { <div class="error" style="margin-top:10px">{{ error() }}</div> }
      </div>

      <div>
        <div class="panel">
          <h2>🔌 MCP connection</h2>
          @if (mcp(); as m) {
            <p class="small" style="margin-top:0">
              <span class="pill paid">connected</span><br />
              Server: <strong>{{ m.serverName }}</strong> v{{ m.serverVersion }}<br />
              <span class="muted">{{ m.protocol }}<br />Transport: {{ m.transport }}</span>
            </p>
            <h3>Tools (fetched live via listTools)</h3>
            <ul class="tool-list">
              @for (t of m.tools; track t.name) {
                <li><span class="tool-name">{{ t.name }}</span><br /><span class="small muted">{{ t.description }}</span></li>
              }
            </ul>
          } @else { <p class="muted small">Connecting to the MCP server…</p> }
        </div>

        <div class="panel">
          <h2>📚 Knowledge base (RAG)</h2>
          @if (ragStatus(); as r) {
            <p class="small" style="margin-top:0">
              Embeddings: <strong>{{ r.provider }}</strong> ({{ r.model }})<br />
              <span class="muted">{{ r.documents }} documents · {{ r.chunks }} chunks · {{ r.store }}</span>
            </p>
            <ul class="tool-list">
              @for (d of r.docs; track d) { <li class="small">📄 {{ d }}</li> }
            </ul>
          } @else { <p class="muted small">Loading index…</p> }
        </div>
      </div>
    </div>
  `,
})
export class ChatComponent implements OnInit {
  private api = inject(ApiService);
  messages = signal<Msg[]>([]);
  draft = signal('');
  busy = signal(false);
  error = signal('');
  providers = signal<ProviderInfo[]>([]);
  providerId = signal('demo');
  mcp = signal<McpStatus | null>(null);
  ragStatus = signal<RagStatus | null>(null);

  suggestions = [
    'Which invoices are overdue?',
    'How much did we spend on software this quarter?',
    'Who is our biggest customer?',
    'What is the late fee policy?',
    'Is the deposit refundable?',
    'How do I record an expense?',
  ];

  ngOnInit() {
    this.api.getProviders().subscribe(p => this.providers.set(p));
    this.api.getMcpStatus().subscribe({ next: m => this.mcp.set(m), error: () => this.error.set('MCP status unavailable — is the API running?') });
    this.api.getRagStatus().subscribe(r => this.ragStatus.set(r));
  }

  selectedProvider() { return this.providers().find(p => p.id === this.providerId()) || null; }
  pathLabel(path: string) {
    return path === 'rag' ? '📚 RAG · knowledge base' : path === 'mcp-tool' ? '🛠 MCP tool · live SQL' : path === 'llm-tools' ? '🤖 LLM tool calling' : 'Assistant';
  }
  stringify(v: unknown) { try { return JSON.stringify(v); } catch { return String(v); } }

  send() { const q = this.draft().trim(); if (q) { this.draft.set(''); this.ask(q); } }
  ask(question: string) {
    this.messages.update(ms => [...ms, { role: 'user', text: question }]);
    this.busy.set(true);
    this.api.chat(question, this.providerId()).subscribe({
      next: res => {
        this.busy.set(false);
        this.messages.update(ms => [...ms, { role: 'assistant', text: res.answer, res }]);
      },
      error: () => { this.busy.set(false); this.error.set('Chat request failed — is the API running?'); },
    });
  }
}
