import { useCallback } from 'react';
import heic2any from 'heic2any';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function convertHeicToJpeg(file: File): Promise<File> {
  try {
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY });
    const blob = Array.isArray(converted) ? converted[0]! : converted;
    return new File(
      [blob],
      file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() },
    );
  } catch {
    // If conversion fails, proceed with original file
    console.warn('HEIC conversion failed, uploading original');
    return file;
  }
}

export async function compressImage(file: File): Promise<File> {
  // Convert HEIC to JPEG first, then continue to canvas compression
  if (isHeic(file)) {
    const converted = await convertHeicToJpeg(file);
    // If conversion failed (returned same file), pass through
    if (converted === file) {
      return file;
    }
    // Continue with the converted JPEG through the compression pipeline
    file = converted;
  }

  return new Promise((resolve, reject) => {

    const url = URL.createObjectURL(file);

    loadImage(url)
      .then((img) => {
        URL.revokeObjectURL(url);

        let { width, height } = img;
        const longestEdge = Math.max(width, height);

        if (longestEdge <= MAX_DIMENSION && file.type === 'image/jpeg') {
          resolve(file);
          return;
        }

        if (longestEdge > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / longestEdge;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressed = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'),
              { type: 'image/jpeg', lastModified: Date.now() },
            );
            resolve(compressed);
          },
          'image/jpeg',
          JPEG_QUALITY,
        );
      })
      .catch(() => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to compress image'));
      });
  });
}

export function useImageCompression() {
  const compress = useCallback((file: File) => compressImage(file), []);
  return { compress };
}
