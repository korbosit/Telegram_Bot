// bot.js
const TelegramBot = require("node-telegram-bot-api");
const config = require("./config");
const { getDataFromSheet, appendDataToSheet } = require("./sheets");

const bot = new TelegramBot(config.botToken, { polling: true });

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name;

    try {
        // Записываем user_id в колонку A
        await appendDataToSheet(
            config.spreadsheetId,
            "Sheet1",
            chatId.toString(),
            firstName
        );

        // Отправляем приветственное сообщение и кнопки
        bot.sendMessage(chatId, "Теперь выбери необходимую опцию", {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Цели на день", callback_data: "daily_goals" },
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
        });
    } catch (error) {
        console.error(`Ошибка при регистрации пользователя: ${error}`);
    }
});

// Обработчик callback_query
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const callbackData = query.data;

    try {
        let goals;
        let message;
        if (callbackData === "daily_goals") {
            goals = await getDataFromSheet(
                config.spreadsheetId,
                "Sheet1!C1:C10"
            );
            message = "Твои цели на день:\n\n";
        } else if (callbackData === "weekly_goals") {
            goals = await getDataFromSheet(
                config.spreadsheetId,
                "Sheet1!E1:E10"
            );
            message = "Твои цели на неделю:\n\n";
        }
        // Добавьте обработку для monthly_goals здесь

        if (goals) {
            const formattedGoals = goals
                .map((goal, index) => `${index + 1}. ${goal}`)
                .join("\n");
            bot.sendMessage(chatId, `${message}${formattedGoals}`);
        } else {
            bot.sendMessage(chatId, "Не удалось найти ваши данные.");
        }
    } catch (error) {
        console.error(`Ошибка при получении целей: ${error}`);
        bot.sendMessage(
            chatId,
            "Произошла ошибка при получении ваших целей. Пожалуйста, попробуйте позже."
        );
    }
});
