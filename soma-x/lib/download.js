import { apiFetch, getErrorMessage } from "@/lib/api";

// Downloads a backend file (a path like "/calendar/me.ics", or a full backend URL) as `filename`.
export async function downloadFile(url, filename) {
  let blob;
  try {
    blob = await apiFetch(url, { responseType: "blob" });
  } catch (err) {
    throw new Error(err?.status === 0 ? getErrorMessage(err) : err?.body?.message || "Download failed");
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
