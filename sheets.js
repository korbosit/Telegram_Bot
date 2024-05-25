const { google } = require("googleapis");
const keys = require("./keys.json");

const client = new google.auth.JWT(keys.client_email, null, keys.private_key, [
    "https://www.googleapis.com/auth/spreadsheets",
]);

client.authorize((err, tokens) => {
    if (err) {
        console.log(err);
        return;
    } else {
        console.log("Connected to Google Sheets API");
    }
});

const gsapi = google.sheets({ version: "v4", auth: client });

const config = {
    spreadsheetId: "1eG_rN34C4Fdrhx9uSFINUe-mqjE3e32jhrw2WfSKhV4", // Ваш Spreadsheet ID
};

// Функция для получения данных из Google Sheets
const getDataFromSheet = async (spreadsheetId, range) => {
    try {
        const response = await gsapi.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        return response.data.values || [];
    } catch (error) {
        console.error(`Ошибка при получении данных: ${error}`);
        throw error;
    }
};

// Функция для добавления данных в Google Sheets
const appendDataToSheet = async (spreadsheetId, range, values) => {
    try {
        const response = await gsapi.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: "RAW",
            resource: {
                values: [values],
            },
        });
        return response;
    } catch (error) {
        console.error(`Ошибка при добавлении данных: ${error}`);
        throw error;
    }
};

// Функция для обновления данных в Google Sheets
const updateDataInSheet = async (spreadsheetId, range, values) => {
    try {
        const response = await gsapi.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: "RAW",
            resource: {
                values: [values],
            },
        });
        return response;
    } catch (error) {
        console.error(`Ошибка при обновлении данных: ${error}`);
        throw error;
    }
};

// Функция для получения следующей свободной строки
const getNextFreeRow = async (spreadsheetId, sheetName) => {
    try {
        const response = await gsapi.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:A`,
        });

        const values = response.data.values || [];
        return values.length + 1;
    } catch (error) {
        console.error(
            `Ошибка при получении следующей свободной строки: ${error}`
        );
        throw error;
    }
};

// Функция для получения индекса строки пользователя
const getUserRowIndex = async (spreadsheetId, userId) => {
    try {
        const response = await gsapi.spreadsheets.values.get({
            spreadsheetId,
            range: "Sheet1!A:A",
        });

        const values = response.data.values || [];
        const userIndex = values.findIndex(
            (row) => row[0] === userId.toString()
        );

        if (userIndex === -1) throw new Error("User not found");

        return userIndex + 1;
    } catch (error) {
        console.error(
            `Ошибка при получении индекса строки пользователя: ${error}`
        );
        throw error;
    }
};

// Функция для получения целей пользователя
const getUserGoals = async (spreadsheetId, userId, goalType) => {
    try {
        const rowIndex = await getUserRowIndex(spreadsheetId, userId);
        const columnMap = {
            daily_goals: `C${rowIndex}`,
            weekly_goals: `E${rowIndex}`,
            monthly_goals: `G${rowIndex}`,
        };

        const range = `Sheet1!${columnMap[goalType]}`;
        const response = await getDataFromSheet(spreadsheetId, range);
        return response[0] ? response[0] : []; // Возвращаем пустой массив, если данных нет
    } catch (error) {
        console.error(`Ошибка при получении данных целей: ${error}`);
        return []; // Возвращаем пустой массив в случае ошибки
    }
};

// Функция для обновления целей пользователя
const updateUserGoals = async (
    spreadsheetId,
    userId,
    goalType,
    goals,
    comments
) => {
    try {
        const rowIndex = await getUserRowIndex(spreadsheetId, userId);
        const goalColumnMap = {
            daily_goals: `C${rowIndex}`,
            weekly_goals: `E${rowIndex}`,
            monthly_goals: `G${rowIndex}`,
        };
        const commentColumnMap = {
            daily_goals: `D${rowIndex}`,
            weekly_goals: `F${rowIndex}`,
            monthly_goals: `H${rowIndex}`,
        };
        const dateColumnMap = {
            daily_goals: `I${rowIndex}`,
            weekly_goals: `J${rowIndex}`,
            monthly_goals: `K${rowIndex}`,
        };

        const now = new Date().toISOString();
        const kievDateTime = formatDateForKiev(now); // Конвертируем дату в формат по киевскому времени

        const currentGoals =
            goals ||
            (await getUserGoals(spreadsheetId, userId, goalType))[0] ||
            "";

        await updateDataInSheet(spreadsheetId, goalColumnMap[goalType], [
            currentGoals,
        ]);
        await updateDataInSheet(spreadsheetId, commentColumnMap[goalType], [
            comments,
        ]);
        await updateDataInSheet(spreadsheetId, dateColumnMap[goalType], [
            kievDateTime,
        ]); // Используем отформатированную дату
    } catch (error) {
        console.error(`Ошибка при обновлении данных целей: ${error}`);
        throw error;
    }
};

const formatDateForKiev = (dateString) => {
    const dateObj = new Date(dateString);
    dateObj.setMinutes(dateObj.getMinutes() + 180); // Добавляем 3 часа (180 минут)

    return dateObj.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h24",
    });
};

module.exports = {
    getDataFromSheet,
    appendDataToSheet,
    updateDataInSheet,
    getNextFreeRow,
    getUserGoals,
    updateUserGoals,
    getUserRowIndex,
    formatDateForKiev,
};
