const sessionManager = require('./sessionManager');
const geminiService = require('./geminiService');
const authService = require('./authService');

function sendError(ws, message, errorType = 'general') {
    ws.send(JSON.stringify({ type: 'error', message: message, error_type: errorType }));
}

const handleAuthenticatedConnection = async (ws, pool, userId) => {
    const clientAddress = ws._socket.remoteAddress + ':' + ws._socket.remotePort;
    console.log(`Authenticated connection established with ${clientAddress} for user id ${userId}`);
    sessionManager.createSession(clientAddress, geminiService.model, geminiService.generationConfig, geminiService.systemInstruction, userId, ws);
    ws.send(JSON.stringify({ type: 'connection_success', userId: userId }));
    setupMessageHandling(ws, pool, userId, clientAddress);
};

const handleAction = async (ws, pool, data) => {
    const clientAddress = ws._socket.remoteAddress + ':' + ws._socket.remotePort;
    const action = data.action;

    if (action === 'signup') {
        try {
            const { username, email, password } = data;
            const { userId, error } = await authService.signupUser(pool, username, email, password);
            if (error) {
                sendError(ws, error, 'signup_error');
                return;
            }
            // Automatically log in the user after successful signup
            const loginResult = await authService.loginUser(pool, email, password);
            if (loginResult.error) {
                sendError(ws, "Signup successful, but error during automatic login. Please log in.", 'login_error');
                return;
            }
            const loggedInUserId = loginResult.userId;
            sessionManager.createSession(clientAddress, geminiService.model, geminiService.generationConfig, geminiService.systemInstruction, loggedInUserId, ws);
            ws.send(JSON.stringify({ type: 'signup_success', userId: loggedInUserId }));
            setupMessageHandling(ws, pool, loggedInUserId, clientAddress);

        } catch (error) {
            console.error("Error during signup:", error);
            sendError(ws, 'Error during signup, please try again later', 'signup_error');
        }
    } else if (action === 'login') {
        try {
            const { email, password } = data;
            const { userId, error } = await authService.loginUser(pool, email, password);
            if (error) {
                sendError(ws, error, 'login_error');
                return;
            }
            sessionManager.createSession(clientAddress, geminiService.model, geminiService.generationConfig, geminiService.systemInstruction, userId, ws);
            ws.send(JSON.stringify({ type: 'login_success', userId: userId }));
            setupMessageHandling(ws, pool, userId, clientAddress);
        } catch (error) {
            console.error("Error during login:", error);
            sendError(ws, 'Error during login, please try again later', 'login_error');
        }
    } else if (action === 'forgot_password') {
        try {
            const { email } = data;
            const { error } = await authService.forgotPassword(pool, email);
            if (error) {
                sendError(ws, error, 'forgot_password_error');
                return;
            }
            ws.send(JSON.stringify({ type: 'forgot_password_success', message: 'Password reset email sent successfully' }));
        } catch (error) {
            console.error("Error during forgot password request:", error);
            sendError(ws, "Error requesting password reset, try again later.", "forgot_password_error");
        }
    } else if (action === 'reset_password') {
        try {
            const { token, newPassword } = data;
            const { error, message } = await authService.resetPassword(pool, token, newPassword);
            if (error) {
                sendError(ws, error, "reset_password_error");
                return;
            }
            ws.send(JSON.stringify({ type: 'reset_password_success', message: message }));
        } catch (error) {
            console.error("Error during password reset:", error);
            sendError(ws, "Error setting password please try again later.", "reset_password_error");
        }
    } else if (action === 'verify_email') {
        try {
            const { token } = data;
            const { error, message } = await authService.verifyEmail(pool, token);
            if (error) {
                sendError(ws, error, 'verify_email_error');
                return;
            }
            // After successful verification, you might want to inform the client or redirect
            ws.send(JSON.stringify({ type: 'verify_email_success', message: message }));
        } catch (err) {
            console.error("Error verifying user email", err);
            sendError(ws, 'Error verifying email try again', 'verify_email_error');
        }
    } else {
        // Handle actions that don't require immediate authentication check here if necessary
        console.log("Handling action:", action, "without explicit auth check yet");
    }
};

