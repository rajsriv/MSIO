import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Github, Terminal, FolderOpen, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { deployRepo, getAllDeployments, Deployment } from './api';
import './App.css';

const App: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [outputDir, setOutputDir] = useState('dist');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchDeployments = async () => {
    try {
      const data = await getAllDeployments();
      setDeployments(data);
      // If we have a selected id, update it from the list
      if (selectedId && !isDeploying) {
        const selected = data.find(d => d.id === selectedId);
        if (selected && selected.status !== deployments.find(d => d.id === selectedId)?.status) {
          // Status changed, might want to do something
        }
      }
    } catch (error) {
      console.error('Failed to fetch deployments:', error);
    }
  };

  useEffect(() => {
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 3000);
    return () => clearInterval(interval);
  }, [selectedId]); // Remove deployments from dependencies to avoid infinite loop

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;

    setIsDeploying(true);
    try {
      const resp = await deployRepo(repoUrl, buildCommand, outputDir);
      setRepoUrl('');
      setSelectedId(resp.id); // Automatically select new deployment
      fetchDeployments();
    } catch (error) {
      console.error('Deployment failed:', error);
    } finally {
      setIsDeploying(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="text-success" size={18} />;
      case 'failed': return <AlertCircle className="text-error" size={18} />;
      case 'building': return <div className="loader" />;
      default: return <RefreshCw className="text-secondary" size={18} />;
    }
  };

  const selectedDeployment = deployments.find(d => d.id === selectedId);

  return (
    <div className="dashboard">
      <div className="main-content">
        <header className="header" style={{ textAlign: 'left', marginBottom: '3rem' }}>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{ fontSize: '2.5rem' }}
          >
            MSIO
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Managed Service Infra Orchestration
          </motion.p>
        </header>

        <motion.div 
          className="card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          style={{ padding: '1.5rem' }}
        >
          <form onSubmit={handleDeploy}>
            <div className="form-group">
              <label><Github size={14} style={{ marginRight: '8px' }} /> GitHub Repository URL</label>
              <input 
                type="text" 
                placeholder="https://github.com/user/repo" 
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group">
                <label><Terminal size={14} style={{ marginRight: '8px' }} /> Build Command</label>
                <input 
                  type="text" 
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label><FolderOpen size={14} style={{ marginRight: '8px' }} /> Output Directory</label>
                <input 
                  type="text" 
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className="deploy-btn" disabled={isDeploying || !repoUrl}>
              {isDeploying ? <><div className="loader" /> Deploying...</> : <><Rocket size={18} /> Deploy Site</>}
            </button>
          </form>
        </motion.div>

        <div className="status-list" style={{ marginTop: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', opacity: 0.8 }}>Recent Deployments</h3>
          <AnimatePresence>
            {deployments.length === 0 ? (
              <motion.div 
                className="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                No deployments yet. Start by deploying a repository.
              </motion.div>
            ) : (
              deployments.map((dep, index) => (
                <motion.div 
                  key={dep.id}
                  className={`status-item ${selectedId === dep.id ? 'active' : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  exit={{ opacity: 0, x: 20 }}
                  onClick={() => setSelectedId(dep.id)}
                  style={{ cursor: 'pointer', borderLeft: selectedId === dep.id ? '4px solid var(--accent-color)' : '1px solid var(--border-color)' }}
                >
                  <div className="status-info">
                    <span className="status-id">{dep.id}</span>
                    <span className="status-repo">{dep.repo_url.split('/').pop()?.replace('.git', '')}</span>
                  </div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {dep.status === 'success' && (
                      <a 
                        href={`http://localhost:3000/view/${dep.id}/index.html`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="status-id"
                        style={{ color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Visit <ExternalLink size={12} />
                      </a>
                    )}
                    <span className={`badge badge-${dep.status}`}>
                      {dep.status}
                    </span>
                    {getStatusIcon(dep.status)}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="logs-panel">
        <div className="logs-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={16} />
            <span style={{ fontWeight: 600 }}>Build Logs</span>
          </div>
          {selectedId && <span className="status-id">#{selectedId}</span>}
        </div>
        <div className="logs-content">
          {selectedDeployment ? (
            selectedDeployment.logs ? (
              selectedDeployment.logs.split('\n').map((line, i) => (
                <div key={i} className={`log-line ${line.includes('[ERROR]') ? 'error' : ''}`}>
                  {line}
                </div>
              ))
            ) : (
              <div className="log-placeholder">
                <RefreshCw className="loader" size={24} style={{ marginBottom: '1rem', color: '#333' }} />
                Waiting for logs...
              </div>
            )
          ) : (
            <div className="log-placeholder">
              <Terminal size={40} style={{ marginBottom: '1rem' }} />
              Select a deployment to view build logs
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
