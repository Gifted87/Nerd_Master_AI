const sessionManager = require("./sessionManager");
const geminiService = require("./geminiService");
const authService = require("./authService");
const { use } = require("marked");

require("dotenv").config();

function sendError(ws, message, errorType = "general") {
  ws.send(
    JSON.stringify({ type: "error", message: message, error_type: errorType })
  );
}

const handleAuthenticatedConnection = async (ws, pool, userId) => {
  const clientAddress = ws._socket.remoteAddress + ":" + ws._socket.remotePort;
  console.log(
    `Authenticated connection established with ${clientAddress} for user id ${userId}`
  );

  sessionManager.createSession(
    clientAddress,
    geminiService.getModel(),
    geminiService.generationConfig,
    geminiService.systemInstruction,
    userId,
    ws
  );
  geminiService.setFileManager(ws);
  ws.send(JSON.stringify({ type: "connection_success", userId: userId }));
  setupMessageHandling(ws, pool, userId, clientAddress);
};

let oldConversation = [];

const handleAction = async (ws, pool, data) => {
  const clientAddress = ws._socket.remoteAddress + ":" + ws._socket.remotePort;
  const action = data.action;

  if (action === "signup") {
    // ... (signup action handler - no changes) ...
    try {
      const { username, email, password } = data;
      const { userId, error } = await authService.signupUser(
        pool,
        username,
        email,
        password
      );
      if (error) {
        sendError(ws, error, "signup_error");
        return;
      }
      const loginResult = await authService.loginUser(pool, email, password);
      if (loginResult.error) {
        sendError(
          ws,
          "Signup successful, but error during automatic login. Please verify your email and try logging in manually .",
          "login_error"
        );
        return;
      }
      const loggedInUserId = loginResult.userId;
      sessionManager.createSession(
        clientAddress,
        geminiService.getModel(),
        geminiService.generationConfig,
        geminiService.systemInstruction,
        loggedInUserId,
        ws
      );
      geminiService.setFileManager(ws);
      ws.send(
        JSON.stringify({ type: "signup_success", userId: loggedInUserId })
      );
      setupMessageHandling(ws, pool, loggedInUserId, clientAddress);
    } catch (error) {
      console.error("Error during signup:", error);
      sendError(
        ws,
        "Error during signup, please try again later",
        "signup_error"
      );
    }
  } else if (action === "login") {
    // ... (login action handler - no changes) ...
    try {
      const { email, password } = data;
      const { userId, error } = await authService.loginUser(
        pool,
        email,
        password
      );
      if (error) {
        sendError(ws, error, "login_error");
        return;
      }
      sessionManager.createSession(
        clientAddress,
        geminiService.getModel(),
        geminiService.generationConfig,
        geminiService.systemInstruction,
        userId,
        ws
      );
      geminiService.setFileManager(ws);
      ws.send(JSON.stringify({ type: "login_success", userId: userId }));
      setupMessageHandling(ws, pool, userId, clientAddress);
    } catch (error) {
      console.error("Error during login:", error);
      sendError(
        ws,
        "Error during login, please try again later",
        "login_error"
      );
    }
  } else if (action === "forgot_password") {
    // ... (forgot_password action handler - no changes) ...
    try {
      const { email } = data;
      const { error } = await authService.forgotPassword(pool, email);
      if (error) {
        sendError(ws, error, "forgot_password_error");
        return;
      }
      ws.send(
        JSON.stringify({
          type: "forgot_password_success",
          message: "Password reset email sent successfully",
        })
      );
    } catch (error) {
      console.error("Error during forgot password request:", error);
      sendError(
        ws,
        "Error requesting password reset, try again later.",
        "forgot_password_error"
      );
    }
  } else if (action === "reset_password") {
    // ... (reset_password action handler - no changes) ...
    try {
      const { token, newPassword } = data;
      const { error, message } = await authService.resetPassword(
        pool,
        token,
        newPassword
      );
      if (error) {
        sendError(ws, error, "reset_password_error");
        return;
      }
      ws.send(
        JSON.stringify({ type: "reset_password_success", message: message })
      );
    } catch (error) {
      console.error("Error during password reset:", error);
      sendError(
        ws,
        "Error setting password please try again later.",
        "reset_password_error"
      );
    }
  } else if (action === "verify_email") {
    // ... (verify_email action handler - no changes) ...
    try {
      const { token } = data;
      const { error, message } = await authService.verifyEmail(pool, token);
      if (error) {
        sendError(ws, error, "verify_email_error");
        return;
      }
      ws.send(
        JSON.stringify({ type: "verify_email_success", message: message })
      );
    } catch (err) {
      console.error("Error verifying user email", err);
      sendError(ws, "Error verifying email try again", "verify_email_error");
    }
  } else {
    // Handle actions that don't require immediate authentication check here if necessary
    console.log("Handling action:", action, "without explicit auth check yet");
  }
};

