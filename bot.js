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
const enableReminder = async (chatId, reminderType) => {
    const reminderMap = {
        enable_daily_reminder: {
            schedule: "30 9,15 * * 1-5", // 9:30 AM и 3:00 PM по будням
            message: "Твои цели на день",
            goalsCallback: "daily_goals",
            successMessage:
                "Отлично! Напоминание включено для твоих целей на день! Оставляй комментарий по поставленным задачам с помощью кнопки ниже. Ты также можешь оставить комментарии, вызвав команду /comments",
        },
        enable_weekly_reminder: {
            schedule: "35 9 * * 1", // 9:35 AM каждый понедельник
            message: "Твои цели на неделю",
            goalsCallback: "weekly_goals",
            successMessage:
                "Отлично! Напоминание включено для твоих целей на неделю! Оставляй комментарий по поставленным задачам с помощью кнопки ниже. Ты также можешь оставить комментарии, вызвав команду /comments",
        },
        enable_monthly_reminder: {
            schedule: "0 9 1 * *", // 9:00 AM в первый день каждого месяца
            message: "Твои цели на месяц",
            goalsCallback: "monthly_goals",
            successMessage:
                "Отлично! Напоминание включено для твоих целей на месяц! Оставляй комментарий по поставленным задачам с помощью кнопки ниже. Ты также можешь оставить комментарии, вызвав команду /comments",
        },
    };

    const reminder = reminderMap[reminderType];

    if (reminder) {
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
                    bot.sendMessage(
                        chatId,
                        `${reminder.message}:\n\n${formattedGoals}\n\nОставляй комментарий по поставленным задачам с помощью кнопки ниже. Ты также можешь оставить комментарии, вызвав команду /comments`,
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
                } catch (error) {
                    console.error(`Ошибка при обработке данных: ${error}`);
                    bot.sendMessage(
                        chatId,
                        "Произошла ошибка при обработке данных. Пожалуйста, попробуйте позже."
                    );
                }
            });

            // Сохраняем задачу
            reminderTasks[chatId] = reminderTasks[chatId] || {};
            reminderTasks[chatId][reminderType] = task;

            bot.sendMessage(chatId, reminder.successMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Комментарии", callback_data: "add_comment" }],
                    ],
                },
            });
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

// Обработчик callback_query

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
                    `Твои цели на день:\n\n${formattedGoals}`
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
                    `Твои цели на неделю:\n\n${formattedGoals}`
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
                    `Твои цели на месяц:\n\n${formattedGoals}`
                );
            } catch (error) {
                console.error(`Ошибка при получении месячных целей: ${error}`);
                bot.sendMessage(
                    chatId,
                    "Произошла ошибка при получении целей. Пожалуйста, попробуйте позже."
                );
            }
            break;
        case "disable_daily_reminder":
            disableReminder(chatId, "enable_daily_reminder");
            break;
        case "disable_weekly_reminder":
            disableReminder(chatId, "enable_weekly_reminder");
            break;
        case "disable_monthly_reminder":
            disableReminder(chatId, "enable_monthly_reminder");
            break;
        default:
            // Если нажата неизвестная кнопка, ничего не делаем
            break;
    }
});
