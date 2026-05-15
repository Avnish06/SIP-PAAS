import axios from 'axios';

// Always use localhost:3000 when running locally — avoids broken public IP after IP change
const BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? 'http://localhost:3000'
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

const api = axios.create({ baseURL: `${BASE}/v1` });

api.interceptors.request.use(cfg => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sipaas_token') : null;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('sipaas_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
