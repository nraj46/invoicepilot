import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard.component';
import { InvoicesComponent } from './pages/invoices.component';
import { ExpensesComponent } from './pages/expenses.component';
import { ChatComponent } from './pages/chat.component';
import { EvalsComponent } from './pages/evals.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'invoices', component: InvoicesComponent },
  { path: 'expenses', component: ExpensesComponent },
  { path: 'assistant', component: ChatComponent },
  { path: 'evals', component: EvalsComponent },
  { path: '**', redirectTo: '' },
];
