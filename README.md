# ThinkSphere

ThinkSphere is a Django learning and gaming platform. The Skill section now includes Groq-powered adaptive skill assessments.

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

   If PowerShell blocks activation for this terminal, run:

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\.venv\Scripts\Activate.ps1
   ```

3. Copy `.env.example` to `.env` and add your Groq API key:

   ```env
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=openai/gpt-oss-120b
   ```

   Get an API key from https://console.groq.com/keys.

4. Apply database migrations:

   ```powershell
   python manage.py migrate
   ```

5. Start the development server:

   ```powershell
   python manage.py runserver
   ```

6. Sign in, open **Skill**, add a skill, and choose **Assess now**.

## Adaptive skill assessment

- Each attempt contains 10 multiple-choice questions.
- Groq generates four-option questions for the selected skill.
- Difficulty moves up after a correct answer and down after an incorrect answer.
- Beginner, intermediate, and advanced questions have weights 1, 2, and 3.
- On completion, the weighted score updates the skill's proficiency percentage.
- Retests create new assessment attempts; previous results remain in assessment history.
- Questions, answers, scores, and history are stored in the project's configured Django database (SQLite by default).

Groq is used only to generate question content. Django handles assessment state, adaptive difficulty, scoring, and persistence.
