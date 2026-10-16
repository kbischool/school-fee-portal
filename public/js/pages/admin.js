import { startPortal } from '../shell.js';
import { adminHomeView } from '../views/admin-home.js';
import { studentsView } from '../views/students.js';
import { studentDetailView } from '../views/student-detail.js';
import { historyView } from '../views/history.js';
import { stockView } from '../views/stock.js';
import { invoicesView } from '../views/invoices.js';
startPortal({
  role: 'admin', search: true,
  nav: [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'students', label: 'Students', icon: 'users' },
    { key: 'history', label: 'Past sessions', short: 'Sessions', icon: 'clock' },
    { key: 'invoices', label: 'New-student invoice', short: 'Invoice', icon: 'doc' },
    { key: 'stock', label: 'Stock', icon: 'box' }
  ],
  routes: {
    home: adminHomeView,
    students: (c) => c.params[0] ? studentDetailView({ ...c, role: 'admin' }) : studentsView({ ...c, showTotals: false }),
    history: (c) => historyView({ ...c, showTotals: false }),
    invoices: invoicesView,
    stock: (c) => stockView({ ...c, showCosts: false })
  }
});
