import api from './api';

// Auth
export const login = (data: any) => api.post('/auth/login', data).then(r => r.data);
export const signup = (data: any) => api.post('/auth/signup', data).then(r => r.data);
export const logout = () => api.post('/auth/logout').then(r => r.data);
export const getCurrentUser = () => api.get('/auth/me').then(r => r.data);
export const changePassword = (data: any) => api.post('/auth/change-password', data).then(r => r.data);
export const generateTenant = (name: string) => api.post('/tenants/generate', { name }).then(r => r.data);
export const getTenants = () => api.get('/tenants').then(r => r.data);
export const updateTenantStatus = (id: string, isActive: boolean) => api.put(`/tenants/${id}/status`, { isActive }).then(r => r.data);

// Customers
export const getCustomers = () => api.get('/customers').then(r => r.data);
export const getCustomerById = (id: string) => api.get(`/customers/${id}`).then(r => r.data);
export const createCustomer = (data: any) => api.post('/customers', data).then(r => r.data);
export const updateCustomer = (data: { id: string, [key: string]: any }) => api.put(`/customers/${data.id}`, data).then(r => r.data);
export const deleteCustomer = (id: string) => api.delete(`/customers/${id}`).then(r => r.data);

// Loans
export const getLoans = () => api.get('/loans').then(r => r.data);
export const getLoanById = (id: string) => api.get(`/loans/${id}`).then(r => r.data);
export const getLoansByCustomer = (customerId: string) => api.get(`/loans/customer/${customerId}`).then(r => r.data);
export const createLoan = (data: any) => api.post('/loans', data).then(r => r.data);
export const refinanceLoan = (id: string, data: any) => api.post(`/loans/${id}/refinance`, data).then(r => r.data);
export const updateLoan = (id: string, data: any) => api.put(`/loans/${id}`, data).then(r => r.data);
export const updateLoanLateFee = (
  id: string,
  data: { mode: 'auto' | 'waive' | 'custom'; amount?: number; note?: string },
) => api.patch(`/loans/${id}/late-fee`, data).then(r => r.data);
export const deleteLoan = (id: string) => api.delete(`/loans/${id}`).then(r => r.data);
export const getNotifications = () => api.get('/loans/notifications').then(r => r.data);

export const getLoanAttachments = (id: string) => api.get(`/loans/${id}/attachments`).then(r => r.data);
export const uploadAttachment = (id: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/loans/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};
export const deleteAttachment = (id: string) => api.delete(`/loans/attachments/${id}`).then(r => r.data);

// Finance
export const getPayments = () => api.get('/finance/payments').then(r => r.data);
export const getPaymentsByLoan = (loanId: string) => api.get(`/finance/payments/loan/${loanId}`).then(r => r.data);
export const createPayment = (data: any) => api.post('/finance/payments', data).then(r => r.data);
export const deletePayment = (id: string) => api.delete(`/finance/payments/${id}`).then(r => r.data);

export const getExpenses = () => api.get('/finance/expenses').then(r => r.data);
export const createExpense = (data: any) => api.post('/finance/expenses', data).then(r => r.data);
export const deleteExpense = (id: string) => api.delete(`/finance/expenses/${id}`).then(r => r.data);

// Reports
export const getDashboardData = () => api.get('/reports/dashboard').then(r => r.data);
export const getReportData = () => api.get('/reports/reports').then(r => r.data);

// Activity
export const logActivity = (data: any) => api.post('/activity', data).then(r => r.data);
export const getActivityLogs = () => api.get('/activity').then(r => r.data);

// Settings
export const getSettings = () => api.get('/settings').then(r => r.data);
export const updateSetting = (key: string, value: any) => api.post(`/settings/${key}`, { value }).then(r => r.data);
