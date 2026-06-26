export const getApiUrl = (path: string): string => {
  const baseUrl = (import.meta as any).env.VITE_API_BASE_URL || '';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
};
