import os
import subprocess
import shutil
import tempfile
import re
import ast
import uuid
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify, send_file, render_template, abort
from werkzeug.security import safe_join
from flask_wtf.csrf import CSRFProtect, CSRFError
from dotenv import load_dotenv

load_dotenv()

# --- Configuration Loading ---
# Load sensitive keys from environment variables - DO NOT HARDCODE HERE
# Set these in your environment (e.g., .env file, system variables)
FLASK_SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'd5342974845146b06d677159749a5ed711a3c347595dd5c') # MUST be replaced for production
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY') # MUST be set for the app to work
# Removed hardcoded API_KEY for Authorization header, rely on CSRF + potentially sessions/other auth

# --- Application Setup ---
app = Flask(__name__)
app.config.update({
    'SECRET_KEY': FLASK_SECRET_KEY,
    'MAX_CONTENT_LENGTH': 16 * 1024, # Limit request size (16 KB)
    'GENERATED_FILES_DIR': os.path.abspath(os.path.join(os.path.dirname(__file__), 'generated_files')),
    # VERY restrictive module whitelist. Add ONLY if absolutely necessary and understood.
    'ALLOWED_MODULES': {
        'python-docx', 'docx', # Allow both common names
        'pptx',
        'reportlab',
        'datetime',
        'random',
        # --- DO NOT ADD 'os', 'sys', 'subprocess', 'shutil', 'requests', 'socket', etc. ---
     },
    'EXECUTION_TIMEOUT': 15, # Slightly increased timeout
    'EXPECTED_OUTPUT_FILENAMES': {'output.docx', 'output.pdf', 'output.pptx'}, # Expected output names from generated script
})

# --- Logging Configuration ---
log_file = os.path.join(os.path.dirname(__file__), 'app.log')
handler = RotatingFileHandler(log_file, maxBytes=100000, backupCount=5) # Increased size/count
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
handler.setLevel(logging.INFO) # Log INFO level and above
if app.debug:
    handler.setLevel(logging.DEBUG) # More verbose logging in debug mode
app.logger.addHandler(handler)
app.logger.setLevel(logging.INFO) # Ensure app logger respects level
logging.getLogger('werkzeug').setLevel(logging.INFO) # Quieter Werkzeug logs unless debugging


# --- Security ---
csrf = CSRFProtect(app)
# Removed WTF_CSRF_ENABLED = False for debug, CSRF should ideally always be checked

# --- AI Configuration ---
if not GEMINI_API_KEY:
    app.logger.critical("GEMINI_API_KEY environment variable not set. AI features will fail.")
    # Optionally, raise an exception or exit if the key is essential for startup
    # raise ValueError("GEMINI_API_KEY must be set")
    genai = None # Prevent further errors if not configured
else:
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        # Choose a model - check availability and features
        # e.g., 'gemini-1.5-flash', 'gemini-1.0-pro'
        model = genai.GenerativeModel('gemini-2.5-pro-exp-03-25')
        app.logger.info("Google Generative AI configured successfully.")
    except ImportError:
        app.logger.critical("google.generativeai library not installed. Run 'pip install google-generativeai'")
        genai = None
    except Exception as e:
        app.logger.critical(f"Failed to configure Google Generative AI: {e}")
        genai = None


# --- Directory Setup ---
os.makedirs(app.config['GENERATED_FILES_DIR'], exist_ok=True)


