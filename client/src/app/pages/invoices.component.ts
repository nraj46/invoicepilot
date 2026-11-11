import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService, Invoice } from '../services/api.service';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  template: `
    <h1>Invoices</h1>
    <p class="subtitle">This page is powered by the <strong>GraphQL API</strong> (<span class="mono">POST /graphql</span>) over the same SQL data layer as the REST endpoints. Totals are derived from line items in SQL — never stored.</p>

    <div style="margin-bottom: 14px">
      @for (f of filters; track f) {
        <button class="filter-btn" [class.active]="status() === f" (click)="setStatus(f)">{{ f }}</button>
      }
      <span class="muted small">{{ invoices().length }} invoices · {{ total() | currency }} shown</span>
    </div>

    @if (error()) { <div class="error">{{ error() }}</div> }
    <div class="panel">
      <table>
        <tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Status</th><th class="num">Total</th></tr>
        @for (i of invoices(); track i.id) {
          <tr>
            <td class="mono">{{ i.number }}</td><td>{{ i.customerName }}</td>
            <td>{{ i.issueDate | date }}</td><td>{{ i.dueDate | date }}</td>
            <td><span class="pill {{ i.status }}">{{ i.status }}</span></td>
            <td class="num">{{ i.total | currency }}</td>
          </tr>
        }
      </table>
    </div>
    <details class="panel">
      <summary style="cursor:pointer; font-weight:600">GraphQL query used by this page</summary>
      <pre class="mono" style="white-space:pre-wrap">{{ gql }}</pre>
    </details>
  `,
})
export class InvoicesComponent implements OnInit {
  private api = inject(ApiService);
  filters = ['all', 'paid', 'pending', 'overdue'];
  status = signal('all');
  invoices = signal<Invoice[]>([]);
  error = signal('');
  gql = `query($status: String) {
  invoices(status: $status) { id number customerName issueDate dueDate status total }
}`;

  ngOnInit() { this.load(); }
  setStatus(f: string) { this.status.set(f); this.load(); }
  total() { return this.invoices().reduce((s, i) => s + i.total, 0); }
  load() {
    this.api.getInvoicesGraphQL(this.status()).subscribe({
      next: r => this.invoices.set(r.data.invoices),
      error: () => this.error.set('GraphQL request failed — is the API running?'),
    });
  }
}
