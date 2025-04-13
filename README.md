## Nerd Master AI - Comprehensive Documentation

**Version:** 1.0 (Based on provided code)

**Table of Contents:**

1.  **Introduction**
    *   Purpose and Vision
    *   Target Audience
    *   Key Differentiators
2.  **Getting Started**
    *   Account Creation (Sign Up)
    *   Email Verification
    *   Logging In
    *   Password Management (Forgot/Reset)
    *   Initial User Experience (Customization Dialog)
3.  **Core Chat Interface**
    *   Layout Overview (Sidebar, Chat Area, Input)
    *   Sending Messages
    *   Receiving AI Responses (Streaming)
    *   Message Formatting (Markdown, Code, MathJax)
    *   Typing Indicator
    *   Initial Welcome Message
4.  **Chatbot Customization**
    *   Purpose
    *   The Customization Dialog
    *   Task Types and Specific Tasks
    *   Crafting Effective Descriptions
    *   Advanced Settings (Temperature, Top-P)
    *   Starting a Customized Session
    *   "Just Chat" Option
5.  **Conversation Management**
    *   Chat History Sidebar
    *   Starting a New Chat
    *   Loading Previous Conversations
    *   Sidebar Collapse/Expand Functionality (Desktop)
    *   Mobile Sidebar Functionality
    *   Logout and Session Handling
6.  **File Handling**
    *   Uploading Files (Button & Input)
    *   Supported File Types
    *   File Previews in Input Area
    *   Removing Files Before Sending
    *   How Files Are Used by the AI
    *   Displaying Files in Chat History
7.  **Action Buttons & Interaction Enhancement**
    *   Overview
    *   Button Functions:
        *   Copy (Formatted Text)
        *   Copy Raw MD (Raw Markdown)
        *   Regenerate
        *   Proceed
        *   Humanize (Experimental/Hidden)
        *   More
        *   Continue
        *   Use Ideal Scenario
        *   Shorter / Longer
        *   Summarize
        *   Rephrase
        *   Tone Adjustment (Creative, Professional, Casual)
    *   Contextual Appearance
8.  **Document Generation Capabilities**
    *   Overview of Two Modes
    *   **Mode 1: Exporting Conversations**
        *   Accessing the Export Dialog (FAB Button)
        *   Export Options (Content Scope, Document Type)
        *   Specifying Content (Chapters - Hidden Feature)
        *   Export Process and Output
    *   **Mode 2: Generating New Documents**
        *   Accessing the Generation Dialog (From Customization)
        *   Defining Document Requirements (Type, Description, Pages)
        *   Generation Process
        *   Result Display (Success/Error, Download Link)
9.  **User Authentication and Security**
    *   Password Hashing (bcrypt)
    *   Token-Based Verification/Reset
    *   Session Management
    *   Secure WebSocket Connection (Implied)
10. **Technical Overview (High-Level)**
    *   Frontend (HTML, CSS, JavaScript, Libraries)
    *   Backend (Node.js, WebSocket Server - `ws`)
    *   Database (MySQL)
    *   AI Service (Google Generative AI - Gemini)
    *   Email Service (Nodemailer)
    *   Document Generation API (External Service)
11. **Troubleshooting / FAQ**
12. **Conclusion**

---

### 1. Introduction

#### Purpose and Vision

