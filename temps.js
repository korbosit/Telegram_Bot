const TelegramBot = require("node-telegram-bot-api");
const config = require("./config");
const cron = require("node-cron");
const {
    getDataFromSheet,
    appendDataToSheet,
    getNextFreeRow,
    getUserGoals,
    getUserRowIndex,
} = require("./sheets");

const ADMIN_USER_ID = 6810209450;

const bot = new TelegramBot(config.botToken, { polling: true });
let registeredUsers = {};
let reminderTasks = {};

// Очистка кэша при перезапуске бота
bot.on("polling_error", (error) => {
    console.error(`Polling error: ${error.message}`);
    registeredUsers = {};
    reminderTasks = {};
});

// Функция для проверки существования пользователя в таблице Google Sheets
const isUserRegistered = async (chatId) => {
    try {
        const response = await getDataFromSheet(config.spreadsheetId, "Sheet1!A:A");
        const userIds = response.map((row) => row[0]);
        return userIds.includes(chatId.toString());
    } catch (error) {
        console.error(`Ошибка при проверке регистрации пользователя: ${error}`);
        return false;
    }
};

// Функция для очистки кэша при удалении пользователя из таблицы
const clearCacheForDeletedUsers = async () => {
    try {
        const response = await getDataFromSheet(config.spreadsheetId, "Sheet1!A:A");
        const userIds = response.map((row) => row[0]);

        Object.keys(registeredUsers).forEach((chatId) => {
            if (!userIds.includes(chatId)) {
                delete registeredUsers[chatId];
                if (reminderTasks[chatId]) {
                    Object.values(reminderTasks[chatId]).forEach((task) => task.stop());
                    delete reminderTasks[chatId];
                }
            }
        });
    } catch (error) {
        console.error(`Ошибка при очистке кэша для удаленных пользователей: ${error}`);
    }
};

// Запускаем функцию очистки кэша каждые 5 минут
setInterval(clearCacheForDeletedUsers, 5 * 60 * 1000);

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name;

    const isRegistered = await isUserRegistered(chatId);

    if (!isRegistered) {
        try {
            // Находим следующую свободную строку
            const nextFreeRow = await getNextFreeRow(config.spreadsheetId, "Sheet1");

            // Записываем данные пользователя в следующую свободную строку
            await appendDataToSheet(
                config.spreadsheetId,
                `Sheet1!A${nextFreeRow}:B${nextFreeRow}`,
                [chatId.toString(), firstName]
            );

            // Регистрируем пользователя в кэш
            registeredUsers[chatId] = true;

            // Отправляем приветственное сообщение и кнопки
            bot.sendMessage(
                chatId,
                `Приветствую тебя, ${firstName}, твой ID: ${chatId}! Я чат-бот для напоминаний твоих целей!`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Цели на день",
                                    callback_data: "daily_goals",
                                },
                                {
                                    text: "Цели на неделю",
                                    callback_data: "weekly_goals",
                                },
                                {
                                    text: "Цели на месяц",
                                    callback_data: "monthly_goals",
                                },
                            ],
                        ],
                    },
                }
            );
        } catch (error) {
            console.error(`Ошибка при регистрации пользователя: ${error}`);
            bot.sendMessage(
                chatId,
                "Произошла ошибка при регистрации. Пожалуйста, попробуйте позже."
            );
        }
    } else {
        bot.sendMessage(
            chatId,
            "Вы уже зарегистрированы. Теперь выберите необходимую опцию.",
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Цели на день",
                                callback_data: "daily_goals",
                            },
                            {
                                text: "Цели на неделю",
                                callback_data: "weekly_goals",
                            },
                            {
                                text: "Цели на месяц",
                                callback_data: "monthly_goals",
                            },
                        ],
                    ],
                },
            }
        );
    }
});

// Обработчик команды /clear_cache
bot.onText(/\/clear_cache/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId === ADMIN_USER_ID) {
        registeredUsers = {};
        reminderTasks = {};
        bot.sendMessage(chatId, "Кэш успешно очищен.");
    } else {
        bot.sendMessage(chatId, "У вас нет прав для выполнения этой команды.");
    }
});