# --- Code Validation Logic ---
def validate_generated_code(code: str) -> bool:
    """
    Perform security checks on AI-generated Python code.
    Checks for dangerous patterns, forbidden modules, and potentially harmful built-ins.

    NOTE: This validation is helpful but NOT foolproof. Strong sandboxing is essential.
    """
    app.logger.debug(f"Validating code (first 200 chars): {code[:200]}...")

    # 1. Length Check
    if len(code) > 100000: # Increased slightly, adjust as needed
        app.logger.warning("Code length exceeded limit.")
        app.logger.warning(code)
        return False

    # 2. Forbidden Patterns (Regex - now uncommented and stricter)
    #    Focus on common ways to execute commands, access network, modify FS outside allowed libs
    forbidden_patterns = [
        r'subprocess\.',                       # Prevent direct subprocess use
        r'os\.system',                         # Prevent os.system
        r'os\.popen',                          # Prevent os.popen
        r'eval\(',                             # Prevent eval()
        r'exec\(',                             # Prevent exec()
        r'(socket|requests|urllib|httpx)\.',  # Prevent common networking libraries
        r'shutil\.(?!copy)',                  # Allow shutil.copy (potentially needed?) but block others like move, rmtree
        r'pickle\.',                           # Prevent pickle for security risks
        r'ctypes\.',                           # Prevent ctypes
        r'getattr\(',                          # Prevent dynamic attribute access (can bypass checks)
        r'setattr\(',                          # Prevent dynamic attribute setting
        r'globals\(',                          # Prevent access to globals
        r'locals\(',                           # Prevent access to locals
        r'open\s*\(.+[\'"]w[\'"].*\)',          # Basic attempt to block writing files via open() - might need refinement
        r'open\s*\(.+[\'"]a[\'"].*\)',          # Basic attempt to block appending files via open()
        # Keywords often associated with dangerous file system operations (crude check)
        # r'\b(rm|del|remove|format|chmod|chown|unlink)\b',
        # Accessing sensitive file paths (examples, needs more context)
        # r'/etc/', r'/root/', r'\.ssh', r'\.git'
    ]

    for pattern in forbidden_patterns:
        if re.search(pattern, code):
            app.logger.warning(f"Forbidden pattern detected in generated code: {pattern}")
            app.logger.warning(code)
            return False

    # 3. AST Analysis (Abstract Syntax Tree)
    try:
        tree = ast.parse(code)
        allowed_modules = app.config['ALLOWED_MODULES']

        for node in ast.walk(tree):
            # Check Imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_name = alias.name.split('.')[0] # Get base module
                    if module_name not in allowed_modules:
                        app.logger.warning(f"Disallowed module imported: {module_name}")
                        return False
            elif isinstance(node, ast.ImportFrom):
                module_name = node.module.split('.')[0] if node.module else None # Handle 'from . import X' if needed
                if module_name and module_name not in allowed_modules:
                     app.logger.warning(f"Disallowed module imported via 'from': {module_name}")
                     return False
                # Could potentially check imported names (node.names) here too if needed

            # Check Dangerous Built-in Functions/Attributes
            # This is complex and non-exhaustive
            if isinstance(node, ast.Name) and node.id in ['eval', 'exec', 'open', '__import__', 'input']:
                 app.logger.warning(f"Potentially dangerous built-in function used: {node.id}")
                 return False
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                 # Example: Check for things like os.system (if os wasn't caught by import check)
                 # This needs careful implementation based on known risks
                 # E.g. if node.value.id == 'os' and node.attr == 'system': return False
                 pass # Add specific checks if needed

    except SyntaxError as e:
        app.logger.error(f"Syntax error in generated code: {e}")
        return False
    except Exception as e:
        app.logger.error(f"Unexpected error during AST parsing: {e}")
        return False # Fail safe

    app.logger.debug("Code validation passed.")
    return True


# --- Flask Routes ---
@app.route('/')
def index():
    """Renders the main HTML page."""
    return render_template('index.html')

