const resolveApiUrl = () => {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:5000/api`;
  }

  return 'http://localhost:5000/api';
};

export const API_URL = resolveApiUrl();

export const testConnection = async () => {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) {
      return { success: false, error: `Backend responded with ${response.status}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message || 'Unable to reach backend' };
  }
};