// Функция для включения напоминаний
const enableReminder = async (chatId, reminderType, bot, reminderTasks) => {
    const reminderMap = {
        enable_daily_reminder: {
            schedule: "30 6,16 * * 1-5", // 9:30 AM и 4:00 PM по Киевскому времени (UTC+3) с понедельника по пятницу
            message: "Твои цели на день",
            goalsCallback: "daily_goals",
            reminderMessage: "Ежедневное напоминание включено.",
        },
        enable_weekly_reminder: {
            schedule: "35 6 * * 1", // 9:35 AM по Киевскому времени (UTC+3) каждый понедельник
            message: "Твои цели на неделю",
            goalsCallback: "weekly_goals",
            reminderMessage: "Еженедельное напоминание включено.",
        },
        enable_monthly_reminder: {
            schedule: "40 6 1-7 * *", // 9:40 AM по Киевскому времени (UTC+3) в первый понедельник каждого месяца
            message: "Твои цели на месяц",
            goalsCallback: "monthly_goals",
            reminderMessage: "Ежемесячное напоминание включено.",
        },
    };

    if (reminderMap[reminderType]) {
        const reminder = reminderMap[reminderType];

        try {
            // Устанавливаем задачу по расписанию
            const task = cron.schedule(reminder.schedule, async () => {
                try {
                    const goals = await getUserGoals(
                        chatId,
                        reminder.goalsCallback
                    );
                    const formattedGoals = goals
                        .map((goal, index) => `${index + 1}. ${goal}`)
                        .join("\n");
                        const handleAddComment = async (chatId, commentType) => {
                            bot.sendMessage(chatId, "Введите ваш комментарий:");

                            bot.once("message", async (msg) => {
                                const comment = msg.text;
                                const userId = chatId.toString();
                                let range;

                                try {
                                    const userRowIndex = await getUserRowIndex(config.spreadsheetId, userId);

                                    if (commentType === "день") {
                                        range = `Sheet1!D${userRowIndex}`;
                                    } else if (commentType === "неделю") {
                                        range = `Sheet1!F${userRowIndex}`;
                                    } else if (commentType === "месяц") {
                                        range = `Sheet1!H${userRowIndex}`;
                                    }

                                    await appendDataToSheet(config.spreadsheetId, range, [comment]);
                                    bot.sendMessage(
                                        chatId,
                                        `Ваш комментарий для целей на ${commentType} сохранен.`
                                    );
                                } catch (error) {
                                    console.error(`Ошибка при сохранении комментария: ${error}`);
                                    bot.sendMessage(
                                        chatId,
                                        "Произошла ошибка при сохранении комментария. Пожалуйста, попробуйте позже."
                                    );
                                }
                            });
                        };

                        // Обработчик callback_query
                        bot.on("callback_query", async (callbackQuery) => {
                            const chatId = callbackQuery.message.chat.id;
                            const data = callbackQuery.data;

                            switch (data) {
                                case "daily_goals":
                                    const dailyGoals = await getUserGoals(chatId, "daily_goals");
                                    const dailyGoalsComments = await getDataFromSheet(
                                        config.spreadsheetId,
                                        `Sheet1!D${await getUserRowIndex(config.spreadsheetId, chatId.toString())}`
                                    );
                                    const dailyGoalsMessage = `Твои цели на день:\n\n${dailyGoals
                                        .map((goal, index) => `${index + 1}. ${goal}`)
                                        .join("\n")}\n\nКомментарий: ${dailyGoalsComments[0][0] || "Нет комментария"}`;
                                    bot.sendMessage(chatId, dailyGoalsMessage, {
                                        reply_markup: {
                                            inline_keyboard: [
                                                [
                                                    {
                                                        text: "Включить напоминание",
                                                        callback_data: "enable_daily_reminder",
                                                    },
                                                    {
                                                        text: "Добавить комментарий",
                                                        callback_data: "add_comment",
                                                    },
                                                ],
                                            ],
                                        },
                                    });
                                    break;
                                // ... аналогичные обработчики для weekly_goals и monthly_goals ...
                                case "enable_daily_reminder":
                                    enableReminder(chatId, "enable_daily_reminder", bot, reminderTasks);
                                    break;
                                case "enable_weekly_reminder":
                                    enableReminder(chatId, "enable_weekly_reminder", bot, reminderTasks);
                                    break;
                                case "enable_monthly_reminder":
                                    enableReminder(chatId, "enable_monthly_reminder", bot, reminderTasks);
                                    break;
                                case "add_comment":
                                    bot.sendMessage(chatId, "Выберите тип комментария:", {
                                        reply_markup: {
                                            inline_keyboard: [
                                                [
                                                    {
                                                        text: "День",
                                                        callback_data: "comment_daily",
                                                    },
                                                    {
                                                        text: "Неделя",
                                                        callback_data: "comment_weekly",
                                                    },
                                                    {
                                                        text: "Месяц",
                                                        callback_data: "comment_monthly",
                                                    },
                                                ],
                                            ],
                                        },
                                    });
                                    break;
                                case "comment_daily":
                                    await handleAddComment(chatId, "день");
                                    break;
                                case "comment_weekly":
                                    await handleAddComment(chatId, "неделю");
                                    break;
                                case "comment_monthly":
                                    await handleAddComment(chatId, "месяц");
                                    break;
                                default:
                                    break;
                            }

                            bot.answerCallbackQuery(callbackQuery.id);
                        });
