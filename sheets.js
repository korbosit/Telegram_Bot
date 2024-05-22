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
            range: `${sheetName}!A:A`,
        });

        const values = response.data.values || [];
        const lastRow = values.filter((row) =>
            row.some((cell) => cell !== "")
        ).length;
        const nextFreeRow = Math.floor(lastRow / 10) * 10 + 2;

        // Проверяем, что nextFreeRow не занят
        if (
            values[nextFreeRow - 1] &&
            values[nextFreeRow - 1].some((cell) => cell !== "")
        ) {
            return nextFreeRow + 10; // Если занят, переходим к следующему интервалу
        }
        return nextFreeRow;
    } catch (error) {
        console.error(
            `Ошибка при получении следующей свободной строки: ${error}`
        );
        throw error;
    }
};

module.exports = {
    getDataFromSheet,
    appendDataToSheet,
    getNextFreeRow,
};
