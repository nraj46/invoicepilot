import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService, Summary, Invoice, Customer } from '../services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  template: `
    <h1>Dashboard</h1>
    <p class="subtitle">BrightWeb Studio — every figure below is computed live by SQL (SUM / GROUP BY / JOIN) over the SQLite database.</p>

    @if (error()) { <div class="error">{{ error() }}</div> }
    @if (summary(); as s) {
      <div class="cards">
        <div class="card"><div class="label">Total invoiced</div><div class="value">{{ s.totalInvoiced | currency }}</div><div class="hint">all time</div></div>
        <div class="card good"><div class="label">Collected</div><div class="value">{{ s.totalCollected | currency }}</div><div class="hint">payments received</div></div>
        <div class="card"><div class="label">Outstanding</div><div class="value">{{ s.outstanding | currency }}</div><div class="hint">pending + overdue</div></div>
        <div class="card danger"><div class="label">Overdue</div><div class="value">{{ s.overdueAmount | currency }}</div><div class="hint">{{ s.overdueCount }} invoices past due</div></div>
        <div class="card"><div class="label">Expenses · this quarter</div><div class="value">{{ s.expensesThisQuarter | currency }}</div><div class="hint">since {{ s.quarterStart | date }}</div></div>
      </div>

      <div class="panel">
        <h2>Invoices by status</h2>
        @for (row of s.byStatus; track row.status) {
          <div class="bar-row">
            <span><span class="pill {{ row.status }}">{{ row.status }}</span> × {{ row.count }}</span>
            <div class="bar-track"><div class="bar-fill" [class.red]="row.status === 'overdue'" [class.green]="row.status === 'paid'" [style.width.%]="pct(row.total, s.totalInvoiced)"></div></div>
            <span class="num">{{ row.total | currency }}</span>
          </div>
        }
      </div>

      <div class="panel">
        <h2>Monthly revenue (payments received)</h2>
        @for (m of s.monthlyRevenue; track m.month) {
          <div class="bar-row">
            <span class="mono">{{ m.month }}</span>
            <div class="bar-track"><div class="bar-fill green" [style.width.%]="pct(m.total, maxMonth())"></div></div>
            <span class="num">{{ m.total | currency }}</span>
          </div>
        }
      </div>

      <div class="panel">
        <h2>Top customers</h2>
        <table>
          <tr><th>Customer</th><th>Contact</th><th class="num">Invoices</th><th class="num">Total invoiced</th></tr>
          @for (c of customers(); track c.id) {
            <tr><td>{{ c.name }}</td><td class="muted">{{ c.contact }}</td><td class="num">{{ c.invoiceCount }}</td><td class="num">{{ c.totalInvoiced | currency }}</td></tr>
          }
        </table>
      </div>

      <div class="panel">
        <h2>Overdue — needs chasing</h2>
        <table>
          <tr><th>Invoice</th><th>Customer</th><th>Due</th><th class="num">Amount</th></tr>
          @for (i of overdue(); track i.id) {
            <tr><td class="mono">{{ i.number }}</td><td>{{ i.customerName }}</td><td>{{ i.dueDate | date }}</td><td class="num">{{ i.total | currency }}</td></tr>
          }
        </table>
      </div>
    } @else if (!error()) {
      <div class="loading">Loading summary…</div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  summary = signal<Summary | null>(null);
  customers = signal<Customer[]>([]);
  overdue = signal<Invoice[]>([]);
  error = signal('');

  ngOnInit() {
    this.api.getSummary().subscribe({ next: s => this.summary.set(s), error: () => this.error.set('Could not load the summary — is the API running?') });
    this.api.getCustomers().subscribe(c => this.customers.set(c.slice(0, 5)));
    this.api.getInvoices('overdue').subscribe(i => this.overdue.set(i));
  }
  pct(v: number, max: number) { return max ? Math.round((v / max) * 100) : 0; }
  maxMonth() { const s = this.summary(); return s ? Math.max(...s.monthlyRevenue.map(m => m.total), 1) : 1; }
}
