import axios from 'axios';

const rawBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
const normalized = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : undefined;
const baseURL = normalized ? (normalized.endsWith('/api') ? normalized : `${normalized}/api`) : '/api';

const api = axios.create({
  baseURL,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