@app.route('/generate-file', methods=['POST'])
# @csrf.exempt # REMOVED - CSRF protection is now active for this route
def generate_file():
    """
    Handles the POST request to generate a document file.
    Requires CSRF token and valid JSON payload.
    """
    app.logger.info(f"File generation request received from {request.remote_addr}")

    # --- Authentication/Authorization ---
    # Removed explicit Bearer token check. Relying on CSRF + session/other auth.
    # If you need specific user auth, implement it here (e.g., check flask_login current_user)
    # Example:
    # from flask_login import login_required, current_user
    # @login_required
    # def generate_file(): ... check current_user.is_authenticated ...

    # --- Input Validation ---
    if not request.is_json:
        app.logger.warning("Invalid content type: Expected application/json")
        return jsonify({"error": "Invalid content type, requires application/json"}), 400

    data = request.get_json()
    if not data:
         app.logger.warning("Empty JSON payload received")
         return jsonify({"error": "Empty request body"}), 400

    user_prompt = data.get('prompt')
    if not user_prompt or not isinstance(user_prompt, str):
        app.logger.warning("Missing or invalid 'prompt' in request JSON")
        return jsonify({"error": "Missing or invalid 'prompt' field"}), 400

    # Limit prompt length server-side as well
    user_prompt = user_prompt[:1000] # Increased limit slightly
    app.logger.debug(f"Processing prompt: {user_prompt[:100]}...")

    # --- AI Code Generation ---
    if not genai or not model:
         app.logger.error("AI model not configured. Cannot generate code.")
         return jsonify({"error": "AI service not available"}), 503 # Service Unavailable

    try:
        # Refined prompt for the AI
        generation_prompt = f"""Generate Python code that creates a document based on the following request: '{user_prompt}'.

        Instructions:
        1.  Determine the most appropriate file type: Word (.docx), PowerPoint (.pptx), or PDF (.pdf).
        2.  Use **only** the following libraries if needed:
            - For Word (.docx): `docx` (from python-docx)
            - For PowerPoint (.pptx): `pptx` (from python-pptx)
            - For PDF (.pdf): `reportlab`
            - Standard libraries: `datetime`, `random`
        3.  The code MUST save the generated file in the **current working directory**.
        4.  The filename MUST be exactly one of: 'output.docx', 'output.pptx', or 'output.pdf'.
        5.  The code MUST NOT attempt to read files, access the network, run shell commands, or perform any other action besides generating the specified file using the allowed libraries.
        6.  Do NOT include any print statements, especially not 'FILE_SAVED:'. Just generate the file.
        7.  Ensure the generated code is complete and runnable Python code.
        8. for word documents and pdf, MAKE SURE TO FORMAT THE DOCUMENT PROPERLY USING TIMES NEW ROMAN FONT AND A FONT SIZE OF 13
        9. for word and pdf dpcuments, MAKE SURE TO THAT THEY ARE AVERAGE 1500 WORDS LONG, EXCEPT INSTRUCTED OTHERWISE and MAKE SURE THAT YOU DONT USE PLACEHOLDERS, INSTEAD USE YOUR KNOWLEDGE TO EXTEND THE WRITEUP. 
        10. Do not use filter text to increase word count. when you are done with the main content, and cannot extend it, wrap up the document. YOU MUST NOT USE FILTER TEXT TO INCREASE WORD COUNT.
        """

        response = model.generate_content(generation_prompt)

        # Basic extraction (adjust if model format differs)
        generated_code = response.text
        if "```python" in generated_code:
            generated_code = generated_code.split("```python")[1].split("```")[0].strip()
        elif "```" in generated_code:
             generated_code = generated_code.split("```")[1].split("```")[0].strip()
        else:
            # Fallback: assume the whole response is code, remove potential markdown/comments cautiously
             generated_code = '\n'.join([line for line in generated_code.split('\n')
                                       if not line.strip().startswith('#')]) # Simple comment removal

        if not generated_code:
            app.logger.error("AI model returned empty code.")
            raise ValueError("AI returned empty code")

        app.logger.debug(f"Generated code (first 500 chars):\n{generated_code[:500]}...")

    except Exception as e:
        app.logger.error(f"AI code generation failed: {e}", exc_info=True)
        # Provide a more generic error to the client
        return jsonify({"error": "Failed to generate document code from AI"}), 500

    # --- Code Validation ---
    if not validate_generated_code(generated_code):
        app.logger.warning("Generated code failed validation.")
        # Do not expose details of validation failure to the client
        return jsonify({"error": "Generated code is invalid or potentially unsafe"}), 400

    # --- Secure Code Execution ---
    # CRITICAL: This section needs proper sandboxing (Docker, nsjail, etc.)
    # The TemporaryDirectory provides *some* isolation, but the process
    # still runs with the server's permissions.
    output_filename = None
    final_filename = None
    file_moved = False

    with tempfile.TemporaryDirectory() as temp_dir:
        script_path = os.path.join(temp_dir, 'generated_script.py')
        try:
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(generated_code)

            app.logger.info(f"Executing generated script in temporary directory: {temp_dir}")

            # *** SANDBOXING NEEDED HERE ***
            # Replace subprocess.run with a call to your sandboxing mechanism.
            # Example placeholder:
            # result = run_in_sandbox(script_path, temp_dir, timeout=app.config['EXECUTION_TIMEOUT'])
            # Where run_in_sandbox handles Docker/nsjail execution.

            # Current implementation (UNSAFE without external sandboxing):
            result = subprocess.run(
                ['python', script_path], # Use specific python executable if needed
                cwd=temp_dir,
                capture_output=True,
                text=True,
                timeout=app.config['EXECUTION_TIMEOUT'],
                check=False # Don't raise exception immediately, check returncode below
            )

            app.logger.debug(f"Script execution finished. Return code: {result.returncode}")
            if result.stdout:
                app.logger.debug(f"Script stdout:\n{result.stdout[:500]}") # Log limited stdout
            if result.stderr:
                app.logger.warning(f"Script stderr:\n{result.stderr[:500]}") # Log limited stderr

            if result.returncode != 0:
                app.logger.error(f"Generated script execution failed with return code {result.returncode}.")
                # Avoid sending detailed stderr to client
                raise ValueError("Script execution failed")

            # --- Find and Validate Output File ---
            found_expected_file = False
            for expected_name in app.config['EXPECTED_OUTPUT_FILENAMES']:
                temp_output_path = os.path.join(temp_dir, expected_name)
                if os.path.exists(temp_output_path) and os.path.isfile(temp_output_path):
                    # Basic check: Ensure file is not excessively large (e.g., > 50MB)
                    if os.path.getsize(temp_output_path) > 50 * 1024 * 1024:
                         app.logger.error(f"Generated file '{expected_name}' is too large.")
                         raise ValueError("Generated file size exceeds limit")

                    # Generate a unique final filename to prevent collisions/overwrites
                    file_ext = os.path.splitext(expected_name)[1]
                    unique_id = uuid.uuid4()
                    final_filename = f"docgen_{unique_id}{file_ext}"

                    # Use safe_join for constructing the final destination path
                    dest_path = safe_join(app.config['GENERATED_FILES_DIR'], final_filename)
                    if not dest_path: # safe_join returns None if path is suspicious
                        app.logger.error(f"Could not create safe destination path for: {final_filename}")
                        raise ValueError("Invalid destination path")

                    app.logger.info(f"Found expected output file: {expected_name}. Moving to: {final_filename}")
                    shutil.move(temp_output_path, dest_path)
                    file_moved = True
                    found_expected_file = True
                    break # Found the file, no need to check others

            if not found_expected_file:
                app.logger.error("Generated script completed but did not produce an expected output file.")
                raise ValueError("Script did not create the expected output file")

        except subprocess.TimeoutExpired:
            app.logger.error(f"Generated script timed out after {app.config['EXECUTION_TIMEOUT']} seconds.")
            return jsonify({"error": "Document generation timed out"}), 500
        except Exception as e:
            app.logger.error(f"Error during script execution or file handling: {e}", exc_info=True)
            # Generic error to client
            return jsonify({"error": "Failed to create or save the document"}), 500

    # --- Success Response ---
    if file_moved and final_filename:
        app.logger.info(f"Successfully generated and moved file: {final_filename}")
        return jsonify({
            "download_url": f"/download/{final_filename}",
            "filename": final_filename
        }), 200
    else:
        # Should not happen if logic above is correct, but as a fallback
        app.logger.error("Reached end of generation process without a valid file state.")
        return jsonify({"error": "An unexpected error occurred during file finalization"}), 500