Nerd Master AI is a sophisticated, interactive web application designed to serve as a powerful assistant for students, researchers, and professionals. It leverages advanced AI (specifically Google's Gemini models) to provide contextual assistance, generate content, facilitate research, aid study, and streamline the creation of academic and professional documents. The vision is to create a versatile, intelligent partner that understands user needs and adapts its capabilities accordingly.

#### Target Audience

*   High School, University, and Postgraduate Students
*   Researchers and Academics
*   Writers and Content Creators
*   Professionals needing assistance with reports, presentations, or research summaries.

#### Key Differentiators

*   **Task-Oriented Customization:** Allows users to tailor the AI's persona and focus for specific academic tasks (assignments, research, writing, etc.).
*   **Integrated Document Generation:** Offers capabilities to both export chat conversations into formatted documents (PDF, DOCX, PPTX) and generate *new* documents based on user descriptions and requirements.
*   **Advanced Interaction:** Features action buttons for quick refinement of AI responses (regenerate, summarize, rephrase, adjust tone, etc.).
*   **Rich Content Support:** Handles Markdown, syntax-highlighted code blocks, and complex mathematical equations (via MathJax).
*   **File Upload Integration:** Allows users to upload various file types (images, PDF, text, code) to provide context for the AI.
*   **Persistent Chat History:** Securely stores conversations linked to user accounts, allowing users to resume previous sessions.

### 2. Getting Started

#### Account Creation (Sign Up)

*   Users can create a new account by providing a unique username, a valid email address, and a secure password.
*   Password requirements enforce minimum length and character complexity (uppercase, lowercase, number, special character) for security.

#### Email Verification

*   Upon signup, a verification email is sent to the user's registered address.
*   Users **must** click the verification link in the email to activate their account. This is a crucial security step.
*   The verification link contains a unique token and directs the user back to the application, triggering the verification process on the backend.
*   Unverified users cannot log in.

#### Logging In

*   Registered and verified users can log in using their email and password.
*   Error messages guide users in case of incorrect credentials or unverified accounts.

#### Password Management (Forgot/Reset)

*   A "Forgot password?" link initiates the password reset process.
*   Users enter their registered email address.
*   If the email exists, a password reset email containing a unique, time-limited reset token is sent.
*   Clicking the link in the email directs the user to a password reset form within the application.
*   The user enters and confirms a new password, which is then securely updated.

#### Initial User Experience (Customization Dialog)

*   After successful login or signup/verification, users are immediately presented with the **Chatbot Customization Dialog**, not the main chat interface.
*   This encourages users to define their immediate need, guiding the AI for a more productive first interaction.
*   Users can select a task type, specific task, provide a description, and optionally tweak advanced AI parameters before starting their session or generating a new document directly. Alternatively, they can choose "Just Chat" for a default session.

### 3. Core Chat Interface

#### Layout Overview

*   **Sidebar:** Located on the left (desktop) or accessible via a toggle (mobile), it displays the user's conversation history and provides buttons for New Chat, Export, and Logout. Desktop view features a collapsible sidebar.
*   **Chat Area:** The main section where messages are displayed and interactions occur.
*   **Input Area:** Located at the bottom, containing the file upload button, text input field, and send button.

#### Sending Messages

*   Users type their message into the auto-resizing text area.
*   Pressing `Enter` or clicking the Send button (<i class="fas fa-paper-plane"></i>) submits the message. `Ctrl+Enter` also submits. `Escape` clears the input.
*   Files can be attached before sending (see Section 6).

#### Receiving AI Responses (Streaming)

*   When the AI generates a response, it's displayed incrementally (streamed) in the chat area for a real-time feel.
*   A temporary flashing cursor indicates the streaming process.
*   While streaming, the Send button changes to a Stop button (<i class="fas fa-stop"></i>), allowing the user to interrupt the generation.
*   Once complete, the message is finalized.

#### Message Formatting

*   The AI's responses are rendered from Markdown, supporting:
    *   Standard formatting (bold, italics, lists, links, blockquotes).
    *   Tables.
    *   Syntax-highlighted code blocks (using `highlight.js`) with a dedicated copy button per block.
    *   Mathematical formulas and equations rendered using MathJax.

#### Typing Indicator

*   A subtle `<i class="fas fa-terminal"></i>` indicator appears while the backend processes the request and starts generating a response.

#### Initial Welcome Message

*   When a new chat session begins (after customization or "Just Chat"), an initial message "Welcome to Nerd Master AI!" is displayed briefly before the first user/AI interaction, unless loading a previous conversation.

### 4. Chatbot Customization

#### Purpose

This feature allows users to configure the AI's behavior, system instructions, and parameters *before* starting a conversation, leading to more focused and relevant interactions tailored to specific academic or professional tasks.

#### The Customization Dialog

*   Appears immediately after login/signup.
*   Can be accessed again by starting a "New Chat".
*   Contains fields to define the session's context.

#### Task Types and Specific Tasks

*   Users first select a broad **Task Type** (e.g., Assignment, Research, Writing, Study, Project Work).
*   Based on the Task Type, a dropdown menu populates with specific **Tasks** (e.g., Assignment Helper, Research Paper Generation, Paraphrasing, Study Helper, Project Work Creation).
*   Selecting a task dynamically loads a specific, detailed **System Instruction** on the backend (`geminiService.js`), guiding the AI's persona, knowledge focus, and response style for that task.

#### Crafting Effective Descriptions

*   The **Description** field allows the user to provide initial context or the specific problem/topic they need help with.
*   This description acts as the first user message in the customized session.
*   Detailed and clear descriptions lead to better initial AI responses.

#### Advanced Settings (Optional)

*   An "Advanced Settings" drawer allows fine-tuning:
    *   **Temperature (0.0 - 2.0, default 0.7):** Controls randomness. Lower values (e.g., 0.2) lead to more deterministic, focused responses. Higher values (e.g., 1.0+) increase creativity and diversity but may reduce coherence.
    *   **Top-P (0.0 - 1.0, default 0.5):** Nucleus sampling. Controls the selection pool of tokens based on cumulative probability. Lower values make the output more focused and less random.
    *   *(AI Model selection is present in HTML but hidden and defaults to Gemini Flash)*.

#### Starting a Customized Session

*   Clicking "Start Session" sends the customization payload (task, description, parameters) to the backend.
*   The backend configures the AI session with the appropriate system instruction and parameters.
*   It then processes the user's description as the first message and streams the initial AI response back to the chat interface.
*   The chat app is then displayed, hiding the customization dialog.

#### "Just Chat" Option

*   If the user wants a general-purpose chat without specific task configuration, they can click "Just Chat".
*   This bypasses the detailed customization, starts a session with the default system instruction, and displays the main chat interface ready for the user's first message.

### 5. Conversation Management

#### Chat History Sidebar

*   Displays a list of the user's previously saved conversations.
*   Each list item typically shows the conversation's name (derived from the first user message or task description) or start time.
*   Clicking a list item loads that conversation's messages into the chat area.
*   The currently loaded conversation is visually highlighted in the sidebar.
*   Initially hidden on mobile, accessible via a menu (<i class="fas fa-bars"></i>) button in the chat header.

#### Starting a New Chat

*   Clicking the "New Chat" (<i class="fas fa-plus"></i>) button in the header:
    *   Saves the currently active conversation (if any messages exist).
    *   Clears the chat message area.
    *   Resets the selected conversation ID.
    *   Displays the **Chatbot Customization Dialog** to configure the new session.

#### Loading Previous Conversations

*   Users can click on any conversation listed in the sidebar.
*   This sends a request to the backend to fetch the messages for that specific conversation ID.
*   The backend retrieves messages from the database, reconstructs the chat history (including AI configuration like system instruction and temperature used for that chat), and sends the messages back to the frontend.
*   The chat area is cleared and populated with the loaded messages. The corresponding AI configuration for that specific chat is also restored for subsequent interactions within that loaded conversation.

#### Sidebar Collapse/Expand Functionality (Desktop)

*   On desktop views (> 768px), the sidebar features a toggle button (<i class="fas fa-chevron-left"></i> / <i class="fas fa-chevron-right"></i>).
*   Clicking this button collapses the sidebar to a narrow strip showing only icons or expands it back to the full width.
*   The collapsed state is saved in `localStorage` and persists across sessions for desktop users.

#### Mobile Sidebar Functionality

*   On mobile views (<= 768px), the sidebar is initially hidden.
*   A menu icon (<i class="fas fa-bars"></i>) in the chat header toggles the sidebar's visibility, sliding it in from the left.
*   Clicking outside the sidebar or selecting a conversation closes it automatically.

#### Logout and Session Handling

*   Clicking the Logout button (<i class="fas fa-sign-out-alt"></i>):
    *   Sends a logout request to the backend.
    *   If there's an active conversation with messages, the backend saves it before logging out.
    *   Removes the authentication token from `localStorage`.
    *   Redirects the user to the authentication screen (Login/Sign Up).
*   Backend sessions are managed with activity tracking. Inactive sessions are automatically cleaned up after a timeout period (currently set to 1 hour).

### 6. File Handling

#### Uploading Files

*   A paperclip icon (<i class="fas fa-paperclip"></i>) button next to the chat input opens the system's file selector.
*   Users can select one or multiple files.

#### Supported File Types

*   The frontend allows selection of images, PDF, various text/code formats (txt, js, py, md, csv, xml, rtf), and potentially others based on the `accept` attribute (`image/*,application/pdf,text/*,...`). The backend Gemini integration primarily focuses on processing common image, text, and code formats.

#### File Previews in Input Area

*   After selecting files, small previews appear *above* the text input area.
*   Image files show a thumbnail.
*   Other files (PDF, text) show a generic icon and the filename.

#### Removing Files Before Sending

*   Each file preview has a small '×' button, allowing the user to remove that specific file before sending the message.

#### How Files Are Used by the AI

*   When a message is sent with files:
    1.  The frontend reads the file(s) as Base64 encoded data.
    2.  This data is sent to the backend along with the text message.
    3.  The backend temporarily saves the file, uploads it to Google AI File Service via `geminiService.js`, obtaining a `fileUri`.
    4.  The file's `mimeType` and `fileUri` are included in the parts array sent to the Gemini API along with the user's text.
    5.  The Gemini model uses the file content as context when generating its response.

#### Displaying Files in Chat History

*   When displaying past messages that included files, the UI shows a representation:
    *   Images might be displayed as thumbnails or placeholders.
    *   Other files are typically represented by an icon and filename within the user message bubble.

### 7. Action Buttons & Interaction Enhancement

#### Overview

Below the chat input area (but above the input form itself), a row of action buttons appears contextually after the AI provides a response. These buttons offer quick ways to interact with or refine the last AI message without typing common commands. They disappear if the user clicks elsewhere or starts typing a new message.

#### Button Functions

*   **Copy (<i class="far fa-copy"></i>):** Copies the *plain text content* (Markdown stripped) of the last AI response to the clipboard.
*   **Raw MD (<i class="fab fa-markdown"></i>):** Copies the *raw Markdown source* of the last AI response to the clipboard.
*   **Regenerate (<i class="fas fa-sync-alt"></i>):** Asks the AI to generate a completely new response to the *previous user prompt*.
*   **Proceed (<i class="fas fa-arrow-right"></i>):** A generic prompt often used in step-by-step generation tasks (like Project Work Creation) to signal the AI to continue to the next step.
*   **Humanize (<i class="fas fa-person"></i>) (Hidden/Experimental):** Instructs the AI to rewrite the last response to sound more natural and less robotic, using a detailed internal prompt. *(Currently hidden in the HTML)*.
*   **More (<i class="fas fa-plus"></i>):** Asks the AI to provide more detail or elaborate further on its last response.
*   **Continue (<i class="fas fa-play"></i>):** Asks the AI to continue generating from where it might have stopped (useful if the response was cut short or the user interrupted).
*   **Use Ideal Scenario (<i class="fab fa-superpowers"></i>):** Often used in conjunction with tasks like Practical Report Generation, telling the AI to make reasonable assumptions and fill in gaps if the user hasn't provided complete details.
*   **Shorter (<i class="fas fa-compress-alt"></i>):** Asks the AI to condense its last response.
*   **Longer (<i class="fas fa-expand-alt"></i>):** Asks the AI to expand on its last response.
*   **Summarize (<i class="fas fa-scroll"></i>):** Asks the AI to provide a summary of its last response.
*   **Rephrase (<i class="fas fa-paragraph"></i>):** Asks the AI to reword its last response while keeping the same meaning.
*   **Tone Adjustment:**
    *   **Creative (<i class="fas fa-paint-brush"></i>):** Asks the AI to rewrite the last response with a more creative tone.
    *   **Professional (<i class="fas fa-briefcase"></i>):** Asks the AI to rewrite the last response with a more formal/professional tone.
    *   **Casual (<i class="fas fa-tshirt"></i>):** Asks the AI to rewrite the last response with a more informal/casual tone.

#### Contextual Appearance

These buttons appear automatically after a message from the AI (`message--bot`) is fully rendered. They are hidden when the user interacts with the input field or clicks away.

### 8. Document Generation Capabilities

#### Overview of Two Modes

Nerd Master AI offers two distinct document generation features:
1.  Exporting existing conversation history into a document.
2.  Generating entirely new documents based on a user-provided topic or description.

#### Mode 1: Exporting Conversations

*   **Accessing:** Initiated by clicking the "Export" Floating Action Button (FAB) (<i class="fas fa-file-export"></i>) in the chat header.
*   **Dialog:** Opens the "Create Document" dialog.
*   **Options:**
    *   **Content Selection:** *(Hidden/Defaults to Last Reply)* Allows choosing between exporting only the *last AI reply* or the *entire conversation*.
    *   **Document Type:** Select the desired output format: PDF, Word Document (DOCX), or PowerPoint (PPTX).
*   **Specifying Content (Chapters):** *(Hidden Feature)* An input field appears if "Entire Conversation" is selected, intended for specifying chapter structures (e.g., "Chapter: 2, Methods: 4-5"), but this feature seems currently hidden or inactive in the UI.
*   **Process:**
    1.  User configures export options and submits.
    2.  A request (`action: "generate_document"`) is sent to the backend, including the selected format, content scope, and potentially chapter instructions.
    3.  The backend retrieves the relevant chat history (last message or full history) for the *current session*.
    4.  It constructs a prompt containing the chat content and formatting instructions.
    5.  This prompt is sent to the **external Document Generation API**.
    6.  The API generates the document and returns a download URL and filename.
    7.  The backend relays this URL/filename to the frontend.
    8.  The frontend displays a success message in the chat with a clickable download link for the generated document. Errors are displayed as error messages.

#### Mode 2: Generating New Documents

*   **Accessing:** Initiated from the **Chatbot Customization Dialog** via the "Generate New Document" button. This bypasses starting a chat session.
*   **Dialog:** Opens the dedicated "Generate New Document" dialog.
*   **Requirements:**
    *   **Document Type:** Select PDF, DOCX, or PPTX.
    *   **Description / Topic:** User provides a detailed description or topic for the document. The quality of this input significantly impacts the output.
    *   **Approximate Number of Pages:** User specifies the desired length (1-30 pages).
*   **Process:**
    1.  User fills in the details and clicks "Proceed".
    2.  A request (`action: "generate_new_document"`) is sent to the backend with the type, description, and page count.
    3.  The backend constructs a *new prompt* specifically for document creation based on the description and page count (calculating paragraph estimates, etc.). This prompt **does not** use existing chat history.
    4.  This prompt is sent to the **external Document Generation API**.
    5.  The API generates the new document.
    6.  The backend receives the download URL and filename.
    7.  The frontend hides the generation dialog and displays a **result overlay**:
        *   **Success:** Shows a success message and a "Download Document" button linking to the generated file. A "Go Back" button is also present.
        *   **Error:** Shows an error message and only the "Go Back" button.
    8.  Clicking "Go Back" reloads the application.

### 9. User Authentication and Security

*   **Password Hashing:** User passwords are not stored in plain text. They are hashed using `bcryptjs` before being saved to the database, providing strong protection against breaches.
*   **Token-Based Verification/Reset:** Email verification and password resets use unique, single-use tokens (`uuid`) sent via email. These tokens often have an expiry time (implemented for password reset) to limit their validity window.
*   **Session Management:** The backend manages user sessions, associating WebSocket connections with authenticated user IDs. It includes activity tracking and timeouts for inactive sessions.
*   **Secure WebSocket Connection (Implied):** While the code uses `ws://`, production deployments should ideally use `wss://` (WebSocket Secure) over TLS/SSL for encrypted communication.

### 10. Technical Overview (High-Level)

*   **Frontend:** Standard HTML, CSS, and JavaScript. Uses libraries like Font Awesome (icons), Poppins (font), Moment.js (timestamps), Highlight.js (code syntax highlighting), Markdown.js (or similar for rendering), and MathJax (equation rendering). Handles UI interactions, displays messages, and communicates with the backend via WebSockets.
*   **Backend:** Node.js environment.
    *   **WebSocket Server:** Uses the `ws` library to handle real-time, bidirectional communication with clients. `websocketHandler.js` manages message routing and authentication checks.
    *   **Database:** Uses `mysql2/promise` library to interact with a MySQL database for storing user accounts, conversation metadata, and message history.
    *   **AI Service Integration:** Uses the `@google/generative-ai` library (`geminiService.js`) to interact with the Google Gemini API for generating chat responses. Manages API keys and potentially different model configurations. Integrates with Google AI File Service for handling uploads.
    *   **Email Service:** Uses `nodemailer` (`emailService.js`) to send transactional emails (verification, password reset) via a configured SMTP server.
    *   **Session Management:** `sessionManager.js` tracks active connections, associated user IDs, chat history objects, and session timeouts.
    *   **Authentication Logic:** `authService.js` handles signup, login, password hashing/comparison, token generation/validation for email verification and password reset.
    *   **Document Generation API:** Communicates with an *external* Flask-based API (running at `http://192.168.43.45:5000` based on code) via HTTP POST requests, sending prompts and receiving document download links. Requires an API key (`DOC_API_SECRET_KEY`).

### 11. Troubleshooting / FAQ

*   **Cannot Log In:**
    *   Ensure email is verified (check spam folder for verification email).
    *   Double-check email and password spelling.
    *   Use the "Forgot password?" feature if needed.
*   **Connection Error/Closed:**
    *   Check internet connectivity.
    *   The server might be temporarily down or restarting. Refresh the page after a minute.
    *   Persistent issues might require server-side checks.
*   **Document Generation Failed:**
    *   The external document generation API might be unavailable or experiencing issues.
    *   The prompt sent (either chat history or new description) might be too complex or malformed for the API. Try simplifying the request.
    *   Check if the backend server can reach the document API URL (`http://192.168.43.45:5000`).
*   **Slow AI Responses:**
    *   Can be due to high load on the Gemini API.
    *   Complex prompts or prompts involving file analysis take longer.
    *   Network latency between the server and the AI API.
*   **File Upload Error:**
    *   Check if the file type is supported.
    *   Ensure the file size is within limits (appears to be generous based on code, but practical limits might exist).
    *   Temporary server issue during upload processing.

### 12. Conclusion

Nerd Master AI provides a rich, interactive platform that goes beyond simple Q&A. Its strength lies in the combination of customizable, task-aware AI chat, robust conversation management, and unique document generation capabilities. By integrating AI assistance directly into the workflow of creating academic and professional content, it aims to significantly enhance productivity, learning, and research efficiency for its users.
