hljs.highlightAll();

const chatApp = document.getElementById("chat-app");
const authContainer = document.getElementById("auth-container");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const loadingOverlay = document.getElementById("loading-overlay");
const authErrorDisplay = document.getElementById("auth-error-display");
const sendButton = document.getElementById("send-button");
const newChatButton = document.getElementById("new-chat-button");
const typingIndicator = document.getElementById("typing-indicator");
const logoutButton = document.getElementById("logout-button");
const sidebar = document.getElementById("chat-sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
let oldChat = false;

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const signupFormDiv = document.getElementById("signup-form-div");
const loginFormDiv = document.getElementById("login-form-div");
const initialChatMessage = document.getElementById("initial-chat-message");

const forgotPasswordDiv = document.getElementById("forgot-password-div");
const forgotPasswordForm = document.getElementById("forgot-password-form");
const resetPasswordForm = document.getElementById("reset-password-form");
const resetPasswordDiv = document.getElementById("reset-password-div");
const toggleLoginLink = document.getElementById("toggle-login");
const toggleSignupLink = document.getElementById("toggle-signup");
const forgotPasswordLink = document.getElementById("forgot-password");
const toggleLoginFromForgot = document.getElementById(
  "toggle-login-from-forgot"
);

const verifyEmailOverlay = document.getElementById("verify-email-overlay");
const loadConversationsButton = document.getElementById(
  "load-conversations-button"
);
const conversationList = document.getElementById("conversation-list");
const loadingPreviousMessages = document.getElementById(
  "loading-previous-messages"
);
const verifyEmailText = document.getElementById("verify_email_text");
const closeVerifyEmailButton = document.getElementById("close-verify-email");

const actionButtons = document.getElementById("action-buttons");
const copyContent = document.getElementById("copy-content");
let lastBotMessage = null;

// New dialog elements
const chatbotCustomizationDialog = document.getElementById(
  "chatbot-customization-dialog"
);

// Add these variables at the top
let streamBuffer = '';
let currentStreamMessageId = null;
let currentStreamConversationId = null;
let renderDebounce = null;

const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-button");
let currentFile = null;

const customizationForm = document.getElementById("customization-form");
const taskTypeSelect = document.getElementById("task-type-select");
const subjectSelect = document.getElementById("subject-select");
const topicInput = document.getElementById("topic-input");
const temperatureInput = document.getElementById("temperature-input");
const aiModelSelect = document.getElementById("ai-model-select");
const topPInput = document.getElementById("top-p-input");


// Add at the top with other element selectors
const sidebarCollapseToggle = document.getElementById('sidebar-collapse-toggle');

// Add this event listener
sidebarCollapseToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebar.classList.toggle('collapsed');
  
  // Only handle desktop behavior
  if (window.innerWidth > 768) {
    if (sidebar.classList.contains('collapsed')) {
      localStorage.setItem('sidebarCollapsed', 'true');
    } else {
      localStorage.removeItem('sidebarCollapsed');
    }
  }
});

// Add this to initialize state
if (localStorage.getItem('sidebarCollapsed') && window.innerWidth > 768) {
  sidebar.classList.add('collapsed');
}


function autoResizeTextarea() {
  const textarea = chatInput;
  textarea.style.height = "auto"; // Reset height
  const maxHeight = parseInt(getComputedStyle(textarea).maxHeight, 10);

  // Set new height (not exceeding maxHeight)
  textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + "px";

  // Reset to minimum height if empty
  if (textarea.value === "") {
    textarea.style.height = "3rem"; // Match your min-height value
  }
}

function handleStreamChunk(responseData) {
  streamBuffer += responseData.chunk;

  // Create message container if it doesn't exist
  if (!currentStreamMessageId) {
    currentStreamMessageId = Date.now().toString();
    const messageDiv = createMessageContainer(responseData.conversationId);
    chatMessages.appendChild(messageDiv);
  }

  hideLoading();

  // Debounced rendering for better performance
  clearTimeout(renderDebounce);
  renderDebounce = setTimeout(() => {
    updateStreamDisplay(streamBuffer, responseData.conversationId);
  }, 100); // Render at 10fps max
}

function createMessageContainer(conversationId) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message message--bot streaming";
  messageDiv.dataset.messageId = currentStreamMessageId;
  messageDiv.dataset.conversationId = conversationId;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message__content";

  messageDiv.appendChild(contentDiv);
  return messageDiv;
}

