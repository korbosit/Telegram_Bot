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
const appendDataToSheet = async (spreadsheetId, range, value) => {
    try {
        const response = await gsapi.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: "RAW",
            resource: {
                values: [[value]],
            },
        });
        return response;
    } catch (error) {
        console.error(`Ошибка при добавлении данных: ${error}`);
        throw error;
    }
};

const getNextFreeRow = async (spreadsheetId, sheetName) => {
    try {
        const response = await gsapi.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:B`,
        });

        const values = response.data.values || [];
        const lastRow =
            values.filter((row) => row.some((cell) => cell !== "")).length + 1;
        return lastRow;
    } catch (error) {
        console.error(
            `Ошибка при получении следующей свободной строки: ${error}`
        );
        throw error;
    }
};

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

        const startRow = Math.floor(userIndex / 10) * 10 + 2;
        return startRow;
    } catch (error) {
        console.error(
            `Ошибка при получении индекса строки пользователя: ${error}`
        );
        throw error;
    }
};

const getUserGoals = async (chatId, callbackData) => {
    try {
        const response = await getDataFromSheet(
            config.spreadsheetId,
            "Sheet1!A:A"
        );
        const values = response || [];
        const userIndex = values.findIndex(
            (row) => row[0] === chatId.toString()
        );

        if (userIndex === -1) throw new Error("User not found");

        const startRow = Math.floor(userIndex / 10) * 10 + 2;

        const rangeMap = {
            daily_goals: `Sheet1!C${startRow}:C${startRow + 9}`,
            weekly_goals: `Sheet1!E${startRow}:E${startRow + 9}`,
            monthly_goals: `Sheet1!G${startRow}:G${startRow + 9}`,
        };

        const data = await getDataFromSheet(
            config.spreadsheetId,
            rangeMap[callbackData]
        );
        const goals = data.flat().filter((goal) => goal !== "");
        return goals;
    } catch (error) {
        console.error(`Ошибка при получении данных целей: ${error}`);
        throw error;
    }
};

module.exports = {
    getDataFromSheet,
    appendDataToSheet,
    getNextFreeRow,
    getUserGoals,
    getUserRowIndex,
};
