import os
import subprocess
import shutil
import tempfile
import re
import ast
from flask import Flask, request, jsonify, send_file
from werkzeug.security import safe_join
import google.generativeai as genai

app = Flask(__name__)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyDbKVW5tpx3xyhW5zfGzMdHmvH1UOKCci4")
GENERATED_FILES_DIR = os.path.abspath("generated_files")
ALLOWED_MODULES = {'python-docx', 'pptx', 'reportlab', 'os', 'datetime', 'random'}
MAX_CODE_LENGTH = 2000
EXECUTION_TIMEOUT = 10

# Ensure directories exist
os.makedirs(GENERATED_FILES_DIR, exist_ok=True)
os.makedirs('static', exist_ok=True)

@app.route('/')
def serve_frontend():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>File Generator</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .container { background: #f4f4f4; padding: 20px; border-radius: 8px; margin-top: 20px; }
            textarea { width: 100%; height: 100px; }
            button { background: #007bff; color: white; border: none; padding: 10px; cursor: pointer; }
            #result { margin-top: 20px; padding: 10px; }
            .success { background: #d4edda; }
            .error { background: #f8d7da; }
        </style>
    </head>
    <body>
        <h1>File Generator</h1>
        <div class="container">
            <input type="password" id="apiKey" placeholder="API Key">
            <textarea id="prompt" placeholder="Your request"></textarea>
            <button onclick="generateFile()">Generate</button>
            <div id="result"></div>
        </div>
        <script>
            async function generateFile() {
                const apiKey = document.getElementById('apiKey').value;
                const prompt = document.getElementById('prompt').value;
                const resultDiv = document.getElementById('result');
                
                resultDiv.textContent = "Generating...";
                resultDiv.className = "";
                
                try {
                    const response = await fetch('/generate-file', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + apiKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ prompt })
                    });
                    
                    const data = await response.json();
                    
                    if (!response.ok) throw new Error(data.error || "Failed");
                    
                    resultDiv.innerHTML = `Success! <a href="${data.download_url}">Download File</a>`;
                    resultDiv.className = "success";
                } catch (error) {
                    resultDiv.textContent = "Error: " + error.message;
                    resultDiv.className = "error";
                }
            }
        </script>
    </body>
    </html>
    """

def validate_code(code: str) -> bool:
    """Check code for security and compliance"""
    if len(code) > MAX_CODE_LENGTH:
        return False
        
    # Check for disallowed patterns
    forbidden_patterns = [
        r'__(.*?)__',
        r'subprocess',
        r'socket',
        r'exec(.*)',
        r'eval(.*)',
        r'open(.*)',
        r'os\.(system|popen|fork|kill)',
        r'shutil',
        r'pickle',
        r'requests',
        r'urllib',
        r'curl',
    ]
    
    for pattern in forbidden_patterns:
        if re.search(pattern, code):
            return False

    # AST validation
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split('.')[0] not in ALLOWED_MODULES:
                        return False
            if isinstance(node, ast.ImportFrom):
                if node.module.split('.')[0] not in ALLOWED_MODULES:
                    return False
    except:
        return False

    return True

@app.route('/generate-file', methods=['POST'])
def generate_file():
    # Authenticate request
    auth_header = request.headers.get('Authorization')
    if not auth_header or auth_header != f'Bearer {os.getenv("API_KEY")}':
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    user_prompt = data.get('prompt')
    
    if not user_prompt:
        return jsonify({"error": "Missing prompt"}), 400

    # Initialize Gemini
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash-thinking-exp-01-21')

    # Generate system prompt
    system_prompt = f"""Generate Python code to create a file based on this request: {user_prompt}
    - Use these libraries: python-docx (Word), python-pptx (PPTX), reportlab (PDF)
    - Save file to current directory with unique name
    - Print exactly 'FILE_SAVED: <filename>' when done
    - Include realistic content matching request
    - Only use allowed modules: {', '.join(ALLOWED_MODULES)}"""
    
    try:
        response = model.generate_content(system_prompt)
        generated_code = response.text
    except Exception as e:
        return jsonify({"error": f"Generation failed: {str(e)}"}), 500

    # Clean code output
    if "```python" in generated_code:
        generated_code = generated_code.split("```python")[1].split("```")[0].strip()

    # Validate code
    if not validate_code(generated_code):
        return jsonify({"error": "Generated code validation failed"}), 400

    # Create temp execution environment
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_script = os.path.join(temp_dir, "generated_script.py")
        
        try:
            with open(temp_script, "w") as f:
                f.write(generated_code)
            
            # Execute in sandbox
            result = subprocess.run(
                ["python", temp_script],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                timeout=EXECUTION_TIMEOUT
            )
        except subprocess.TimeoutExpired:
            return jsonify({"error": "Execution timed out"}), 500
        except Exception as e:
            return jsonify({"error": f"Execution failed: {str(e)}"}), 500

        # Handle errors
        if result.returncode != 0:
            error_msg = result.stderr.strip() or "Unknown error"
            return jsonify({"error": f"Execution error: {error_msg}"}), 500

        # Find created file
        output_line = next((line for line in result.stdout.split("\n") if "FILE_SAVED:" in line), None)
        if not output_line:
            return jsonify({"error": "File creation confirmation missing"}), 500

        filename = output_line.split("FILE_SAVED:")[1].strip()
        source_path = safe_join(temp_dir, filename)
        
        if not os.path.exists(source_path):
            return jsonify({"error": "File not created"}), 500

        # Move to secure storage
        dest_path = safe_join(GENERATED_FILES_DIR, filename)
        shutil.move(source_path, dest_path)

        # Generate download URL
        download_url = f"/download/{filename}"
        return jsonify({"download_url": download_url}), 200

@app.route('/download/<filename>')
def download_file(filename):
    safe_path = safe_join(GENERATED_FILES_DIR, filename)
    if not os.path.exists(safe_path):
        return jsonify({"error": "File not found"}), 404
    return send_file(safe_path, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)