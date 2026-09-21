"use strict";

/**
 * Telegram-бот — интерфейс к агенту SingularityApp.
 *
 * Возможности:
 *  - доступ только для владельца (по Telegram user ID);
 *  - текстовые сообщения, голосовые (расшифровка через OpenAI) и изображения (vision);
 *  - агент задаёт уточняющие вопросы, если данных не хватает;
 *  - работа с Singularity через официальный MCP (https://mcp.singularity-app.com/mcp);
 *  - опционально — обзор рабочих задач в Jira (спринт, фокус), если заданы JIRA_*.
 */

const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Telegraf } = require("telegraf");
const { OpenAI } = require("openai");

const { config } = require("./config");
const { McpClientPool } = require("./mcp-client-pool");
const { buildSystemPrompt } = require("./prompt");
const { runAgent, transcribeAudio } = require("./agent");
const { toTelegramHtml, stripMarkdown, splitIntoChunks } = require("./format");
const { fetchTodayMessage } = require("./today");
const { fetchWeekMessage } = require("./week");

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
  baseURL: config.openaiBaseUrl,
});

const mcpClientPool = new McpClientPool({
  entryPoint: config.mcpEntryPoint,
  baseUrl: config.singularityBaseUrl,
  mcpUrl: config.singularityMcpUrl,
  mcpTransport: config.singularityMcpTransport,
  mcpToolsets: config.singularityMcpToolsets,
  mcpFallbackToStdio: config.singularityMcpFallbackToStdio,
  jira: config.jira,
});

// История диалога по Telegram-пользователям (в памяти процесса).
// Не используем chat ID: в группах он общий для нескольких пользователей.
const histories = new Map();
// Простая очередь обработки на пользователя, чтобы его сообщения не пересекались.
const chatLocks = new Map();

function getHistory(chatId) {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId);
}

function getUserProfile(ctx) {
  const userId = ctx.from && String(ctx.from.id);
  return userId ? config.userProfiles.get(userId) : undefined;
}

/**
 * Обрезает историю, сохраняя последние сообщения и целостность tool-вызовов.
 */
