"use strict";

/**
 * Преобразование Markdown-ответа модели в разметку, которую понимает Telegram.
 *
 * Модель отвечает в обычном Markdown (**жирный**, списки, `код` и т.п.),
 * но Telegram по умолчанию показывает такой текст как есть (с «звёздочками»).
 * Поэтому конвертируем ограниченное подмножество Markdown в Telegram-HTML
 * (parse_mode: "HTML") и умеем откатываться на «чистый» текст.
 */

const TELEGRAM_LIMIT = 4096;
// Оставляем запас под HTML-теги, чтобы после конвертации не превысить лимит.
const CHUNK_LIMIT = 3500;

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Конвертирует Markdown в Telegram-HTML.
 * Поддержка: заголовки, жирный, курсив, зачёркнутый, инлайн-код,
 * блоки кода и ссылки.
 */
function toTelegramHtml(text) {
  const codeBlocks = [];
  const inlineCodes = [];

  // Вырезаем блоки кода ```...``` до экранирования, чтобы не трогать их содержимое.
  let s = text.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
    codeBlocks.push(inner);
    return `\u0000CB${codeBlocks.length - 1}\u0000`;
  });

  // Вырезаем инлайн-код `...`.
  s = s.replace(/`([^`\n]+)`/g, (m, p1) => {
    inlineCodes.push(p1);
    return `\u0000IC${inlineCodes.length - 1}\u0000`;
  });

  // Экранируем спецсимволы HTML в оставшемся тексте.
  s = escapeHtml(s);

  // Ссылки [текст](url).
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (m, t, u) => `<a href="${u}">${t}</a>`
  );

  // Заголовки #..###### -> жирный.
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*$/gm, "<b>$1</b>");

  // Жирный: **текст** и __текст__.
  s = s.replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, "<b>$1</b>");
  s = s.replace(/__(?=\S)([\s\S]+?)(?<=\S)__/g, "<b>$1</b>");

  // Зачёркнутый ~~текст~~.
  s = s.replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, "<s>$1</s>");

  // Курсив *текст* и _текст_ (без конфликта со списками и уже раскрытым жирным).
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g, "$1<i>$2</i>");
  s = s.replace(/(^|[^_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![_\w])/g, "$1<i>$2</i>");

  // Возвращаем инлайн-код.
  s = s.replace(
    /\u0000IC(\d+)\u0000/g,
    (m, i) => `<code>${escapeHtml(inlineCodes[Number(i)])}</code>`
  );

  // Возвращаем блоки кода.
  s = s.replace(
    /\u0000CB(\d+)\u0000/g,
    (m, i) => `<pre>${escapeHtml(codeBlocks[Number(i)])}</pre>`
  );

  return s;
}

/**
 * Убирает Markdown-разметку, оставляя читабельный «чистый» текст.
 * Используется как запасной вариант, если Telegram не смог разобрать HTML.
 */
function stripMarkdown(text) {
  return text
    .replace(/```[^\n]*\n?([\s\S]*?)\n?```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/~~([\s\S]+?)~~/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
}

/**
 * Разбивает исходный текст на части не длиннее limit символов,
 * по возможности по границам строк (чтобы не рвать разметку внутри строки).
 */
function splitIntoChunks(text, limit = CHUNK_LIMIT) {
  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length) {
      chunks.push(current);
      current = "";
    }
  };

  for (const line of text.split("\n")) {
    // Одиночная строка длиннее лимита — режем жёстко.
    if (line.length > limit) {
      pushCurrent();
      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit));
      }
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      pushCurrent();
      current = line;
    } else {
      current = candidate;
    }
  }
  pushCurrent();

  return chunks.length ? chunks : [""];
}

module.exports = {
  TELEGRAM_LIMIT,
  CHUNK_LIMIT,
  toTelegramHtml,
  stripMarkdown,
  splitIntoChunks,
};
