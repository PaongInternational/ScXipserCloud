#!/bin/bash
# Developer: PaongDev
# Skrip Pembantu Deployment Termux

ACTION=$1
FILE_PATH=$2
TARGET_DIR=$3

echo "--- PaongDev Deployment Log ---"
echo "Aksi: $ACTION"
echo "Target Dir: $TARGET_DIR"

if [ "$ACTION" = "UNZIP" ]; then
    if [ -f "$FILE_PATH" ]; then
        echo "Mengekstrak $FILE_PATH ke $TARGET_DIR..."
        
        # Buat direktori jika belum ada
        mkdir -p "$TARGET_DIR"
        
        # Eksekusi unzip (overwrite -o)
        unzip -o "$FILE_PATH" -d "$TARGET_DIR"
        
        if [ $? -eq 0 ]; then
            echo "Ekstraksi ZIP berhasil."
        else
            echo "Error: Gagal mengekstrak berkas ZIP."
            exit 1
        fi
        
        # Hapus berkas ZIP setelah diekstrak (bersihkan)
        rm "$FILE_PATH"
        echo "Berkas ZIP dihapus."
        exit 0
    else
        echo "Error: Berkas ZIP tidak ditemukan di $FILE_PATH."
        exit 1
    fi
else
    echo "Error: Aksi tidak dikenal: $ACTION"
    exit 1
fi
