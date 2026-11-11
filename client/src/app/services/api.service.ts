import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Summary {
  totalInvoiced: number; totalCollected: number; outstanding: number;
  overdueAmount: number; overdueCount: number; expensesThisQuarter: number;
  quarterStart: string;
  byStatus: { status: string; count: number; total: number }[];
  monthlyRevenue: { month: string; total: number }[];
}
export interface Invoice {
  id: number; number: string; customerId: number; customerName: string;
  issueDate: string; dueDate: string; status: string; total: number;
  lineItems?: { id: number; description: string; quantity: number; unitPrice: number; amount: number }[];
}
export interface Customer {
  id: number; name: string; email: string; contact: string;
  invoiceCount: number; totalInvoiced: number;
}
export interface Expense { id: number; category: string; description: string; vendor: string; amount: number; date: string; }
export interface CategoryTotal { category: string; count: number; total: number; }
export interface ChatTrace {
  path: string;
  provider: { id: string; name: string; model: string; mode: string; live: boolean };
  toolCalls: { via: string; name: string; server?: string; args?: unknown; sql?: string; rowCount?: number }[];
  citations: { doc: string; score: number; chunk: string }[];
  fallback?: string;
}
export interface ChatResponse { question: string; answer: string; trace: ChatTrace; }
export interface ProviderInfo { id: string; name: string; model: string; live: boolean; mode: string; note: string; }
export interface McpStatus {
  connected: boolean; serverName: string; serverVersion: string; transport: string; protocol: string;
  tools: { name: string; description: string }[];
}
export interface RagStatus { provider: string; model: string; documents: number; chunks: number; store: string; docs: string[]; }
export interface EvalResult {
  id: string; kind: string; question: string; pass: boolean; expected: string;
  path: string; tool: string | null; citations: string[]; answerPreview: string;
}
export interface EvalReport { passed: number; total: number; passRate: number; results: EvalResult[]; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // REST
  getSummary(): Observable<Summary> { return this.http.get<Summary>('/api/summary'); }
  getCustomers(): Observable<Customer[]> { return this.http.get<Customer[]>('/api/customers'); }
  getInvoices(status?: string): Observable<Invoice[]> {
    const q = status && status !== 'all' ? `?status=${status}` : '';
    return this.http.get<Invoice[]>(`/api/invoices${q}`);
  }
  getExpenses(): Observable<Expense[]> { return this.http.get<Expense[]>('/api/expenses'); }
  getExpenseTotals(quarter = false): Observable<CategoryTotal[]> {
    return this.http.get<CategoryTotal[]>(`/api/expenses/totals${quarter ? '?quarter=current' : ''}`);
  }

  // GraphQL — the Invoices page is powered by the GraphQL API
  getInvoicesGraphQL(status?: string): Observable<{ data: { invoices: Invoice[] } }> {
    const query = `query($status: String) {
      invoices(status: $status) { id number customerName issueDate dueDate status total }
    }`;
    return this.http.post<{ data: { invoices: Invoice[] } }>('/graphql', {
      query, variables: { status: status && status !== 'all' ? status : null },
    });
  }

  // Assistant / meta
  chat(question: string, provider: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>('/api/chat', { question, provider });
  }
  getProviders(): Observable<ProviderInfo[]> { return this.http.get<ProviderInfo[]>('/api/providers'); }
  getMcpStatus(): Observable<McpStatus> { return this.http.get<McpStatus>('/api/mcp/status'); }
  getRagStatus(): Observable<RagStatus> { return this.http.get<RagStatus>('/api/rag/status'); }
  getEvals(): Observable<EvalReport> { return this.http.get<EvalReport>('/api/evals'); }
}