function updateStreamDisplay(content, conversationId) {
  const messageDiv = chatMessages.querySelector(
    `[data-message-id="${currentStreamMessageId}"]`
  );
  if (!messageDiv) return;

  const contentDiv = messageDiv.querySelector(".message__content");
  contentDiv.innerHTML = markdown.toHTML(content);
  
  // Manually apply Highlight.js to code blocks
  contentDiv.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
  // Add temporary cursor
  if (!contentDiv.querySelector(".streaming-cursor")) {
    contentDiv.innerHTML += '<span class="streaming-cursor"></span>';
  }


  // Highlight code blocks incrementally
  contentDiv.querySelectorAll("pre code").forEach((block) => {
    if (!block.dataset.highlighted) {
      hljs.highlightElement(block);
      block.dataset.highlighted = "true";
    }
  });
  // const shouldScroll = chatMessages.scrollTop + chatMessages.clientHeight >= 
  //                      chatMessages.scrollHeight - 50;

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function finalizeStream(responseData) {
  const messageDiv = chatMessages.querySelector(
    `[data-message-id="${currentStreamMessageId}"]`
  );
  if (messageDiv) {
    messageDiv.classList.remove("streaming");
    messageDiv.querySelector(".message__content").innerHTML =
      responseData.message;
    hljs.highlightAll();
  }
    lastBotMessage = messageDiv.querySelector(".message__content").innerHTML;
  

    messageDiv.querySelectorAll("pre code").forEach((codeBlock) => {
      const pre = codeBlock.closest("pre");
      const copyBtn = createCodeCopyButton(codeBlock);
      pre.style.position = "relative";
      pre.appendChild(copyBtn);
      hljs.highlightBlock(codeBlock);
    });


  actionButtons.classList.remove("hidden");




  // Reset stream state
  streamBuffer = "";
  currentStreamMessageId = null;
  hideLoading();
  hideTypingIndicator();
  toggleButtonLoading(false);
}

function handleStreamError(responseData) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = responseData.message;
  chatMessages.appendChild(errorDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Reset stream state
  streamBuffer = "";
  currentStreamMessageId = null;
}

// Add event listeners
chatInput.addEventListener("input", autoResizeTextarea);
window.addEventListener("load", autoResizeTextarea); // Handle initial content

const advancedSettingsToggle = document.getElementById(
  "advanced-settings-toggle"
);
const advancedSettingsDrawer = document.getElementById(
  "advanced-settings-drawer"
);
// New Cancel Button Element
const cancelCustomizationButton = document.getElementById(
  "cancel-customization-button"
);

let authToken = localStorage.getItem("authToken");
const socket = new WebSocket("ws://192.168.43.45:8765");
let selectedConversationId = null;

closeVerifyEmailButton.addEventListener("click", () => {
  verifyEmailOverlay.classList.add("hidden");
});

function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}
const tokenType = getQueryParam("type");
const emailVerificationToken = getQueryParam("token");
const resetPasswordToken = getQueryParam("token");

socket.onopen = () => {
  console.log("Connected to WebSocket server.");
  if (authToken) {
    console.log("Sending stored auth token:", authToken);
    socket.send(JSON.stringify({ userId: authToken }));
    authContainer.classList.add("hidden");
    // Show customization dialog instead of chat app immediately
    chatbotCustomizationDialog.classList.remove("hidden");
    chatApp.classList.add("hidden"); // Hide chat app initially
  } else if (tokenType === "verify" && emailVerificationToken) {
    console.log(
      "Email verification token found in URL:",
      emailVerificationToken
    );
    socket.send(
      JSON.stringify({
        action: "verify_email",
        token: emailVerificationToken,
      })
    );
  } else if (tokenType === "reset" && resetPasswordToken) {
    console.log("Reset password token found in URL:", resetPasswordToken);
    signupFormDiv.classList.add("hidden");
    loginFormDiv.classList.add("hidden");
    forgotPasswordDiv.classList.add("hidden");
    resetPasswordDiv.classList.remove("hidden");
  } else {
    authContainer.classList.remove("hidden");
    chatApp.classList.add("hidden");
  }
};

