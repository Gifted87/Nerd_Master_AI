const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
    console.error('GOOGLE_API_KEY not found.');
    process.exit(1);
}

async function testGemini() {
    try {
        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // Use a documented model name
        console.log("GenerativeModel initialized successfully.");
    } catch (error) {
        console.error("Error initializing GenerativeModel:", error);
    }
}

testGemini();