@app.route('/download/<path:filename>')
def download_file(filename):
    """Serves the generated file for download."""
    app.logger.info(f"Download request for: {filename} from {request.remote_addr}")
    try:
        # safe_join is crucial here to prevent directory traversal
        safe_path = safe_join(app.config['GENERATED_FILES_DIR'], filename)

        if safe_path is None or not os.path.isfile(safe_path):
            app.logger.warning(f"File not found or invalid path: {filename}")
            abort(404, description="File not found.")

        # Check if path is still within the intended directory (extra safety)
        if not os.path.abspath(safe_path).startswith(os.path.abspath(app.config['GENERATED_FILES_DIR'])):
             app.logger.error(f"Attempt to access file outside GENERATED_FILES_DIR: {filename}")
             abort(404, description="File not found.")


        return send_file(safe_path, as_attachment=True)

    except Exception as e:
        app.logger.error(f"Error during file download for {filename}: {e}", exc_info=True)
        abort(500, description="Could not process file download.")

# --- Error Handling ---
@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    app.logger.warning(f"CSRF validation failed: {e.description} from {request.remote_addr}")
    return jsonify({"error": "CSRF validation failed: " + e.description}), 400

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({"error": "Not Found", "message": error.description}), 404

@app.errorhandler(500)
def internal_error(error):
    # Log the actual error if possible, but return generic message
    app.logger.error(f"Internal Server Error: {error.description if hasattr(error, 'description') else error}")
    return jsonify({"error": "Internal Server Error", "message": "An unexpected error occurred."}), 500


# --- Main Execution ---
if __name__ == '__main__':
    # Production: Use Gunicorn/uWSGI behind a reverse proxy (Nginx/Caddy)
    # Development: Use Flask's built-in server (debug=True enables reloader)
    is_debug = os.getenv('FLASK_ENV') == 'development' or os.getenv('FLASK_DEBUG') == '1'
    app.logger.info(f"Starting Flask app (Debug Mode: {is_debug})")
    # Note: Don't use app.run(ssl_context='adhoc') in production. Handle HTTPS at the proxy level.
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', 5000)), # Allow port configuration via env var
        debug=is_debug
    )