socket.onmessage = (event) => {
  try {
    const responseData = JSON.parse(event.data);
    const messageType = responseData.type;
    const messageContent = responseData.message;
    const errorType = responseData.error_type;
    const conversationId = responseData.conversationId;

    console.log("Received from server:", responseData);

    if (messageType === "stream_chunk") {
      handleStreamChunk(responseData);
    } else if (messageType === "stream_end") {
      finalizeStream(responseData);
    } else if (messageType === "stream_error") {
      handleStreamError(responseData);
    } else if (messageType === "connection_success") {
      const userId = responseData.userId;
      console.log("Connection Successful, userId:", userId);
      authToken = userId;
      localStorage.setItem("authToken", userId);
      authContainer.classList.add("hidden");
      // Show customization dialog after connection success, chat app is shown after dialog submit
      chatbotCustomizationDialog.classList.remove("hidden");
      chatApp.classList.add("hidden"); // Ensure chat app is hidden initially
      hideLoading();
      socket.send(JSON.stringify({ action: "load_previous_conversations" }));
    } else if (messageType === "customize_conversation_success") {
      // After customization is sent and processed, hide dialog and show chat app
      chatbotCustomizationDialog.classList.add("hidden");
      chatApp.classList.remove("hidden");
      hideLoading(); // ADDED: Hide loading overlay here!
      socket.send(JSON.stringify({ action: "load_previous_conversations" }));
      if (messageContent) {
        addMessageToChat(messageContent, "bot"); // Display initial bot message if provided
      }
      if (window.innerWidth > 768) {
        socket.send(JSON.stringify({ action: "load_previous_conversations" }));
      }
    } else if (messageType === "status" && messageContent === "typing") {
      showTypingIndicator();
    } else if (messageType === "new_chat_success") {
      console.log("new chat success conversation id", conversationId);
      oldChat = false;
      selectedConversationId = conversationId;
      chatMessages.innerHTML = "";
      hideLoading();
      toggleButtonLoading(false);
    } else if (messageType === "old_chat_success") {
      console.log("new chat success conversation id", conversationId);
      selectedConversationId = conversationId;
      sendButton.innerHTML = isLoading
        ? '<div class="loading-spinner"></div>'
        : '<i class="fas fa-paper-plane"></i>';
      // chatMessages.innerHTML = "";
      hideLoading();
      toggleButtonLoading(false);
    } else if (messageType === "bot") {
      addMessageToChat(
        messageContent,
        "bot",
        false,
        null,
        null,
        conversationId
      );
      hideLoading();
      hideTypingIndicator();
      toggleButtonLoading(false);
    } else if (messageType === "previous_conversations") {
      displayConversationList(responseData.conversations);
      hideLoading();
      toggleButtonLoading(false);
      console.log(oldChat);
    } else if (messageType === "conversation_messages") {
      hideLoading();
      chatMessages.innerHTML = "";

      const typingIndicator = document.createElement("div");
      typingIndicator.className = "typing-indicator hidden";
      typingIndicator.id = "typing-indicator";
      // typingIndicator.textContent = "Bot is typing...";
      chatMessages.appendChild(typingIndicator);

      showTypingIndicator();
      selectedConversationId = responseData.conversationId;
      oldChat = true;
      if (responseData.messages) {
        responseData.messages.forEach((msg) => {
          addMessageToChat(
            msg.message,
            msg.type,
            false,
            msg.id,
            msg.timestamp,
            responseData.conversationId
          );
        });
      }
      hideTypingIndicator();
      toggleButtonLoading(false);
    } else if (messageType === "message_edited") {
      const messageId = responseData.messageId;
      const newMessage = responseData.newMessage;
      updateMessage(messageId, newMessage);
    } else if (messageType === "message_deleted") {
      const messageId = responseData.messageId;
      deleteMessageFromUI(messageId);
    } else if (messageType === "signup_success") {
      const userId = responseData.userId;
      console.log("SignUp Successful userId:", userId);
      authToken = userId;
      localStorage.setItem("authToken", userId);
      authContainer.classList.add("hidden");
      // Show customization dialog after signup, chat app after dialog submit
      chatbotCustomizationDialog.classList.remove("hidden");
      chatApp.classList.add("hidden");
      hideLoading();
    } else if (messageType === "login_success") {
      const userId = responseData.userId;
      console.log("Login Successful userId:", userId);
      authToken = userId;
      localStorage.setItem("authToken", userId);
      authContainer.classList.add("hidden");
      // Show customization dialog after login, chat app after dialog submit
      chatbotCustomizationDialog.classList.remove("hidden");
      chatApp.classList.add("hidden");
      hideLoading();
    } else if (messageType === "verify_email_success") {
      verifyEmailOverlay.classList.remove("hidden");
      verifyEmailText.innerText = messageContent;
      authErrorDisplay.classList.add("hidden");
    } else if (messageType === "forgot_password_success") {
      displayAuthMessage(messageContent);
      hideLoading();
    } else if (messageType === "reset_password_success") {
      resetPasswordDiv.classList.add("hidden");
      loginFormDiv.classList.remove("hidden");
      displayAuthMessage(messageContent);
      hideLoading();
    } else if (messageType === "error") {
      displayError(messageContent, errorType);
      hideLoading();
      hideTypingIndicator();
      toggleButtonLoading(false);

      if (
        errorType === "signup_error" ||
        errorType === "login_error" ||
        errorType === "forgot_password_error" ||
        errorType === "reset_password_error" ||
        errorType === "verify_email_error"
      ) {
        displayAuthError(messageContent, errorType);
      }
    } else {
      console.warn("Unrecognised message type:", messageType, responseData);
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
};

const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authErrorDisplay.classList.add("hidden");
  const username = document.getElementById("signup-username").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  if (!username.trim()) {
    displayAuthError("Username field is required", "signup_error");
    return;
  }
  if (!isValidEmail(email)) {
    displayAuthError("Please provide a valid email format", "signup_error");
    return;
  }
  if (!passwordRegex.test(password)) {
    displayAuthError(
      "Password must be 8 chars long min, have one uppercase, one lowercase and one special character",
      "signup_error"
    );
    return;
  }
  showLoading();
  console.log(`Attempting signup payload`, {
    username: username,
    email: email,
    password: password,
  });
  const signupPayload = {
    action: "signup",
    username: username,
    email: email,
    password: password,
  };
  socket.send(JSON.stringify(signupPayload));
  signupForm.reset();
});
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authErrorDisplay.classList.add("hidden");
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  if (!isValidEmail(email)) {
    displayAuthError("Please provide a valid email format", "login_error");
    return;
  }
  if (!password.trim()) {
    displayAuthError("Password field is required", "login_error");
    return;
  }
  showLoading();
  console.log(`Attempting login payload`, {
    email: email,
    password: password,
  });
  const loginPayload = {
    action: "login",
    email: email,
    password: password,
  };
  socket.send(JSON.stringify(loginPayload));
  loginForm.reset();
});
forgotPasswordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const forgotEmail = document.getElementById("forgot-email").value;
  authErrorDisplay.classList.add("hidden");
  if (!isValidEmail(forgotEmail)) {
    displayAuthError(
      "Please provide a valid email format",
      "forgot_password_error"
    );
    return;
  }
  showLoading();
  console.log("Attempting forgot password request:", {
    email: forgotEmail,
  });

  const forgotPasswordPayload = {
    action: "forgot_password",
    email: forgotEmail,
  };
  socket.send(JSON.stringify(forgotPasswordPayload));
  forgotPasswordForm.reset();
});

resetPasswordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authErrorDisplay.classList.add("hidden");
  const newPassword = document.getElementById("reset-password").value;

  if (!passwordRegex.test(newPassword)) {
    displayAuthError(
      "Password must be 8 chars long min, have one uppercase, one lowercase and one special character",
      "reset_password_error"
    );
    return;
  }
  const token = getQueryParam("token");
  showLoading();
  const resetPasswordPayload = {
    action: "reset_password",
    newPassword: newPassword,
    token: token,
  };

  console.log("Reset Payload:", resetPasswordPayload);

  socket.send(JSON.stringify(resetPasswordPayload));
  resetPasswordForm.reset();
});

function stripMarkdown(htmlContent) {
  // Convert HTML entities to plain text first
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlContent;
  const text = tempDiv.textContent || tempDiv.innerText || "";

  // Remove markdown formatting
  return text
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/`(.*?)`/g, "$1") // code
    .replace(/\[(.*?)\]\(.*?\)/g, "$1") // links
    .replace(/#{1,6}\s?/g, "") // headers
    .replace(/\n{2,}/g, "\n\n") // preserve paragraph breaks
    .replace(/<[^>]*>?/gm, ""); // remove any remaining HTML tags
}

function createCodeCopyButton(codeElement) {
  const button = document.createElement("button");
  button.className = "code-copy-btn";
  button.innerHTML = '<i class="far fa-copy"></i>';
  button.title = "Copy code";

  button.addEventListener("click", () => {
    try {
      const codeText = codeElement.innerText;

      // Create temporary textarea
      const tempTextArea = document.createElement("textarea");
      tempTextArea.value = codeText;
      tempTextArea.style.position = "absolute";
      tempTextArea.style.left = "-9999px";
      tempTextArea.style.top = "-9999px";
      document.body.appendChild(tempTextArea);

      // Select and copy
      tempTextArea.select();
      document.execCommand("copy");

      // Cleanup
      document.body.removeChild(tempTextArea);

      // Visual feedback
      button.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(() => {
        button.innerHTML = '<i class="far fa-copy"></i>';
      }, 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
      button.innerHTML = '<i class="fas fa-times"></i>';
      setTimeout(() => {
        button.innerHTML = '<i class="far fa-copy"></i>';
      }, 2000);
      displayError("Failed to copy to clipboard", "copy_error");
    }
  });

  return button;
}

function addMessageToChat(
  message,
  type,
  isPrepended = false,
  messageId = null,
  timestamp = null,
  conversationId = null
) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message");

  messageDiv.classList.add(type === "user" ? "message--user" : "message--bot");

  if (messageId) {
    messageDiv.dataset.messageId = messageId;
  }
  if (conversationId) {
    messageDiv.dataset.conversationId = conversationId;
  }

  const messageContentDiv = document.createElement("div");
  messageContentDiv.innerHTML = message;

  if (type === "bot") {
    lastBotMessage = messageContentDiv.innerHTML;
    console.log("Last bot message:", lastBotMessage);
    actionButtons.classList.remove("hidden");
  } else {
    actionButtons.classList.add("hidden");
  }

  if (type === "bot" && message.includes("<img")) {
    messageContentDiv.querySelectorAll("img").forEach((img) => {
      img.style.maxWidth = "100%";
      img.style.borderRadius = "var(--border-radius)";
    });
  }

  messageContentDiv.querySelectorAll("pre code").forEach((codeBlock) => {
    const pre = codeBlock.closest("pre");
    const copyBtn = createCodeCopyButton(codeBlock);
    pre.style.position = "relative";
    pre.appendChild(copyBtn);
    hljs.highlightBlock(codeBlock);
  });

  const timestampSpan = document.createElement("span");
  timestampSpan.classList.add("message__timestamp");
  timestampSpan.textContent = timestamp
    ? moment(timestamp).format("LT")
    : moment().format("LT");

  const actionsDiv = document.createElement("div");
  actionsDiv.classList.add("message__actions");

  if (type === "user") {
    actionButtons.classList.add("hidden");
    const editBtn = createActionButton("fas fa-edit", () =>
      editMessage(messageDiv, messageContentDiv, message)
    );
    const deleteBtn = createActionButton("fas fa-trash", () =>
      deleteMessage(messageDiv)
    );
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
  }
  const copyBtn = createActionButton("fas fa-copy", () =>
    copyToClipboard(messageContentDiv.innerText)
  );
  //   copyBtn.classList.add("message__copy-button");
  messageDiv.appendChild(messageContentDiv);
  //   messageDiv.appendChild(timestampSpan);
  //   messageDiv.appendChild(actionsDiv);
  //   messageDiv.appendChild(copyBtn);
  // Highlight code blocks
  messageContentDiv.querySelectorAll("pre code").forEach(hljs.highlightBlock);

  if (isPrepended) {
    chatMessages.insertBefore(messageDiv, chatMessages.firstChild);
  } else {
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function createActionButton(iconClass, onClick) {
  const button = document.createElement("button");
  button.innerHTML = `<i class="${iconClass}"></i>`;
  button.addEventListener("click", onClick);
  return button;
}

function editMessage(messageDiv, messageContent, currentMessage) {
  const textarea = document.createElement("textarea");
  textarea.value = currentMessage;
  textarea.classList.add("chat-input");
  textarea.style.width = "calc(100% - 20px)"; // Adjust width for padding
  textarea.style.minHeight = "50px";
  textarea.style.boxSizing = "border-box";

  const saveButton = document.createElement("button");
  saveButton.textContent = "Save";
  saveButton.classList.add("send-button");
  saveButton.onclick = () => {
    const newMessage = textarea.value;
    const messageId = messageDiv.dataset.messageId;
    if (messageId) {
      socket.send(
        JSON.stringify({
          action: "edit_message",
          messageId: messageId,
          newMessage: newMessage,
        })
      );
    } else {
      messageContent.innerHTML = newMessage;
    }
    messageDiv.innerHTML = "";
    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(createTimestampSpan());
    messageDiv.appendChild(
      createActionsDivForUserMessage(messageContent, newMessage)
    );
  };

  messageDiv.innerHTML = "";
  messageDiv.appendChild(textarea);
  messageDiv.appendChild(saveButton);
}

function createTimestampSpan(timestamp) {
  const timestampSpan = document.createElement("span");
  timestampSpan.classList.add("message__timestamp");
  timestampSpan.textContent = timestamp
    ? moment(timestamp).format("LT")
    : moment().format("LT");
  return timestampSpan;
}
function createActionsDivForUserMessage(messageContent, currentMessage) {
  const actionsDiv = document.createElement("div");
  actionsDiv.classList.add("message__actions");
  const editBtn = createActionButton("fas fa-edit", () =>
    editMessage(actionsDiv.parentElement, messageContent, currentMessage)
  );
  const deleteBtn = createActionButton("fas fa-trash", () =>
    deleteMessage(actionsDiv.parentElement)
  );
  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);
  return actionsDiv;
}
function updateMessage(messageId, newMessage) {
  const messageDiv = chatMessages.querySelector(
    `[data-message-id="${messageId}"]`
  );
  if (messageDiv) {
    messageDiv.querySelector(".message div:first-child").innerHTML = newMessage;
  }
}

function deleteMessage(messageDiv) {
  const messageId = messageDiv.dataset.messageId;
  if (messageId) {
    socket.send(
      JSON.stringify({ action: "delete_message", messageId: messageId })
    );
  } else {
    messageDiv.remove();
  }
}
function deleteMessageFromUI(messageId) {
  const messageDiv = chatMessages.querySelector(
    `[data-message-id="${messageId}"]`
  );
  if (messageDiv) {
    messageDiv.remove();
  }
}

function showLoading() {
  loadingOverlay.classList.remove("hidden");
}
function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function showTypingIndicator() {
  typingIndicator.classList.remove("hidden");
}
function hideTypingIndicator() {
  typingIndicator.classList.add("hidden");
}
function displayAuthError(message, errorType) {
  authErrorDisplay.textContent = message;
  authErrorDisplay.classList.remove("hidden");
  setTimeout(() => {
    authErrorDisplay.classList.add("hidden");
  }, 5000);
}
function displayAuthMessage(message) {
  authErrorDisplay.textContent = message;
  authErrorDisplay.classList.remove("hidden");
  setTimeout(() => {
    authErrorDisplay.classList.add("hidden");
  }, 5000);
}
function displayError(message, errorType) {
  const errorDiv = document.createElement("div");
  errorDiv.classList.add("error-message");
  errorDiv.textContent = message;
  chatMessages.appendChild(errorDiv);
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}
function toggleButtonLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.innerHTML = isLoading
    ? '<i class="fas fa-terminal"></i> <div class="loading-spinner"></div>'
    : '<i class="fas fa-paper-plane"></i>';
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    console.log("Message copied to clipboard!");
  } catch (err) {
    console.error("Failed to copy message: ", err);
  }
}
toggleLoginLink.addEventListener("click", (e) => {
  e.preventDefault();
  signupFormDiv.classList.add("hidden");
  loginFormDiv.classList.remove("hidden");
  forgotPasswordDiv.classList.add("hidden");
  resetPasswordDiv.classList.add("hidden");
});
toggleSignupLink.addEventListener("click", (e) => {
  e.preventDefault();
  signupFormDiv.classList.remove("hidden");
  loginFormDiv.classList.add("hidden");
  forgotPasswordDiv.classList.add("hidden");
  resetPasswordDiv.classList.add("hidden");
});
forgotPasswordLink.addEventListener("click", (e) => {
  e.preventDefault();
  signupFormDiv.classList.add("hidden");
  loginFormDiv.classList.add("hidden");
  forgotPasswordDiv.classList.remove("hidden");
  resetPasswordDiv.classList.add("hidden");
});
toggleLoginFromForgot.addEventListener("click", (e) => {
  e.preventDefault();
  signupFormDiv.classList.add("hidden");
  loginFormDiv.classList.remove("hidden");
  forgotPasswordDiv.classList.add("hidden");
  resetPasswordDiv.classList.add("hidden");
});

