import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import { supabase } from '../shared/supabase';

const execPromise = util.promisify(exec);
const docker = new Docker(); // Assumes Docker is running locally

const STORAGE_STRATEGY = process.env.STORAGE_STRATEGY || 'supabase';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET_NAME || 'static-sites';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runDeployment(deploymentId: string) {
  const { data: deployment, error: fetchError } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', deploymentId)
    .single();

  if (fetchError || !deployment) throw new Error('Deployment not found');

  let logBuffer = deployment.logs || '';
  const appendLog = async (message: string) => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;
    logBuffer += formattedMessage;
    console.log(`[${deploymentId}] ${message}`);
    await supabase
      .from('deployments')
      .update({ logs: logBuffer })
      .eq('id', deploymentId);
  };

  try {
    // 1. Update status to 'building'
    await supabase
      .from('deployments')
      .update({ status: 'building', updated_at: new Date().toISOString() })
      .eq('id', deploymentId);
    await appendLog('Starting deployment...');

    const projectPath = path.join(process.cwd(), 'temp', deploymentId);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // 2. Clone Repository
    await appendLog(`Cloning repository: ${deployment.repo_url}`);
    await execPromise(`git clone ${deployment.repo_url} .`, { cwd: projectPath });
    await appendLog('Repository cloned successfully.');

    // 3. Build in Docker
    await appendLog(`Running build: ${deployment.build_command}`);
    
    // Ensure image exists
    const imageName = 'node:20-alpine';
    try {
      await docker.getImage(imageName).inspect();
      await appendLog(`Image ${imageName} found locally.`);
    } catch (e) {
      await appendLog(`Image ${imageName} not found. Pulling...`);
      await new Promise((resolve, reject) => {
        docker.pull(imageName, {}, (err: any, stream: any) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('Failed to get pull stream'));
          docker.modem.followProgress(stream, (err: any, res: any) => {
            if (err) return reject(err);
            resolve(res);
          });
        });
      });
      await appendLog(`Image ${imageName} pulled successfully.`);
    }

    const container = await docker.createContainer({
      Image: imageName,
      Cmd: ['sh', '-c', `npm install && ${deployment.build_command}`],
      WorkingDir: '/app',
      HostConfig: {
        Binds: [`${projectPath}:/app`],
      },
      Tty: false,
    });

    await container.start();
    await appendLog('Container started. Running npm install and build...');

    // Attach to logs
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true
    });

    container.modem.demuxStream(stream, {
      write: (data: Buffer) => {
        appendLog(data.toString().trim());
      }
    }, {
      write: (data: Buffer) => {
        appendLog(`[ERROR] ${data.toString().trim()}`);
      }
    });

    const result = await container.wait();
    
    if (result.StatusCode !== 0) {
      throw new Error(`Build failed with status ${result.StatusCode}`);
    }

    await appendLog('Build completed successfully.');
    await container.remove();

    // 4. Upload / Store Artifacts
    const outputAbsPath = path.join(projectPath, deployment.output_dir);
    if (!fs.existsSync(outputAbsPath)) {
      throw new Error(`Output directory "${deployment.output_dir}" not found after build.`);
    }

    if (STORAGE_STRATEGY === 'supabase') {
      await appendLog(`Uploading ${deployment.output_dir} to Supabase Storage (${SUPABASE_BUCKET})...`);
      await uploadDirToSupabase(outputAbsPath, `deployments/${deploymentId}`);
    } else {
      await appendLog(`Unknown storage strategy: ${STORAGE_STRATEGY}`);
      throw new Error(`Unsupported storage strategy: ${STORAGE_STRATEGY}`);
    }
    await appendLog('Artifact storage complete.');

    // 5. Update status to 'success'
    await supabase
      .from('deployments')
      .update({ status: 'success', updated_at: new Date().toISOString() })
      .eq('id', deploymentId);
    await appendLog('Deployment successful!');

    // Cleanup local files (Separate try-catch to avoid failing the whole deployment)
    try {
      await safeRmDir(projectPath);
    } catch (cleanupError) {
      await appendLog(`Warning: Cleanup failed but deployment was already successful. Manual cleanup may be needed for: ${projectPath}`);
    }

  } catch (error: any) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Try to stringify if it's an object (like from AWS SDK or Docker)
      try {
        errorMessage = JSON.stringify(error);
        if (errorMessage === '{}') {
          // If JSON.stringify fails to capture properties (like in some error objects)
          errorMessage = error.message || error.code || error.stack || 'Unknown error object';
        }
      } catch (e) {
        errorMessage = 'Object (circular or non-serializable)';
      }
    }
    
    await appendLog(`Deployment failed: ${errorMessage}`);
    await supabase
      .from('deployments')
      .update({ 
        status: 'failed', 
        error_message: errorMessage, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', deploymentId);
  }
}

async function safeRmDir(dirPath: string, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      return;
    } catch (err: any) {
      if (i === retries - 1) throw err;
      await sleep(delay);
    }
  }
}

async function copyDir(src: string, dest: string) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function uploadDirToSupabase(dirPath: string, bucketPrefix: string) {
  const files = fs.readdirSync(dirPath, { recursive: true }) as string[];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) continue;

    const fileContent = fs.readFileSync(filePath);
    const storagePath = path.join(bucketPrefix, file).replace(/\\/g, '/');
    const contentType = getContentType(file);
    console.log(`[STORAGE] Uploading ${file} as ${contentType} to ${storagePath}`);

    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, fileContent, {
        contentType: contentType,
        upsert: true
      });

    if (error) {
      console.error(`Failed to upload ${file}:`, error);
      throw error;
    }
  }
}

function getContentType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.html') return 'text/html';
  if (ext === '.css') return 'text/css';
  if (ext === '.js') return 'application/javascript';
  if (ext === '.json') return 'application/json';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}
