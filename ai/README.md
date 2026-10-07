# Somabox LMS Offline AI Assistant (`./ai/`)

This directory contains the complete, isolated offline AI Assistant system for **TEACHERS ONLY** on Somabox LMS.

## Directory Structure
```
ai/
├── config.yaml          # Model file, ports, concurrency, max tokens configuration
├── models/              # Local GGUF model files (.gitignore ignored)
├── data/                # SQLite feedback database (.gitignore ignored)
├── prompts/             # Chat mode templates (lesson_plan, quiz, explain, adapt, rubric)
│   └── structured/      # JSON task prompts used by POST /generate
├── runtime/             # llama.cpp server runner scripts
├── gateway/             # Express HTTP Gateway (GET /health, POST /ask, POST /generate, POST /feedback)
├── scripts/             # Admin, test, evaluation & export scripts
└── README.md            # System documentation
```

---

## 1. Quick Start

### Step 1: Place GGUF Model File
Place the required GGUF model file in `ai/models/`.
* Recommended model: `qwen2.5-7b-instruct-q4_k_m.gguf`
* For connected machines, you can run:
  ```bash
  ./ai/scripts/download_model.sh
  ```

### Step 2: Install Runtime & Gateway Dependencies
```bash
./ai/runtime/install_runtime.sh
cd ai/gateway && npm install && cd ../..
```

### Step 3: Start Services
1. **Start Model Runtime** (llama.cpp server):
   ```bash
   ./ai/runtime/start_runtime.sh
   ```
2. **Start Gateway Service** (HTTP Gateway on port 5000):
   ```bash
   cd ai/gateway && npm start
   ```

---

## 2. Swapping the Model

To swap to a different GGUF model:
1. Place the new `.gguf` file inside `ai/models/`.
2. Edit `ai/config.yaml`:
   ```yaml
   model:
     name: "Your-New-Model-Name"
     file: "your_new_model.gguf"
   ```
3. Restart `start_runtime.sh`. (The Gateway auto-reloads `config.yaml` on change).

---

## 3. Evaluation & Testing

* **Smoke Test**:
  ```bash
  ./ai/scripts/smoke_test.sh
  ```
* **Teacher Evaluation Benchmark** (chat prompts in English, French, Kinyarwanda, and Swahili):
  ```bash
  ./ai/scripts/teacher_eval.sh
  ```
* **Structured Output Quality Gate** (every `/generate` task in en/fr/rw/sw; checks valid JSON,
  real outcome codes, latency; writes `ai/data/structured_eval_*.json`; exits 1 on failure):
  ```bash
  node ai/scripts/structured_eval.mjs [gatewayUrl]
  ```
* **Gateway Unit Tests** (no model needed; uses a fake llama runtime):
  ```bash
  cd ai/gateway && npm test
  ```
* **Export Teacher Feedback**:
  ```bash
  ./ai/scripts/export_feedback.sh
  ```

---

## 4. System Architecture & RAG Readiness

* **Zero LMS Core Coupling**: All AI code lives inside `./ai/`. The LMS communicates strictly via HTTP (`POST /ask` for chat, `POST /generate` for structured content).
* **Structured generation**: `POST /generate { task, input }` returns `{ result, usage, attempts }`. Each task (`outline`, `outcome_rewrite`, `quiz`, `rubric`, `story`, `page`, `assignment`, `grading_suggestion`, `class_summary`) has a JSON schema in `gateway/tasks.js`; llama.cpp constrains output to it, the gateway re-validates and retries once. The LMS turns results into drafts a teacher must approve (see `docs/phase-8-ai.md`).
* **RAG Ready**: The gateway accepts `course_id` and `lesson_id` parameters in `POST /ask` and injects context labels into the prompts.
* **Privacy & Security**: Teacher IDs are hashed before storing feedback. No student data or model output is written directly to the database without manual teacher editing.
