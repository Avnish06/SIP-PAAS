import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
