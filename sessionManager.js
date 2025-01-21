const chatHistories = new Map();
const clientActivity = new Map();
const userSessions = new Map(); // Maps clientAddress to userId
const socketToSession = new Map(); // Maps WebSocket to session details (includes chat history)
const conversationIds = new Map(); //Maps socket to conversation id
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour

const createSession = (clientAddress, model, generationConfig, systemInstruction, userId, ws) => {
    const chatHistory = model.startChat({
        generationConfig: generationConfig,
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        history: [],
    });
    chatHistory.history = [];
    chatHistories.set(clientAddress, chatHistory);
    clientActivity.set(clientAddress, Date.now());
    userSessions.set(clientAddress, userId);
    socketToSession.set(ws, { clientAddress, chatHistory });
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

const getChatHistoryBySocket = (ws) => {
    return socketToSession.get(ws)?.chatHistory;
};

const deleteSession = (clientAddress) => {
    chatHistories.delete(clientAddress);
    clientActivity.delete(clientAddress);
    userSessions.delete(clientAddress);
     conversationIds.delete(clientAddress);
    // Clean up socketToSession as well
    socketToSession.forEach((session, ws) => {
        if (session.clientAddress === clientAddress) {
            socketToSession.delete(ws);
        }
    });
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
    }
};
const deleteSessionByUserId = (userId) => {
    socketToSession.forEach((session, ws) => {
         if(userSessions.get(session.clientAddress) === userId){
           chatHistories.delete(session.clientAddress);
           clientActivity.delete(session.clientAddress);
           userSessions.delete(session.clientAddress);
             conversationIds.delete(session.clientAddress);
           socketToSession.delete(ws);
           console.log(`Session deleted for userId ${userId}`)
        }

    })
}

const checkInactiveSessions = (wss) => {
    clientActivity.forEach((lastActivity, clientAddress) => {
        if (Date.now() - lastActivity > SESSION_TIMEOUT) {
            wss.clients.forEach(client => {
                if (client._socket && (client._socket.remoteAddress + ':' + client._socket.remotePort === clientAddress)) {
                    client.close(1008, 'Inactive session');
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
    if(socketToSession.has(ws)){
        const { clientAddress } = socketToSession.get(ws);
       conversationIds.set(clientAddress, conversationId);
    }
}
const getCurrentConversationIdBySocket = (ws) => {
  if(socketToSession.has(ws)){
      const { clientAddress } = socketToSession.get(ws);
     return conversationIds.get(clientAddress);
  }
  return null;
}


module.exports = {
    chatHistories,
    createSession,
    updateActivity,
    updateActivityBySocket,
    getChatHistory,
    getChatHistoryBySocket,
    deleteSession,
    deleteSessionBySocket,
    deleteSessionByUserId, // Added
    checkInactiveSessions,
    SESSION_TIMEOUT,
    getUserSessionId,
    setCurrentConversationIdBySocket,
    getCurrentConversationIdBySocket
};