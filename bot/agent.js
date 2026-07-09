"use strict";

/**
 * Агент на базе OpenAI: цикл вызова инструментов (function calling),
 * расшифровка аудио и распознавание изображений.
 */

const fs = require("fs");

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
