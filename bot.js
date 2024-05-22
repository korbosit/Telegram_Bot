const TelegramBot = require("node-telegram-bot-api");
const config = require("./config");
const cron = require("node-cron");
const {
    getDataFromSheet,
    appendDataToSheet,
    getNextFreeRow,
    getUserGoals,
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

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name;

    if (!registeredUsers[chatId]) {
        try {
            // Находим первую пустую строку, соответствующую правилам
            const firstEmptyRow = await getNextFreeRow(
                config.spreadsheetId,
                "Sheet1"
            );

            // Записываем данные пользователя в первую пустую строку
            await appendDataToSheet(
                config.spreadsheetId,
                `Sheet1!A${firstEmptyRow}`,
                chatId.toString()
            );
            await appendDataToSheet(
                config.spreadsheetId,
                `Sheet1!B${firstEmptyRow}`,
                firstName
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

    // Проверка, является ли отправитель команды админом
    const isAdmin = userId === ADMIN_USER_ID;

    if (isAdmin) {
        registeredUsers = {};
        reminderTasks = {};
        bot.sendMessage(chatId, "Кэш успешно очищен.");
    } else {
        bot.sendMessage(chatId, "У вас нет прав для выполнения этой команды.");
    }
});

// Функция для включения напоминаний
const enableReminder = async (chatId, reminderType, period) => {
    const reminderMap = {
        enable_daily_reminder: {
            successMessage: `Напоминания для целей на ${period} включены!`,
        },
        enable_weekly_reminder: {
            successMessage: `Напоминания для целей на ${period} включены!`,
        },
        enable_monthly_reminder: {
            successMessage: `Напоминания для целей на ${period} включены!`,
        },
    };

    const reminder = reminderMap[reminderType];

    if (reminder) {
        try {
            // Устанавливаем задачу по расписанию
            const task = cron.schedule("0 9 * * 1", async () => {
                bot.sendMessage(chatId, reminder.successMessage, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Комментарии",
                                    callback_data: "add_comment",
                                },
                            ],
                        ],
                    },
                });
            });

            // Сохраняем задачу
            reminderTasks[chatId] = reminderTasks[chatId] || {};
            reminderTasks[chatId][reminderType] = task;
        } catch (error) {
            console.error(`Ошибка при установке напоминания: ${error}`);
            bot.sendMessage(
                chatId,
                "Произошла ошибка при установке напоминания. Пожалуйста, попробуйте позже."
            );
        }
    }
};

// Функция для удаления напоминаний
const disableReminder = (chatId, reminderType) => {
    if (reminderTasks[chatId] && reminderTasks[chatId][reminderType]) {
        reminderTasks[chatId][reminderType].stop();
        delete reminderTasks[chatId][reminderType];
        bot.sendMessage(chatId, `Напоминание отключено.`);
    } else {
        bot.sendMessage(
            chatId,
            `У вас нет активных напоминаний для этого типа.`
        );
    }
};

