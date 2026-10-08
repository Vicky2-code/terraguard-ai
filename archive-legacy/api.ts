import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
  timeout: 10000,
});

export async function checkBackend() {
  try {
    await api.get("/health");
    return true;
  } catch {
    return false;
  }
}

export default api;