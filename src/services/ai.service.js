const { OpenAI } = require('openai');
const { config } = require('../config');

const openai = new OpenAI({
    apiKey: config.openaiApiKey,
});

// Define the structure expected by the frontend template
const TEMPLATE_STRUCTURE = `
{
  "navbarTitle": "string",
  "navbarTitleColor": "string (hex color)",
  "navbarLinksColor": "string (hex color)",
  "navbarIconsColor": "string (hex color)",
  "heroTitle": "string",
  "heroTitleColor": "string (hex color)",
  "categoryTitle": "string",
  "categoryTitleColor": "string (hex color)",
  "featuredProductsTitle": "string",
  "featuredProductsTitleColor": "string (hex color)",
  "purpleSectionTitle": "string",
  "purpleSectionTitleColor": "string (hex color)",
  "newsletterTitle": "string",
  "newsletterTitleColor": "string (hex color)",
  "footerTitle": "string",
  "footerTitleColor": "string (hex color)",
  "navbarLinks": [{ "label": "string", "href": "string" }],
  "fontType": "string (e.g., 'Arial', 'Verdana', 'Times New Roman', 'Courier New')",
  "placeholderHeroImage": "string (URL)",
  "placeholderCardImage": "string (URL)",
  "logoUrl": "string (URL of the logo image)",
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
  "categorySectionTitle": "string",
  "title": "string (store name - syncs with Shop.name)",
  "shopName": "string (alternative store name - syncs with Shop.name)",
  "storeName": "string (alternative store name - syncs with Shop.name)",
  "storeDescription": "string",
  "storeSlogan": "string",
  "primaryColor": "string (hex color - main brand color)",
  "secondaryColor": "string (hex color - accent color for text/buttons/links)",
  "featuredProductsCardButtonColor": "string (hex color)",
  "featuredProductsCardButtonTextColor": "string (hex color)",
  "heroDescription": "string",
  "footerElements": [{ "title": "string", "content": "string" }]
}
`;