document.querySelectorAll(".action-btn:not(#copy-btn)").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const actionText = e.currentTarget.dataset.action;
    chatInput.value = actionText;
    chatForm.dispatchEvent(new Event("submit"));
  });
});

document.getElementById("copy-btn").addEventListener("click", () => {
  if (!lastBotMessage) return;

  try {
    const plainText = stripMarkdown(lastBotMessage);

    // Create a temporary textarea element
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = plainText;
    // Make it invisible
    tempTextArea.style.position = "absolute";
    tempTextArea.style.left = "-9999px";
    tempTextArea.style.top = "-9999px";
    document.body.appendChild(tempTextArea);

    // Select and copy the text
    tempTextArea.select();
    document.execCommand("copy");

    // Remove the temporary textarea
    document.body.removeChild(tempTextArea);

    // Provide feedback
    const copyBtn = document.getElementById("copy-btn");
    copyBtn.classList.add("copied");
    setTimeout(() => copyBtn.classList.remove("copied"), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
    displayError("Failed to copy to clipboard", "copy_error");
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth <= 768) {
    actionButtons.style.flexWrap = "wrap";
    actionButtons.style.gap = "0.5rem";
  } else {
    actionButtons.style.flexWrap = "nowrap";
    actionButtons.style.gap = "0.75rem";
  }
});

uploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFileSelect);

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const container = document.getElementById("input-preview-container");
  container.innerHTML = "";

  // Validate file type and size
  files.forEach((file) => {
    // Validate file size
    if (file.size > 20 * 1024 * 1024) {
      displayError("File size too large. Maximum 20MB allowed.");
      return;
    }

    const preview = document.createElement("div"); // Moved inside the loop
    preview.className = "file-preview";

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-file";
    removeBtn.innerHTML = "×";

    // Fixed removal handler using proper closure
    removeBtn.onclick = () => {
      // Remove the preview element
      console.log("Remove file:", file.name);
      preview.remove();

      // Update the file input files
      const newFiles = Array.from(fileInput.files).filter((f) => f !== file);
      const dataTransfer = new DataTransfer();
      newFiles.forEach((f) => dataTransfer.items.add(f));
      fileInput.files = dataTransfer.files;
    };

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement("img");
        img.src = e.target.result;
        img.alt = file.name;
        preview.appendChild(img);
        preview.appendChild(removeBtn);
      };
      reader.readAsDataURL(file);
    } else if (file.type === "application/pdf") {
      const fileMeta = document.createElement("div");
      fileMeta.className = "file-meta";
      fileMeta.textContent = `📄 ${file.name}`;
      preview.appendChild(fileMeta);
      preview.appendChild(removeBtn);
    } else {
      const fileMeta = document.createElement("div");
      fileMeta.className = "file-meta";
      fileMeta.textContent = `📝 ${file.name}`;
      preview.appendChild(fileMeta);
      preview.appendChild(removeBtn);
    }

    container.appendChild(preview);
  });

  // // Create preview element
  // const preview = document.createElement('div');
  // preview.className = 'file-preview';

  // Create remove button
  // const removeBtn = document.createElement('button');
  // removeBtn.className = 'remove-file';
  // removeBtn.innerHTML = '×';
  // removeBtn.onclick = () => {
  //   console.log('Remove file');
  //   container.innerHTML = '';
  //   fileInput.value = '';
  //   currentFile = null;
  // };

  // // Handle image files
  // if (file.type.startsWith('image/')) {
  //   const reader = new FileReader();
  //   reader.onload = (e) => {
  //     // Create image element inside preview div
  //     const img = document.createElement('img');
  //     img.src = e.target.result;
  //     img.alt = file.name;
  //     preview.appendChild(img);
  //     preview.appendChild(removeBtn);
  //   };
  //   reader.readAsDataURL(file);
  // }
  // // Handle PDF files
  // else {
  //   const fileMeta = document.createElement('div');
  //   fileMeta.className = 'file-meta';
  //   fileMeta.textContent = `📄 ${file.name}`;
  //   preview.appendChild(fileMeta);
  //   preview.appendChild(removeBtn);
  // }

  // container.appendChild(preview);

  currentFile = files;
  console.log("Selected files:", currentFile);
}