function buildDocumentPrompt({ contentType, docType, chapters, history }) {
  // Input validation
  if (!history || !Array.isArray(history)) {
    console.error("Invalid history provided to buildDocumentPrompt:", history);
    throw new Error(
      "Invalid conversation history provided for document generation."
    );
  }

  // Filter out potentially malformed history items
  const validHistory = history.filter(
    (m) =>
      m &&
      m.role &&
      m.parts &&
      Array.isArray(m.parts) &&
      m.parts.length > 0 &&
      typeof m.parts[0].text === "string"
  );

  if (validHistory.length === 0) {
    console.log("No valid messages found in history for document generation.");
    // Provide a fallback prompt if history is empty
    return `Generate ${docType.toUpperCase()} document with following requirements:
Format: ${docType}
${chapters ? `Chapter Structure: ${chapters}` : ""}
Style: Formal academic paper format with proper headings.
Content: No relevant conversation content was provided or available. Please generate a template or generic document.`;
  }

  const contentSource = validHistory
    .map((m) => {
      const rolePrefix = m.role === "model" ? "AI Assistant" : "User";
      const textContent = m.parts[0]?.text || ""; // Ensure text exists
      return `${rolePrefix}: ${textContent}`;
    })
    .join("\n\n---\n\n"); // Use a clear separator

  console.log("contentSource: ", contentSource); // Debugging line

  // Construct the final prompt for the API
  return `Generate ${docType.toUpperCase()} document with following requirements:
Format: ${docType}
${chapters ? `Chapter Structure: ${chapters}` : ""}
Style: Formal styling with proper headings and subheading, bullets and tables where neccessary.
Content: ${contentSource} 
`;
}

// Calls the external Document Generation API
async function fetchDocumentFromAPI(prompt) {
  const apiKey = process.env.DOC_API_SECRET_KEY;
  if (!apiKey) {
    console.error(
      "Document Generation API Key (DOC_API_SECRET_KEY) is missing from environment variables."
    );
    throw new Error(
      "Service configuration error: Cannot authenticate with document generation service."
    );
  }

  // Use environment variable or config for the API URL, default to doc.txt URL
  const apiUrl =
    process.env.DOC_API_URL || "http://192.168.43.45:5000/generate-file"; // From doc.txt

  console.log(`Sending request to Document API: ${apiUrl}`);
  // console.log(`Prompt for Document API: ${prompt}`); // Avoid logging potentially large/sensitive prompts

  try {
    // Ensure you have 'node-fetch' installed (`npm install node-fetch`) if using Node < 18
    // Or use the built-in global fetch in Node 18+
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey, // Use the fetched token
      },
      body: JSON.stringify({ prompt }), // Send only the prompt as per doc.txt
    });

    console.log(`Document API Response Status: ${response.status}`);

    if (!response.ok) {
      let errorBody = "No error details available.";
      try {
        errorBody = await response.text();
      } catch (readError) {
        /* Ignore */
      }
      console.error("Document API Error Body:", errorBody);
      // Throw a more specific error based on status
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Authentication failed with Document API (status ${response.status}). Check API Key.`
        );
      }
      throw new Error(
        `Document API request failed with status ${
          response.status
        }. ${errorBody.substring(0, 100)}`
      );
    }

    const responseData = await response.json();
    console.log("Document API Response Data:", responseData);

    // Validate response data structure
    if (!responseData.download_url || !responseData.filename) {
      console.error(
        "Invalid response structure from Document API:",
        responseData
      );
      throw new Error(
        "Received an invalid response from the document generation service."
      );
    }
    return responseData; // Contains { download_url, filename }
  } catch (error) {
    console.error("Error calling Document API:", error);
    // Re-throw a generic error to avoid exposing too much detail
    throw new Error(
      `Failed to communicate with the document generation service. ${error.message}`
    );
  }
}

// Handles the 'generate_document' action received via WebSocket
async function handleDocumentGeneration(ws, userId, data) {
  const clientAddress = ws._socket.remoteAddress + ":" + ws._socket.remotePort;
  console.log(
    `Handling document generation request for user ${userId}, data:`,
    data
  );
  try {
    const { contentType, docType, chapters } = data; // Payload from client

    // Validate incoming data
    if (!contentType || !docType) {
      throw new Error("Missing required parameters (contentType, docType).");
    }

    // Retrieve the chat history associated with this WebSocket connection
    const chatSession = sessionManager.getChatHistoryBySocket(ws);

    // Check if chat history exists for the session
    if (!chatSession || !chatSession.history) {
      console.error(
        `Chat history not found for user ${userId}, client ${clientAddress}. Cannot generate document.`
      );
      sendError(
        ws,
        "Could not find chat history for this session. Load conversation first.",
        "session_error"
      );
      return; // Stop
    }

    console.log(
      `Retrieved chat history length: ${chatSession.history.length} for user ${userId}.`
    );

    // Build the prompt
    const prompt = buildDocumentPrompt({
      contentType,
      docType,
      chapters,
      history: chatSession.history, // Pass the actual history array
    });

    // Call the external API
    const docResponse = await fetchDocumentFromAPI(prompt);

    // --- Send Success Response back to Client ---
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "document_generation_success", // Match client handler in script.js
          success: true,
          downloadUrl: "http://192.168.43.45:5000" + docResponse.download_url, // Field name expected by client
          filename: docResponse.filename,
        })
      );
      console.log(
        `Document generation successful for user ${userId}. URL: http://192.168.43.45:5000${docResponse.download_url}`
      );
    }
  } catch (error) {
    console.error(
      `Error during document generation process for user ${userId}:`,
      error
    );
    // --- Send Error Response back to Client ---
    if (ws.readyState === ws.OPEN) {
      // Match client error handler type
      ws.send(
        JSON.stringify({
          type: "document_generation_error", // Match client handler
          success: false,
          message:
            error.message ||
            "Document generation failed due to an internal error.",
        })
      );
    }
  }
}

