const { google } = require("googleapis");
const keys = require("./keys.json");

const client = new google.auth.JWT(keys.client_email, null, keys.private_key, [
    "https://www.googleapis.com/auth/spreadsheets",
]);

client.scopes = ["https://www.googleapis.com/auth/spreadsheets"];
const sheets = google.sheets({ version: "v4", auth: client });

const getLastRow = async (spreadsheetId, sheetName) => {
    await client.authorize();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:A`,
    });
    return response.data.values ? response.data.values.length + 1 : 2;
};

// const appendDataToSheet = async (
//     spreadsheetId,
//     sheetName,
//     userId,
//     firstName
// ) => {
//     await client.authorize();
//     const response = await sheets.spreadsheets.values.get({
//         spreadsheetId,
//         range: `${sheetName}!A:A`,
//     });
//     const lastFilledRow = response.data.values
//         ? response.data.values.length
//         : 1;
//     const startRow = Math.floor((lastFilledRow - 2) / 10) * 10 + 12; // Corrected row calculation
//     const range = `${sheetName}!A${startRow}:B${startRow}`;
//     await sheets.spreadsheets.values.update({
//         spreadsheetId,
//         range,
//         valueInputOption: "USER_ENTERED",
//         resource: {
//             range,
//             majorDimension: "ROWS",
//             values: [[userId.toString(), firstName]],
//         },
//     });
// };

const appendDataToSheet = async (spreadsheetId, range, value) => {
    await client.authorize();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });

    const values = response.data.values || [];
    const newValues = [...values, [value]];

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        resource: { values: newValues },
    });
};

const getDataFromSheet = async (spreadsheetId, range) => {
    await client.authorize();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    return response.data.values || [];
};

module.exports = {
    getLastRow,
    appendDataToSheet,
    getDataFromSheet,
};
