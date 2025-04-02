import os
import subprocess
import shutil
import google.generativeai as genai

# Configuration
GEMINI_API_KEY = "AIzaSyDbKVW5tpx3xyhW5zfGzMdHmvH1UOKCci4"  # Replace with your API key
DOWNLOADS_DIR = os.path.expanduser("~/Downloads")  # Default downloads path

def main():
    # Initialize Gemini
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash-thinking-exp-01-21')

    # Get user request
    user_prompt = input("Enter your file creation request (e.g. 'Make a PDF about dogs'):\n")

    # Generate system prompt
    system_prompt = f"""Generate Python code to create a file based on this request: {user_prompt}
- Use these libraries: python-docx (Word), python-pptx (PPTX), reportlab (PDF)
- Determine file type from the request
- Save the file and print exactly 'FILE_SAVED: <filename>' when done
- Include realistic content matching the request
- No explanations, just valid code!"""

    # Get code from Gemini
    response = model.generate_content(system_prompt)
    generated_code = response.text

    # Clean code output
    if "```python" in generated_code:
        generated_code = generated_code.split("```python")[1].split("```")[0]
    generated_code = generated_code.strip()

    # Validate code
    if not generated_code or "FILE_SAVED:" not in generated_code:
        print("Error: Invalid code generated")
        return

    # Save to temp file
    temp_script = "temp_generated_script.py"
    with open(temp_script, "w") as f:
        f.write(generated_code)

    try:
        # Execute the generated script
        result = subprocess.run(
            ["python", temp_script],
            capture_output=True,
            text=True
        )

        # Handle errors
        if result.returncode != 0:
            if "ModuleNotFoundError" in result.stderr:
                missing_module = result.stderr.split()[-1]
                print(f"Error: Please install required package - 'pip install {missing_module}'")
            else:
                print(f"Execution Error:\n{result.stderr}")
            return

        # Find created file
        output_line = [line for line in result.stdout.split("\n") if "FILE_SAVED:" in line]
        if not output_line:
            print("Error: File creation confirmation missing")
            return

        filename = output_line[0].split("FILE_SAVED:")[1].strip()
        if not os.path.exists(filename):
            print(f"Error: File {filename} not found")
            return

        # Move to downloads
        dest_path = os.path.join(DOWNLOADS_DIR, filename)
        shutil.move(filename, dest_path)
        print(f"Success! File saved to: {dest_path}")

    finally:
        # Cleanup
        if os.path.exists(temp_script):
            os.remove(temp_script)

if __name__ == "__main__":
    print("=== File Generator using Gemini ===")
    print("WARNING: This executes AI-generated code. Use at your own risk.\n")
    main()