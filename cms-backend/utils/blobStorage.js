const { put, del } = require('@vercel/blob');

/**
 * Upload a file buffer to Vercel Blob storage
 * @param {Buffer} buffer - The file buffer
 * @param {string} filename - The filename to use
 * @param {string} contentType - The MIME type
 * @returns {Promise<{url: string}>} - The blob URL
 */
async function uploadToBlob(buffer, filename, contentType) {
    // In production (Vercel), use Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(filename, buffer, {
            access: 'public',
            contentType: contentType,
        });
        return { url: blob.url };
    }

    // In local development, fall back to saving locally
    const fs = require('fs');
    const path = require('path');

    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'comprovantes');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    return { url: `/uploads/comprovantes/${filename}` };
}

/**
 * Delete a file from Vercel Blob storage
 * @param {string} url - The blob URL to delete
 */
async function deleteFromBlob(url) {
    if (process.env.BLOB_READ_WRITE_TOKEN && url.includes('vercel-storage.com')) {
        try {
            await del(url);
        } catch (error) {
            console.error('Error deleting blob:', error);
        }
    }
    // For local files, we don't delete to keep history
}

module.exports = { uploadToBlob, deleteFromBlob };
