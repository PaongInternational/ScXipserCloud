// Developer: PaongDev
// Email: bypaongpinew@gmail.com
// Project: Termux VPS Dashboard (SC File 10)
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');

// Load environment variables from .env file
dotenv.config();

const DB_PATH = path.join(__dirname, 'config', 'db.json');
const NODE_CONFIG_PATH = path.join(__dirname, 'config', 'node_settings.json');
const FIREWALL_CONFIG_PATH = path.join(__dirname, 'config', 'firewall_rules.json');
const UPLOAD_DIR = path.join(os.homedir(), 'tmp_uploads');
const DEPLOY_SCRIPT_PATH = path.join(__dirname, 'deploy.sh');

// Global Configuration Variables
const USERNAME = process.env.DASH_USER;
const PASSWORD = process.env.DASH_PASS;
const JWT_SECRET = process.env.JWT_SECRET;
const FIREWALL_CMD_BASE = process.env.TERMUX_FIREWALL_CMD || 'echo "Simulasi Firewall: "'; 

// --- Helper Functions ---

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function loadConfig(configPath) {
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Gagal membaca ${path.basename(configPath)}:`, error.message);
        return {}; 
    }
}

function saveConfig(configPath, data) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Gagal menulis ${path.basename(configPath)}:`, error.message);
        return false;
    }
}

// Global Configuration Storage
let nodeSettings = loadConfig(NODE_CONFIG_PATH);
let firewallRules = loadConfig(FIREWALL_CONFIG_PATH);

// --- Server Setup (Uses dynamic config from node_settings.json) ---
const PORT = nodeSettings.server?.port || process.env.SERVER_PORT || 3000;
const HOST_IP = nodeSettings.server?.host || '0.0.0.0';
const MAX_FILE_SIZE = (nodeSettings.server?.maxFileSizeMB || 50) * 1024 * 1024; // Convert MB to bytes

const app = express();

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage, limits: { fileSize: MAX_FILE_SIZE } });

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); 

// Security Middleware (JWT Check)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ success: false, message: 'Token tidak tersedia.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token tidak valid.' });
        req.user = user;
        next();
    });
}

// --- Main Route ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API Endpoints ---

// 1. Authentication
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USERNAME && password === PASSWORD) {
        const token = jwt.sign({ username: username }, JWT_SECRET, { expiresIn: `${nodeSettings.server?.sessionTimeoutHours || 1}h` });
        res.json({ success: true, token: token });
    } else {
        res.status(401).json({ success: false, message: 'Username atau sandi salah.' });
    }
});

// 2. Get Dashboard Data (Domains/DB)
app.get('/api/data', authenticateToken, (req, res) => {
    const data = loadConfig(DB_PATH);
    res.json({ success: true, ...data });
});

// 3. Get System Info
app.get('/api/system/info', authenticateToken, async (req, res) => {
    
    const cpuUsage = os.loadavg()[0]; // 1 minute load average (simple proxy for load)
    
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    let uid = 'N/A';
    try {
        const { stdout } = await new Promise((resolve, reject) => {
            exec('id -u', { timeout: 500 }, (err, stdout) => {
                if (err) return reject(err);
                resolve({ stdout });
            });
        });
        uid = stdout.trim();
    } catch (e) { /* Safe fail */ }

    res.json({
        success: true,
        ip: getLocalIP() + ':' + PORT,
        cpuLoad: cpuUsage * 10, // Scale for better visualization (0-100 range)
        ramTotal: totalMem,
        ramFree: freeMem,
        arch: os.arch(),
        uid: uid
    });
});

// 4. Real CLI Execution 
app.post('/api/system/cli', authenticateToken, (req, res) => {
    const command = req.body.command;
    const timeout = (nodeSettings.api?.cliTimeoutSeconds || 30) * 1000;

    exec(command, { cwd: os.homedir(), timeout: timeout }, (error, stdout, stderr) => {
        if (error) {
            let errorMessage = error.message;
            if (error.killed && error.signal === 'SIGTERM') {
                errorMessage = `Perintah timeout setelah ${timeout / 1000} detik.`;
            }
            console.error(`Error Executing ${command}: ${errorMessage}`);
            return res.json({ success: false, output: `[ERROR] ${errorMessage}\n${stderr}` });
        }
        res.json({ success: true, output: stdout || 'Perintah berhasil dieksekusi (tanpa output di stdout).' });
    });
});

// 5. Service Control
app.post('/api/system/service', authenticateToken, (req, res) => {
    const { service, action } = req.body;
    let command = '';
    
    if (service === 'nginx') {
        // Nginx control via Termux standard command
        command = `nginx -s ${action}`; 
    } else if (service === 'mysqld') {
        if (action === 'start') {
            command = `mysqld_safe --datadir=$PREFIX/var/lib/mysql &`; 
        } else if (action === 'stop') {
             command = `killall mysqld`; 
        }
    } else {
        return res.json({ success: false, output: `Layanan ${service} tidak dikenal.` });
    }

    exec(command, { cwd: os.homedir() }, (error, stdout, stderr) => {
        const output = stdout + stderr;
        if (error) {
            return res.json({ success: false, output: `Gagal menjalankan \`${service} ${action}\`: ${error.message}\n${output}` });
        }
        res.json({ success: true, output: `Layanan ${service} berhasil di-${action}.` });
    });
});


