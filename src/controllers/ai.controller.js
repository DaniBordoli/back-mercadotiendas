const aiService = require('../services/ai.service');
const { successResponse, errorResponse } = require('../utils/response');
const User = require('../models/User');

const REQUIRED_SHOP_FIELDS = ['shopName', 'layoutDesign', 'contactEmail', 'shopPhone', 'subdomain'];

const handleChat = async (req, res) => {
    try {
        const { messages, currentTemplate } = req.body;
        const userId = req.user && req.user.id;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return errorResponse(res, 'Invalid chat messages provided', 400);
        }
        if (!currentTemplate || typeof currentTemplate !== 'object') {
             return errorResponse(res, 'Invalid current template state provided', 400);
        }
        if (!userId) {
            return errorResponse(res, 'Usuario no autenticado', 401);
        }
        const user = await User.findById(userId).populate('shop');
        if (!user) {
            return errorResponse(res, 'Usuario no encontrado', 404);
        }
        if (user.shop) {
            const formattedMessages = messages.map(msg => ({
                role: msg.sender === 'ai' ? 'assistant' : 'user',
                content: msg.text // Assuming frontend sends { sender: 'user'|'ai', text: '...' }
            }));
            const result = await aiService.getAIChatResponse(formattedMessages, currentTemplate);
            
            // NO guardar automáticamente los cambios del template
            // Los cambios solo se aplicarán cuando el usuario confirme en el frontend
            
            return successResponse(res, {
                reply: result.reply,
                templateUpdates: result.templateUpdates,
                isFinalStep: result.isFinalStep || false
            }, 'AI response generated');
        }
        // Si el usuario NO tiene tienda, guiar la recolección de datos obligatorios
        // Revisar qué campos ya tiene el currentTemplate
        const missingFields = REQUIRED_SHOP_FIELDS.filter(field => !currentTemplate[field]);
        if (missingFields.length > 0) {
            // Preguntar por el siguiente campo faltante
            const nextField = missingFields[0];
            let question = '';
            switch (nextField) {
                case 'shopName':
                    question = '¿Cómo se llamará tu tienda?';
                    break;
                case 'layoutDesign':
                    question = '¿Qué diseño o plantilla prefieres para tu tienda? (Por ejemplo: moderno, minimalista, clásico, etc.)';
                    break;
                case 'contactEmail':
                    question = '¿Cuál es el correo de contacto de tu tienda?';
                    break;
                case 'shopPhone':
                    question = '¿Cuál es el teléfono de tu tienda?';
                    break;
                case 'subdomain':
                    question = '¿Qué subdominio quieres para tu tienda? (Ejemplo: mitienda, solo minúsculas, números o guiones, 3-30 caracteres)';
                    break;
                default:
                    question = `Por favor, proporciona el dato para: ${nextField}`;
            }
            return successResponse(res, {
                reply: question,
                templateUpdates: null,
                isFinalStep: false,
                requiredShopFields: missingFields
            }, 'Recolectando datos obligatorios para crear tienda');
        }
        // Si ya tiene todos los datos obligatorios, chequear si el usuario está confirmando la creación
        const lastUserMessage = messages.length > 0 ? messages[messages.length - 1].text.trim().toLowerCase() : '';
        const confirmationWords = ['sí', 'si', 'ok', 'dale', 'crea', 'crear', 'hazlo', 'yes', 'sure', 'go', 'adelante', 'confirmo', 'confirmar'];
        const isConfirmation = confirmationWords.some(word => lastUserMessage.startsWith(word));
        if (isConfirmation) {
            return successResponse(res, {
                reply: '¡Listo! Procede a crear la tienda con los datos proporcionados.',
                templateUpdates: null,
                isFinalStep: true,
                shouldCreateShop: true,
                shopData: {
                    shopName: currentTemplate.shopName,
                    layoutDesign: currentTemplate.layoutDesign,
                    contactEmail: currentTemplate.contactEmail,
                    shopPhone: currentTemplate.shopPhone,
                    subdomain: currentTemplate.subdomain
                }
            }, 'Confirmación recibida, proceder a crear tienda');
        }
       
        return successResponse(res, {
            reply: `¡Perfecto! He recopilado toda la información necesaria para tu tienda. Aquí está el resumen:

🏪 **Nombre de la tienda:** ${currentTemplate.shopName}
🎨 **Diseño:** ${currentTemplate.layoutDesign}
📧 **Email de contacto:** ${currentTemplate.contactEmail}
📞 **Teléfono:** ${currentTemplate.shopPhone}
🌐 **Subdominio:** ${currentTemplate.subdomain}

¿Quieres que proceda a crear tu tienda con esta información?`,
            templateUpdates: null,
            isFinalStep: true,
            shopData: {
                shopName: currentTemplate.shopName,
                layoutDesign: currentTemplate.layoutDesign,
                contactEmail: currentTemplate.contactEmail,
                shopPhone: currentTemplate.shopPhone,
                subdomain: currentTemplate.subdomain
            }
        }, 'Resumen completo y datos listos para crear tienda');
    } catch (error) {
        console.error("Error in AI chat controller:", error);
        return errorResponse(res, error.message || 'Error processing AI chat request', 500);
    }
};

module.exports = {
    handleChat,
};