function showFilePreview(file) {
  const previewContainer = document.createElement("div");
  previewContainer.className = "file-preview";

  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewContainer.innerHTML = `
        <img src="${e.target.result}" alt="Preview">
        <button class="remove-file" onclick="removeCurrentFile()">&times;</button>
      `;
      chatMessages.appendChild(previewContainer);
    };
    reader.readAsDataURL(file);
  } else {
    previewContainer.innerHTML = `
      <div class="file-meta">
        <p>${file.name}</p>
        <button class="remove-file" onclick="removeCurrentFile()">&times;</button>
      </div>
    `;
    chatMessages.appendChild(previewContainer);
  }
}

window.removeCurrentFile = () => {
  currentFile = null;
  document.querySelector(".file-preview")?.remove();
  fileInput.value = "";
};

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  const files = Array.from(fileInput.files);

  if (!message && files.length === 0) return;

  const fileDataArray = [];
  if (files.length > 0) {
    showLoading("Uploading files...");
    for (const file of files) {
      const fileData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            name: file.name,
            mimeType: file.type,
            data: reader.result.split(",")[1],
            size: file.size,
          });
        reader.readAsDataURL(file);
      });
      fileDataArray.push(fileData);
    }
  }

  let messageContent = message;

  if (fileDataArray && fileDataArray.length > 0) {
    fileDataArray.forEach((fileData) => {
      if (fileData.mimeType.startsWith("image/")) {
        messageContent += `<img src="data:${fileData.mimeType};base64,${fileData.data}" 
                              alt="${fileData.name}" 
                              style="max-width:100%;border-radius:var(--border-radius);margin-top:0.5rem;">`;
      } else {
        // Use appropriate icons for different file types
        const icon = fileData.mimeType === "application/pdf" ? "📄" : "📁";
        messageContent += `<div class="file-meta" style="margin-top:0.5rem;">
                          ${icon} ${fileData.name}
                        </div>`;
      }
    });
  }

  if (currentFile) {
    showLoading("Uploading file...");
  }

  if (message && oldChat === false) {
    const payload = {
      action: "send_message",
      message: message,
      files: fileDataArray,
    };
    console.log("Sending message payload:", payload);
    socket.send(JSON.stringify(payload));
    addMessageToChat(
      messageContent,
      "user",
      false,
      null,
      null,
      selectedConversationId
    );
    chatInput.value = "";
    removeCurrentFile();
    autoResizeTextarea();
    currentFile = null;
    fileInput.value = "";
    document.getElementById("input-preview-container").innerHTML = "";
    toggleButtonLoading(true);
  } else {
    console.log(oldChat);
    const payload = {
      action: "continue_conversation",
      message: message,
      files: fileDataArray,
      conversationId: selectedConversationId,
    };
    console.log("Sending message payload:", payload);
    socket.send(JSON.stringify(payload));
    addMessageToChat(
      messageContent,
      "user",
      false,
      null,
      null,
      selectedConversationId
    );
    chatInput.value = "";
    removeCurrentFile();
    autoResizeTextarea();
    currentFile = null;
    fileInput.value = "";
    document.getElementById("input-preview-container").innerHTML = "";
    toggleButtonLoading(true);
  }
});

