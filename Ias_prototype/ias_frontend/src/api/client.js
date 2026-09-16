import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL, timeout: 15000 });

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rubberdam_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) onUnauthorized();
    const message =
      error.response?.data?.error || error.message || 'Request failed, please try again';
    const wrapped = new Error(message);
    wrapped.status = error.response?.status;
    wrapped.details = error.response?.data?.details;
    return Promise.reject(wrapped);
  }
);

export default api;