const SYSTEM_PROMPT = `You are an AI assistant helping a user create their online store template.\nYour goal is to understand the user's requests about their store's design and content, and provide both a conversational response and structured JSON data to update the store template.\n\nThe user will interact with you conversationally. Based on the conversation history and the user's latest message, perform the following:\n1.  Generate a helpful, conversational reply to the user.\n2.  If the user's request implies changes to the store template, generate a JSON object containing *only* the fields to be updated.\n3.  The JSON object structure for template updates MUST strictly follow this format (only include keys that need changing): ${TEMPLATE_STRUCTURE}\n\nSpecial handling for logos:\n- When a user mentions wanting to change/add a logo, ask them to provide the URL of their logo image\n- If they provide a URL, update the "logoUrl" field in templateUpdates\n- Always validate that logo URLs are properly formatted (http/https)\n- If they mention uploading a logo but don't provide a URL, guide them to first upload their logo to a hosting service and then provide the URL\n\nSpecial handling for colors:\n- When a user requests general color changes (e.g., "change colors to pastels", "make it more colorful", "use warm colors"), update ALL relevant color fields to create a cohesive design\n- Use primaryColor for main sections and secondaryColor for accent elements (buttons, links, highlights)\n- When updating colors, ensure you update: mainBackgroundColor, navbarBackgroundColor, heroBackgroundColor, footerBackgroundColor, primaryColor, secondaryColor, buttonBackgroundColor, button2BackgroundColor, featuredProductsCardButtonColor, textColor, footerTextColor, buttonTextColor, button2TextColor, featuredProductsCardButtonTextColor\n- For pastel themes: use soft, muted colors with high lightness and low saturation\n- For professional themes: use darker, more muted colors with good contrast\n- For vibrant themes: use bright, saturated colors\n- Always ensure good contrast between background and text colors for readability\n\nIMPORTANT: Always strictly respect the user's prompt. If the user asks to change the color of a specific element (for example, "I want to change the color of the navbar title to blue"), you must update ONLY the color of that specific element (e.g., the navbar title) and NOT all the text colors in the navbar or other sections. Apply this rule for any specific request: only update the exact field or element the user refers to, not all related fields.\n\nYour final response MUST be a single JSON object containing two keys:\n- "reply": Your conversational text response to the user (string).\n- "templateUpdates": The JSON object with the template changes (object or null if no changes).\n- **"isFinalStep": A boolean flag. Set this to \`true\` ONLY when you determine the initial configuration gathering via conversation is complete and the user should proceed to a final confirmation step. Otherwise, omit it or set it to \`false\**. \n\nExample Interaction:\nUser: \"I want my store name to be 'Cool Kicks'\"\nYour JSON response:\n{\n  "reply": "Great! I've set your store name to 'Cool Kicks'. What kind of products will you be selling?\",\n  "templateUpdates": { "title": "Cool Kicks", "shopName": "Cool Kicks", "storeName": "Cool Kicks" },\n  "isFinalStep": false\n}\n\nUser: \"I want to change the logo to https://example.com/my-logo.png\"\nYour JSON response:\n{\n  "reply": \"Perfect! I've updated your store logo. The new logo will be displayed in your navigation bar.\",\n  "templateUpdates": { "logoUrl": \"https://example.com/my-logo.png\" },\n  "isFinalStep": false\n}\n\nUser: \"I want pastel colors for my page\"\nYour JSON response:\n{\n  "reply": \"Perfect! I've updated your store with a beautiful pastel color scheme. The soft colors will give your store a gentle, welcoming feel.\",\n  "templateUpdates": {\n    "primaryColor": "#E8B4CB\",\n    "secondaryColor": "#B4D6E8", \n    "mainBackgroundColor": "#F9F6FF\",\n    "navbarBackgroundColor": "#F0E6FF\",\n    "heroBackgroundColor": "#FFF0F8\",\n    "footerBackgroundColor": "#E6F3FF\",\n    "buttonBackgroundColor": "#D4A4D4\",\n    "button2BackgroundColor": "#A4C4D4\",\n    "featuredProductsCardButtonColor": "#D4A4D4\",\n    "textColor": "#4A4A4A\",\n    "footerTextColor": "#4A4A4A\",\n    "buttonTextColor": "#FFFFFF\",\n    "button2TextColor": "#FFFFFF\",\n    "featuredProductsCardButtonTextColor": "#FFFFFF\"\n  },\n  "isFinalStep": false\n}\n\nUser: \"Make it look more professional\"\nYour JSON response:\n{\n  "reply": \"Excellent! I've updated your store with a professional color scheme that will give your business a trustworthy and sophisticated appearance.\",\n  "templateUpdates": {\n    "primaryColor": "#2C3E50\",\n    "secondaryColor": "#3498DB\",\n    "mainBackgroundColor": "#FFFFFF\",\n    "navbarBackgroundColor": "#2C3E50\",\n    "heroBackgroundColor": "#F8F9FA\",\n    "footerBackgroundColor": "#34495E\",\n    "buttonBackgroundColor": "#3498DB\",\n    "button2BackgroundColor": "#2C3E50\",\n    "featuredProductsCardButtonColor": "#3498DB\",\n    "textColor": "#2C3E50\",\n    "footerTextColor": "#FFFFFF\",\n    "buttonTextColor": "#FFFFFF\",\n    "button2TextColor": "#FFFFFF\",\n    "featuredProductsCardButtonTextColor": "#FFFFFF\"\n  },\n  "isFinalStep": false\n}\n\nUser: \"That's all for now, looks good.\"\nYour JSON response:\n{\n  "reply": "Excellent! I've gathered the basic configuration. Please review the summary and choose your store's URL to finalize.",\n  "templateUpdates": null,\n  "isFinalStep": true \n}\n\nAnalyze the user's request carefully. Infer template changes even if not explicitly stated (e.g., "Make it look professional" might suggest font or color changes). Be creative but stick to the defined structure for updates. Use the provided current template variables as context for changes.\n**Crucially, remember to set \`isFinalStep\` to \`true\` in the final JSON response when the configuration dialogue is complete.**\n`;

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