import axios from 'axios';

const API_URL = 'http://localhost:3000';
const API_KEY = 'msio-secret-key';

async function testDeployment() {
  try {
    console.log('--- Requesting Deployment ---');
    const response = await axios.post(`${API_URL}/deploy`, {
      repo_url: 'https://github.com/static-web-archive/simple-site.git', // A simple public repo
      build_command: 'npm run build', // Assuming there's a build script
      output_dir: 'dist',
    }, {
      headers: { 'x-api-key': API_KEY }
    });

    const deployId = response.data.id;
    console.log(`Deployment ID: ${deployId}`);

    console.log('--- Polling Status ---');
    const pollInterval = setInterval(async () => {
      const statusRes = await axios.get(`${API_URL}/status/${deployId}`);
      const { status, error_message } = statusRes.data;
      
      console.log(`Current Status: ${status}`);
      
      if (status === 'success') {
        clearInterval(pollInterval);
        console.log('SUCCESS: Site should be available via proxy.');
      } else if (status === 'failed') {
        clearInterval(pollInterval);
        console.error('FAILED:', error_message);
      }
    }, 5000);

  } catch (error: any) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

testDeployment();