// Advanced settings drawer toggle
advancedSettingsToggle.addEventListener("click", () => {
  advancedSettingsDrawer.classList.toggle("hidden");
  const icon = advancedSettingsToggle.querySelector("i");
  icon.classList.toggle("fa-chevron-down");
  icon.classList.toggle("fa-chevron-up");
});

// Customization form submit
customizationForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const taskType = taskTypeSelect.value;
  const subject = subjectSelect.value;
  const topic = topicInput.value;
  const temperature = parseFloat(temperatureInput.value);
  const aiModel = aiModelSelect.value;
  const topP = parseFloat(topPInput.value);

  const customizationPayload = {
    action: "customize_conversation",
    taskType: taskType,
    subject: subject,
    topic: topic,
    temperature: temperature,
    aiModel: aiModel,
    topP: topP,
  };

  console.log("Sending customization payload:", customizationPayload);
  socket.send(JSON.stringify(customizationPayload));
  showLoading(); // Optionally show loading overlay while processing customization
});

// Cancel customization button
cancelCustomizationButton.addEventListener("click", () => {
  chatbotCustomizationDialog.classList.add("hidden");
  socket.send(JSON.stringify({ action: "load_previous_conversations" }));
  chatApp.classList.remove("hidden"); // Show chat app with default settings
});

