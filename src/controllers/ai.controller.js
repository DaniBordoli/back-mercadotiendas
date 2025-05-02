const aiService = require('../services/ai.service');
const { successResponse, errorResponse } = require('../utils/response');

const handleChat = async (req, res) => {
    try {
        const { messages, currentTemplate } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return errorResponse(res, 'Invalid chat messages provided', 400);
        }
        if (!currentTemplate || typeof currentTemplate !== 'object') {
             return errorResponse(res, 'Invalid current template state provided', 400);
        }

        // Ensure message format is correct for OpenAI
        const formattedMessages = messages.map(msg => ({
            role: msg.sender === 'ai' ? 'assistant' : 'user',
            content: msg.text // Assuming frontend sends { sender: 'user'|'ai', text: '...' }
        }));

        const result = await aiService.getAIChatResponse(formattedMessages, currentTemplate);

        return successResponse(res, {
            reply: result.reply,
            templateUpdates: result.templateUpdates,
            isFinalStep: result.isFinalStep || false
        }, 'AI response generated');

    } catch (error) {
        console.error("Error in AI chat controller:", error);
        return errorResponse(res, error.message || 'Error processing AI chat request', 500);
    }
};

module.exports = {
    handleChat,
}; 