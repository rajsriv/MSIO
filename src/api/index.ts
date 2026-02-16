import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../shared/supabase';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve local deployments if storage strategy is local
if (process.env.STORAGE_STRATEGY === 'local') {
  const localPath = require('path').resolve(process.env.LOCAL_STORAGE_PATH || './deployments');
  console.log(`Serving local deployments from: ${localPath}`);
  app.use('/view', express.static(localPath));
}

// Basic Authentication Middleware (MVP)
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey === 'msio-secret-key') { // Simple static key for MVP
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Deployment Request Endpoint
app.post('/deploy', authMiddleware, async (req, res) => {
  const { repo_url, build_command, output_dir } = req.body;

  if (!repo_url || !build_command || !output_dir) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = uuidv4().split('-')[0]; // Short ID for convenience

  const { error } = await supabase
    .from('deployments')
    .insert([{ id, repo_url, build_command, output_dir, status: 'pending' }]);

  if (error) {
    console.error('Failed to queue deployment:', error);
    return res.status(500).json({ error: 'Failed to queue deployment' });
  }

  res.status(202).json({ id, message: 'Deployment queued' });
});

// Deployment Status Endpoint
app.get('/status/list', async (req, res) => {
  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch deployments:', error);
    return res.status(500).json({ error: 'Failed to fetch deployments' });
  }
  res.json(data);
});

app.get('/status/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  res.json(data);
});

// Deployment Proxy Endpoint
app.use('/view/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const filePath = req.path.replace(/^\//, '') || 'index.html';

  const bucket = (process.env.SUPABASE_BUCKET_NAME || 'static-sites').trim();
  const storagePath = `deployments/${id}/${filePath}`;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(storagePath);

    if (error || !data) {
      console.error(`Proxy Error: Failed to fetch ${storagePath}`, error);
      return res.status(404).send('File not found in storage');
    }

    // Determine Content-Type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.gif': 'image/gif',
      '.ico': 'image/x-icon'
    };

    const contentType = contentTypeMap[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');

    // Convert Blob/Buffer to Buffer if needed
    const buffer = Buffer.from(await data.arrayBuffer());
    res.send(buffer);

  } catch (err) {
    console.error('Proxy Exception:', err);
    res.status(500).send('Internal Server Error while fetching file');
  }
});

// Export for Vercel serverless
export default app;

// Only listen if not in serverless environment
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`API Server running at http://localhost:${port}`);
  });
}
