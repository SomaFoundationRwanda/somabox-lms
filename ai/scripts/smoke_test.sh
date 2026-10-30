#!/usr/bin/env bash
set -e

GATEWAY_URL="http://127.0.0.1:5000"

echo "=== Running AI Gateway Smoke Tests ==="

echo "1. Checking Gateway Health (/health)..."
HEALTH_RESP=$(curl -s "$GATEWAY_URL/health" || true)

if [ -z "$HEALTH_RESP" ]; then
    echo "FAILED: AI Gateway is not responding at $GATEWAY_URL"
    exit 1
fi

echo "Health Response: $HEALTH_RESP"

MODES=("lesson_plan" "quiz" "explain" "adapt" "rubric")

for MODE in "${MODES[@]}"; do
    echo "----------------------------------------"
    echo "Testing mode: $MODE ..."

    ASK_PAYLOAD=$(cat <<EOF
{
  "mode": "$MODE",
  "question": "Smoke test prompt for $MODE",
  "source_text": "Sample text for testing",
  "course_id": "CS101",
  "lesson_id": "L01",
  "teacher_hash": "smoke_test_teacher_hash"
}
EOF
)

    RESPONSE=$(curl -s -X POST "$GATEWAY_URL/ask" \
        -H "Content-Type: application/json" \
        -d "$ASK_PAYLOAD" || true)

    if echo "$RESPONSE" | grep -q "data: "; then
        echo "SUCCESS: $MODE stream received."
    else
        echo "WARNING: $MODE stream did not return expected SSE format. Output:"
        echo "$RESPONSE"
    fi
done

echo "----------------------------------------"
echo "Testing /feedback endpoint..."
FEEDBACK_PAYLOAD=$(cat <<EOF
{
  "response_id": "smoke-test-resp-123",
  "teacher_hash": "smoke_test_teacher_hash",
  "rating": 1,
  "comment": "Smoke test positive feedback",
  "mode": "explain"
}
EOF
)

FEEDBACK_RESP=$(curl -s -X POST "$GATEWAY_URL/feedback" \
    -H "Content-Type: application/json" \
    -d "$FEEDBACK_PAYLOAD" || true)

echo "Feedback Response: $FEEDBACK_RESP"
echo "=== Smoke Tests Completed ==="
