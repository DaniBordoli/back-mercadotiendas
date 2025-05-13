const { OpenAI } = require('openai');
const { config } = require('../config');

const openai = new OpenAI({
    apiKey: config.openaiApiKey,
});

// Define the structure expected by the frontend template
const TEMPLATE_STRUCTURE = `
{
  "navbarLinks": [{ "label": "string", "href": "string" }],
  "title": "string",
  "fontType": "string (e.g., 'Arial', 'Verdana', 'Times New Roman', 'Courier New')",
  "placeholderHeroImage": "string (URL)",
  "placeholderCardImage": "string (URL)",
  "textColor": "string (hex color, e.g., '#000000')",
  "navbarBackgroundColor": "string (hex color)",
  "mainBackgroundColor": "string (hex color)",
  "footerBackgroundColor": "string (hex color)",
  "footerTextColor": "string (hex color)",
  "footerSections": [{ "title": "string", "links": [{ "text": "string", "url": "string" }] }],
  "footerDescription": "string",
  "searchTitle": "string (Title above product cards)",
  "buttonBackgroundColor": "string (hex color)",
  "buttonTextColor": "string (hex color)",
  "buttonBorderColor": "string (hex color)",
  "buttonText": "string",
  "button2Text": "string",
  "button2BackgroundColor": "string (hex color)",
  "button2TextColor": "string (hex color)",
  "heroBackgroundColor": "string (hex color)",
  "featuredProductsTitle": "string",
  "categorySectionTitle": "string",
  "storeName": "string",
  "storeDescription": "string",
  "storeSlogan": "string",
  "primaryColor": "string (hex color)",
  "secondaryColor": "string (hex color)",
  "footerElements": [{ "title": "string", "content": "string" }]
}
`;

const SYSTEM_PROMPT = `You are an AI assistant helping a user create their online store template.\nYour goal is to understand the user's requests about their store's design and content, and provide both a conversational response and structured JSON data to update the store template.\n\nThe user will interact with you conversationally. Based on the conversation history and the user's latest message, perform the following:\n1.  Generate a helpful, conversational reply to the user.\n2.  If the user's request implies changes to the store template, generate a JSON object containing *only* the fields to be updated.\n3.  The JSON object structure for template updates MUST strictly follow this format (only include keys that need changing): ${TEMPLATE_STRUCTURE}\n\nYour final response MUST be a single JSON object containing two keys:\n- \"reply\": Your conversational text response to the user (string).\n- \"templateUpdates\": The JSON object with the template changes (object or null if no changes).\n- **\"isFinalStep\": A boolean flag. Set this to \`true\` ONLY when you determine the initial configuration gathering via conversation is complete and the user should proceed to a final confirmation step. Otherwise, omit it or set it to \`false\**. \n\nExample Interaction:\nUser: \"I want my store name to be 'Cool Kicks'\"\nYour JSON response:\n{\n  \"reply\": \"Great! I've set your store name to 'Cool Kicks'. What kind of products will you be selling?\",\n  \"templateUpdates\": { \"storeName\": \"Cool Kicks\", \"title\": \"Cool Kicks\" },\n  \"isFinalStep\": false\n}\n\nUser: \"Make the main background color light gray\"\nYour JSON response:\n{\n  \"reply\": \"Okay, I've updated the main background color to light gray.\",\n  \"templateUpdates\": { \"mainBackgroundColor\": \"#F0F0F0\" },\n  \"isFinalStep\": false\n}\n\nUser: \"That's all for now, looks good.\"\nYour JSON response:\n{\n  \"reply\": \"Excellent! I've gathered the basic configuration. Please review the summary and choose your store's URL to finalize.\",\n  \"templateUpdates\": null,\n  \"isFinalStep\": true \n}\n\nAnalyze the user's request carefully. Infer template changes even if not explicitly stated (e.g., \"Make it look professional\" might suggest font or color changes). Be creative but stick to the defined structure for updates. Use the provided current template variables as context for changes.\n**Crucially, remember to set \`isFinalStep\` to \`true\` in the final JSON response when the configuration dialogue is complete.**\n`;

const getAIChatResponse = async (conversationHistory, currentTemplateVariables) => {
    // Add current template variables to the last user message for context (optional, adjust as needed)
    const lastMessage = conversationHistory.pop();
    lastMessage.content += `\n\nCurrent Template State: ${JSON.stringify(currentTemplateVariables)}`;
    conversationHistory.push(lastMessage);

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: messages,
            response_format: { type: "json_object" }, // Request JSON output
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error("No content received from OpenAI.");
        }

        try {
            const parsedJson = JSON.parse(content);
            if (typeof parsedJson.reply === 'string' && (typeof parsedJson.templateUpdates === 'object' || parsedJson.templateUpdates === null)) {
                parsedJson.isFinalStep = parsedJson.isFinalStep || false;
                return parsedJson;
            } else {
                 console.warn("OpenAI response JSON structure is invalid, attempting fallback parsing.");
                 const replyMatch = content.match(/"reply":\s*"([^"]*)"/);
                 const updatesMatch = content.match(/"templateUpdates":\s*({.*?}|null)/s);
                 return {
                     reply: replyMatch ? replyMatch[1] : "Sorry, I couldn't process that properly.",
                     templateUpdates: updatesMatch && updatesMatch[1] !== 'null' ? JSON.parse(updatesMatch[1]) : null,
                     isFinalStep: false
                 };
            }
        } catch (parseError) {
             console.error("Failed to parse OpenAI JSON response:", parseError, "Content:", content);
             return { reply: content, templateUpdates: null, isFinalStep: false };
        }

    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        throw new Error("Failed to get response from AI assistant.");
    }
};

module.exports = {
    getAIChatResponse,
}; 