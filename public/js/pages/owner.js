import { startPortal } from '../shell.js';
import { overviewView } from '../views/overview.js';
import { studentsView } from '../views/students.js';
import { studentDetailView } from '../views/student-detail.js';
import { historyView } from '../views/history.js';
import { paymentsView } from '../views/payments.js';
import { stockView } from '../views/stock.js';
import { invoicesView } from '../views/invoices.js';
import { payrollView } from '../views/payroll.js';
import { accountsView } from '../views/accounts.js';
import { importView } from '../views/import.js';
startPortal({
  role: 'owner', search: true,
  nav: [
    { key: 'overview', label: 'Overview', short: 'Overview', icon: 'chart', section: 'School' },
    { key: 'students', label: 'Students', icon: 'users' },
    { key: 'history', label: 'Past sessions', short: 'Sessions', icon: 'clock' },
    { key: 'payments', label: 'Payments', icon: 'wallet' },
    { key: 'stock', label: 'Stock', icon: 'box', section: 'Operations' },
    { key: 'invoices', label: 'New-student invoice', short: 'Invoice', icon: 'doc' },
    { key: 'payroll', label: 'Staff & payroll', short: 'Payroll', icon: 'briefcase', section: 'Owner only' },
    { key: 'accounts', label: 'Accounts & codes', short: 'Accounts', icon: 'key' },
    { key: 'import', label: 'Import data', short: 'Import', icon: 'upload' }
  ],
  routes: {
    overview: overviewView,
    students: (c) => c.params[0] ? studentDetailView({ ...c, role: 'owner' }) : studentsView({ ...c, showTotals: true }),
    history: (c) => historyView({ ...c, showTotals: true }),
    payments: paymentsView,
    stock: (c) => stockView({ ...c, showCosts: true }),
    invoices: invoicesView,
    payroll: payrollView,
    accounts: accountsView,
    import: importView
  }
});
