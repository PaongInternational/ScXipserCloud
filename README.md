PaongDev Termux VPS Dashboard (SC File 10 - Versi Lengkap)
Dashboard manajemen server berbasis web yang berjalan di Termux. Dashboard ini menggunakan Node.js (Express) dan eksekusi perintah shell nyata untuk mengelola layanan, konfigurasi server, dan aturan keamanan.
Developer: PaongDev
Email: bypaongpinew@gmail.com
⚠️ Prasyarat & Instalasi di Termux
Pastikan Anda telah menginstal paket-paket berikut di Termux:
Langkah 1: Instalasi Paket Termux
Buka Termux dan jalankan perintah:
# Update paket
pkg update && pkg upgrade

# Instal Node.js, unzip, dan skrip lain (misal: SSH, Nginx)
pkg install nodejs unzip nginx openssh mariadb

# Pastikan Anda mengaktifkan akses penyimpanan
termux-setup-storage

Langkah 2: Cloning & Struktur File
Pastikan 10 berkas berikut ada di direktori root proyek:
 * LICENSE
 * package.json
 * .env.example
 * config/db.json
 * config/node_settings.json (BARU)
 * config/firewall_rules.json (BARU)
 * index.html
 * server.js
 * deploy.sh
 * README.md
Langkah 3: Konfigurasi
 * Buat .env: Salin .env.example dan ubah kredensial (username/password) dan JWT_SECRET.
   cp .env.example .env
chmod +x deploy.sh

 * Instal Dependensi:
   npm install

Langkah 4: Jalankan Dashboard
Jalankan server Node.js:
node server.js

Akses dashboard dari browser Anda menggunakan alamat IP lokal Termux dan port yang ditentukan (default: http://<IP_ANDA>:3000).
⚙️ Manajemen Pengaturan & Keamanan
1. Firewall & DDoS Protection
Bagian ini memungkinkan Anda mengelola konfigurasi keamanan. Perintah nyata yang digunakan akan bergantung pada variabel lingkungan TERMUX_FIREWALL_CMD di .env.
 * Jika Termux Anda di-Root/Proot: Anda dapat mengganti variabel di .env menjadi TERMUX_FIREWALL_CMD=iptables untuk menjalankan perintah firewall yang sesungguhnya.
 * Jika Termux Non-Root: Secara default, hanya akan ada simulasi dengan rate limiting yang diimplementasikan di sisi Node.js (Middleware di server.js yang tidak terlihat, namun diaktifkan saat konfigurasi DDoS disimpan).
2. Node.js Settings
Anda dapat mengontrol parameter penting server Node.js:
 * Server Port: Mengubah port dashboard. PERLU RESTART server.js MANUAL!
 * Max Ukuran File Upload: Mengontrol limit file yang diizinkan Multer saat deployment.
 * CLI Timeout: Mengatur batas waktu (detik) untuk setiap perintah yang dieksekusi di CLI Terminal.