const setupMessageHandling = (ws, pool, userId, clientAddress) => {
  ws.on("message", async (messageString) => {
    // console.log("Received message on server during WS", sessionManager.logSocketToSession(ws));

    sessionManager.updateActivityBySocket(ws);
    try {
      const data = JSON.parse(messageString);
      const action = data.action;
      if (action === "logout") {
        // ... (logout action handler - no changes) ...
        console.log(`logout request received from ${clientAddress}`);
        const currentConversationId =
          sessionManager.getCurrentConversationIdBySocket(ws);
        const currentChat = sessionManager.getChatHistoryBySocket(ws);
        if (
          currentConversationId &&
          currentChat &&
          currentChat.history.length > 0
        ) {
          console.log(
            `saving current conversation ${currentConversationId} on logout`
          );
          await saveConversationMessages(
            pool,
            userId,
            currentChat,
            currentConversationId,
            ws
          );
        }
        sessionManager.deleteSessionByUserId(userId);
      } else if (action === "generate_document") {
        handleDocumentGeneration(ws, userId, data);
      } else if (action === "generate_new_document") {
        console.log(
          `Generate new document request received for user ${userId}`,
        );
        try {
          const { docType, description, pages } = data;

          // --- Backend Validation ---
          if (!docType || !description || !pages) {
            throw new Error(
              "Missing required parameters (docType, description, pages)."
            );
          }
          const pageCount = parseInt(pages, 10);
          if (isNaN(pageCount) || pageCount < 1 || pageCount > 30) {
            throw new Error("Invalid page count. Must be between 1 and 30.");
          }
          // --- End Validation ---

          const calculated_paragraphs = pageCount * 3; // 15 paragraphs per page
          // --- Construct a NEW Prompt ---
          // This prompt is specifically for generating NEW content based on description and page count
          const newDocumentPrompt = `create a ${docType.toUpperCase()} document with the following details:
          Style: Formal styling with proper headings and subheading, bullets and tables where neccessary.
          content: ${description}
          paragraphs: ${calculated_paragraphs}
          paragraph length: 150 words
          pages: ${pageCount}
          CRITICAL - DO NOT USE FILLERS, DO NOT REPEAT SENTENCES OR PARAGRAPHS, EXPAND THE CONTEXT OF THE SUBJECT IF NECCESSARY.`;
          // --- End Prompt Construction ---
          console.log(
            `Calling document API for new document generation. Type: ${docType}, Pages: ${pageCount}`
          );
          // Call the *existing* API function with the *new* prompt
          const docResponse = await fetchDocumentFromAPI(newDocumentPrompt);

          // Send success response back to client
          if (ws.readyState === ws.OPEN) {
            ws.send(
              JSON.stringify({
                type: "generate_new_document_success", // <-- New success type
                success: true,
                downloadUrl:
                  "http://192.168.43.45:5000" + docResponse.download_url, // Adjust host if needed
                filename:
                  docResponse.filename || `generated_${docType}_document`,
              })
            );
            console.log(
              `New document generated successfully for user ${userId}. URL: http://192.168.43.45:5000${docResponse.download_url}`
            );
          }
        } catch (error) {
          console.error(
            `Error during new document generation process for user ${userId}:`,
            error
          );
          if (ws.readyState === ws.OPEN) {
            ws.send(
              JSON.stringify({
                type: "generate_new_document_error", // <-- New error type
                success: false,
                message:
                  error.message ||
                  "New document generation failed due to an internal error.",
              })
            );
          }
        }
      } else if (action === "new_chat") {
        // ... (new_chat action handler - no changes) ...
        console.log(`new chat request received from ${clientAddress}`);
        sessionManager.setCurrentConversationIdBySocket(ws, null);

        sessionManager.createSession(
          clientAddress,
          geminiService.getModel(),
          geminiService.generationConfig,
          geminiService.systemInstruction,
          userId,
          ws
        );
        geminiService.setFileManager(ws);
        console.log(
          "filemanager apikey set:",
          sessionManager.getChatHistoryBySocket(ws)._apiKey
        );
        // setupMessageHandling(ws, pool, userId, clientAddress);

        // console.log("socket to session:", sessionManager.logSocketToSession());
        const currentConversationId =
          sessionManager.getCurrentConversationIdBySocket(ws);

        const currentChat = sessionManager.getChatHistoryBySocket(ws);
        console.log("new_chat currentChat:", currentChat);
        if (
          currentConversationId &&
          currentChat &&
          currentChat.history.length > 0
        ) {
          console.log(
            `saving current conversation ${currentConversationId} on new_chat`
          );
          await saveConversationMessages(
            pool,
            userId,
            currentChat,
            currentConversationId,
            ws
          );
        }
        ws.send(
          JSON.stringify({ type: "new_chat_success", conversationId: null })
        );
      } else if (action === "customize_conversation") {
        // --- NEW: Handle customize_conversation action ---
        console.log(
          `customize_conversation request received from ${clientAddress}`
        );
        const { taskType, task, description, temperature, aiModel, topP } =
          data;

        // Get system instruction based on task
        const systemInstruction =
          geminiService.getSystemInstructionForTask(task);

        // 2. Update Session Configuration
        const chatSession = sessionManager.getChatHistoryBySocket(ws);
        if (chatSession) {
          chatSession.params.generationConfig = {
            ...chatSession.params.generationConfig, // Keep other configs
            temperature: temperature,
            topP: topP,
          };
          chatSession.params.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
          console.log("System Instruction:", systemInstruction);
          console.log(
            "Generation Config:",
            chatSession.params.generationConfig
          );
        }

        // 3. Construct Initial Prompt
        const initialPrompt = description;

        // 4. Create new conversation and get conversation ID
        const conversationId = await createNewConversation(
          pool,
          userId,
          `${task} - ${description}`,
          ws
        );
        sessionManager.setCurrentConversationIdBySocket(ws, conversationId);

        // 5. Generate Initial Response from Gemini
        try {
          const { fullResponse, files } = await geminiService.generateResponse(
            chatSession,
            initialPrompt,
            ws,
            null
          );
          const htmlResponse = geminiService.md.render(fullResponse);
          const timestamp = Date.now();

          // 6. Save Initial User and Bot Messages to Database
          const messageToSaveUser = {
            userId: userId,
            type: "user",
            message: initialPrompt,
            timestamp: timestamp,
            conversationId: conversationId,
          };
          await saveMessage(pool, messageToSaveUser);

          const messageToSaveBot = {
            userId: userId,
            type: "bot",
            message: htmlResponse,
            timestamp: timestamp,
            conversationId: conversationId,
          };
          await saveMessage(pool, messageToSaveBot);

          // 7. Send customize_conversation_success Response back to Frontend, including initial bot message
          ws.send(
            JSON.stringify({
              type: "customize_conversation_success",
              message: htmlResponse, // Send initial bot response to display
              conversationId: conversationId,
            })
          );
        } catch (error) {
          console.error(
            "Error generating initial response after customization:",
            error
          );
          sendError(ws, "Error generating initial response.", "internal_error");
        }
      } else if (action === "stop_stream") {
        console.log("Stopping Stream");
        geminiService.setStreamStatus(true);

        ws.send(
          JSON.stringify({
            type: "stream_end",
            message: "Stream stopped by user.", // Or any appropriate message
            conversationId: sessionManager.getCurrentConversationIdBySocket(ws),
          })
        );
      } else if (action === "continue_conversation") {
        // ... (continue_conversation action handler - no changes) ...
        const userMessage = data.message?.trim();
        const fileDataArray = data.files;

        if (!userMessage && !fileData) {
          sendError(ws, "No message or file provided", "input_validation");
          return;
        }

        // Validate file data if present
        // if (fileDataArray) {
        //   // const allowedMimeTypes = [
        //   //   "image/png",
        //   //   "image/jpeg",
        //   //   "image/webp",
        //   //   "image/heic",
        //   //   "image/heif",
        //   //   "application/pdf",
        //   //   "application/x-javascript",
        //   //   "text/javascript",
        //   //   "application/x-python",
        //   //   "text/x-python",
        //   //   "text/plain",
        //   //   "text/html",
        //   //   "text/css",
        //   //   "text/md",
        //   //   "text/csv",
        //   //   "text/xml",
        //   //   "text/rtf",
        //   // ];

        //   // In both send_message and continue_conversation handlers:
        //   if (fileDataArray.size > 20 * 1024 * 1024) {
        //     sendError(ws, "File size exceeds 20MB limit", "file_validation");
        //     return;
        //   }
        //   // if (!allowedMimeTypes.includes(fileData.mimeType)) {
        //   //   sendError(ws, "Invalid file type", "file_validation");
        //   //   return;
        //   // }
        // }

        let currentConversationId = data.conversationId;

        console.log("currentConversationId: ", currentConversationId);

        let chat = sessionManager.getChatHistoryBySocket(ws);

        if (!currentConversationId) {
          currentConversationId = await createNewConversation(
            pool,
            userId,
            userMessage,
            ws
          );
          sessionManager.setCurrentConversationIdBySocket(
            ws,
            currentConversationId
          );

          ws.send(
            JSON.stringify({
              type: "old_chat_success",
              conversationId: currentConversationId,
            })
          );
        }

        if (!chat) {
          console.error(`Chat history not found for ${clientAddress}`);
          sendError(ws, "Chat session error.", "session_error");
          return;
        }
        try {
          const { fullResponse, files } = await geminiService.generateResponse(
            chat,
            userMessage,
            ws,
            fileDataArray
          );
          const htmlResponse = geminiService.md.render(fullResponse);
          const timestamp = Date.now();

          const messageToSaveUser = {
            userId: userId,
            type: "user",
            message: userMessage, // The text message
            files: files
              ? files.map((f) => ({
                  name: f.displayName,
                  mimeType: f.mimeType,
                  size: f.size, // Assuming you have size somewhere, or fetch with fileManager.
                  fileUri: f.uri,
                }))
              : null,
            timestamp: timestamp,
            conversationId: currentConversationId,
          };
          await saveMessage(pool, messageToSaveUser);

          const messageToSaveBot = {
            userId: userId,
            type: "bot",
            message: htmlResponse,
            timestamp: timestamp,
            conversationId: currentConversationId,
          };
          await saveMessage(pool, messageToSaveBot);

          // ws.send(
          //   JSON.stringify({
          //     type: "bot",
          //     message: htmlResponse,
          //     conversationId: currentConversationId,
          //   })
          // );
        } catch (error) {
          console.error("Error processing message:", error);
          sendError(
            ws,
            "An error occurred while processing your request.",
            "internal_error"
          );
        }
      } else if (action === "send_message") {
        // ... (send_message action handler - no changes) ...
        const userMessage = data.message?.trim();
        const fileDataArray = data.files;

        if (!userMessage && !fileData) {
          sendError(ws, "No message or file provided", "input_validation");
          return;
        }

        // Validate file data if present
        // if (fileDataArray) {
        //   // const allowedMimeTypes = [
        //   //   "image/png",
        //   //   "image/jpeg",
        //   //   "image/webp",
        //   //   "image/heic",
        //   //   "image/heif",
        //   //   "application/pdf",
        //   //   "application/x-javascript",
        //   //   "text/javascript",
        //   //   "application/x-python",
        //   //   "text/x-python",
        //   //   "text/plain",
        //   //   "text/html",
        //   //   "text/css",
        //   //   "text/md",
        //   //   "text/csv",
        //   //   "text/xml",
        //   //   "text/rtf",
        //   // ];

        //   // // In both send_message and continue_conversation handlers:
        //   // if (fileData.size > 20 * 1024 * 1024) {
        //   //   sendError(ws, "File size exceeds 20MB limit", "file_validation");
        //   //   return;
        //   // }
        //   // if (!allowedMimeTypes.includes(fileData.mimeType)) {
        //   //   sendError(ws, "Invalid file type", "file_validation");
        //   //   return;
        //   // }
        // }

        let currentConversationId =
          sessionManager.getCurrentConversationIdBySocket(ws);

        let chat = sessionManager.getChatHistoryBySocket(ws);

        console.log("chatHistory: ", chat);
        if (!currentConversationId) {
          currentConversationId = await createNewConversation(
            pool,
            userId,
            userMessage,
            ws
          );
          sessionManager.setCurrentConversationIdBySocket(
            ws,
            currentConversationId
          );

          ws.send(
            JSON.stringify({
              type: "old_chat_success",
              conversationId: currentConversationId,
            })
          );
        }

        if (!chat) {
          console.error(`Chat history not found for ${clientAddress}`);
          sendError(ws, "Chat session error.", "session_error");
          return;
        }
        try {
          const { fullResponse, files } = await geminiService.generateResponse(
            chat,
            userMessage,
            ws,
            fileDataArray
          );
          const htmlResponse = geminiService.md.render(fullResponse);
          const timestamp = Date.now();

          const messageToSaveUser = {
            userId: userId,
            type: "user",
            message: userMessage, // The text message
            files: files
              ? files.map((f) => ({
                  name: f.displayName,
                  mimeType: f.mimeType,
                  size: f.size, // Assuming you have size somewhere, or fetch with fileManager.
                  fileUri: f.uri,
                }))
              : null,
            timestamp: timestamp,
            conversationId: currentConversationId,
          };
          await saveMessage(pool, messageToSaveUser);

          const messageToSaveBot = {
            userId: userId,
            type: "bot",
            message: htmlResponse,
            timestamp: timestamp,
            conversationId: currentConversationId,
          };
          await saveMessage(pool, messageToSaveBot);

          // ws.send(
          //   JSON.stringify({
          //     type: "bot",
          //     message: htmlResponse,
          //     conversationId: currentConversationId,
          //   })
          // );
        } catch (error) {
          console.error("Error processing message:", error);
          sendError(
            ws,
            "An error occurred while processing your request.",
            "internal_error"
          );
        }
      } else if (action === "load_previous_conversations") {
        // ... (load_previous_conversations action handler - no changes) ...
        try {
          const conversations = await loadPreviousConversations(pool, userId);
          ws.send(
            JSON.stringify({
              type: "previous_conversations",
              conversations: conversations,
            })
          );
        } catch (error) {
          console.error("Error loading previous conversations:", error);
          sendError(
            ws,
            "An error occurred while loading previous conversations.",
            "internal_error"
          );
        }
      } else if (action === "load_conversation") {
        // ... (load_conversation action handler - no changes) ...
        try {
          const conversationId = data.conversationId;
          const messages = await loadConversationMessages(
            pool,
            conversationId,
            ws
          );
          ws.send(
            JSON.stringify({
              type: "conversation_messages",
              messages: messages,
              conversationId: conversationId,
            })
          );
        } catch (error) {
          console.error("Error loading conversation messages:", error);
          sendError(
            ws,
            "An error occurred while loading conversation messages.",
            "internal_error"
          );
        }
      } else if (action === "edit_message") {
        // ... (edit_message action handler - no changes) ...
        try {
          const messageId = data.messageId;
          const newMessage = data.newMessage;
          await editMessage(pool, messageId, newMessage);
          ws.send(
            JSON.stringify({
              type: "message_edited",
              messageId: messageId,
              newMessage: newMessage,
            })
          );
        } catch (error) {
          console.error("Error editing message:", error);
          sendError(
            ws,
            "An error occurred while editing the message.",
            "internal_error"
          );
        }
      } else if (action === "delete_message") {
        // ... (delete_message action handler - no changes) ...
        try {
          const messageId = data.messageId;
          await deleteMessage(pool, messageId);
          ws.send(
            JSON.stringify({ type: "message_deleted", messageId: messageId })
          );
        } catch (error) {
          console.error("Error deleting message:", error);
          sendError(
            ws,
            "An error occurred while deleting the message.",
            "internal_error"
          );
        }
      } else if (action === "generate_document") {
        // <<< ADD THIS BLOCK HERE
        console.log(
          `Generate document request received for user ${userId}`
        );
        // Delegate to the specific handler function (we'll create this next)
        // Pass ws, the userId from setupMessageHandling's scope, and the received data
        await handleDocumentGeneration(ws, userId, data);
      } else {
        console.warn(
          `Unhandled action '${action}' received from authenticated user ${userId} on ${clientAddress}`
        );
        // Optionally inform the client about the unhandled action
        sendError(
          ws,
          `Action '${action}' is not recognized by the server.`,
          "unhandled_action"
        );
      }
    } catch (error) {
      console.error("Error processing message:", error);
      sendError(ws, "Invalid message format.", "message_format");
    }
  });

  ws.on("close", () => {
    // ... (close event handler - no changes) ...
    console.log(`WebSocket closed for user ID ${userId}`);
    const currentConversationId =
      sessionManager.getCurrentConversationIdBySocket(ws);
    const currentChat = sessionManager.getChatHistoryBySocket(ws);
    if (
      currentConversationId &&
      currentChat &&
      currentChat.history.length > 0
    ) {
      console.log(
        `saving current conversation ${currentConversationId} on socket close`
      );
      saveConversationMessages(
        pool,
        userId,
        currentChat,
        currentConversationId,
        ws
      );
    }

    sessionManager.deleteSessionBySocket(ws);
  });

  ws.on("error", (error) => {
    // ... (error event handler - no changes) ...
    console.error(`WebSocket error for user ID ${userId}:`, error);
    sessionManager.deleteSessionBySocket(ws);
  });
};
async function createNewConversation(pool, userId, name, ws) {
  // ... (createNewConversation function - no changes) ...
  let input = name.toString().substring(0, 50);
  if (input.includes("-")) {
    const parts = input.split("-", 2); // Split into two parts
    input = parts[1].trim(); // Grab text after hyphen and trim
  }

  const db_name = input;

  const chatSession = sessionManager.getChatHistoryBySocket(ws);
  let systemInstruction = geminiService.systemInstruction; // Default
  let temperature = geminiService.generationConfig.temperature; // Default
  let topP = geminiService.generationConfig.topP; //Default
  let apiKey = null;

  if (chatSession) {
    systemInstruction = chatSession.params.systemInstruction.parts[0].text;
    temperature = chatSession.params.generationConfig.temperature;
    topP = chatSession.params.generationConfig.topP;
    apiKey = sessionManager.getChatHistoryBySocket(ws)._apiKey;
  }

  console.log(
    "Saving Gemini Configurations to Database: ",
    systemInstruction,
    temperature,
    topP,
    apiKey
  );

  try {
    const conn = await pool.getConnection();
    const [result] = await conn.execute(
      "INSERT INTO conversations (userId, name, system_instruction, temperature, top_p, _apiKey) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, db_name, systemInstruction, temperature, topP, apiKey]
    );
    conn.release();
    return result.insertId;
  } catch (err) {
    console.error("Error creating new conversation", err);
    throw err;
  }
}
async function saveMessage(pool, message) {
  // ... (saveMessage function - no changes) ...
  if (!message || !message.message || !message.message.trim()) {
    console.warn("Skipping empty message:", message);
    return null;
  }

  try {
    const conn = await pool.getConnection();
    const [result] = await conn.execute(
      `INSERT INTO messages 
       (conversationId, userId, type, message, timestamp, files) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        message.conversationId,
        message.userId,
        message.type,
        message.message,
        message.timestamp,
        message.files ? JSON.stringify(message.files) : null,
      ]
    );
    conn.release();
    return result.insertId;
  } catch (err) {
    console.error("Error saving message:", err);
    throw err;
  }
}
async function saveConversationMessages(
  pool,
  userId,
  chat,
  conversationId,
  ws
) {
  // ... (saveConversationMessages function - no changes) ...
  try {
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      console.log(`creating new conversation before saving messages`);
      currentConversationId = await createNewConversation(pool, userId, ws);
    }
    const messages = chat.history;
    if (!messages || messages.length === 0) {
      console.log("no messages to save in this conversation");
      return;
    }
    for (const message of messages) {
      const messageType = message.role;
      const messageText = message.parts[0].text;
      const timestamp = Date.now(); // or get from the message if available
      const messageToSave = {
        conversationId: currentConversationId,
        userId: userId,
        type: messageType,
        message: messageText,
        timestamp: timestamp,
      };
      await saveMessage(pool, messageToSave);
    }
  } catch (err) {
    console.error("Error saving conversation messages:", err);
    throw err;
  }
}

async function loadPreviousConversations(pool, userId) {
  // ... (loadPreviousConversations function - no changes) ...
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      "SELECT id, startTime, name FROM conversations WHERE userId = ? ORDER BY startTime DESC",
      [userId]
    );
    conn.release();
    return rows.map((row) => ({
      id: row.id,
      startTime: row.startTime,
      name: row.name,
    }));
  } catch (err) {
    console.error("Error loading previous conversations:", err);
    throw err;
  }
}

async function loadConversationMessages(pool, conversationId, ws) {
  // ... (loadConversationMessages function - no changes) ...
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT c.system_instruction, c.temperature, c.top_p, c._apiKey, m.type, m.message, m.files
      FROM messages m
      INNER JOIN conversations c ON m.conversationId = c.id
      WHERE m.conversationId = ?
      ORDER BY m.timestamp ASC`,
      [conversationId]
    );
    conn.release();

    const systemInstruction =
      rows.length > 0 && rows[0].system_instruction !== null
        ? rows[0].system_instruction
        : geminiService.systemInstruction;
    const temperature =
      rows.length > 0 && rows[0].temperature !== null
        ? rows[0].temperature
        : geminiService.generationConfig.temperature;
    const topP =
      rows.length > 0 && rows[0].top_p !== null
        ? rows[0].top_p
        : geminiService.generationConfig.topP;

    const apiKey = rows.length > 0 ? rows[0]._apiKey : null;
    console.log(
      "Loaded Gemini Config: ",
      systemInstruction,
      temperature,
      topP,
      apiKey
    );

    const chatSession = sessionManager.getChatHistoryBySocket(ws);
    if (chatSession) {
      chatSession.params.generationConfig = {
        ...chatSession.params.generationConfig,
        temperature: temperature,
        topP: topP,
      };
      chatSession.params.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    console.log("Loaded Gemini Config: ", systemInstruction, temperature, topP);

    const formattedHistory = rows.map((row) => {
      const messagePart = { text: row.message };
      const parts = [messagePart];

      if (row.type === "user" && row.files) {
        console.log("User message with files:", row.files);
        const files = row.files;
        files.forEach((file) => {
          parts.push({
            fileData: {
              mimeType: file.mimeType,
              fileUri: file.fileUri,
            },
          });
        });
      }
      return {
        role: row.type === "bot" ? "model" : row.type,
        parts: parts,
      };
    });

    socketToSession = sessionManager.logSocketToSession();

    if (socketToSession.has(ws)) {
      sessionManager.setChatHistory(ws, formattedHistory);
      sessionManager.setApiKey(ws, apiKey);
      geminiService.setFileManager(ws);

      // const { clientAddress, chatHistory } = socketToSession.get(ws);
      // if (chatHistory) {
      // chatHistory.history = formattedHistory;
      // chatHistory._history = formattedHistory;
      // oldConversation = chatHistory;
      // sessionManager.setCurrentConversationIdBySocket(ws, conversationId);
      // }
    }

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      message: row.message,
      files: row.files ? row.files : null, // Include files
    }));
  } catch (err) {
    console.error("Error loading conversation messages:", err);
    throw err;
  }
}

async function editMessage(pool, messageId, newMessage) {
  // ... (editMessage function - no changes) ...
  try {
    const conn = await pool.getConnection();
    await conn.execute("UPDATE messages SET message = ? WHERE id = ?", [
      newMessage,
      messageId,
    ]);
    conn.release();
  } catch (err) {
    console.error("Error editing message:", err);
    throw err;
  }
}

async function deleteMessage(pool, messageId) {
  // ... (deleteMessage function - no changes) ...
  try {
    const conn = await pool.getConnection();
    await conn.execute("DELETE FROM messages WHERE id = ?", [messageId]);
    conn.release();
  } catch (err) {
    console.error("Error deleting message:", err);
    throw err;
  }
}

module.exports = {
  handleAuthenticatedConnection,
  handleAction,
};
