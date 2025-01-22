const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
    console.error('GOOGLE_API_KEY not found in environment variables. Please set it.');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" }); // Or another suitable Gemini model

const generationConfig = {
    temperature: 2,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
};

const systemInstruction = "You are a helpful chatbot that can provide information and answer questions. You can also provide explanations and summaries of text, as well as generate code snippets and markdown content.";

const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: (str, lang) => {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value;
            } catch (__) {}
        }
        return '';
    }
}).enable(['table', 'code']);

async function generateResponse(chat, userMessage, ws) {
    try {
        console.log("Generating response for user message:", userMessage);
        ws.send(JSON.stringify({ type: 'status', message: 'typing' }));
        console.log("Sent 'typing' status to websocket");
        // console.log("Chat History:", chat.history);

        const startTime = Date.now();
        const result = await chat.sendMessage(userMessage);
        const endTime = Date.now();
        const elapsedTime = endTime - startTime;

        // console.log("Chat History:", chat.history);

        console.log(`API call took ${elapsedTime}ms`);
        console.log("Raw API response:", result);

        const response = result.response;
        const responseText = await response.text();

        console.log("Response text:", responseText);

        return responseText;
    } catch (error) {
        console.error('Error generating response:', error);
        if (error.response) {
            console.error('API Error Response:', error.response.data);
        }
        return "I couldn't generate a response.";
    }
}

module.exports = {
    generateResponse,
    model,
    generationConfig,
    systemInstruction,
    md,
};