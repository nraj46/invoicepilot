'use strict';
// InvoicePilot knowledge base — the small business's own policy and how-to
// documents. The assistant retrieves chunks from these for policy/how-to
// questions (RAG) and answers with citations.
const DOCS = [
  {
    id: 'payment-terms',
    title: 'Payment Terms Policy',
    body: `BrightWeb Studio's standard payment terms are Net 14: invoices are due 14 days after the issue date unless a different term is agreed in writing on the project contract.
New clients pay a 30% deposit before work begins; the deposit is applied to the final invoice.
Project milestones are invoiced as they are completed, and the final balance is due on delivery of the finished work.
We accept ACH transfer, card payments, and bank transfer. Card payments above $2,500 carry a 2.9% processing fee, which is shown on the invoice.`,
  },
  {
    id: 'late-fee',
    title: 'Late Fee Policy',
    body: `A late fee of 1.5% per month is charged on any invoice balance that is more than 7 days past its due date, calculated on the outstanding balance.
A reminder is sent 3 days before the due date, on the due date, and again 7 and 14 days after the due date.
If an invoice is more than 30 days overdue, active project work is paused until the balance is brought current.
Late fees are shown as a separate line item on the next statement and are never charged on disputed amounts while a dispute is being reviewed.`,
  },
  {
    id: 'expense-policy',
    title: 'Expense Policy',
    body: `Employees must keep receipts for every business expense over $25 and attach them to the expense entry in InvoicePilot.
Any single expense over $500 requires pre-approval from the studio manager before the purchase is made.
Software subscriptions used by the whole team (design tools, hosting, project management) are charged to the business card and categorised as Software or Hosting.
Approved expenses are reimbursed within 10 business days. Personal expenses must never be recorded in InvoicePilot.`,
  },
  {
    id: 'refund-policy',
    title: 'Refund Policy',
    body: `The 30% project deposit is refundable in full until work begins. Once work has started, the deposit covers the first milestone and is non-refundable.
Completed and approved milestones are non-refundable, because the work has been delivered and accepted.
If a client cancels mid-project, they are invoiced only for milestones completed up to the cancellation date, minus the deposit already paid.
Refunds for prepaid retainers are issued for any unused full months, within 14 days of the cancellation notice.`,
  },
  {
    id: 'tax-vat',
    title: 'Tax & VAT Notes',
    body: `For US clients, our design and development services are not subject to sales tax in our home state, so invoices show a 0% tax line.
For clients in the EU, VAT is handled under the reverse-charge mechanism: the invoice states "VAT reverse charge" and the client accounts for VAT in their own country.
UK clients are invoiced in GBP on request, converted at the rate on the invoice issue date.
We keep all invoices, receipts and payment records for 7 years for tax purposes, and our accountant reviews quarterly totals every April, July, October and January.`,
  },
  {
    id: 'getting-started',
    title: 'Getting Started with InvoicePilot',
    body: `The Dashboard shows the health of the business at a glance: total invoiced, total collected, outstanding balance, overdue amount, and expenses for the current quarter.
The Invoices page lists every invoice with its status — paid, pending, or overdue — and can be filtered by status or searched by customer or invoice number.
The Expenses page groups spending by category so you can see where the money goes each quarter.
Use the Assistant tab to ask questions in plain English, such as "Which invoices are overdue?" or "How much did we spend on software this quarter?".`,
  },
  {
    id: 'create-invoice',
    title: 'How to Create & Send an Invoice',
    body: `To create an invoice, choose the customer, add one line item per service with quantity and unit price, and the total is calculated automatically.
Check the issue date and due date — the due date defaults to 14 days after issue, matching our Net 14 payment terms.
When you send an invoice, the client receives a PDF with the payment link and the invoice number, which starts with INV-.
Sent invoices appear on the Invoices page as pending until a payment is recorded against them.`,
  },
  {
    id: 'record-expense',
    title: 'How to Record an Expense',
    body: `To record an expense, enter the amount, pick a category (Software, Hosting, Contractors, Marketing, Office, or Travel), add the vendor, and set the date.
Attach the receipt for anything over $25, as required by the Expense Policy.
Contractor payments should be categorised as Contractors and include the contractor's invoice number in the description.
Expenses appear immediately in the Expenses page totals and in the current-quarter figure on the Dashboard.`,
  },
  {
    id: 'understanding-reports',
    title: 'Understanding Reports & the Dashboard',
    body: `"Total collected" is the sum of all payments actually received, while "total invoiced" is the sum of every invoice issued — the difference between them is money still in flight or outstanding.
"Outstanding" combines pending and overdue invoices. "Overdue" alone counts only invoices past their due date, which are the ones that need chasing first.
Monthly revenue on the Dashboard is grouped by the month each payment was received, not the month the invoice was issued.
Expense totals are grouped by category and can be limited to the current quarter to compare against this quarter's income.`,
  },
  {
    id: 'chasing-overdue',
    title: 'Chasing Overdue Invoices — Guide',
    body: `Start with a friendly reminder referencing the invoice number and amount; most overdue invoices are simply forgotten and are paid within a few days.
If there is no response in 7 days, send a firmer note pointing out the late fee of 1.5% per month from the Late Fee Policy.
After 30 days overdue, phone the client contact directly and pause any active work, as the Late Fee Policy allows.
Always keep the conversation in the client's thread so there is a written record, and never add late fees to a disputed amount.`,
  },
];

module.exports = { DOCS };
