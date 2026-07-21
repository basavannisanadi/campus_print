const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const logOutput = document.getElementById('log-output');

const indBackend = document.getElementById('ind-backend');
const txtBackend = document.getElementById('txt-backend');
const indFrontend = document.getElementById('ind-frontend');
const txtFrontend = document.getElementById('txt-frontend');
const indAgent = document.getElementById('ind-agent');
const txtAgent = document.getElementById('txt-agent');
const indPrinters = document.getElementById('ind-printers');
const txtPrinters = document.getElementById('txt-printers');

const errorToast = document.getElementById('error-toast');
const errorMessage = document.getElementById('error-message');
const btnCloseError = document.getElementById('btn-close-error');

let statusInterval = null;
let isOperating = false;

// Format log strings for terminal view
function renderLogs(logs) {
  if (!Array.isArray(logs)) return;
  logOutput.innerHTML = '';
  logs.forEach(line => {
    const div = document.createElement('div');
    div.className = 'log-line';
    
    // Apply styling based on log contents
    if (line.toLowerCase().includes('failed') || line.toLowerCase().includes('error')) {
      div.classList.add('text-error');
    } else if (line.toLowerCase().includes('ready') || line.toLowerCase().includes('online') || line.toLowerCase().includes('success') || line.toLowerCase().includes('registered')) {
      div.classList.add('text-success');
    } else if (line.toLowerCase().includes('started') || line.toLowerCase().includes('waiting')) {
      // Keep standard log-line styling
    } else {
      div.classList.add('text-dim');
    }
    
    div.textContent = line;
    logOutput.appendChild(div);
  });
  // Auto scroll to bottom
  logOutput.scrollTop = logOutput.scrollHeight;
}

// Update indicator lights based on status responses
function updateIndicators(status) {
  // Backend status
  if (status.backend === 'ONLINE') {
    indBackend.className = 'indicator green';
    txtBackend.textContent = '🟢 Online';
  } else if (status.backend === 'STARTING') {
    indBackend.className = 'indicator yellow';
    txtBackend.textContent = '🟡 Starting...';
  } else {
    indBackend.className = 'indicator red';
    txtBackend.textContent = '🔴 Offline';
  }

  // Frontend status
  if (status.frontend === 'ONLINE') {
    indFrontend.className = 'indicator green';
    txtFrontend.textContent = '🟢 Online';
  } else if (status.frontend === 'STARTING') {
    indFrontend.className = 'indicator yellow';
    txtFrontend.textContent = '🟡 Starting...';
  } else {
    indFrontend.className = 'indicator red';
    txtFrontend.textContent = '🔴 Offline';
  }

  // Agent status
  if (status.agent === 'ONLINE') {
    indAgent.className = 'indicator green';
    txtAgent.textContent = '🟢 Online';
  } else if (status.agent === 'STARTING') {
    indAgent.className = 'indicator yellow';
    txtAgent.textContent = '🟡 Starting...';
  } else {
    indAgent.className = 'indicator red';
    txtAgent.textContent = '🔴 Offline';
  }

  // Printer status
  if (status.agent === 'ONLINE') {
    if (status.printers > 0) {
      indPrinters.className = 'indicator green';
      txtPrinters.textContent = `🟢 ${status.printers} Discovered`;
    } else {
      indPrinters.className = 'indicator red';
      txtPrinters.textContent = '🔴 No Printers Found';
    }
  } else {
    indPrinters.className = 'indicator grey';
    txtPrinters.textContent = 'Offline';
  }
}

// Main polling status loop
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const status = await res.json();
      updateIndicators(status);
      renderLogs(status.logs);
      
      // Update Start/Stop button states
      const anyStarting = status.backend === 'STARTING' || status.frontend === 'STARTING' || status.agent === 'STARTING';
      const anyOnline = status.backend === 'ONLINE' || status.frontend === 'ONLINE' || status.agent === 'ONLINE';
      
      if (isOperating || anyStarting) {
        btnStart.disabled = true;
        btnStop.disabled = true;
      } else if (anyOnline) {
        btnStart.disabled = true;
        btnStop.disabled = false;
      } else {
        btnStart.disabled = false;
        btnStop.disabled = true;
      }
    }
  } catch (err) {
    console.error('Failed to connect to launcher server:', err);
  }
}

// Action listeners
btnStart.addEventListener('click', async () => {
  isOperating = true;
  btnStart.disabled = true;
  btnStop.disabled = true;
  errorToast.classList.add('hidden');
  
  try {
    const res = await fetch('/api/start', { method: 'POST' });
    const result = await res.json();
    if (!result.success) {
      showError('Startup Failed', result.error || 'Check the launcher.log below for details.');
    }
  } catch (err) {
    showError('Connection Failed', 'Could not communicate with the launcher daemon.');
  } finally {
    isOperating = false;
    fetchStatus();
  }
});

btnStop.addEventListener('click', async () => {
  isOperating = true;
  btnStart.disabled = true;
  btnStop.disabled = true;
  errorToast.classList.add('hidden');
  
  try {
    const res = await fetch('/api/stop', { method: 'POST' });
    await res.json();
  } catch (err) {
    showError('Shutdown Failed', 'Could not communicate with the launcher daemon.');
  } finally {
    isOperating = false;
    fetchStatus();
  }
});

btnCloseError.addEventListener('click', () => {
  errorToast.classList.add('hidden');
});

function showError(title, message) {
  document.getElementById('error-title').textContent = title;
  errorMessage.textContent = message;
  errorToast.classList.remove('hidden');
}

// Initial status polling
fetchStatus();
statusInterval = setInterval(fetchStatus, 1500);