function trimHistory(history) {
  const max = config.maxHistoryMessages;
  if (history.length <= max) return history;
  let trimmed = history.slice(history.length - max);
  // Убираем "осиротевшие" tool-сообщения в начале
  while (trimmed.length && trimmed[0].role === "tool") {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

/**
 * Последовательная обработка сообщений в рамках одного чата.
 */
async function withChatLock(chatId, fn) {
  const prev = chatLocks.get(chatId) || Promise.resolve();
  const next = prev.then(fn, fn);
  chatLocks.set(
    chatId,
    next.catch(() => {})
  );
  return next;
}

async function replyLong(ctx, text) {
  const safe = text && text.trim() ? text : "Готово.";
  // Режем исходный Markdown на части, затем каждую конвертируем в Telegram-HTML.
  for (const chunk of splitIntoChunks(safe)) {
    try {
      await ctx.reply(toTelegramHtml(chunk), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    } catch (err) {
      // Если Telegram не смог разобрать HTML — шлём «чистый» текст без разметки.
      console.error("Ошибка отправки HTML, откат на текст:", err.message);
      await ctx.reply(stripMarkdown(chunk));
    }
  }
}

/**
 * Скачивает файл Telegram по fileId и возвращает Buffer.
 */
async function downloadTelegramFile(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(link.href);
  if (!res.ok) {
    throw new Error(`Не удалось скачать файл: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), url: link.href };
}

/**
 * Обрабатывает пользовательский ввод (уже сформированный content для OpenAI)
 * и отправляет ответ агента.
 */
async function handleUserContent(ctx, userContent) {
  const userId = String(ctx.from.id);
  const profile = getUserProfile(ctx);
  if (!profile) {
    throw new Error("Доступ к SingularityApp для этого пользователя не настроен.");
  }
  await ctx.sendChatAction("typing").catch(() => {});

  const history = getHistory(userId);
  const systemMessage = {
    role: "system",
    content: buildSystemPrompt({
      timezone: config.ownerTimezone,
      now: new Date(),
      jira: config.jira,
    }),
  };

  const userMessage = { role: "user", content: userContent };
  const messages = [systemMessage, ...history, userMessage];

  const typingInterval = setInterval(() => {
    ctx.sendChatAction("typing").catch(() => {});
  }, 4000);

  let reply;
  try {
    const mcpClient = await mcpClientPool.getClient(
      userId,
      profile.accessToken
    );
    reply = await runAgent({
      openai,
      mcpClient,
      config,
      messages,
      onToolCall: (name) => {
        console.log(`[agent] user=${userId} tool call: ${name}`);
      },
    });
  } finally {
    clearInterval(typingInterval);
  }

  // Сохраняем новую историю (без системного сообщения)
  const updated = trimHistory(messages.slice(1));
  histories.set(userId, updated);

  await replyLong(ctx, reply);
}

function registerHandlers(bot) {
  // Проверка владельца для всех апдейтов
  bot.use(async (ctx, next) => {
    if (!getUserProfile(ctx)) {
      const uid = ctx.from ? ctx.from.id : "неизвестно";
      if (ctx.reply) {
        await ctx
          .reply(
            `Доступ запрещён. Этот бот приватный.\nВаш Telegram ID: ${uid}`
          )
          .catch(() => {});
      }
      return; // не пропускаем дальше
    }
    return next();
  });

  bot.start(async (ctx) => {
    const jiraHint = config.jira
      ? "\n\nМогу посмотреть рабочие задачи в Jira: что в текущем спринте и на чём сфокусироваться."
      : "";
    await ctx.reply(
      "Привет! Я помогу создавать и вести задачи, проекты, заметки и привычки в SingularityApp." +
        jiraHint +
        "\n\nПиши текстом, присылай голосовые или картинки (например, список дел). " +
        "Если чего-то не пойму — переспрошу.\n\n" +
        "Команды:\n/today — задачи на сегодня\n/week — что сделано на прошлой неделе\n/reset — очистить контекст диалога"
    );
  });

  bot.command("reset", async (ctx) => {
    histories.delete(String(ctx.from.id));
    await ctx.reply("Контекст диалога очищен.");
  });

  bot.command("today", async (ctx) => {
    await withChatLock(String(ctx.from.id), async () => {
      try {
        await ctx.sendChatAction("typing").catch(() => {});
        const userId = String(ctx.from.id);
        const profile = getUserProfile(ctx);
        const mcpClient = await mcpClientPool.getSingularityClient(
          userId,
          profile.accessToken
        );
        const message = await fetchTodayMessage({
          mcpClient,
          timezone: config.ownerTimezone,
          now: new Date(),
        });
        await replyLong(ctx, message);
      } catch (err) {
        console.error("Ошибка команды /today:", err);
        await ctx
          .reply(`Не удалось получить задачи на сегодня: ${err.message}`)
          .catch(() => {});
      }
    });
  });

  bot.command("week", async (ctx) => {
    await withChatLock(String(ctx.from.id), async () => {
      try {
        await ctx.sendChatAction("typing").catch(() => {});
        const userId = String(ctx.from.id);
        const profile = getUserProfile(ctx);
        const mcpClient = await mcpClientPool.getSingularityClient(
          userId,
          profile.accessToken
        );
        const message = await fetchWeekMessage({
          mcpClient,
          timezone: config.ownerTimezone,
          now: new Date(),
        });
        await replyLong(ctx, message);
      } catch (err) {
        console.error("Ошибка команды /week:", err);
        await ctx
          .reply(
            `Не удалось получить закрытые задачи за прошлую неделю: ${err.message}`
          )
          .catch(() => {});
      }
    });
  });

  // Текстовые сообщения
  bot.on("text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return; // команды обрабатываются отдельно
    await withChatLock(String(ctx.from.id), async () => {
      try {
        await handleUserContent(ctx, ctx.message.text);
      } catch (err) {
        console.error("Ошибка обработки текста:", err);
        await ctx.reply(`Произошла ошибка: ${err.message}`).catch(() => {});
      }
    });
  });

  // Голосовые сообщения и аудио
  const voiceHandler = async (ctx) => {
    await withChatLock(String(ctx.from.id), async () => {
      let tmpPath;
      try {
        await ctx.sendChatAction("typing").catch(() => {});
        const media = ctx.message.voice || ctx.message.audio;
        const { buffer } = await downloadTelegramFile(ctx, media.file_id);
        const ext =
          media.mime_type && media.mime_type.includes("mpeg") ? "mp3" : "ogg";
        tmpPath = path.join(
          os.tmpdir(),
          `sing-voice-${crypto.randomUUID()}.${ext}`
        );
        await fs.promises.writeFile(tmpPath, buffer);

        const text = await transcribeAudio({ openai, config, filePath: tmpPath });
        if (!text.trim()) {
          await ctx.reply("Не удалось распознать речь. Попробуйте ещё раз.");
          return;
        }
        await ctx.reply(`Распознал: "${text}"`);
        await handleUserContent(ctx, text);
      } catch (err) {
        console.error("Ошибка обработки голоса:", err);
        await ctx.reply(`Произошла ошибка: ${err.message}`).catch(() => {});
      } finally {
        if (tmpPath) fs.promises.unlink(tmpPath).catch(() => {});
      }
    });
  };
  bot.on("voice", voiceHandler);
  bot.on("audio", voiceHandler);

  // Изображения (фото и картинки-документы)
  const photoHandler = async (ctx) => {
    await withChatLock(String(ctx.from.id), async () => {
      try {
        await ctx.sendChatAction("typing").catch(() => {});
        let fileId;
        let mime = "image/jpeg";
        if (ctx.message.photo && ctx.message.photo.length) {
          // Берём самую большую версию фото
          fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (
          ctx.message.document &&
          ctx.message.document.mime_type &&
          ctx.message.document.mime_type.startsWith("image/")
        ) {
          fileId = ctx.message.document.file_id;
          mime = ctx.message.document.mime_type;
        }
        if (!fileId) {
          await ctx.reply("Не вижу изображения в сообщении.");
          return;
        }

        const { buffer } = await downloadTelegramFile(ctx, fileId);
        const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
        const caption =
          ctx.message.caption ||
          "На изображении список дел или заметка. Разбери его и помоги оформить задачи/заметки в SingularityApp.";

        const content = [
          { type: "text", text: caption },
          { type: "image_url", image_url: { url: dataUrl } },
        ];
        await handleUserContent(ctx, content);
      } catch (err) {
        console.error("Ошибка обработки изображения:", err);
        await ctx.reply(`Произошла ошибка: ${err.message}`).catch(() => {});
      }
    });
  };
  bot.on("photo", photoHandler);
  bot.on("document", photoHandler);
}

async function main() {
  if (config.userProfiles.size === 0) {
    console.warn(
      "[warn] TELEGRAM_SINGULARITY_TOKENS пуст — доступ будет запрещён всем. Настройте соответствие Telegram ID и ключа Singularity API."
    );
  }

  const bot = new Telegraf(config.telegramBotToken);
  registerHandlers(bot);
  await bot.telegram
    .setMyCommands([
      { command: "today", description: "Задачи на сегодня" },
      { command: "week", description: "Что сделано на прошлой неделе" },
      { command: "reset", description: "Очистить контекст диалога" },
    ])
    .catch((err) => {
      console.warn(
        `[warn] Не удалось обновить меню команд Telegram: ${err.message}`
      );
    });

  process.once("SIGINT", async () => {
    bot.stop("SIGINT");
    await mcpClientPool.close();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    bot.stop("SIGTERM");
    await mcpClientPool.close();
    process.exit(0);
  });

  // В Telegraf v4 launch() резолвится только при остановке бота,
  // поэтому не ждём его здесь, а лишь перехватываем ошибки старта.
  bot.launch().catch((err) => {
    console.error("Ошибка при работе бота:", err);
    process.exit(1);
  });
  if (config.jira) {
    const extras = [
      config.jira.projectKey && `проект ${config.jira.projectKey}`,
      config.jira.boardId && `доска ${config.jira.boardId}`,
    ].filter(Boolean);
    console.log(
      `Jira MCP включён: ${config.jira.baseUrl}` +
        (extras.length ? ` (${extras.join(", ")})` : "") +
        ". Подключение при первом сообщении."
    );
  } else {
    console.log("Jira MCP выключен (не заданы JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN).");
  }
  const transportLabel =
    config.singularityMcpTransport === "stdio"
      ? `локальный stdio (${config.mcpEntryPoint})`
      : `официальный HTTP ${config.singularityMcpUrl}` +
        (config.singularityMcpFallbackToStdio
          ? " (fallback: mcp.js)"
          : "");
  console.log(`Singularity MCP: ${transportLabel}`);
  console.log("Бот запущен. MCP-подключения создаются при первом сообщении пользователя.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Не удалось запустить бота:", err);
    process.exit(1);
  });
}

module.exports = { main };