// Функция для обработки добавления комментариев
const handleAddComment = async (chatId, commentType) => {
    bot.sendMessage(chatId, "Введите ваш комментарий:");

    bot.once("message", async (msg) => {
        const comment = msg.text;
        const userId = chatId.toString();
        let range;

        try {
            const response = await getDataFromSheet(
                config.spreadsheetId,
                "Sheet1!A:A"
            );
            const userIndex = response.findIndex((row) => row[0] === userId);
            if (userIndex === -1) throw new Error("User not found");
            const startRow = Math.floor(userIndex / 10) * 10 + 2;

            if (commentType === "день") {
                range = `Sheet1!D${startRow}:D${startRow + 9}`;
            } else if (commentType === "неделю") {
                range = `Sheet1!F${startRow}:F${startRow + 9}`;
            } else if (commentType === "месяц") {
                range = `Sheet1!H${startRow}:H${startRow + 9}`;
            }

            await appendDataToSheet(config.spreadsheetId, range, comment);
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

bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    switch (data) {
        case "daily_goals":
            try {
                const goals = await getUserGoals(chatId, "daily_goals");
                const formattedGoals = goals
                    .map((goal, index) => `${index + 1}. ${goal}`)
                    .join("\n");
                bot.sendMessage(
                    chatId,
                    `Твои цели на день:\n\n${formattedGoals}`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Включить напоминание",
                                        callback_data: "enable_daily_reminder",
                                    },
                                ],
                            ],
                        },
                    }
                );
            } catch (error) {
                console.error(
                    `Ошибка при получении ежедневных целей: ${error}`
                );
                bot.sendMessage(
                    chatId,
                    "Произошла ошибка при получении целей. Пожалуйста, попробуйте позже."
                );
            }
            break;
        case "weekly_goals":
            try {
                const goals = await getUserGoals(chatId, "weekly_goals");
                const formattedGoals = goals
                    .map((goal, index) => `${index + 1}. ${goal}`)
                    .join("\n");
                bot.sendMessage(
                    chatId,
                    `Твои цели на неделю:\n\n${formattedGoals}`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Включить напоминание",
                                        callback_data: "enable_weekly_reminder",
                                    },
                                ],
                            ],
                        },
                    }
                );
            } catch (error) {
                console.error(`Ошибка при получении недельных целей: ${error}`);
                bot.sendMessage(
                    chatId,
                    "Произошла ошибка при получении целей. Пожалуйста, попробуйте позже."
                );
            }
            break;
        case "monthly_goals":
            try {
                const goals = await getUserGoals(chatId, "monthly_goals");
                const formattedGoals = goals
                    .map((goal, index) => `${index + 1}. ${goal}`)
                    .join("\n");
                bot.sendMessage(
                    chatId,
                    `Твои цели на месяц:\n\n${formattedGoals}`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Включить напоминание",
                                        callback_data:
                                            "enable_monthly_reminder",
                                    },
                                ],
                            ],
                        },
                    }
                );
            } catch (error) {
                console.error(`Ошибка при получении месячных целей: ${error}`);
                bot.sendMessage(
                    chatId,
                    "Произошла ошибка при получении целей. Пожалуйста, попробуйте позже."
                );
            }
            break;
        case "add_comment":
            // Отправка кнопок "День", "Неделя", "Месяц" после нажатия кнопки "Комментарии"
            bot.sendMessage(chatId, "Выберите тип комментария:", {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "День", callback_data: "comment_daily" },
                            { text: "Неделя", callback_data: "comment_weekly" },
                            { text: "Месяц", callback_data: "comment_monthly" },
                        ],
                    ],
                },
            });
            break;
        case "comment_daily":
            // Логика для обработки комментариев к ежедневным целям
            break;
        case "comment_weekly":
            // Логика для обработки комментариев к недельным целям
            break;
        case "comment_monthly":
            // Логика для обработки комментариев к месячным целям
            break;
        case "enable_daily_reminder":
            enableReminder(chatId, "enable_daily_reminder");
            bot.sendMessage(chatId, "Напоминания для целей на день включены!", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Комментарии", callback_data: "add_comment" }],
                    ],
                },
            });
            break;
        case "enable_weekly_reminder":
            enableReminder(chatId, "enable_weekly_reminder");
            bot.sendMessage(
                chatId,
                "Напоминания для целей на неделю включены!",
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Комментарии",
                                    callback_data: "add_comment",
                                },
                            ],
                        ],
                    },
                }
            );
            break;
        case "enable_monthly_reminder":
            enableReminder(chatId, "enable_monthly_reminder");
            bot.sendMessage(
                chatId,
                "Напоминания для целей на месяц включены!",
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Комментарии",
                                    callback_data: "add_comment",
                                },
                            ],
                        ],
                    },
                }
            );
            break;
        default:
            break;
    }

    bot.answerCallbackQuery(callbackQuery.id);
});
