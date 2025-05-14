const cloudinary = require('cloudinary').v2;

// Configuración de Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

class CloudinaryService {
    /**
     * Sube una imagen a Cloudinary
     * @param {Buffer} fileBuffer - Buffer del archivo
     * @param {string} folder - Carpeta donde se guardará la imagen
     * @returns {Promise<string>} URL de la imagen
     */
    async uploadImage(fileBuffer, folder = 'shops') {
        try {
            // Convertir el buffer a base64
            const base64Image = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;

            // Subir la imagen a Cloudinary
            const result = await cloudinary.uploader.upload(base64Image, {
                folder: folder,
                resource_type: 'auto',
                transformation: [
                    { width: 1000, crop: 'limit' }, // Limitar el tamaño máximo
                    { quality: 'auto:good' } // Optimización automática de calidad
                ]
            });

            return result.secure_url;
        } catch (error) {
            console.error('Error al subir imagen a Cloudinary:', error);
            throw new Error('Error al subir la imagen');
        }
    }

    /**
     * Elimina una imagen de Cloudinary
     * @param {string} imageUrl - URL de la imagen a eliminar
     */
    async deleteImage(imageUrl) {
        try {
            if (!imageUrl) return;

            // Extraer el public_id de la URL
            const publicId = this.getPublicIdFromUrl(imageUrl);
            if (!publicId) return;

            // Eliminar la imagen
            await cloudinary.uploader.destroy(publicId);
        } catch (error) {
            console.error('Error al eliminar imagen de Cloudinary:', error);
            throw new Error('Error al eliminar la imagen');
        }
    }

    /**
     * Extrae el public_id de una URL de Cloudinary
     * @param {string} url - URL de Cloudinary
     * @returns {string|null} public_id de la imagen
     */
    getPublicIdFromUrl(url) {
        try {
            const urlParts = url.split('/');
            const fileName = urlParts[urlParts.length - 1].split('.')[0];
            const folder = urlParts[urlParts.length - 2];
            return `${folder}/${fileName}`;
        } catch {
            return null;
        }
    }
}

module.exports = new CloudinaryService();
