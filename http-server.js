"use strict";
/**
 * HTTP Server для Singularity MCP
 *
 * Пример запуска:
 * 1. Установите зависимости: npm install express cors dotenv
 * 2. Соберите проект: npm run build
 * 3. Создайте файл .env с вашим REFRESH_TOKEN
 * 4. Запустите сервер: npm run http-server
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const server_1 = require("./server");
const dotenv_1 = __importDefault(require("dotenv"));
// Загрузка переменных окружения из .env файла
dotenv_1.default.config();
// Класс для имитации StreamableHTTPServerTransport
class MockStreamableHTTPServerTransport {
    constructor(options) {
        this.sessionIdGenerator = options.sessionIdGenerator;
        console.log('Создан транспорт с опциями:', options);
    }
    async handleRequest(req, res, body) {
        console.log('Обработка запроса:', {
            method: req.method,
            path: req.path,
            body: body || {},
        });
        // Обработка запроса в режиме MCP
        try {
            // Здесь должна быть реальная обработка запроса MCP
            // Сейчас просто отправляем успешный ответ
            res.status(200).json({
                jsonrpc: '2.0',
                result: {
                    message: 'Запрос успешно обработан Singularity MCP сервером',
                    endpoint: req.path,
                },
                id: body?.id || null,
            });
        }
        catch (error) {
            console.error('Ошибка при обработке MCP запроса:', error);
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Внутренняя ошибка сервера',
                },
                id: body?.id || null,
            });
        }
    }
}
// Получение конфигурации из переменных окружения
const SINGULARITY_API_URL = process.env.SINGULARITY_API_URL || 'https://api.singularity-app.com';
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');
const DEMO_MODE = process.env.DEMO_MODE === 'true' || !REFRESH_TOKEN;
/**
 * Пример переменных окружения для .env файла:
 *
 * # API URL Singularity
 * SINGULARITY_API_URL=https://api.singularity-app.com
 *
 * # Refresh токен для аутентификации
 * REFRESH_TOKEN=your_refresh_token_here
 *
 * # Порт для HTTP сервера
 * PORT=3000
 *
 * # Разрешенные CORS источники (через запятую)
 * CORS_ORIGINS=http://localhost:3000,http://localhost:8080
 *
 * # Уровень логирования (debug, info, warn, error)
 * LOG_LEVEL=info
 *
 * # Режим демонстрации (без настоящей авторизации)
 * DEMO_MODE=true
 */
async function startServer() {
    // Проверка наличия refresh токена и режима демонстрации
    if (!REFRESH_TOKEN && !DEMO_MODE) {
        console.error('ОШИБКА: Не указан REFRESH_TOKEN в переменных окружения');
        console.error('Создайте файл .env с переменной REFRESH_TOKEN=ваш_токен');
        console.error('Или установите DEMO_MODE=true для запуска в демо-режиме');
        process.exit(1);
    }
    if (DEMO_MODE) {
        console.warn('ВНИМАНИЕ: Запуск в демонстрационном режиме без авторизации.');
        console.warn('В этом режиме запросы к API будут имитироваться.');
        console.warn('Для полнофункционального режима укажите REFRESH_TOKEN в файле .env');
    }
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // Настройка CORS для поддержки MCP заголовков
    app.use((0, cors_1.default)({
        origin: CORS_ORIGINS,
        exposedHeaders: ['mcp-session-id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
    }));
    console.log('Инициализация MCP сервера для Singularity API...');
    // Создание экземпляра MCP сервера
    const mcpServer = new server_1.SingularityMcpServer({
        baseUrl: SINGULARITY_API_URL,
        accessToken: REFRESH_TOKEN,
        enableLogging: true,
        logLevel: LOG_LEVEL
    });
    // Эндпоинт для обработки MCP запросов
    app.post('/mcp', async (req, res) => {
        console.log('Получен MCP запрос:', req.body);
        try {
            // Создание имитации HTTP транспорта
            const transport = new MockStreamableHTTPServerTransport({
                sessionIdGenerator: undefined, // Для stateless режима
            });
            // Подключение сервера к транспорту
            console.log('Подключение к транспорту...');
            await mcpServer.connect(transport);
            // Обработка запроса
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            console.error('Ошибка при обработке MCP запроса:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Внутренняя ошибка сервера',
                    },
                    id: req.body?.id || null,
                });
            }
        }
    });
    // Эндпоинт проверки работоспособности сервера
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'ok',
            message: 'Singularity MCP Server работает',
            apiUrl: SINGULARITY_API_URL,
            demoMode: DEMO_MODE
        });
    });
    // Запуск сервера
    app.listen(PORT, () => {
        console.log(`Singularity MCP сервер запущен на порту ${PORT}`);
        console.log(`Эндпоинт проверки: http://localhost:${PORT}/health`);
        console.log(`MCP эндпоинт: http://localhost:${PORT}/mcp (POST)`);
        console.log(`Режим работы: ${DEMO_MODE ? 'Демонстрационный' : 'Полнофункциональный'}`);
    });
}
// Запуск сервера
if (require.main === module) {
    startServer()
        .then(() => {
        console.log('Сервер успешно запущен');
    })
        .catch((error) => {
        console.error('Ошибка при запуске сервера:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=http-server.js.map