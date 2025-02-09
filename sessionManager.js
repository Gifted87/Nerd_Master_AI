const chatHistories = new Map();
const clientActivity = new Map();
const userSessions = new Map(); // Maps clientAddress to userId
const socketToSession = new Map(); // Maps WebSocket to session details (includes chat history)
const conversationIds = new Map(); //Maps socket to conversation id
const SESSION_TIMEOUT = 3000000 * 60 * 1000; // 1 hour


function logSocketToSession() {
  console.log("Current socketToSession Map:");
  socketToSession.forEach((session, ws) => {
    console.log(
      `  WebSocket: ${ws._socket.remoteAddress}:${ws._socket.remotePort}, Session:`,
      session
    );
  });
  return socketToSession;
}
const createSession = (
  clientAddress,
  model,
  generationConfig,
  systemInstruction,
  userId,
  ws
) => {
  const chatHistory = model.startChat({
    generationConfig: generationConfig,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    history: [],
  });
  chatHistory.history = [];
  chatHistories.set(clientAddress, chatHistory);
  clientActivity.set(clientAddress, Date.now());
  userSessions.set(clientAddress, userId);
  socketToSession.set(ws, { clientAddress, chatHistory });
  console.log(
    `Session created for client: ${clientAddress}, user ID: ${userId}`
  ); // Added logging here
  //   logSocketToSession(); // Log socketToSession after creating a session

  //   console.log("socketToSession:", socketToSession);
};

const updateActivity = (clientAddress) => {
  clientActivity.set(clientAddress, Date.now());
};

const updateActivityBySocket = (ws) => {
  if (socketToSession.has(ws)) {
    const { clientAddress } = socketToSession.get(ws);
    updateActivity(clientAddress);
  }
};

const getChatHistory = (clientAddress) => {
  return chatHistories.get(clientAddress);
};

const setChatHistory = (ws, history) => {
  const { clientAddress, chatHistory } = socketToSession.get(ws);
  if (chatHistory) {
    chatHistory.history = history;
    chatHistory._history = history;
  }
};


const setApiKey = (ws, apiKey) => {
  const { clientAddress, chatHistory } = socketToSession.get(ws);
  if (chatHistory) {
    chatHistory._apiKey = apiKey;
  }
 console.log("Old _apiKey Restored: ", chatHistory)
};




const getChatHistoryBySocket = (ws) => {
  const session = socketToSession.get(ws);
  return session?.chatHistory || null;
};

const deleteSession = (clientAddress) => {
  console.log(`Deleting session for client: ${clientAddress}`); // Added log here
  chatHistories.delete(clientAddress);
  clientActivity.delete(clientAddress);
  userSessions.delete(clientAddress);
  conversationIds.delete(clientAddress);

  socketToSession.forEach((session, ws) => {
    if (session.clientAddress === clientAddress) {
      socketToSession.delete(ws);
      console.log(
        `Removed session from socketToSession for client: ${clientAddress}`
      ); // Added log here
    }
  });
  logSocketToSession(); // Log socketToSession after deleting a session
};

const deleteSessionBySocket = (ws) => {
  if (socketToSession.has(ws)) {
    const { clientAddress } = socketToSession.get(ws);
    chatHistories.delete(clientAddress);
    clientActivity.delete(clientAddress);
    userSessions.delete(clientAddress);
    conversationIds.delete(clientAddress);
    socketToSession.delete(ws);
    console.log(`Session deleted for ${clientAddress} due to socket closure.`);
    logSocketToSession(); // Log socketToSession after deleting session by socket
  }
};
const deleteSessionByUserId = (userId) => {
  socketToSession.forEach((session, ws) => {
    if (userSessions.get(session.clientAddress) === userId) {
      chatHistories.delete(session.clientAddress);
      clientActivity.delete(session.clientAddress);
      userSessions.delete(session.clientAddress);
      conversationIds.delete(session.clientAddress);
      socketToSession.delete(ws);
      console.log(`Session deleted for userId ${userId}`);
      logSocketToSession(); // Log socketToSession after deleting session by userId
    }
  });
};
const checkInactiveSessions = (wss) => {
  clientActivity.forEach((lastActivity, clientAddress) => {
    if (Date.now() - lastActivity > SESSION_TIMEOUT) {
      wss.clients.forEach((client) => {
        if (
          client._socket &&
          client._socket.remoteAddress + ":" + client._socket.remotePort ===
            clientAddress
        ) {
          client.close(1008, "Inactive session");
        }
      });
      deleteSession(clientAddress);
      console.log(`Session timed out for ${clientAddress} (background check)`);
    }
  });
};

const getUserSessionId = (clientAddress) => {
  return userSessions.get(clientAddress);
};
const setCurrentConversationIdBySocket = (ws, conversationId) => {
  if (socketToSession.has(ws)) {
    const { clientAddress } = socketToSession.get(ws);
    conversationIds.set(clientAddress, conversationId);
  }
};
const getCurrentConversationIdBySocket = (ws) => {
  if (socketToSession.has(ws)) {
    const { clientAddress } = socketToSession.get(ws);
    return conversationIds.get(clientAddress);
  }
  return null;
};

module.exports = {
  chatHistories,
  createSession,
  updateActivity,
  updateActivityBySocket,
  getChatHistory,
  getChatHistoryBySocket,
  deleteSession,
  deleteSessionBySocket,
  deleteSessionByUserId,
  checkInactiveSessions,
  SESSION_TIMEOUT,
  getUserSessionId,
  setCurrentConversationIdBySocket,
  getCurrentConversationIdBySocket,
  logSocketToSession,
  setChatHistory,
  setApiKey,
};
