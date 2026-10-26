import { useState } from 'react';
import { errorMessage } from '../services/api';

const MAX_FILES = 5;

/**
 * Destek mesajlarına dosya ekleme: düğmeyle seçme, sürükle-bırak ve panodan yapıştırma (ekran görüntüsü).
 * Dosyalar seçilir seçilmez yüklenir; mesaj gönderilirken yalnızca bağlantıları gider.
 */
const useAttachments = (client, uploadPath, onError) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);

  const addFiles = async (list) => {
    const picked = Array.from(list || []).slice(0, Math.max(0, MAX_FILES - files.length));
    if (!picked.length) {
      if (list?.length) onError?.(`En fazla ${MAX_FILES} dosya eklenebilir.`);
      return;
    }
    setUploading((n) => n + picked.length);
    for (const file of picked) {
      try {
        const data = new FormData();
        // Panodan gelen görsellerin adı "image.png" olur; anlaşılır bir ad verilir
        const named = file.name && file.name !== 'image.png' ? file : new File([file], `ekran-goruntusu-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.png`, { type: file.type });
        data.append('file', named);
        const res = await client.post(uploadPath, data);
        setFiles((prev) => [...prev, res.data]);
      } catch (err) {
        onError?.(errorMessage(err, `${file.name} yüklenemedi.`));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  return {
    files,
    uploading: uploading > 0,
    dragging,
    addFiles,
    remove: (url) => setFiles((prev) => prev.filter((f) => f.url !== url)),
    reset: () => setFiles([]),
    // Metin alanına yapıştırılan görseller (Ctrl+V ile ekran görüntüsü) eklenir
    onPaste: (e) => {
      const images = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (images.length) { e.preventDefault(); addFiles(images); }
    },
    dropProps: {
      onDragOver: (e) => { e.preventDefault(); setDragging(true); },
      onDragLeave: () => setDragging(false),
      onDrop: (e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }
    }
  };
};

export default useAttachments;
