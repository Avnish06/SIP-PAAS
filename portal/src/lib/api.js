import axios from 'axios';

// Same-origin relative base. The browser calls the portal host itself
// (e.g. http://<portal-host>:8080/v1/...) and Next.js rewrites /v1/* to the
// API service server-side (see next.config.js). This works identically on
// localhost and on the VPS public IP — no CORS, no loopback/private-network
// block, and no need to expose the API port through the firewall.
const api = axios.create({ baseURL: '/v1' });

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
