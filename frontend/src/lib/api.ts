import axios from 'axios';

const rawBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
const normalized = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : undefined;
const baseURL = normalized ? (normalized.endsWith('/api') ? normalized : `${normalized}/api`) : '/api';

const api = axios.create({
  baseURL,
  withCredentials: true
});

export default api;