newChatButton.addEventListener("click", () => {
  // Show customization dialog instead of directly starting new chat
  chatbotCustomizationDialog.classList.remove("hidden");
  actionButtons.classList.add("hidden");
  chatApp.classList.add("hidden");
  initialChatMessage.classList.add("hidden"); // Hide initial message if it was visible
  chatMessages.innerHTML = ""; // Clear previous messages if any
  selectedConversationId = null;
  document
    .querySelectorAll("#conversation-list li")
    .forEach((li) => li.classList.remove("selected"));
});

loadConversationsButton.addEventListener("click", () => {
  socket.send(JSON.stringify({ action: "load_previous_conversations" }));
});

sidebarToggle.addEventListener("click", () => {
  socket.send(JSON.stringify({ action: "load_previous_conversations" }));
});

function displayConversationList(conversations) {
  conversationList.innerHTML = "";
  conversations.forEach((conversation) => {
    const listItem = document.createElement("li");
    const conversationName =
      conversation.name ||
      `Conversation ${moment(conversation.startTime).format("MMM DD, h:mm A")}`;
    listItem.textContent =
      conversationName.length > 19
        ? conversationName.substring(0, 19) + "..."
        : conversationName;
    listItem.addEventListener("click", () => {
      loadConversation(conversation.id);
      // Remove selection from other list items
      document
        .querySelectorAll("#conversation-list li")
        .forEach((li) => li.classList.remove("selected"));
      // Add selection to the clicked item
      listItem.classList.add("selected");
      // Close sidebar on mobile after selecting conversation
      if (window.innerWidth <= 768) {
        sidebar.classList.remove("open");
      }
    });
    conversationList.appendChild(listItem);
  });
}
function loadConversation(conversationId) {
  showLoading();
  socket.send(
    JSON.stringify({
      action: "load_conversation",
      conversationId: conversationId,
    })
  );
}

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("authToken");
  authToken = null;
  chatApp.classList.add("hidden");
  authContainer.classList.remove("hidden");
  authErrorDisplay.classList.add("hidden");
  chatMessages.innerHTML = "";
  selectedConversationId = null;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ action: "logout" }));
  }
});

// Mobile sidebar toggle functionality
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// Close sidebar when clicking outside on mobile
document.addEventListener("click", (event) => {
  if (
    window.innerWidth <= 768 &&
    sidebar.classList.contains("open") &&
    !event.target.closest(".sidebar") &&
    !event.target.closest(".sidebar-toggle-button")
  ) {
    sidebar.classList.remove("open");
  }
});

// Prevent clicks inside the sidebar from closing it
sidebar.addEventListener("click", (event) => {
  if (window.innerWidth <= 768) {
    event.stopPropagation();
  }
});
