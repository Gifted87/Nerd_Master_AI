const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const MarkdownIt = require("markdown-it");
const hljs = require("highlight.js");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const sessionManager = require("./sessionManager");
const uuid = require("uuid");
dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);

if (!GOOGLE_API_KEY) {
  console.error(
    "GOOGLE_API_KEY not found in environment variables. Please set it."
  );
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-thinking-exp-01-21",
}); // Default model

const generationConfig = {
  temperature: 1.5,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

async function uploadToGemini(fileData) {
  try {
    // Create temporary file path
    const tempPath = `./temp/${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${fileData.name.split(".").pop()}`;
    fs.writeFileSync(tempPath, Buffer.from(fileData.data, "base64"));

    const uploadResult = await fileManager.uploadFile(tempPath, {
      mimeType: fileData.mimeType,
      displayName: fileData.name,
    });

    fs.unlinkSync(tempPath); // Clean up temp file
    console.log("Uploaded file details:", uploadResult.file);
    return uploadResult.file;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

async function waitForFilesActive(files) {
  console.log("Waiting for file processing...");
  for (const file of files) {
    let currentFile = await fileManager.getFile(file.name);
    while (currentFile.state === "PROCESSING") {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      currentFile = await fileManager.getFile(file.name);
    }
    if (currentFile.state !== "ACTIVE") {
      throw Error(`File ${file.name} failed to process`);
    }
  }
  console.log("\nAll files ready");
}

// System instructions for different task types
const systemInstructions = {
  assignment:
    "You are a helpful AI assistant specialized in helping students with assignments. Provide clear, concise, and step-by-step guidance. Focus on explaining concepts and methods, not just giving answers.",
  project_work:
    "You are an expert project work assistant. Help students brainstorm ideas, plan project stages, suggest resources, and provide feedback on project progress.",
  essay:
    "You are an essay writing tutor. Assist students in outlining essays, developing arguments, providing evidence, and refining their writing style. Focus on clarity, coherence, and academic tone.",
  research_paper:
    "You are a research paper assistant. Guide students through the research process, help in finding relevant sources, structuring arguments, and ensuring academic rigor.",
  maths:
    "You are a maths tutor. Assist students with maths problems, explain mathematical concepts, and guide them to solve problems step-by-step. Focus on logical reasoning and accuracy.",
  reading_comprehension:
    "You are a reading comprehension expert. Help students understand texts, identify key themes, answer questions based on provided texts, and improve their reading skills.",
  default:
    "You are a helpful chatbot that can provide information and answer questions. You can also provide explanations and summaries of text, as well as generate code snippets and markdown content.", // Default instruction
};

// Default system instruction - define it BEFORE getSystemInstructionForTaskType and exports
const systemInstruction = systemInstructions["default"];

// Function to get system instruction based on task type
function getSystemInstructionForTaskType(taskType) {
  return systemInstructions[taskType] || systemInstruction; // Use the default systemInstruction here as fallback
}

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
    return "";
  },
}).enable(["table", "code"]);

async function generateResponse(chat, userMessage, ws, fileDataArray) {
  try {
    console.log("Generating response for user message:", userMessage);
    ws.send(JSON.stringify({ type: "status", message: "typing" }));
    console.log("Sent 'typing' status to websocket");

    const startTime = Date.now();

    console.log("Generating response with files:", fileDataArray);
    const parts = [{ text: userMessage }];
    const uploadedFiles = [];

    if (fileDataArray && fileDataArray.length > 0) {
      for (const fileData of fileDataArray) {
        const geminiFile = await uploadToGemini(fileData);
        uploadedFiles.push(geminiFile);
        parts.push({
          fileData: {
            mimeType: geminiFile.mimeType,
            fileUri: geminiFile.uri,
          },
        });
      }
      await waitForFilesActive(uploadedFiles);
    }

    console.log("Push complete parts to chat completed. Parts:", parts);

    const result = await chat.sendMessageStream(parts);
    let fullResponse = "";

    console.log("response from chat.sendMessage generated");

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    console.log(`API call took ${elapsedTime}ms`);
    console.log("Raw API response:", result);

    try {
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;

        // Send chunk immediately
        ws.send(
          JSON.stringify({
            type: "stream_chunk",
            chunk: chunkText,
            conversationId: sessionManager.getCurrentConversationIdBySocket(ws),
          })
        );
      }
    } catch (streamError) {
      console.error("Stream error:", streamError);
      ws.send(
        JSON.stringify({
          type: "stream_error",
          message: "Response generation was interrupted",
        })
      );
      throw streamError;
    }

    // Finalize and save
    const htmlResponse = md.render(fullResponse);
    ws.send(
      JSON.stringify({
        type: "stream_end",
        message: htmlResponse,
        conversationId: sessionManager.getCurrentConversationIdBySocket(ws),
      })
    );

    return fullResponse;

  } catch (error) {
    console.error("Error generating response:", error);
    if (error.response) {
      console.error("API Error Response:", error.response.data);
    }
    return "I couldn't generate a response.";
  }
}

module.exports = {
  generateResponse,
  model,
  generationConfig,
  systemInstruction, // Export default systemInstruction
  getSystemInstructionForTaskType, // Export the new function
  md,
};