const setupMessageHandling = (ws, pool, userId, clientAddress) => {
    ws.on('message', async messageString => {
        sessionManager.updateActivityBySocket(ws);
        try {
            const data = JSON.parse(messageString);
            const action = data.action;
              if (action === 'logout') {
                    console.log(`logout request received from ${clientAddress}`)
                   sessionManager.deleteSessionByUserId(userId);
                //    ws.close(1000, "logout request");
                } else if (action === 'send_message') {
                const userMessage = data.message?.trim();
                if (!userMessage) {
                    sendError(ws, 'No message provided', 'input_validation');
                    return;
                }
                const chat = sessionManager.getChatHistoryBySocket(ws);
                if (!chat) {
                    console.error(`Chat history not found for ${clientAddress}`);
                    sendError(ws, 'Chat session error.', 'session_error');
                    return;
                }
                try {
                    const botResponse = await geminiService.generateResponse(chat, userMessage, ws);
                    const htmlResponse = geminiService.md.render(botResponse);
                    const timestamp = Date.now();
                    const messageToSaveUser = {
                        userId: userId,
                        type: 'user',
                        message: userMessage,
                        timestamp: timestamp
                    };
                    await saveMessage(pool, messageToSaveUser);

                    const messageToSaveBot = {
                        userId: userId,
                        type: 'bot',
                        message: htmlResponse,
                        timestamp: timestamp
                    };
                    await saveMessage(pool, messageToSaveBot);

                    ws.send(JSON.stringify({ type: 'bot', message: htmlResponse }));

                } catch (error) {
                    console.error('Error processing message:', error);
                    sendError(ws, 'An error occurred while processing your request.', 'internal_error');
                }

            } else if (action === 'load_previous_messages') {
                try {
                    const messages = await loadPreviousMessages(pool, userId, ws);
                    ws.send(JSON.stringify({ type: 'previous_messages', message: messages }));
                } catch (error) {
                    console.error('Error loading previous messages:', error);
                    sendError(ws, 'An error occurred while loading previous messages.', 'internal_error');
                }
            } else if (action === 'edit_message') {
                try {
                    const messageId = data.messageId;
                    const newMessage = data.newMessage;
                    await editMessage(pool, messageId, newMessage);
                    ws.send(JSON.stringify({ type: 'message_edited', messageId: messageId, newMessage: newMessage }));
                } catch (error) {
                    console.error('Error editing message:', error);
                    sendError(ws, 'An error occurred while editing the message.', 'internal_error');
                }
            } else if (action === 'delete_message') {
                try {
                    const messageId = data.messageId;
                    await deleteMessage(pool, messageId);
                    ws.send(JSON.stringify({ type: 'message_deleted', messageId: messageId }));
                } catch (error) {
                    console.error('Error deleting message:', error);
                    sendError(ws, 'An error occurred while deleting the message.', 'internal_error');
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            sendError(ws, 'Invalid message format.', 'message_format');
        }
    });

    ws.on('close', () => {
        console.log(`WebSocket closed for user ID ${userId}`);
         sessionManager.deleteSessionBySocket(ws);
    });

    ws.on('error', error => {
        console.error(`WebSocket error for user ID ${userId}:`, error);
        sessionManager.deleteSessionBySocket(ws);
    });
};

async function saveMessage(pool, message) {
    try {
        const conn = await pool.getConnection();
        const [result] = await conn.execute(
            'INSERT INTO messages (userId, type, message, timestamp) VALUES (?, ?, ?, ?)',
            [message.userId, message.type, message.message, message.timestamp]
        );
        conn.release();
        return result.insertId;
    } catch (err) {
        console.error('Error saving message:', err);
        throw err;
    }
}

async function loadPreviousMessages(pool, userId, ws, page = 1, pageSize = 10) {
    try {
        const offset = (page - 1) * pageSize;
        const conn = await pool.getConnection();
        const [rows] = await conn.execute(
            'SELECT id, type, message, timestamp FROM messages WHERE userId = ? ORDER BY timestamp DESC LIMIT ?, ?',
            [userId, parseInt(offset, 10), parseInt(pageSize, 10)]
        );
        conn.release();
        console.log("Sending previous messages:", rows);
        return rows.map(row => ({
            id: row.id,
            type: row.type,
            message: row.message,
            timestamp: row.timestamp
        }));
    } catch (err) {
        console.error('Error loading previous messages:', err);
        sendError(ws, 'Error loading previous messages from the database.', 'database_error');
        return [];
    }
}

async function editMessage(pool, messageId, newMessage) {
    try {
        const conn = await pool.getConnection();
        await conn.execute(
            'UPDATE messages SET message = ? WHERE id = ?',
            [newMessage, messageId]
        );
        conn.release();
    } catch (err) {
        console.error('Error editing message:', err);
        throw err;
    }
}

async function deleteMessage(pool, messageId) {
    try {
        const conn = await pool.getConnection();
        await conn.execute(
            'DELETE FROM messages WHERE id = ?',
            [messageId]
        );
        conn.release();
    } catch (err) {
        console.error('Error deleting message:', err);
        throw err;
    }
}

module.exports = {
    handleAuthenticatedConnection,
    handleAction
};