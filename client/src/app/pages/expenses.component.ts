import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService, Expense, CategoryTotal } from '../services/api.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  template: `
    <h1>Expenses</h1>
    <p class="subtitle">Powered by the <strong>REST API</strong> (<span class="mono">/api/expenses</span>, <span class="mono">/api/expenses/totals</span>). Category totals are SQL <span class="mono">GROUP BY</span> rollups.</p>

    <div style="margin-bottom: 14px">
      <button class="filter-btn" [class.active]="!quarter()" (click)="setQuarter(false)">All time</button>
      <button class="filter-btn" [class.active]="quarter()" (click)="setQuarter(true)">This quarter</button>
    </div>

    @if (error()) { <div class="error">{{ error() }}</div> }
    <div class="panel">
      <h2>Spending by category — total {{ grandTotal() | currency }}</h2>
      @for (c of totals(); track c.category) {
        <div class="bar-row">
          <span>{{ c.category }} <span class="muted">× {{ c.count }}</span></span>
          <div class="bar-track"><div class="bar-fill" [style.width.%]="pct(c.total)"></div></div>
          <span class="num">{{ c.total | currency }}</span>
        </div>
      }
    </div>

    <div class="panel">
      <h2>All expenses</h2>
      <table>
        <tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th class="num">Amount</th></tr>
        @for (e of expenses(); track e.id) {
          <tr><td>{{ e.date | date }}</td><td><span class="pill info">{{ e.category }}</span></td><td>{{ e.description }}</td><td class="muted">{{ e.vendor }}</td><td class="num">{{ e.amount | currency }}</td></tr>
        }
      </table>
    </div>
  `,
})
export class ExpensesComponent implements OnInit {
  private api = inject(ApiService);
  expenses = signal<Expense[]>([]);
  totals = signal<CategoryTotal[]>([]);
  quarter = signal(false);
  error = signal('');

  ngOnInit() {
    this.api.getExpenses().subscribe({ next: e => this.expenses.set(e), error: () => this.error.set('Could not load expenses — is the API running?') });
    this.loadTotals();
  }
  setQuarter(q: boolean) { this.quarter.set(q); this.loadTotals(); }
  loadTotals() { this.api.getExpenseTotals(this.quarter()).subscribe(t => this.totals.set(t)); }
  grandTotal() { return this.totals().reduce((s, c) => s + c.total, 0); }
  pct(v: number) { const max = Math.max(...this.totals().map(c => c.total), 1); return Math.round((v / max) * 100); }
}
