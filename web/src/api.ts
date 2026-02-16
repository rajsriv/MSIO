import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000');
const API_KEY = 'msio-secret-key';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'x-api-key': API_KEY,
  },
});

export interface Deployment {
  id: string;
  repo_url: string;
  build_command: string;
  output_dir: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  error_message?: string;
  logs?: string;
  created_at: string;
  updated_at: string;
}

export const deployRepo = async (repo_url: string, build_command: string, output_dir: string) => {
  const response = await client.post('/deploy', { repo_url, build_command, output_dir });
  return response.data;
};

export const getDeploymentStatus = async (id: string): Promise<Deployment> => {
  const response = await client.get(`/status/${id}`);
  return response.data;
};

export const getAllDeployments = async (): Promise<Deployment[]> => {
  // Note: We might need to add a list endpoint to our API if we want to show history
  // For now, we'll assume the status endpoint or a yet-to-be-added list endpoint
  const response = await client.get('/status/list'); // Let's add this to API next
  return response.data;
};
