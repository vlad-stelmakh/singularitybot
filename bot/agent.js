"use strict";

/**
 * Агент на базе OpenAI: цикл вызова инструментов (function calling),
 * расшифровка аудио и распознавание изображений.
 */

const fs = require("fs");

// Наивный ISO-datetime со временем, но без часового пояса
// (например "2026-07-27T18:20:00" или "2026-07-27T18:20:00.000").
// Голая дата "YYYY-MM-DD" (useTime: false) намеренно не матчится.
const NAIVE_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?$/;

/**
 * Рекурсивно дописывает смещение часового пояса владельца к строкам
 * даты-времени без явного пояса. SingularityApp API требует ISO-8601
 * с явным смещением (Z или ±HH:MM), иначе возвращает 400 Bad Request.
 *
 * @param {*} value - аргументы инструмента (объект/массив/примитив)
 * @param {string} tz - смещение владельца, например "+03:00"
 * @returns {*} значение с нормализованными датами
 */
function normalizeDateTimes(value, tz) {
  if (typeof value === "string") {
    return NAIVE_DATETIME_RE.test(value) ? `${value}${tz}` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDateTimes(item, tz));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = normalizeDateTimes(val, tz);
    }
    return out;
  }
  return value;
}

/**
 * Запускает цикл общения с моделью и вызова инструментов MCP.
 *
 * @param {object} params
 * @param {import('openai').OpenAI} params.openai
 * @param {import('./mcp-client').SingularityMcpClient} params.mcpClient
 * @param {object} params.config
 * @param {Array<object>} params.messages - полная история сообщений (включая system)
 * @param {(name: string, args: object) => void} [params.onToolCall] - колбэк для логирования/индикации
 * @returns {Promise<string>} финальный текстовый ответ ассистента
 */
async function runAgent({ openai, mcpClient, config, messages, onToolCall }) {
  const tools = mcpClient.getOpenAiTools();

  for (let iteration = 0; iteration < config.maxToolIterations; iteration++) {
    const completion = await openai.chat.completions.create({
      model: config.chatModel,
      messages,
      tools,
      tool_choice: "auto",
    });

    const message = completion.choices[0].message;
    messages.push(message);

    const toolCalls = message.tool_calls || [];
    if (toolCalls.length === 0) {
      return message.content || "";
    }

    for (const call of toolCalls) {
      const name = call.function.name;
      let args = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Ошибка разбора аргументов инструмента: ${err.message}`,
        });
        continue;
      }

      if (config.ownerTimezone) {
        args = normalizeDateTimes(args, config.ownerTimezone);
      }

      if (onToolCall) {
        try {
          onToolCall(name, args);
        } catch (_) {
          /* ignore */
        }
      }

      let toolResultText;
      try {
        const result = await mcpClient.callTool(name, args);
        toolResultText = result.text || (result.isError ? "Инструмент вернул ошибку." : "OK");
      } catch (err) {
        toolResultText = `Ошибка вызова инструмента ${name}: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResultText,
      });
    }
  }

  return "Не удалось завершить действие: превышен лимит вызовов инструментов. Уточните запрос, пожалуйста.";
}

/**
 * Расшифровывает аудиофайл (голосовое сообщение) в текст.
 *
 * @param {object} params
 * @param {import('openai').OpenAI} params.openai
 * @param {object} params.config
 * @param {string} params.filePath - путь до скачанного аудиофайла
 * @returns {Promise<string>}
 */
async function transcribeAudio({ openai, config, filePath }) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: config.transcriptionModel,
  });
  return transcription.text || "";
}

module.exports = { runAgent, transcribeAudio };
