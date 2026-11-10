"use client";
import { App, ConfigProvider } from "antd";
import esES from "antd/locale/es_ES";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { tema } from "@/theme/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <ConfigProvider theme={tema} locale={esES}>
      <App>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}
