const aiService = require('../services/ai.service');
const { successResponse, errorResponse } = require('../utils/response');
const User = require('../models/User');
const ShopInstitutional = require('../models/ShopInstitutional');

const REQUIRED_SHOP_FIELDS = ['shopName', 'layoutDesign', 'contactEmail', 'shopPhone', 'subdomain'];
const INSTITUTIONAL_FIELDS = ['description', 'mission', 'vision', 'history', 'values'];

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
                content: msg.text
            }));
            
            // Detectar y guardar campos institucionales
            const lastUserMessage = messages[messages.length - 1].text;
            const lastAIMessage = messages.length > 1 ? messages[messages.length - 2].text.toLowerCase() : '';
            
            let institutionalUpdates = {};
            
            // Solo guardar si la IA hizo una pregunta específica institucional en el mensaje anterior
            if (lastAIMessage.includes('describe brevemente tu tienda') || 
                lastAIMessage.includes('qué tipo de productos venderás') || 
                lastAIMessage.includes('industria/rubro') ||
                lastAIMessage.includes('cuál quieres que sea la nueva descripción')) {
                institutionalUpdates.description = lastUserMessage;
            } else if (lastAIMessage.includes('cuál es la misión') || 
                       lastAIMessage.includes('qué propósito tiene tu negocio') ||
                       lastAIMessage.includes('cuál quieres que sea la nueva misión')) {
                institutionalUpdates.mission = lastUserMessage;
            } else if (lastAIMessage.includes('cuál es la visión') || 
                       lastAIMessage.includes('hacia dónde quieres que crezca') ||
                       lastAIMessage.includes('cuál quieres que sea la nueva visión')) {
                institutionalUpdates.vision = lastUserMessage;
            } else if (lastAIMessage.includes('historia de tu marca') || 
                       lastAIMessage.includes('cómo surgió la idea') ||
                       lastAIMessage.includes('cuál quieres que sea la nueva historia')) {
                institutionalUpdates.history = lastUserMessage;
            } else if (lastAIMessage.includes('qué valores son importantes') || 
                       lastAIMessage.includes('reflejar en la tienda') ||
                       lastAIMessage.includes('cuáles quieres que sean los nuevos valores')) {
                institutionalUpdates.values = lastUserMessage;
            }
            
            // Si hay campos institucionales para actualizar, guardarlos
            if (Object.keys(institutionalUpdates).length > 0) {
                try {
                    let shopInstitutional = await ShopInstitutional.findOne({ shop: user.shop._id });
                    if (!shopInstitutional) {
                        shopInstitutional = new ShopInstitutional({
                            shop: user.shop._id,
                            ...institutionalUpdates
                        });
                    } else {
                        Object.assign(shopInstitutional, institutionalUpdates);
                    }
                    await shopInstitutional.save();
                    
                    const fieldName = Object.keys(institutionalUpdates)[0];
                    const fieldValue = institutionalUpdates[fieldName];
                    const friendlyNames = {
                        description: 'descripción',
                        mission: 'misión',
                        vision: 'visión',
                        history: 'historia',
                        values: 'valores'
                    };
                    
                    return successResponse(res, {
                        reply: `He actualizado la ${friendlyNames[fieldName]} de tu tienda a: '${fieldValue}'. ¿Quieres modificar algo más?`,
                        templateUpdates: null,
                        isFinalStep: false
                    }, 'Información institucional guardada');
                } catch (error) {
                    console.error('Error guardando información institucional:', error);
                }
            }
            
            // Detectar solicitudes de cambio de campos institucionales
            const userMessageLower = lastUserMessage.toLowerCase();
            if (userMessageLower.includes('cambiar') || userMessageLower.includes('modificar') || userMessageLower.includes('actualizar')) {
                if (userMessageLower.includes('descripción') || userMessageLower.includes('descripcion')) {
                    return successResponse(res, {
                        reply: 'Claro, dime por favor cuál quieres que sea la nueva descripción de tu tienda y la actualizaré para ti.',
                        templateUpdates: null,
                        isFinalStep: false
                    }, 'Solicitando nueva descripción');
                } else if (userMessageLower.includes('misión') || userMessageLower.includes('mision')) {
                    return successResponse(res, {
                        reply: 'Perfecto, dime cuál quieres que sea la nueva misión de tu tienda.',
                        templateUpdates: null,
                        isFinalStep: false
                    }, 'Solicitando nueva misión');
                } else if (userMessageLower.includes('visión') || userMessageLower.includes('vision')) {
                    return successResponse(res, {
                        reply: 'Excelente, dime cuál quieres que sea la nueva visión de tu tienda.',
                        templateUpdates: null,
                        isFinalStep: false
                    }, 'Solicitando nueva visión');
                } else if (userMessageLower.includes('historia')) {
                    return successResponse(res, {
                        reply: 'Perfecto, cuéntame cuál quieres que sea la nueva historia de tu tienda.',
                        templateUpdates: null,
                        isFinalStep: false
                    }, 'Solicitando nueva historia');
                } else if (userMessageLower.includes('valores')) {
                    return successResponse(res, {
                        reply: 'Genial, dime cuáles quieres que sean los nuevos valores de tu tienda.',
                        templateUpdates: null,
                        isFinalStep: false
                    }, 'Solicitando nuevos valores');
                }
            }
            
            // Mejorar reconocimiento de referencias al Hero
            const heroKeywords = [
                'hero', 'principal', 'titulo principal', 'texto principal', 'imagen principal',
                'encabezado', 'banner', 'portada', 'cabecera', 'sección principal',
                'título grande', 'texto grande', 'primera sección', 'parte de arriba',
                'lo primero que se ve', 'imagen de fondo', 'texto de bienvenida'
            ];
            
            const isHeroReference = heroKeywords.some(keyword => userMessageLower.includes(keyword));
            
            if (isHeroReference) {
                let heroUpdates = {};
                
                if (userMessageLower.includes('color') && (userMessageLower.includes('titulo') || userMessageLower.includes('texto'))) {
                    const colorMatch = userMessageLower.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|azul|rojo|verde|negro|blanco|gris|amarillo|naranja|morado|rosa/);
                    if (colorMatch) {
                        const colorMap = {
                            'azul': '#3B82F6', 'rojo': '#EF4444', 'verde': '#10B981',
                            'negro': '#000000', 'blanco': '#FFFFFF', 'gris': '#6B7280',
                            'amarillo': '#F59E0B', 'naranja': '#F97316', 'morado': '#8B5CF6', 'rosa': '#EC4899'
                        };
                        heroUpdates.heroTitleColor = colorMap[colorMatch[0]] || colorMatch[0];
                    }
                } else if (userMessageLower.includes('titulo') || userMessageLower.includes('texto')) {
                    if (!userMessageLower.includes('color')) {
                        const titleMatch = lastUserMessage.match(/"([^"]+)"/);
                        if (titleMatch) {
                            heroUpdates.heroTitle = titleMatch[1];
                        }
                    }
                } else if (userMessageLower.includes('descripcion') || userMessageLower.includes('subtitulo')) {
                    const descMatch = lastUserMessage.match(/"([^"]+)"/);
                    if (descMatch) {
                        heroUpdates.heroDescription = descMatch[1];
                    }
                } else if (userMessageLower.includes('imagen')) {
                    const urlMatch = lastUserMessage.match(/https?:\/\/[^\s]+/);
                    if (urlMatch) {
                        heroUpdates.placeholderHeroImage = urlMatch[0];
                    }
                }
                
                if (Object.keys(heroUpdates).length > 0) {
                    return successResponse(res, {
                        reply: `He actualizado la sección principal de tu tienda. Los cambios se han aplicado al ${Object.keys(heroUpdates).includes('heroTitle') ? 'título' : Object.keys(heroUpdates).includes('heroTitleColor') ? 'color del título' : Object.keys(heroUpdates).includes('heroDescription') ? 'descripción' : 'imagen'} de la portada. ¿Te gusta cómo se ve?`,
                        templateUpdates: heroUpdates,
                        isFinalStep: false
                    }, 'Actualizando elementos del Hero');
                }
            }
            
            const result = await aiService.getAIChatResponse(formattedMessages, currentTemplate);
            
            return successResponse(res, {
                reply: result.reply,
                templateUpdates: result.templateUpdates,
                isFinalStep: result.isFinalStep || false
            }, 'AI response generated');
        }
        // Si el usuario NO tiene tienda, guiar la recolección de datos obligatorios
        // Revisar qué campos ya tiene el currentTemplate
        const missingFields = REQUIRED_SHOP_FIELDS.filter(field => !currentTemplate[field]);
        const missingInstitutionalFields = INSTITUTIONAL_FIELDS.filter(field => !currentTemplate[field]);
        
        if (missingFields.length > 0) {
            // Preguntar por el siguiente campo obligatorio faltante
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
        
        // Si ya tiene todos los campos obligatorios pero faltan campos institucionales
        if (missingInstitutionalFields.length > 0) {
            const nextField = missingInstitutionalFields[0];
            let question = '';
            switch (nextField) {
                case 'description':
                    question = '¿En qué industria/rubro estás o qué tipo de productos venderás? Describe brevemente tu tienda.';
                    break;
                case 'mission':
                    question = '¿Cuál es la misión de tu tienda? ¿Qué propósito tiene tu negocio?';
                    break;
                case 'vision':
                    question = '¿Cuál es la visión de tu tienda? ¿Hacia dónde quieres que crezca en el futuro?';
                    break;
                case 'history':
                    question = '¿Puedes contarme la historia de tu marca? ¿Cómo surgió la idea de crear esta tienda?';
                    break;
                case 'values':
                    question = '¿Qué valores son importantes para vos y te gustaría reflejar en la tienda?';
                    break;
                default:
                    question = `Por favor, proporciona información sobre: ${nextField}`;
            }
            return successResponse(res, {
                reply: question,
                templateUpdates: null,
                isFinalStep: false,
                institutionalFields: missingInstitutionalFields
            }, 'Recolectando datos institucionales para crear tienda');
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
                },
                institutionalData: {
                    description: currentTemplate.description,
                    mission: currentTemplate.mission,
                    vision: currentTemplate.vision,
                    history: currentTemplate.history,
                    values: currentTemplate.values
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