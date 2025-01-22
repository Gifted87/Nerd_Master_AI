const sessionManager = require("./sessionManager");
const geminiService = require("./geminiService");
const authService = require("./authService");
// const { logSocketToSession } = sessionManager;
// const logSocketToSession = require("./sessionManager")

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
  // Create session without conversation ID, it will be generated on first message or new chat
  sessionManager.createSession(
    clientAddress,
    geminiService.model,
    geminiService.generationConfig,
    geminiService.systemInstruction,
    userId,
    ws
  );
  ws.send(JSON.stringify({ type: "connection_success", userId: userId }));
  setupMessageHandling(ws, pool, userId, clientAddress);
  //   console.log("logSocketToSession:",sessionManager.logSocketToSession());
};

let oldConversation = [];

const handleAction = async (ws, pool, data) => {
  const clientAddress = ws._socket.remoteAddress + ":" + ws._socket.remotePort;
  const action = data.action;

  if (action === "signup") {
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
      // Automatically log in the user after successful signup
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
        geminiService.model,
        geminiService.generationConfig,
        geminiService.systemInstruction,
        loggedInUserId,
        ws
      );
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
        geminiService.model,
        geminiService.generationConfig,
        geminiService.systemInstruction,
        userId,
        ws
      );
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
    try {
      const { token } = data;
      const { error, message } = await authService.verifyEmail(pool, token);
      if (error) {
        sendError(ws, error, "verify_email_error");
        return;
      }
      // After successful verification, you might want to inform the client or redirect
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

const setupMessageHandling = (ws, pool, userId, clientAddress) => {
  ws.on("message", async (messageString) => {
    sessionManager.updateActivityBySocket(ws);
    try {
      const data = JSON.parse(messageString);
      const action = data.action;
      if (action === "logout") {
        console.log(`logout request received from ${clientAddress}`);
        // save current conversation on logout
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
            currentConversationId
          );
        }
        sessionManager.deleteSessionByUserId(userId);
      } else if (action === "new_chat") {
        //save current conversation on new chat
        console.log(`new chat request received from ${clientAddress}`);

        sessionManager.setCurrentConversationIdBySocket(ws, null);

        const currentConversationId =
          sessionManager.getCurrentConversationIdBySocket(ws);
        const currentChat = sessionManager.getChatHistoryBySocket(ws);

        console.log(`current conversation id: ${currentConversationId}`);
        console.log(`current Chat: ${currentChat.history}`);

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
            currentConversationId
          );
        }

        //Create a new conversation id
        // const newConversationId = await createNewConversation(pool, userId);
        // sessionManager.setCurrentConversationIdBySocket(ws,newConversationId);

        ws.send(
          JSON.stringify({ type: "new_chat_success", conversationId: null })
        );
      } else if (action === "continue_conversation") {
        const userMessage = data.message?.trim();

        if (!userMessage) {
          sendError(ws, "No message provided", "input_validation");
          return;
        }
        let currentConversationId =
          sessionManager.getCurrentConversationIdBySocket(ws);

        console.log(
          `send_message get current conversation id: ${currentConversationId}`
        );

        let chat = oldConversation;

        if (!currentConversationId) {
          console.log(`creating new conversation for user id ${userId}`);
          currentConversationId = await createNewConversation(
            pool,
            userId,
            userMessage
          );
          sessionManager.setCurrentConversationIdBySocket(
            ws,
            currentConversationId
          );
          console.log(`chat: `, chat);
          //  chat.params.history = [];
          //   chat._history = [];
          console.log(`new chat: `, chat);
          ws.send(
            JSON.stringify({
              type: "old_chat_success",
              conversationId: currentConversationId,
            })
          );
        }
        // chat = sessionManager.getChatHistoryBySocket(ws);
        if (!chat) {
          console.error(`Chat history not found for ${clientAddress}`);
          sendError(ws, "Chat session error.", "session_error");
          return;
        }
        try {
          const botResponse = await geminiService.generateResponse(
            chat,
            userMessage,
            ws
          );
          const htmlResponse = geminiService.md.render(botResponse);
          const timestamp = Date.now();

          const messageToSaveUser = {
            userId: userId,
            type: "user",
            message: userMessage,
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

          ws.send(
            JSON.stringify({
              type: "bot",
              message: htmlResponse,
              conversationId: currentConversationId,
            })
          );
        } catch (error) {
          console.error("Error processing message:", error);
          sendError(
            ws,
            "An error occurred while processing your request.",
            "internal_error"
          );
        }
      } else if (action === "send_message") {
        const userMessage = data.message?.trim();

        if (!userMessage) {
          sendError(ws, "No message provided", "input_validation");
          return;
        }
        let currentConversationId =
          sessionManager.getCurrentConversationIdBySocket(ws);

        console.log(
          `send_message get current conversation id:`,
          currentConversationId
        );

        //   console.log(`Old session data:`, oldConversation);

        let chat = sessionManager.getChatHistoryBySocket(ws);
        if (!currentConversationId) {
          console.log(`creating new conversation for user id ${userId}`);
          currentConversationId = await createNewConversation(
            pool,
            userId,
            userMessage
          );
          sessionManager.setCurrentConversationIdBySocket(
            ws,
            currentConversationId
          );
          console.log(`chat: `, chat);
          //  chat.params.history = [];
          chat._history = [];
          console.log(`new chat: `, chat);
          ws.send(
            JSON.stringify({
              type: "old_chat_success",
              conversationId: currentConversationId,
            })
          );
        }
        // chat = sessionManager.getChatHistoryBySocket(ws);
        if (!chat) {
          console.error(`Chat history not found for ${clientAddress}`);
          sendError(ws, "Chat session error.", "session_error");
          return;
        }
        try {
          const botResponse = await geminiService.generateResponse(
            chat,
            userMessage,
            ws
          );
          const htmlResponse = geminiService.md.render(botResponse);
          const timestamp = Date.now();

          const messageToSaveUser = {
            userId: userId,
            type: "user",
            message: userMessage,
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

          ws.send(
            JSON.stringify({
              type: "bot",
              message: htmlResponse,
              conversationId: currentConversationId,
            })
          );
        } catch (error) {
          console.error("Error processing message:", error);
          sendError(
            ws,
            "An error occurred while processing your request.",
            "internal_error"
          );
        }
      } else if (action === "load_previous_conversations") {
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
      }
    } catch (error) {
      console.error("Error processing message:", error);
      sendError(ws, "Invalid message format.", "message_format");
    }
  });

  ws.on("close", () => {
    console.log(`WebSocket closed for user ID ${userId}`);
    //save current conversation on socket close
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
        currentConversationId
      );
    }

    sessionManager.deleteSessionBySocket(ws);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for user ID ${userId}:`, error);
    sessionManager.deleteSessionBySocket(ws);
  });
};
async function createNewConversation(pool, userId, name) {
  const db_name = name.substring(0, 25);
  try {
    const conn = await pool.getConnection();
    const [result] = await conn.execute(
      "INSERT INTO conversations (userId, name) VALUES (?, ?)",
      [userId, db_name]
    );
    conn.release();
    return result.insertId;
  } catch (err) {
    console.error("Error creating new conversation", err);
    throw err;
  }
}
async function saveMessage(pool, message) {
  if (!message || !message.message || !message.message.trim()) {
    console.warn("Skipping empty message:", message);
    return null;
  }

  try {
    const conn = await pool.getConnection();
    const [result] = await conn.execute(
      "INSERT INTO messages (conversationId, userId, type, message, timestamp) VALUES (?, ?, ?, ?, ?)",
      [
        message.conversationId,
        message.userId,
        message.type,
        message.message,
        message.timestamp,
      ]
    );
    conn.release();
    return result.insertId;
  } catch (err) {
    console.error("Error saving message:", err);
    throw err;
  }
}
async function saveConversationMessages(pool, userId, chat, conversationId) {
  try {
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      console.log(`creating new conversation before saving messages`);
      currentConversationId = await createNewConversation(pool, userId);
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
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      "SELECT type, message FROM messages WHERE conversationId = ? ORDER BY timestamp ASC",
      [conversationId]
    );
    conn.release();

    const formattedHistory = rows.map((row) => ({
      role: row.type === "bot" ? "model" : row.type,
      parts: [{ text: row.message }],
    }));

    console.log("formattedHistory:", formattedHistory)

    socketToSession = sessionManager.logSocketToSession();
    console.log("socketToSession:", socketToSession);

    if (socketToSession.has(ws)) {
      const { clientAddress, chatHistory } = socketToSession.get(ws);
      if (chatHistory) {
        chatHistory.history = formattedHistory;
        chatHistory._history =formattedHistory;
        oldConversation = chatHistory;
        sessionManager.setCurrentConversationIdBySocket(
          ws,
          conversationId
        );
        console.log("Loaded old Conversation ID:", conversationId);
        console.log("New History:", chatHistory.history);
      }
    }

    return rows.map((row) => ({
      type: row.type,
      message: row.message,
    }));
  } catch (err) {
    console.error("Error loading conversation messages:", err);
    throw err;
  }
}

async function editMessage(pool, messageId, newMessage) {
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
