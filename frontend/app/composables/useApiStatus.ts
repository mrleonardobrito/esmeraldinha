import { ref, readonly } from "vue";

const isApiAvailable = ref(true);
const lastConnectionError = ref<string | null>(null);

export const setApiUnavailable = (errorMessage?: string) => {
  isApiAvailable.value = false;
  lastConnectionError.value =
    errorMessage || "Não foi possível conectar aos servidores";
};

export const setApiAvailable = () => {
  isApiAvailable.value = true;
  lastConnectionError.value = null;
};

export const checkConnectionError = (error: unknown): boolean => {
  if (!error) return false;

  const errorObj = error as Record<string, unknown>;
  const errorMessage = (errorObj.message as string) || error.toString() || "";
  const errorCode =
    (errorObj.code as string) || (errorObj.status as string) || "";

  const connectionErrorPatterns = [
    "ERR_CONNECTION_REFUSED",
    "ERR_NETWORK",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ECONNRESET",
    "ETIMEDOUT",
    "fetch failed",
    "Failed to fetch",
    "NetworkError",
    "Load failed",
  ];

  const hasConnectionError = connectionErrorPatterns.some(
    (pattern) => errorMessage.includes(pattern) || errorCode.includes(pattern)
  );

  if (hasConnectionError) {
    setApiUnavailable(errorMessage);
    return true;
  }

  setApiAvailable();
  return false;
};

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const baseURL = "http://127.0.0.1:8000";
    const response = await fetch(`${baseURL}/api/health/`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      setApiAvailable();
      return true;
    } else {
      setApiUnavailable(
        `Erro HTTP ${response.status}: ${response.statusText}`
      );
      return false;
    }
  } catch (error) {
    checkConnectionError(error);
    return false;
  }
};

export const useApiStatus = () => {
  return {
    isApiAvailable: readonly(isApiAvailable),
    lastConnectionError: readonly(lastConnectionError),
    setApiUnavailable,
    setApiAvailable,
    checkConnectionError,
    checkApiHealth,
  };
};
