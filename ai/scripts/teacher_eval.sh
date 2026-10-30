#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$AI_DIR/config.yaml"
DATA_DIR="$AI_DIR/data"

mkdir -p "$DATA_DIR"

GATEWAY_URL="http://127.0.0.1:5000"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
MODEL_NAME=$(node -e "const fs = require('fs'), yaml = require('$AI_DIR/gateway/node_modules/js-yaml'); const c = yaml.load(fs.readFileSync('$CONFIG_FILE')); console.log(c.model.name || 'Qwen2.5-7B');" 2>/dev/null || echo "Qwen2.5-7B")

EVAL_FILE="$DATA_DIR/eval_${MODEL_NAME}_${TIMESTAMP}.txt"

echo "=== Running Teacher Evaluation Benchmark ===" | tee "$EVAL_FILE"
echo "Model: $MODEL_NAME" | tee -a "$EVAL_FILE"
echo "Timestamp: $TIMESTAMP" | tee -a "$EVAL_FILE"
echo "Output File: $EVAL_FILE" | tee -a "$EVAL_FILE"
echo "--------------------------------------------------" | tee -a "$EVAL_FILE"

# 12 prompts across 5 modes and 4 languages (English, French, Kinyarwanda, Swahili)
declare -a PROMPTS=(
  "lesson_plan|English|Create a 45-minute lesson plan on photosynthesis for Primary 5 science."
  "lesson_plan|Kinyarwanda|Tegura teguro y'isomo ryo kubara ku banyeshuri bo mu mwaka wa 3 w'amashuri abanza."
  "quiz|French|Créer un quiz de 5 questions sur le système solaire pour les élèves du secondaire."
  "quiz|English|Generate 5 multiple choice questions on cell division with answer key."
  "explain|Kinyarwanda|Sobanura mu magambo arwaza amatsiko uko umuriro w'amashanyarazi ukora n'ingero zo mu cyaro."
  "explain|French|Expliquez la gravité terrestre avec des exemples simples de la vie quotidienne."
  "adapt|English|Adapt this text about climate change for 8-year-old readers."
  "adapt|French|Réécrivez ce texte sur l'hygiène pour un niveau de lecture primaire."
  "rubric|English|Create a marking rubric out of 20 points for an essay on Rwandan history."
  "rubric|Kinyarwanda|Kora igipimo cy'amanota (rubric) yo gukosora umukoro w'inyandiko ku kubungabunga ibidukikije."
  "quiz|Swahili|Tunga maswali 5 ya kuchagua kuhusu mzunguko wa maji kwa wanafunzi wa darasa la tano."
  "explain|Swahili|Eleza kwa lugha rahisi jinsi mimea inavyotengeneza chakula chake, kwa mifano ya kijijini."
)

INDEX=1
for ENTRY in "${PROMPTS[@]}"; do
    IFS="|" read -r MODE LANG QUESTION <<< "$ENTRY"

    echo "" | tee -a "$EVAL_FILE"
    echo "=== Test $INDEX/${#PROMPTS[@]}: Mode=[$MODE] Language=[$LANG] ===" | tee -a "$EVAL_FILE"
    echo "Prompt: $QUESTION" | tee -a "$EVAL_FILE"
    echo "--- Model Output ---" | tee -a "$EVAL_FILE"

    START_TIME=$(node -e "console.log(Date.now())")

    ASK_PAYLOAD=$(cat <<EOF
{
  "mode": "$MODE",
  "question": "$QUESTION",
  "teacher_hash": "eval_benchmark_teacher"
}
EOF
)

    TOKEN_COUNT=0
    FIRST_TOKEN_TIME=0

    # Execute request and record tokens
    RESPONSE=$(curl -s -N -X POST "$GATEWAY_URL/ask" \
        -H "Content-Type: application/json" \
        -d "$ASK_PAYLOAD" || true)

    while IFS= read -r line; do
        if [[ "$line" =~ ^data:\ (.*) ]]; then
            JSON_STR="${BASH_REMATCH[1]}"
            TYPE=$(node -e "try { console.log(JSON.parse(process.argv[1]).type || ''); } catch { console.log(''); }" "$JSON_STR" 2>/dev/null || true)

            if [ "$TYPE" == "token" ]; then
                CONTENT=$(node -e "try { process.stdout.write(JSON.parse(process.argv[1]).content || ''); } catch {}" "$JSON_STR" 2>/dev/null || true)
                echo -n "$CONTENT" >> "$EVAL_FILE"

                TOKEN_COUNT=$((TOKEN_COUNT + 1))
                if [ "$FIRST_TOKEN_TIME" -eq 0 ]; then
                    NOW=$(node -e "console.log(Date.now())")
                    FIRST_TOKEN_TIME=$((NOW - START_TIME))
                fi
            fi
        fi
    done <<< "$RESPONSE"

    END_TIME=$(node -e "console.log(Date.now())")
    TOTAL_TIME_MS=$((END_TIME - START_TIME))

    if [ "$TOTAL_TIME_MS" -gt 0 ] && [ "$TOKEN_COUNT" -gt 0 ]; then
        TOKENS_PER_SEC=$(node -e "console.log(($TOKEN_COUNT / ($TOTAL_TIME_MS / 1000)).toFixed(2))")
    else
        TOKENS_PER_SEC="0.00"
    fi

    echo "" | tee -a "$EVAL_FILE"
    echo "--------------------------------------------------" | tee -a "$EVAL_FILE"
    echo "Stats: First Token: ${FIRST_TOKEN_TIME}ms | Total Time: ${TOTAL_TIME_MS}ms | Tokens: $TOKEN_COUNT | Speed: ${TOKENS_PER_SEC} tok/s" | tee -a "$EVAL_FILE"

    INDEX=$((INDEX + 1))
done

echo "" | tee -a "$EVAL_FILE"
echo "=== Evaluation Completed. Saved to $EVAL_FILE ===" | tee -a "$EVAL_FILE"