// 6. Deployment Upload
app.post('/api/deployment/upload', authenticateToken, upload.single('deploymentFile'), (req, res) => {
    const uploadedFile = req.file;
    const targetPath = req.body.targetPath;

    if (!uploadedFile) {
        return res.status(400).json({ success: false, message: 'Tidak ada berkas yang diunggah atau ukuran melebihi batas.' });
    }

    const isZip = uploadedFile.originalname.toLowerCase().endsWith('.zip');
    
    if (isZip) {
        // Call the deploy.sh script for extraction
        const shellCommand = `bash ${DEPLOY_SCRIPT_PATH} UNZIP ${uploadedFile.path} ${targetPath}`;

        exec(shellCommand, { cwd: os.homedir() }, (error, stdout, stderr) => {
            const output = stdout + stderr;
            if (error) {
                return res.json({ success: false, message: 'Ekstraksi ZIP GAGAL.', output: output });
            }
            res.json({ success: true, message: 'Deployment dan Ekstraksi ZIP berhasil.', output: output });
        });
        
    } else {
        // Move single file directly
        const finalDest = path.join(targetPath, uploadedFile.originalname);
        fs.rename(uploadedFile.path, finalDest, (err) => {
            if (err) {
                 return res.json({ success: false, message: 'Gagal memindahkan berkas.', output: err.message });
            }
            // Delete the temporary file if rename succeeded (Multer doesn't delete it automatically for single file move)
            fs.unlink(uploadedFile.path, () => {}); 
            res.json({ success: true, message: 'Deployment berkas tunggal berhasil.', output: `Berkas dipindahkan ke: ${finalDest}` });
        });
    }
});

// 7. Get/Update Node.js Configuration
app.get('/api/config/node', authenticateToken, (req, res) => {
    res.json({ success: true, settings: nodeSettings });
});

app.post('/api/config/node', authenticateToken, (req, res) => {
    const newSettings = req.body;
    if (saveConfig(NODE_CONFIG_PATH, newSettings)) {
        nodeSettings = newSettings; // Update runtime variable
        res.json({ success: true, message: 'Konfigurasi Node.js berhasil disimpan. Restart server diperlukan untuk perubahan PORT.' });
    } else {
        res.status(500).json({ success: false, message: 'Gagal menyimpan konfigurasi Node.js.' });
    }
});

// 8. Get/Update Firewall Configuration
app.get('/api/config/firewall', authenticateToken, (req, res) => {
    res.json({ success: true, rules: firewallRules });
});

app.post('/api/config/firewall', authenticateToken, (req, res) => {
    const newRules = req.body;
    
    // --- REAL FIREWALL/DDOS EXECUTION (Simulated for Termux compatibility) ---
    if (newRules.firewall.status === 'active') {
        const portList = newRules.firewall.allowedPorts.map(p => `${p.port}/${p.protocol}`).join(', ');
        const firewallCommand = `${FIREWALL_CMD_BASE} -A INPUT -p TCP --dport ${portList} -j ACCEPT`;
        
        exec(firewallCommand, (err, stdout, stderr) => {
             // We generally ignore errors here as Termux environment might not support iptables
             console.log(`[FIREWALL EXEC] Status: ${newRules.firewall.status}. Command: ${firewallCommand}`);
        });

    } else {
        exec(`${FIREWALL_CMD_BASE} --flush`, (err, stdout, stderr) => {
            console.log(`[FIREWALL EXEC] Status: ${newRules.firewall.status}. Command: Flush rules`);
        });
    }
    // --- END FIREWALL EXECUTION ---
    
    if (saveConfig(FIREWALL_CONFIG_PATH, newRules)) {
        firewallRules = newRules; // Update runtime variable
        res.json({ success: true, message: 'Aturan Firewall dan DDoS berhasil disimpan dan perintah Termux telah dikirim.' });
    } else {
        res.status(500).json({ success: false, message: 'Gagal menyimpan aturan Firewall.' });
    }
});


// Start the server
app.listen(PORT, HOST_IP, () => {
    const serverIp = getLocalIP();
    console.log('----------------------------------------------------');
    console.log(`[PAONGDEV] Termux VPS Dashboard | SC File 10`);
    console.log(`[INFO] Dashboard berjalan di: http://${serverIp}:${PORT}`);
    console.log(`[INFO] Port: ${PORT} | Maks Upload: ${nodeSettings.server?.maxFileSizeMB || 50} MB`);
    console.log(`[INFO] Firewall Status: ${firewallRules.firewall?.status || 'N/A'}`);
    console.log('----------------------------------------------------');
});
