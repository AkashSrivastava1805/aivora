import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000"
});

let authAdapter = {
  getSession: () => null,
  onSessionUpdate: () => {},
  onLogout: () => {}
};
let refreshInFlight = null;
let interceptorBound = false;

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function bindApiAuth(adapter) {
  authAdapter = {
    ...authAdapter,
    ...adapter
  };

  if (interceptorBound) return;
  interceptorBound = true;

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config || {};
      const status = error.response?.status;
      const isRefreshEndpoint = originalRequest.url?.includes("/auth/refresh");

      if (status !== 401 || originalRequest._retry || isRefreshEndpoint) {
        return Promise.reject(error);
      }

      const currentSession = authAdapter.getSession?.();
      if (!currentSession?.token) {
        authAdapter.onLogout?.();
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (!refreshInFlight) {
        refreshInFlight = axios
          .post(
            `${api.defaults.baseURL}/auth/refresh`,
            {},
            { headers: { Authorization: `Bearer ${currentSession.token}` } }
          )
          .then((resp) => {
            const refreshed = resp.data;
            setAuthToken(refreshed.token);
            const nextSession = {
              ...currentSession,
              token: refreshed.token,
              user: refreshed.user
            };
            authAdapter.onSessionUpdate?.(nextSession);
            return refreshed.token;
          })
          .catch((refreshError) => {
            authAdapter.onLogout?.();
            throw refreshError;
          })
          .finally(() => {
            refreshInFlight = null;
          });
      }

      const newToken = await refreshInFlight;
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    }
  );
}

export default api;
