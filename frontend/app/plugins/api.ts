import { useRuntimeConfig, defineNuxtPlugin } from "nuxt/app";
import { useApiStatus } from "../composables/useApiStatus";

export default defineNuxtPlugin((_) => {
  const config = useRuntimeConfig();
  let apiStatus: ReturnType<typeof useApiStatus> | null = null;

  const api = $fetch.create({
    baseURL: (config.public.apiBaseUrl as string) ?? "http://127.0.0.1:8000",

    onRequest() {
      if (!apiStatus) {
        apiStatus = useApiStatus();
      }

      if (apiStatus) {
        apiStatus.setApiAvailable();
      }
    },

    onRequestError({ error }) {
      if (apiStatus) {
        apiStatus.checkConnectionError(error);
      }
    },

    onResponse() {
      if (apiStatus) {
        apiStatus.setApiAvailable();
      }
    },

    onResponseError({ error }) {
      if (apiStatus) {
        const isConnectionError = apiStatus.checkConnectionError(error);

        if (!isConnectionError) {
          apiStatus.setApiAvailable();
        }
      }
    },
  });

  return {
    provide: {
      api,
    },
  };
});
