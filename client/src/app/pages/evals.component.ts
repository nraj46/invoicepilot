import { Component, OnInit, inject, signal } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { ApiService, EvalReport } from '../services/api.service';

@Component({
  selector: 'app-evals',
  standalone: true,
  imports: [PercentPipe],
  template: `
    <h1>Assistant Evals</h1>
    <p class="subtitle">A golden set of {{ report()?.total ?? 10 }} questions run <strong>live</strong> against the assistant. Expected values are computed independently from SQL (or, for RAG cases, from the required citation) at run time — nothing is hardcoded.</p>

    <button class="btn" (click)="run()" [disabled]="busy()">{{ busy() ? 'Running…' : '▶ Run evals' }}</button>
    @if (error()) { <div class="error" style="margin-top:12px">{{ error() }}</div> }

    @if (report(); as r) {
      <div class="cards" style="margin-top:18px">
        <div class="card"><div class="label">Pass rate</div><div class="score-big" [class.pass]="r.passed === r.total" [class.fail]="r.passed !== r.total">{{ r.passRate | percent }}</div></div>
        <div class="card"><div class="label">Passed</div><div class="value">{{ r.passed }} / {{ r.total }}</div><div class="hint">8 data (MCP/SQL) · 2 RAG</div></div>
      </div>

      <div class="panel">
        <table>
          <tr><th>Case</th><th>Kind</th><th>Question</th><th>Expected</th><th>Path</th><th>Result</th></tr>
          @for (e of r.results; track e.id) {
            <tr>
              <td class="mono">{{ e.id }}</td>
              <td><span class="pill {{ e.kind === 'rag' ? 'info' : 'gray' }}">{{ e.kind }}</span></td>
              <td>{{ e.question }}</td>
              <td class="small muted">{{ e.expected }}</td>
              <td class="small">{{ e.path }}{{ e.tool ? ' · ' + e.tool : '' }}@if (e.citations.length) { <br /><span class="muted">cites: {{ e.citations.join(', ') }}</span> }</td>
              <td>@if (e.pass) { <span class="pass">PASS</span> } @else { <span class="fail">FAIL</span> }</td>
            </tr>
          }
        </table>
      </div>
    }
  `,
})
export class EvalsComponent implements OnInit {
  private api = inject(ApiService);
  report = signal<EvalReport | null>(null);
  busy = signal(false);
  error = signal('');

  ngOnInit() { this.run(); }
  run() {
    this.busy.set(true);
    this.api.getEvals().subscribe({
      next: r => { this.busy.set(false); this.report.set(r); },
      error: () => { this.busy.set(false); this.error.set('Evals failed — is the API running?'); },
    });
  }
}
