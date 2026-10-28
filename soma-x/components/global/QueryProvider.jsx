"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";

export default function QueryProvider({ children }) {
    const [client] = useState(makeQueryClient);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
