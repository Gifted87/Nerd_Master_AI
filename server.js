const WebSocket = require('ws');
const http = require('http');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const uuid = require('uuid');
const websocketHandler = require('./websocketHandler');
const sessionManager = require('./sessionManager');
const fs = require('fs');

dotenv.config();

const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 8765;
const WEBSOCKET_HOST = process.env.WEBSOCKET_HOST || '0.0.0.0';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'password';
const DB_NAME = process.env.DB_NAME || 'chatdb';
const DB_CONNECTION_LIMIT = parseInt(process.env.DB_CONNECTION_LIMIT || '10');

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

let pool;

async function connectDB() {
    try {
        pool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            connectionLimit: DB_CONNECTION_LIMIT
        });

        const connection = await pool.getConnection();
        console.log('Connected to the MySQL database!');

        // Create users table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                isVerified BOOLEAN DEFAULT FALSE,
                verificationToken VARCHAR(255),
                resetToken VARCHAR(255),
                resetTokenExpiry DATETIME
            )
        `);

        // Create conversations table
      await connection.execute(`
         CREATE TABLE IF NOT EXISTS conversations (
             id INT AUTO_INCREMENT PRIMARY KEY,
             userId INT NOT NULL,
             name VARCHAR(255),
             startTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
             FOREIGN KEY (userId) REFERENCES users(id)
         )
     `);

         // Create messages table with conversationId
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversationId INT NOT NULL,
                userId INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                timestamp BIGINT NOT NULL,
                FOREIGN KEY (userId) REFERENCES users(id),
                FOREIGN KEY (conversationId) REFERENCES conversations(id)
            )
        `);

        console.log('Ensured users, conversations and messages tables exist.');

        connection.release();

        return pool;
    } catch (err) {
        console.error('Error connecting to the database:', err);
        throw err;
    }
}

async function startServer() {
    await connectDB();

    wss.on('connection', ws => {
        console.log('WebSocket connection initiated.');
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', async messageString => {
            try {
                console.log("Received message on server during WS", messageString);
                const data = JSON.parse(messageString);
                console.log("Parsed data", data);

                if (data.userId) {
                    const userId = parseInt(data.userId);
                    console.log(`Authenticating for userId: ${userId}`);
                    websocketHandler.handleAuthenticatedConnection(ws, pool, userId);
                } else if (data.action) {
                    websocketHandler.handleAction(ws, pool, data);
                } else {
                    console.log("Unidentified message format:", data);
                    ws.send(JSON.stringify({ type: 'error', message: 'Unidentified message format', error_type: 'message_format' }));
                }

            } catch (err) {
                console.error('Error processing message:', err);
                 if (messageString) {
                    console.error("Could not JSON.parse(messageString):", messageString);
                    ws.send(JSON.stringify({ type: "error", message: "Data parsing error, check log for more", error_type: 'message_parsing_error' }));
                }
            }
        });

        ws.on('close', () => {
            const clientAddress = ws._socket.remoteAddress + ':' + ws._socket.remotePort;
            console.log(`WebSocket connection closed for ${clientAddress}`);
            sessionManager.deleteSessionBySocket(ws);
        });

        ws.on('error', error => {
            const clientAddress = ws._socket.remoteAddress + ':' + ws._socket.remotePort;
            console.error(`WebSocket error with ${clientAddress}:`, error);
            sessionManager.deleteSessionBySocket(ws);
        });
    });

    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    });

    server.listen(WEBSOCKET_PORT, WEBSOCKET_HOST, () => {
        console.log(`WebSocket server started on ws://${WEBSOCKET_HOST}:${WEBSOCKET_PORT}`);
        setInterval(() => {
            wss.clients.forEach(ws => {
                if (!ws.isAlive) {
                     const clientAddress = ws._socket.remoteAddress + ':' + ws._socket.remotePort;
                    console.log(`Closing inactive connection for ${clientAddress}`);
                    sessionManager.deleteSessionBySocket(ws);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping(null, false);
            });
             sessionManager.checkInactiveSessions(wss);
        }, 30 * 1000); // Check for inactive clients and sessions every 30 seconds
    });
}

startServer();

process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    if (pool) {
        await pool.end();
        console.log('MySQL connection pool closed.');
    }
    process.exit();
});